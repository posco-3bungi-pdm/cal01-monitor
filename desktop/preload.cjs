const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cal01Connection", {
  read: () => ipcRenderer.invoke("connection:read"),
  connect: server => ipcRenderer.invoke("connection:connect", server),
});
