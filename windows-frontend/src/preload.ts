import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  showFileDialog: () => ipcRenderer.invoke('show-file-dialog'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  setNotchExpanded: (expanded: boolean) => ipcRenderer.invoke('set-notch-expanded', expanded),
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      showFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      readFile: (filePath: string) => Promise<{ canceled?: never; data: number[]; name: string }>;
      openExternalUrl: (url: string) => Promise<void>;
      setNotchExpanded: (expanded: boolean) => Promise<void>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
    };
  }
}

