const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pop9", {
  read: () => ipcRenderer.invoke("config:read"),
  save: cfg => ipcRenderer.invoke("config:save", cfg),
  start: () => ipcRenderer.invoke("agent:start"),
  stop: () => ipcRenderer.invoke("agent:stop"),
  test: () => ipcRenderer.invoke("agent:test"),
  autostart: enabled => ipcRenderer.invoke("app:autostart", enabled),
  autostartStatus: () => ipcRenderer.invoke("app:autostart-status"),
  log: callback => ipcRenderer.on("agent:log", (_event, data) => callback(data))
});
