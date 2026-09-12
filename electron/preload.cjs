const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure Preload Bridge
 * Only exposes strictly vetted, non-privileged IPC communication channels.
 * Prevents direct access to Node.js APIs or privileged system tokens.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Hardware metadata & deterministic device identification
  getHardwareInfo: () => ipcRenderer.invoke('hardware:getInfo'),

  // Printer device management
  getPrinters: () => ipcRenderer.invoke('printer:list'),
  printReceipt: (options) => ipcRenderer.invoke('printer:printReceipt', options),

  // Cash drawer ESC/POS hardware pulse
  openCashDrawer: (printerName) => ipcRenderer.invoke('cashDrawer:open', printerName),

  // Window & POS Kiosk control
  setFullscreen: (fullscreen) => ipcRenderer.invoke('window:setFullscreen', fullscreen),
  toggleKioskMode: () => ipcRenderer.invoke('window:toggleKiosk'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close')
});
