const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportPDF: (reportData) => ipcRenderer.invoke('export-pdf', reportData)
});

