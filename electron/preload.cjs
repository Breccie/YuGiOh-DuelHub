const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopShell", {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.invoke("desktop:minimize-window"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("desktop:toggle-maximize-window"),
  closeWindow: () => ipcRenderer.invoke("desktop:close-window"),
  saveTextFile: (payload) => ipcRenderer.invoke("desktop:save-text-file", payload),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:open-path", targetPath),
  revealPath: (targetPath) => ipcRenderer.invoke("desktop:reveal-path", targetPath),
});
