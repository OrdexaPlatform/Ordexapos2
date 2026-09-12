export interface PrinterDevice {
  name: string;
  displayName?: string;
  description?: string;
  status?: number;
  isDefault: boolean;
}

export interface HardwareInfo {
  machineGuid: string;
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  totalMemoryBytes: number;
  macAddress: string;
  fingerprint: string;
}

export interface PrintOptions {
  html: string;
  printerName?: string;
  silent?: boolean;
  width?: '58mm' | '80mm' | 'a4';
  copies?: number;
}

export interface PrintResult {
  success: boolean;
  error?: string;
  printerUsed?: string;
}

export interface DrawerResult {
  success: boolean;
  message: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  getHardwareInfo: () => Promise<HardwareInfo>;
  getPrinters: () => Promise<PrinterDevice[]>;
  printReceipt: (options: PrintOptions) => Promise<PrintResult>;
  openCashDrawer: (printerName?: string) => Promise<DrawerResult>;
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  toggleKioskMode: () => Promise<boolean>;
  minimizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
