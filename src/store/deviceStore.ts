import { create } from 'zustand';
import { supabase, supabaseAnonQuery } from '../lib/supabase';
import { Device, POSLicenseValidationResult } from '../types';
import { validatePOSLicense, registerPOSTerminal, deactivatePOSTerminal } from '../lib/deviceService';
import { offlineStorage } from '../lib/offline/offlineStorage';
import { getTerminalHardwareIdentity } from '../lib/electronBridge';
import { useClientStore } from './clientStore';

interface DeviceState {
  fingerprint: string;
  deviceName: string;
  operatingSystem: string;
  appVersion: string;
  isDesktopNative: boolean;
  device: Device | null;
  status: 'active' | 'deactivated' | 'unregistered' | 'loading' | 'error';
  isActivated: boolean;
  isOfflineGraceActive: boolean;
  remainingGraceHours: number | null;
  errorMessage: string | null;
  licenseValidation: POSLicenseValidationResult | null;
  initializeDevice: (clientId?: string, licenseId?: string) => Promise<void>;
  validateLicense: (clientId?: string) => Promise<POSLicenseValidationResult>;
  registerTerminal: (clientId: string, licenseKey: string, customDeviceName?: string) => Promise<{ success: boolean; message: string }>;
  deactivateTerminal: (clientId: string, reason?: string) => Promise<{ success: boolean; message: string }>;
  setFingerprint: (fp: string) => void;
}

// Key for client hardware identifier in storage
const DEVICE_FP_STORAGE_KEY = 'ordexa_device_fingerprint';

