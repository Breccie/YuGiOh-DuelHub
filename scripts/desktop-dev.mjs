import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");
const electronDirectory = join(projectRoot, "electron");
const nextHost = "127.0.0.1";
const nextPort = 3000;
const nextUrl = `http://${nextHost}:${nextPort}`;

const nextCommand = process.execPath;
const nextArgs = [
  join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
  "dev",
  join(projectRoot, "apps", "frontend"),
];
const electronCommand =
  process.platform === "win32"
    ? join(projectRoot, "node_modules", "electron", "dist", "electron.exe")
    : join(projectRoot, "node_modules", ".bin", "electron");

let webProcess = null;
let electronProcess = null;
let restartTimer = null;
let shouldRestartElectron = false;
let isShuttingDown = false;
let electronWatchers = [];

function writeLine(prefix, message) {
  process.stdout.write(`${prefix} ${message}\n`);
}

function writeError(prefix, message) {
  process.stderr.write(`${prefix} ${message}\n`);
}

function normalizePath(filePath) {
  return filePath.split("\\").join("/");
}

function pipeWithPrefix(stream, prefix, writer) {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      writer(prefix, line);
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  });

  stream.on("end", () => {
    const line = buffer.replace(/\r$/, "");
    if (line) {
      writer(prefix, line);
    }
  });
}

function waitForPort({ host, port, timeoutMs = 120000 }) {
  const startedAt = Date.now();

  return new Promise((resolvePromise, rejectPromise) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });

      socket.once("connect", () => {
        socket.end();
        resolvePromise();
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() - startedAt >= timeoutMs) {
          rejectPromise(
            new Error(`Zeitüberschreitung beim Warten auf ${host}:${port}.`),
          );
          return;
        }

        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

function killChildProcess(childProcess) {
  if (!childProcess?.pid) {
    return Promise.resolve();
  }

  return new Promise((resolvePromise) => {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", [
        "/PID",
        String(childProcess.pid),
        "/T",
        "/F",
      ]);

      killer.once("exit", () => resolvePromise());
      killer.once("error", () => {
        childProcess.kill("SIGTERM");
        resolvePromise();
      });
      return;
    }

    childProcess.kill("SIGTERM");
    resolvePromise();
  });
}

function stopWatchingElectronFiles() {
  for (const watcher of electronWatchers) {
    watcher.close();
  }

  electronWatchers = [];
}

function isRelevantElectronChange(fileName) {
  if (!fileName) {
    return false;
  }

  const normalizedName = normalizePath(String(fileName));
  return !(
    normalizedName.endsWith("~") ||
    normalizedName.endsWith(".tmp") ||
    normalizedName.endsWith(".swp") ||
    normalizedName.includes("/.")
  );
}

function scheduleElectronRestart(fileName) {
  if (isShuttingDown || !isRelevantElectronChange(fileName)) {
    return;
  }

  shouldRestartElectron = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  const normalizedName = normalizePath(String(fileName));
  writeLine(
    "[DEV]",
    `Änderung erkannt in ${normalizedName}. Electron wird neu gestartet.`,
  );

  restartTimer = setTimeout(async () => {
    restartTimer = null;
    await restartElectron();
  }, 180);
}

function watchElectronFiles() {
  stopWatchingElectronFiles();

  try {
    const watcher = watch(
      electronDirectory,
      { recursive: true },
      (_eventType, fileName) => {
        scheduleElectronRestart(fileName);
      },
    );

    watcher.on("error", (error) => {
      writeError("[DEV]", `Datei-Watcher Fehler: ${error.message}`);
    });

    electronWatchers.push(watcher);
    return;
  } catch (error) {
    writeError(
      "[DEV]",
      `Rekursiver Datei-Watcher nicht verfügbar, nutze einfachen Fallback: ${error.message}`,
    );
  }

  const watcher = watch(electronDirectory, (_eventType, fileName) => {
    scheduleElectronRestart(fileName);
  });

  watcher.on("error", (error) => {
    writeError("[DEV]", `Datei-Watcher Fehler: ${error.message}`);
  });

  electronWatchers.push(watcher);
}

function attachProcessLogging(childProcess, prefix) {
  pipeWithPrefix(childProcess.stdout, prefix, writeLine);
  pipeWithPrefix(childProcess.stderr, prefix, writeError);
}

function createWebProcess() {
  writeLine("[WEB]", "Starte Next.js Dev-Server ...");

  webProcess = spawn(nextCommand, nextArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  attachProcessLogging(webProcess, "[WEB]");

  webProcess.once("error", (error) => {
    writeError("[WEB]", `Start fehlgeschlagen: ${error.message}`);
    shutdown(1);
  });

  webProcess.once("exit", (code) => {
    webProcess = null;

    if (!isShuttingDown) {
      writeError("[WEB]", `Dev-Server beendet (Code ${code ?? "unbekannt"}).`);
      shutdown(code ?? 1);
    }
  });
}

async function createElectronProcess() {
  await waitForPort({ host: nextHost, port: nextPort });

  if (isShuttingDown) {
    return;
  }

  shouldRestartElectron = false;
  writeLine("[DESKTOP]", `Starte Electron mit ${nextUrl} ...`);

  electronProcess = spawn(electronCommand, ["."], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_START_URL: nextUrl,
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  attachProcessLogging(electronProcess, "[DESKTOP]");

  electronProcess.once("error", (error) => {
    writeError("[DESKTOP]", `Start fehlgeschlagen: ${error.message}`);
    shutdown(1);
  });

  electronProcess.once("exit", async (code) => {
    electronProcess = null;

    if (isShuttingDown) {
      return;
    }

    if (shouldRestartElectron) {
      await createElectronProcess();
      return;
    }

    writeLine("[DESKTOP]", "Electron wurde geschlossen. Dev-Runner wird beendet.");
    shutdown(code ?? 0);
  });
}

async function restartElectron() {
  if (isShuttingDown) {
    return;
  }

  if (!electronProcess) {
    await createElectronProcess();
    return;
  }

  await killChildProcess(electronProcess);
}

async function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  stopWatchingElectronFiles();

  await Promise.all([
    killChildProcess(electronProcess),
    killChildProcess(webProcess),
  ]);

  process.exit(exitCode);
}

async function main() {
  watchElectronFiles();
  createWebProcess();
  await createElectronProcess();
}

process.on("SIGINT", () => {
  shutdown(0);
});

process.on("SIGTERM", () => {
  shutdown(0);
});

process.on("uncaughtException", (error) => {
  writeError("[DEV]", error.stack || error.message);
  shutdown(1);
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  writeError("[DEV]", message);
  shutdown(1);
});

if (process.argv[1] === scriptPath) {
  main().catch((error) => {
    writeError("[DEV]", error.stack || error.message);
    shutdown(1);
  });
}
