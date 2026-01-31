const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportPDF: (reportData) => ipcRenderer.invoke('export-pdf', reportData),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectProjectDirectory: () => ipcRenderer.invoke('select-project-directory')
});

