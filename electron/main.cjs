const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let mainWindow = null;

// Determine persistent Machine GUID for stable hardware identity
function getOrGenerateMachineGuid() {
  try {
    const userDataPath = app.getPath('userData');
    const guidFilePath = path.join(userDataPath, 'ordexa_machine_guid.json');

    if (fs.existsSync(guidFilePath)) {
      const data = JSON.parse(fs.readFileSync(guidFilePath, 'utf8'));
      if (data && data.guid) {
        return data.guid;
      }
    }

    const newGuid = crypto.randomUUID();
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(guidFilePath, JSON.stringify({ guid: newGuid, generatedAt: new Date().toISOString() }), 'utf8');
    return newGuid;
  } catch (err) {
    console.warn('Could not write machine guid to disk, generating memory guid:', err);
    return crypto.randomUUID();
  }
}

// Extract primary MAC address
function getPrimaryMacAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const ifaceList = interfaces[name] || [];
    for (const iface of ifaceList) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return '00:00:00:00:00:00';
}

// Compute deterministic hardware info and SHA-256 fingerprint
function generateHardwareFingerprint() {
  const guid = getOrGenerateMachineGuid();
  const hostname = os.hostname() || 'localhost';
  const mac = getPrimaryMacAddress();
  const cpuModel = os.cpus()[0]?.model || 'Standard CPU';
  const platform = process.platform;
  const arch = process.arch;
  const totalMemoryBytes = os.totalmem();

  const rawString = `ORDEXA_HW::${guid}::${hostname}::${mac}::${cpuModel}::${platform}::${arch}`;
  const fingerprint = crypto.createHash('sha256').update(rawString).digest('hex');

  return {
    machineGuid: guid,
    hostname,
    platform,
    arch,
    cpuModel,
    totalMemoryBytes,
    macAddress: mac,
    fingerprint
  };
}

function createWindow() {
  // Resolve icon path with fallback: custom/public icon -> build icon -> none
  const candidateIconPaths = [
    path.join(__dirname, '..', 'public', 'assets', 'ordexa-icon.png'),
    path.join(process.resourcesPath || '', 'public', 'assets', 'ordexa-icon.png'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build', 'icon.ico')
  ];

  let resolvedIcon = candidateIconPaths.find(p => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Ordexa POS Desktop',
    ...(resolvedIcon ? { icon: resolvedIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load from dev server or compiled dist bundle
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  const distHtmlPath = path.join(__dirname, '..', 'dist', 'index.html');

  if (isDev && process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else if (fs.existsSync(distHtmlPath)) {
    mainWindow.loadFile(distHtmlPath);
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Enforce single application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Setup Strictly Vetted IPC Handlers
function setupIpcHandlers() {
  // 1. Hardware Info & Fingerprint
  ipcMain.handle('hardware:getInfo', async () => {
    return generateHardwareFingerprint();
  });

  // 2. Printer Listing
  ipcMain.handle('printer:list', async () => {
    if (!mainWindow) return [];
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers.map(p => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description,
        status: p.status,
        isDefault: p.isDefault
      }));
    } catch (err) {
      console.error('Error fetching printers:', err);
      return [];
    }
  });

  // 3. Silent Thermal / Laser Receipt Printing
  ipcMain.handle('printer:printReceipt', async (_event, options) => {
    return new Promise((resolve) => {
      try {
        const printWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        });

        const htmlData = `data:text/html;charset=utf-8,${encodeURIComponent(options.html)}`;
        printWindow.loadURL(htmlData);

        printWindow.webContents.on('did-finish-load', () => {
          const printSettings = {
            silent: options.silent ?? true,
            printBackground: true,
            copies: options.copies || 1
          };

          if (options.printerName) {
            printSettings.deviceName = options.printerName;
          }

          printWindow.webContents.print(printSettings, (success, failureReason) => {
            printWindow.close();
            if (success) {
              resolve({ success: true, printerUsed: options.printerName || 'Default' });
            } else {
              resolve({ success: false, error: failureReason || 'Failed to execute print job' });
            }
          });
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });

  // 4. Cash Drawer Kick Pulse (ESC/POS 27, 112, 0, 25, 250)
  ipcMain.handle('cashDrawer:open', async (_event, printerName) => {
    return new Promise((resolve) => {
      try {
        const drawerWindow = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        // ESC/POS drawer open command embedded as raw binary / base64 HTML
        const pulseHtml = `
          <!DOCTYPE html>
          <html>
          <body>
            <span style="font-size: 1px; color: transparent;">\x1b\x70\x00\x19\xfa</span>
          </body>
          </html>
        `;

        drawerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pulseHtml)}`);
        drawerWindow.webContents.on('did-finish-load', () => {
          const printSettings = {
            silent: true,
            printBackground: false
          };
          if (printerName) {
            printSettings.deviceName = printerName;
          }

          drawerWindow.webContents.print(printSettings, (success) => {
            drawerWindow.close();
            if (success) {
              resolve({ success: true, message: 'تم إرسال نبضة فتح الدرج بنجاح' });
            } else {
              resolve({ success: false, message: 'فشل إرسال أمر فتح الدرج إلى الطابعة' });
            }
          });
        });
      } catch (err) {
        resolve({ success: false, message: err.message });
      }
    });
  });

  // 5. Window Controls
  ipcMain.handle('window:setFullscreen', async (_event, fullscreen) => {
    if (mainWindow) {
      mainWindow.setFullScreen(Boolean(fullscreen));
      return mainWindow.isFullScreen();
    }
    return false;
  });

  ipcMain.handle('window:toggleKiosk', async () => {
    if (mainWindow) {
      const current = mainWindow.isKiosk();
      mainWindow.setKiosk(!current);
      return mainWindow.isKiosk();
    }
    return false;
  });

  ipcMain.handle('window:minimize', async () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:close', async () => {
    if (mainWindow) mainWindow.close();
  });
}
