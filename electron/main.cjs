const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { copyFileSync, existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { spawn } = require("node:child_process");
const net = require("node:net");

const DESKTOP_PORT = 3232;
const DESKTOP_HOST = "127.0.0.1";

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

function getAppRoot() {
  return resolve(__dirname, "..");
}

function shouldUseStandaloneServer() {
  return app.isPackaged || process.env.ELECTRON_USE_STANDALONE === "1";
}

function getSeedDatabasePath() {
  return join(
    getAppRoot(),
    "apps",
    "frontend",
    ".next",
    "standalone",
    "desktop-assets",
    "seed.db",
  );
}

function getRuntimeDatabasePath() {
  return join(app.getPath("userData"), "yugioh-progression.db");
}

function getAssetCacheDirectory() {
  return join(app.getPath("sessionData"), "remote-assets");
}

function ensureRuntimeDatabase() {
  const runtimeDbPath = getRuntimeDatabasePath();

  if (!existsSync(runtimeDbPath)) {
    const seedDbPath = getSeedDatabasePath();
    mkdirSync(dirname(runtimeDbPath), { recursive: true });
    copyFileSync(seedDbPath, runtimeDbPath);
  }

  return runtimeDbPath;
}

function waitForPort({ host, port, timeoutMs = 30000 }) {
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
            new Error(`Timed out waiting for ${host}:${port} to become ready.`),
          );
          return;
        }

        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

async function startStandaloneServer() {
  if (serverProcess) {
    return `http://${DESKTOP_HOST}:${DESKTOP_PORT}`;
  }

  const appRoot = getAppRoot();
  const standaloneDir = join(appRoot, "apps", "frontend", ".next", "standalone");
  const serverEntry = join(standaloneDir, "server.js");
  const runtimeDbPath = ensureRuntimeDatabase();

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: DESKTOP_HOST,
      PORT: String(DESKTOP_PORT),
      DATABASE_URL: `file:${runtimeDbPath}`,
      DESKTOP_ASSET_CACHE_DIR: getAssetCacheDirectory(),
      NODE_ENV: "production",
    },
    stdio: "pipe",
  });

  serverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[desktop-server] ${chunk}`);
  });

  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[desktop-server] ${chunk}`);
  });

  serverProcess.once("exit", (code) => {
    if (!isQuitting && code !== 0) {
      console.error(`Standalone server exited with code ${code}.`);
    }

    serverProcess = null;
  });

  await waitForPort({ host: DESKTOP_HOST, port: DESKTOP_PORT });

  return `http://${DESKTOP_HOST}:${DESKTOP_PORT}`;
}

async function resolveStartUrl() {
  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
  }

  if (shouldUseStandaloneServer()) {
    return startStandaloneServer();
  }

  return `http://${DESKTOP_HOST}:3000`;
}

async function createMainWindow() {
  const startUrl = await resolveStartUrl();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#080b10",
    autoHideMenuBar: true,
    title: "Yu-Gi-Oh Progression",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(startUrl);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerDesktopIpc() {
  ipcMain.handle("desktop:minimize-window", () => {
    mainWindow?.minimize();
    return true;
  });

  ipcMain.handle("desktop:toggle-maximize-window", () => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }

    return true;
  });

  ipcMain.handle("desktop:close-window", () => {
    mainWindow?.close();
    return true;
  });

  ipcMain.handle("desktop:save-text-file", async (_event, payload) => {
    if (!mainWindow) {
      return { canceled: true, filePath: null };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload?.defaultPath || "deck-export.ydk",
      filters: payload?.filters || [{ name: "Text", extensions: ["txt"] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }

    mkdirSync(dirname(result.filePath), { recursive: true });
    writeFileSync(result.filePath, payload?.content || "", "utf8");

    return {
      canceled: false,
      filePath: result.filePath,
    };
  });

  ipcMain.handle("desktop:open-path", async (_event, targetPath) => {
    if (!targetPath) {
      return false;
    }

    const result = await shell.openPath(targetPath);
    return result === "";
  });

  ipcMain.handle("desktop:reveal-path", async (_event, targetPath) => {
    if (!targetPath) {
      return false;
    }

    shell.showItemInFolder(targetPath);
    return true;
  });
}

app.whenReady().then(async () => {
  registerDesktopIpc();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;

  if (serverProcess) {
    serverProcess.kill();
  }
});
