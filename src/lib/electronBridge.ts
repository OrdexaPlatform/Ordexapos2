import { HardwareInfo, PrinterDevice, PrintOptions, PrintResult, DrawerResult } from '../types/electron';

export type { PrintResult, HardwareInfo, PrinterDevice, PrintOptions, DrawerResult };
export type PrinterDeviceInfo = PrinterDevice;

export const isElectronApp = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
};

export const getHardwareInfo = async (): Promise<HardwareInfo | null> => {
  if (isElectronApp() && window.electronAPI?.getHardwareInfo) {
    try {
      return await window.electronAPI.getHardwareInfo();
    } catch (err) {
      console.error('Failed to get hardware info from Electron:', err);
    }
  }
  return null;
};

export const getTerminalHardwareIdentity = async () => {
  const hw = await getHardwareInfo();
  if (hw) {
    return {
      fingerprint: `DEV-WIN-${hw.fingerprint.slice(0, 16).toUpperCase()}`,
      operatingSystem: `${hw.platform === 'win32' ? 'Windows' : hw.platform} (${hw.arch})`,
      deviceName: hw.hostname,
      hostname: hw.hostname,
      macAddress: hw.macAddress
    };
  }
  return null;
};

export const getDesktopPrinters = async (): Promise<PrinterDevice[]> => {
  if (isElectronApp() && window.electronAPI?.getPrinters) {
    try {
      return await window.electronAPI.getPrinters();
    } catch (err) {
      console.error('Failed to fetch Electron printers:', err);
    }
  }
  return [];
};

export const getAvailablePrinters = async (): Promise<PrinterDeviceInfo[]> => {
  return await getDesktopPrinters();
};

export const printThermalReceiptNative = async (options: PrintOptions): Promise<PrintResult> => {
  if (isElectronApp() && window.electronAPI?.printReceipt) {
    try {
      return await window.electronAPI.printReceipt(options);
    } catch (err: any) {
      console.error('Native print error:', err);
      return {
        success: false,
        error: err?.message || 'فشل الطباعة عبر نظام سطح المكتب'
      };
    }
  }

  // Fallback for Web
  return {
    success: false,
    error: 'الطباعة المباشرة الصامتة تتطلب تطبيق Ordexa Desktop'
  };
};

export const openCashDrawerPulse = async (printerName?: string): Promise<DrawerResult> => {
  if (isElectronApp() && window.electronAPI?.openCashDrawer) {
    try {
      return await window.electronAPI.openCashDrawer(printerName);
    } catch (err: any) {
      console.error('Native cash drawer pulse error:', err);
      return {
        success: false,
        message: err?.message || 'فشل إرسال أمر نبضة فتح الدرج'
      };
    }
  }

  return {
    success: false,
    message: 'فتح الدرج الإلكتروني يتطلب تطبيق Ordexa Desktop'
  };
};

export const toggleKiosk = async (): Promise<boolean> => {
  if (isElectronApp() && window.electronAPI?.toggleKioskMode) {
    return await window.electronAPI.toggleKioskMode();
  }
  return false;
};

export const setDesktopFullscreen = async (fullscreen: boolean): Promise<boolean> => {
  if (isElectronApp() && window.electronAPI?.setFullscreen) {
    return await window.electronAPI.setFullscreen(fullscreen);
  }
  return false;
};