function getHardwareSignature(): { prefix: string; os: string; hwId: string } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { prefix: 'SRV', os: 'GEN', hwId: '00000000' };
  }

  const ua = navigator.userAgent || '';
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));

  let prefix = 'PC';
  if (isMobile) {
    prefix = 'MOB';
  } else if (isTablet) {
    prefix = 'TAB';
  }

  let os = 'GEN';
  if (/Windows/i.test(ua)) os = 'WIN';
  else if (/Android/i.test(ua)) os = 'AND';
  else if (/iPhone|iPad|iPod|iOS/i.test(ua)) os = 'IOS';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'MAC';
  else if (/Linux/i.test(ua)) os = 'LNX';

  // Hardware traits: screen dimensions, color depth, concurrency, touch points
  const screenSpec = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}x${screen.colorDepth}` : '0x0x0';
  const cores = navigator.hardwareConcurrency || 1;
  const touchPoints = navigator.maxTouchPoints || 0;
  const rawString = `${prefix}-${os}-${screenSpec}-${cores}-${touchPoints}`;

  let hash = 2166136261;
  for (let i = 0; i < rawString.length; i++) {
    hash ^= rawString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hwId = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');

  return { prefix, os, hwId };
}

export function getOrCreateLocalDeviceFingerprint(): string {
  try {
    const { prefix, os, hwId } = getHardwareSignature();
    const expectedPrefix = `${prefix}-${os}-${hwId}`;
    
    let fp = localStorage.getItem(DEVICE_FP_STORAGE_KEY);
    
    // If the stored fingerprint was from another device type (e.g. mobile vs PC mismatch), discard and regenerate
    if (!fp || !fp.startsWith(`${prefix}-${os}-`)) {
      const array = new Uint8Array(4);
      if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(array);
      }
      const randomPart = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      fp = `${expectedPrefix}-${randomPart}`;
      localStorage.setItem(DEVICE_FP_STORAGE_KEY, fp);
    }
    return fp;
  } catch {
    return 'DEV-TERMINAL-01';
  }
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  fingerprint: getOrCreateLocalDeviceFingerprint(),
  deviceName: 'نقطة البيع الرئيسية (Terminal)',
  operatingSystem: typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
    ? 'Windows 11 POS'
    : 'Web POS Client',
  appVersion: '1.0.0',
  isDesktopNative: false,
  device: null,
  status: 'loading',
  isActivated: false,
  isOfflineGraceActive: false,
  remainingGraceHours: null,
  errorMessage: null,
  licenseValidation: null,

  setFingerprint: (fp: string) => {
    try {
      localStorage.setItem(DEVICE_FP_STORAGE_KEY, fp);
    } catch (e) {
      console.warn('Cannot write to localStorage:', e);
    }
    set({ fingerprint: fp });
  },

  validateLicense: async (clientId?: string) => {
    const currentFp = get().fingerprint || getOrCreateLocalDeviceFingerprint();
    
    // Check if network is available or check offline license / auth snapshot first
    if (clientId) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        const authSnap = await offlineStorage.verifyAuthSnapshot(clientId, currentFp);
        const offlineCheck = await offlineStorage.verifyOfflineLicense(clientId, currentFp);

        if (authSnap.valid || offlineCheck.permitted) {
          const remainingHours = offlineCheck.remainingHours || 168;
          const offlineResult: POSLicenseValidationResult = {
            is_valid: true,
            client: {
              id: clientId,
              business_name: 'Ordexa Client',
              status: 'active'
            },
            license: {
              id: authSnap.snapshot?.license_id || offlineCheck.cachedLicense?.license_id || '',
              license_key: offlineCheck.cachedLicense?.license_key || 'OFFLINE_LICENSE',
              license_type: 'enterprise',
              status: 'active',
              expiry_date: '',
              days_left: 365,
              max_devices: (offlineCheck.cachedLicense as any)?.max_devices || (authSnap.snapshot as any)?.max_devices || 1,
              activated_devices: 1
            },
            device: {
              id: authSnap.snapshot?.device_id || get().device?.id || '',
              device_name: get().deviceName,
              device_fingerprint: currentFp,
              status: 'active',
              is_registered: true,
              is_active: true
            },
            message: `يعمل بدون إنترنت (فترة سماح: متبقي ${remainingHours} ساعة)`
          };
          set({
            licenseValidation: offlineResult,
            isOfflineGraceActive: true,
            remainingGraceHours: remainingHours
          });
          return offlineResult;
        } else {
          const failedResult: POSLicenseValidationResult = {
            is_valid: false,
            client: {
              id: clientId,
              business_name: 'Ordexa Client',
              status: 'suspended'
            },
            error_code: 'OFFLINE_GRACE_EXPIRED',
            message: authSnap.reason || offlineCheck.reason || 'انتهت صلاحية العمل بدون إنترنت'
          };
          set({
            licenseValidation: failedResult,
            isOfflineGraceActive: false,
            remainingGraceHours: 0
          });
          return failedResult;
        }
      }
    }

    try {
      const result = await validatePOSLicense(clientId, currentFp);
      set({ licenseValidation: result, isOfflineGraceActive: false });
      
      // If valid, refresh offline cache and auth snapshot
      if (result.is_valid && clientId && result.license?.id) {
        offlineStorage.cacheLicenseValidation({
          clientId,
          licenseId: result.license.id,
          licenseKey: result.license.license_key || 'VALIDATED_LICENSE',
          deviceFingerprint: currentFp,
          status: 'active',
          maxOfflineHours: 168
        });

        const maxHours = 168;
        const nowIso = new Date().toISOString();
        const expiry = new Date(Date.now() + maxHours * 3600 * 1000).toISOString();
        const snap = {
          client_id: clientId,
          client_code: (result.client as any)?.client_code || '',
          client_name: result.client?.business_name || '',
          client_user_id: '',
          user_role: 'cashier',
          permissions: ['pos_sales', 'pos_offline'],
          device_id: result.device?.id || '',
          device_fingerprint: currentFp,
          device_authorization_status: 'active',
          license_id: result.license.id,
          license_key: result.license.license_key || 'VALIDATED_LICENSE',
          license_status: 'active',
          license_expiry: result.license.expiry_date || '',
          max_offline_hours: maxHours,
          created_at: nowIso,
          last_validated_at: nowIso,
          offline_grace_expiry: expiry,
        };
        const checksum = offlineStorage.computeAuthSnapshotChecksum(snap);
        offlineStorage.saveAuthSnapshot({ ...snap, checksum }).catch(() => {});

        try {
          localStorage.setItem(`ordexa_device_registered_${clientId}`, 'true');
          if (result.device) {
            localStorage.setItem(`ordexa_device_${clientId}`, JSON.stringify(result.device));
          }
        } catch {}
      }
      return result;
    } catch (err) {
      // Fallback to offline check if network request failed (Network / DB connection error)
      if (clientId) {
        const authSnap = await offlineStorage.verifyAuthSnapshot(clientId, currentFp);
        const offlineCheck = await offlineStorage.verifyOfflineLicense(clientId, currentFp);
        if (authSnap.valid || offlineCheck.permitted) {
          const remainingHours = offlineCheck.remainingHours || 168;
          const offlineResult: POSLicenseValidationResult = {
            is_valid: true,
            client: {
              id: clientId,
              business_name: 'Ordexa Client',
              status: 'active'
            },
            license: {
              id: authSnap.snapshot?.license_id || offlineCheck.cachedLicense?.license_id || '',
              license_key: offlineCheck.cachedLicense?.license_key || 'OFFLINE_LICENSE',
              license_type: 'enterprise',
              status: 'active',
              expiry_date: '',
              days_left: 365,
              max_devices: (offlineCheck.cachedLicense as any)?.max_devices || (authSnap.snapshot as any)?.max_devices || 1,
              activated_devices: 1
            },
            device: {
              id: authSnap.snapshot?.device_id || get().device?.id || '',
              device_name: get().deviceName,
              device_fingerprint: currentFp,
              status: 'active',
              is_registered: true,
              is_active: true
            },
            message: `يعمل بدون إنترنت (فترة سماح: متبقي ${remainingHours} ساعة)`
          };
          set({
            licenseValidation: offlineResult,
            isOfflineGraceActive: true,
            remainingGraceHours: remainingHours
          });
          return offlineResult;
        }
      }
      throw err;
    }
  },

  registerTerminal: async (clientId: string, licenseKey: string, customDeviceName?: string) => {
    const currentFp = get().fingerprint || getOrCreateLocalDeviceFingerprint();
    const name = customDeviceName?.trim() || get().deviceName;

    set({ status: 'loading', errorMessage: null });

    const res = await registerPOSTerminal({
      clientId,
      licenseKey,
      deviceName: name,
      deviceFingerprint: currentFp,
      operatingSystem: get().operatingSystem,
      appVersion: get().appVersion,
    });

    if (res.success && res.device) {
      set({
        device: res.device,
        deviceName: res.device.device_name || name,
        status: 'active',
        isActivated: true,
        errorMessage: null,
      });
      // Re-validate license and update offline cache
      await get().validateLicense(clientId);
      return { success: true, message: res.message };
    } else {
      set({
        status: 'unregistered',
        isActivated: false,
        errorMessage: res.message,
      });
      return { success: false, message: res.message };
    }
  },

  deactivateTerminal: async (clientId: string, reason?: string) => {
    const currentDev = get().device;
    if (!currentDev?.id) {
      return { success: false, message: 'لا يوجد جهاز نشط لإلغاء تفعيله' };
    }

    const res = await deactivatePOSTerminal(clientId, currentDev.id, reason);
    if (res.success) {
      set({
        status: 'deactivated',
        isActivated: false,
        device: { ...currentDev, status: 'deactivated' },
      });
      await get().validateLicense(clientId);
    }
    return res;
  },

  initializeDevice: async (clientId?: string, licenseId?: string) => {
    // 1. Check if running in native Electron desktop
    let hwIdentity;
    try {
      hwIdentity = await getTerminalHardwareIdentity();
    } catch {
      hwIdentity = null;
    }

    const currentFp = hwIdentity?.fingerprint || get().fingerprint || getOrCreateLocalDeviceFingerprint();
    const osName = hwIdentity?.operatingSystem || get().operatingSystem;
    const isDesktop = hwIdentity?.fingerprint?.startsWith('DEV-WIN-') || false;

    const isAlreadyActiveForThisClient = 
      get().isActivated && 
      get().status === 'active' && 
      get().device?.client_id === clientId;

    set({ 
      fingerprint: currentFp, 
      operatingSystem: osName,
      isDesktopNative: isDesktop,
      status: isAlreadyActiveForThisClient ? 'active' : 'loading', 
      errorMessage: null 
    });

    // Offline early exit if offline with valid license/grace/snapshot
    if (clientId && typeof navigator !== 'undefined' && !navigator.onLine) {
      const authSnap = await offlineStorage.verifyAuthSnapshot(clientId, currentFp);
      const graceCheck = await offlineStorage.verifyOfflineLicense(clientId, currentFp);

      if (authSnap.valid || graceCheck.permitted) {
        let cachedDev: any = null;
        try {
          const rawDev = localStorage.getItem(`ordexa_device_${clientId}`);
          if (rawDev) cachedDev = JSON.parse(rawDev);
        } catch {}

        set({
          status: 'active',
          isActivated: true,
          errorMessage: null,
          isOfflineGraceActive: true,
          remainingGraceHours: graceCheck.remainingHours || 168,
          device: cachedDev || get().device || {
            id: authSnap.snapshot?.device_id || 'offline-device',
            device_name: get().deviceName || 'جهاز نقطة البيع',
            device_fingerprint: currentFp,
            status: 'active',
            is_active: true,
            is_registered: true,
            client_id: clientId,
          } as any
        });
        return;
      }
    }

    try {
      // 2. Run validation for client & license
      const validation = await get().validateLicense(clientId);

      // Query the devices table for this fingerprint
      let query = supabaseAnonQuery
        .from('devices')
        .select('*, client:clients(*), license:licenses(*)')
        .eq('device_fingerprint', currentFp);

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        // Fallback check: if network error or connection trouble, verify local auth snapshot or grace
        if (clientId) {
          const authSnap = await offlineStorage.verifyAuthSnapshot(clientId, currentFp);
          const graceCheck = await offlineStorage.verifyOfflineLicense(clientId, currentFp);
          const isRegisteredLocally = typeof localStorage !== 'undefined' && localStorage.getItem(`ordexa_device_registered_${clientId}`);

          if (authSnap.valid || graceCheck.permitted || isRegisteredLocally) {
            let cachedDev: any = null;
            try {
              const rawDev = localStorage.getItem(`ordexa_device_${clientId}`);
              if (rawDev) cachedDev = JSON.parse(rawDev);
            } catch {}

            set({
              status: 'active',
              isActivated: true,
              errorMessage: null,
              isOfflineGraceActive: true,
              remainingGraceHours: graceCheck.remainingHours || 168,
              device: cachedDev || get().device || {
                id: authSnap.snapshot?.device_id || 'offline-device',
                device_name: get().deviceName || 'جهاز نقطة البيع',
                device_fingerprint: currentFp,
                status: 'active',
                is_active: true,
                is_registered: true,
                client_id: clientId,
              } as any
            });
            return;
          }
        }

        console.error('Error fetching device status:', error);
        set({
          device: null,
          status: 'error',
          isActivated: false,
          errorMessage: 'خطأ في الاتصال بقاعدة البيانات للتحقق من الجهاز',
        });
        return;
      }

      if (!data) {
        // Only if offline with valid grace or auth snapshot, allow offline grace
        if (clientId && typeof navigator !== 'undefined' && !navigator.onLine) {
          const authSnap = await offlineStorage.verifyAuthSnapshot(clientId, currentFp);
          const graceCheck = await offlineStorage.verifyOfflineLicense(clientId, currentFp);

          if (authSnap.valid || graceCheck.permitted) {
            let cachedDev: any = null;
            try {
              const rawDev = localStorage.getItem(`ordexa_device_${clientId}`);
              if (rawDev) cachedDev = JSON.parse(rawDev);
            } catch {}

            set({
              status: 'active',
              isActivated: true,
              errorMessage: null,
              isOfflineGraceActive: true,
              remainingGraceHours: graceCheck.remainingHours || 168,
              device: cachedDev || get().device || {
                id: authSnap.snapshot?.device_id || 'offline-device',
                device_name: get().deviceName || 'جهاز نقطة البيع',
                device_fingerprint: currentFp,
                status: 'active',
                is_active: true,
                is_registered: true,
                client_id: clientId,
              } as any
            });
            return;
          }
        }

        // Check if license is active and has available device slots
        const val = validation || get().licenseValidation;
        const maxDevs = val?.license?.max_devices ?? 1;
        const actDevs = val?.license?.activated_devices ?? 0;
        let licKey = val?.license?.license_key;
        const effectiveClientId = clientId || val?.client?.id;

        // Fallback: resolve license_key from clientStore if missing from validation
        if (!licKey && effectiveClientId) {
          const clientLicense = useClientStore.getState().license;
          if (clientLicense?.license_key) {
            licKey = clientLicense.license_key;
          } else {
            try {
              const { data: directLic } = await supabaseAnonQuery
                .from('licenses')
                .select('*')
                .eq('client_id', effectiveClientId)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (directLic) {
                licKey = directLic.license_key;
              }
            } catch (licFetchErr) {
              console.warn('License key direct resolution warning:', licFetchErr);
            }
          }
        }

        if (maxDevs && actDevs >= maxDevs) {
          // Device quota fully utilized
          set({
            device: null,
            status: 'unregistered',
            isActivated: false,
            errorMessage: `تم استنفاد الحد الأقصى للأجهزة المسموح بها في ترخيصكم (${maxDevs} جهاز). يرجى ترقية الخطة أو تعطيل جهاز آخر أولاً.`,
          });
          return;
        }

        // Device not registered yet under this client/license
        set({
          device: null,
          status: 'unregistered',
          isActivated: false,
          errorMessage: null,
        });
        return;
      }

      if (data.status === 'active') {
        // Update heartbeat last_seen_at silently
        supabaseAnonQuery
          .from('devices')
          .update({ 
            last_seen_at: new Date().toISOString(),
            operating_system: osName,
            app_version: get().appVersion
          })
          .eq('id', data.id)
          .then();

        if (clientId) {
          try {
            localStorage.setItem(`ordexa_device_registered_${clientId}`, 'true');
            localStorage.setItem(`ordexa_device_${clientId}`, JSON.stringify(data));
          } catch {}
        }

        set({
          device: data as Device,
          deviceName: data.device_name || get().deviceName,
          status: 'active',
          isActivated: true,
          errorMessage: null,
        });
      } else {
        set({
          device: data as Device,
          deviceName: data.device_name || get().deviceName,
          status: 'deactivated',
          isActivated: false,
          errorMessage: 'تم إلغاء تفعيل هذا الجهاز من لوحة التحكم',
        });
      }
    } catch (err: any) {
      // Check offline grace / auth snapshot fallback
      if (clientId) {
        const authSnap = await offlineStorage.verifyAuthSnapshot(clientId, currentFp);
        const graceCheck = await offlineStorage.verifyOfflineLicense(clientId, currentFp);
        const isRegisteredLocally = typeof localStorage !== 'undefined' && localStorage.getItem(`ordexa_device_registered_${clientId}`);

        if (authSnap.valid || graceCheck.permitted || isRegisteredLocally || get().isOfflineGraceActive) {
          let cachedDev: any = null;
          try {
            const rawDev = localStorage.getItem(`ordexa_device_${clientId}`);
            if (rawDev) cachedDev = JSON.parse(rawDev);
          } catch {}

          set({
            status: 'active',
            isActivated: true,
            errorMessage: null,
            isOfflineGraceActive: true,
            remainingGraceHours: graceCheck.remainingHours || 168,
            device: cachedDev || get().device || {
              id: authSnap.snapshot?.device_id || 'offline-device',
              device_name: get().deviceName || 'جهاز نقطة البيع',
              device_fingerprint: currentFp,
              status: 'active',
              is_active: true,
              is_registered: true,
              client_id: clientId,
            } as any
          });
          return;
        }
      }

      console.error('Unexpected device initialization error:', err);
      set({
        device: null,
        status: 'error',
        isActivated: false,
        errorMessage: err.message || 'حدث خطأ أثناء فحص الجهاز',
      });
    }
  },
}));


