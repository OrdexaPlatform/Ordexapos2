import { supabase, supabaseAnonQuery } from './supabase';
import { logActivity } from './activityLogger';
import { getEffectiveLicenseStatus } from './licenseUtils';
import { Device, License } from '../types';

export interface DeviceActivationParams {
  licenseKey: string;
  deviceName: string;
  deviceFingerprint: string;
  operatingSystem?: string;
  appVersion?: string;
}

export interface DeviceActivationResult {
  success: boolean;
  device?: Device;
  license?: License;
  message: string;
  errorCode?: 'LICENSE_NOT_FOUND' | 'LICENSE_INACTIVE' | 'MAX_DEVICES_REACHED' | 'DB_ERROR';
}

/**
 * Real device activation logic implementing business rules:
 * 1. Verify license exists
 * 2. Verify license is active (not suspended, not revoked, not expired)
 * 3. Handle duplicate fingerprint (idempotent / reactivation without leaking device slots)
 * 4. Verify max_devices quota against currently active devices
 * 5. Create device or reactivate existing device
 * 6. Update activated_devices counter accurately
 * 7. Log activity with client_id, license_id, device_id, fingerprint, and reason
 */
export async function activateDevice(params: DeviceActivationParams): Promise<DeviceActivationResult> {
  const {
    licenseKey,
    deviceName,
    deviceFingerprint,
    operatingSystem,
    appVersion,
  } = params;

  try {
    // 1. Fetch license by key
    const { data: license, error: licenseErr } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', licenseKey.trim())
      .maybeSingle();

    if (licenseErr) {
      console.error('Database error querying license:', licenseErr);
      return {
        success: false,
        message: 'خطأ في التحقق من الترخيص بقاعدة البيانات',
        errorCode: 'DB_ERROR',
      };
    }

    if (!license) {
      await logActivity({
        action: 'device_activation_rejected',
        entityType: 'device',
        metadata: {
          license_key: licenseKey,
          fingerprint: deviceFingerprint,
          device_name: deviceName,
          reason: 'مفتاح الترخيص غير موجود في النظام',
        },
      });

      return {
        success: false,
        message: 'مفتاح الترخيص غير موجود أو غير صحيح',
        errorCode: 'LICENSE_NOT_FOUND',
      };
    }

    // 2. Check effective license status
    const effectiveStatus = getEffectiveLicenseStatus(license.status, license.expiry_date);

    if (effectiveStatus !== 'active') {
      let statusReason = 'الترخيص غير نشط';
      if (effectiveStatus === 'revoked') statusReason = 'الترخيص ملغي نهائياً';
      else if (effectiveStatus === 'suspended') statusReason = 'الترخيص موقوف مؤقتاً';
      else if (effectiveStatus === 'expired') statusReason = 'الترخيص منتهي الصلاحية';

      await logActivity({
        action: 'device_activation_rejected',
        entityType: 'device',
        entityId: license.id,
        metadata: {
          client_id: license.client_id,
          license_id: license.id,
          license_key: licenseKey,
          fingerprint: deviceFingerprint,
          device_name: deviceName,
          license_status: license.status,
          effective_status: effectiveStatus,
          expiry_date: license.expiry_date,
          reason: statusReason,
        },
      });

      return {
        success: false,
        message: `لا يمكن تفعيل الجهاز: ${statusReason}`,
        errorCode: 'LICENSE_INACTIVE',
      };
    }

    // 3. Duplicate device fingerprint check
    const { data: existingDevice, error: devCheckErr } = await supabase
      .from('devices')
      .select('*')
      .eq('device_fingerprint', deviceFingerprint)
      .maybeSingle();

    if (devCheckErr) {
      console.error('Database error checking existing device fingerprint:', devCheckErr);
      return {
        success: false,
        message: 'خطأ أثناء فحص البصمة الرقمية للجهاز',
        errorCode: 'DB_ERROR',
      };
    }

    // 4. Count currently active devices for this license
    const { count: currentActiveCount, error: countErr } = await supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', license.id)
      .eq('status', 'active');

    if (countErr) {
      console.error('Error counting active devices:', countErr);
      return {
        success: false,
        message: 'خطأ في فحص عدد الأجهزة المرتبطة',
        errorCode: 'DB_ERROR',
      };
    }

    const activeDevicesCount = currentActiveCount || 0;

    // Case A: Device with this fingerprint already exists
    if (existingDevice) {
      // If it belongs to the same license and is already active:
      if (existingDevice.license_id === license.id && existingDevice.status === 'active') {
        // Update heartbeat info
        const { data: updatedDevice } = await supabase
          .from('devices')
          .update({
            device_name: deviceName || existingDevice.device_name,
            operating_system: operatingSystem || existingDevice.operating_system,
            app_version: appVersion || existingDevice.app_version,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existingDevice.id)
          .select()
          .single();

        return {
          success: true,
          device: updatedDevice || existingDevice,
          license,
          message: 'الجهاز مسجل ونشط بالفعل لهذا الترخيص',
        };
      }

      // If existing device was deactivated (or registered under this license as deactivated):
      // Check if there is capacity
      if (activeDevicesCount >= license.max_devices) {
        await logActivity({
          action: 'device_activation_rejected',
          entityType: 'device',
          entityId: existingDevice.id,
          metadata: {
            client_id: license.client_id,
            license_id: license.id,
            device_id: existingDevice.id,
            fingerprint: deviceFingerprint,
            max_devices: license.max_devices,
            active_devices_count: activeDevicesCount,
            reason: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص.',
          },
        });

        return {
          success: false,
          message: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص.',
          errorCode: 'MAX_DEVICES_REACHED',
        };
      }

      // Reactivate existing device under this license
      const { data: reactivatedDevice, error: reactivateErr } = await supabase
        .from('devices')
        .update({
          client_id: license.client_id,
          license_id: license.id,
          device_name: deviceName || existingDevice.device_name,
          operating_system: operatingSystem || existingDevice.operating_system,
          app_version: appVersion || existingDevice.app_version,
          status: 'active',
          activated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          deactivated_at: null,
        })
        .eq('id', existingDevice.id)
        .select()
        .single();

      if (reactivateErr) throw reactivateErr;

      // Update activated_devices counter
      const newActiveCount = activeDevicesCount + 1;
      await supabase
        .from('licenses')
        .update({ activated_devices: newActiveCount, updated_at: new Date().toISOString() })
        .eq('id', license.id);

      await logActivity({
        action: 'device_activated',
        entityType: 'device',
        entityId: existingDevice.id,
        metadata: {
          client_id: license.client_id,
          license_id: license.id,
          device_id: existingDevice.id,
          fingerprint: deviceFingerprint,
          device_name: deviceName,
          is_reactivation: true,
          activated_devices: newActiveCount,
          max_devices: license.max_devices,
        },
      });

      return {
        success: true,
        device: reactivatedDevice,
        license,
        message: 'تمت إعادة تفعيل الجهاز بنجاح',
      };
    }

    // Case B: Brand new device
    // Verify capacity
    if (activeDevicesCount >= license.max_devices) {
      await logActivity({
        action: 'device_activation_rejected',
        entityType: 'device',
        metadata: {
          client_id: license.client_id,
          license_id: license.id,
          fingerprint: deviceFingerprint,
          device_name: deviceName,
          max_devices: license.max_devices,
          active_devices_count: activeDevicesCount,
          reason: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص.',
        },
      });

      return {
        success: false,
        message: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص.',
        errorCode: 'MAX_DEVICES_REACHED',
      };
    }

    // Insert new device record
    const { data: newDevice, error: insertDevErr } = await supabase
      .from('devices')
      .insert({
        client_id: license.client_id,
        license_id: license.id,
        device_name: deviceName,
        device_fingerprint: deviceFingerprint,
        operating_system: operatingSystem || null,
        app_version: appVersion || null,
        status: 'active',
        activated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertDevErr) throw insertDevErr;

    // Update activated_devices in license table
    const newActiveCount = activeDevicesCount + 1;
    await supabase
      .from('licenses')
      .update({
        activated_devices: newActiveCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', license.id);

    await logActivity({
      action: 'device_activated',
      entityType: 'device',
      entityId: newDevice.id,
      metadata: {
        client_id: license.client_id,
        license_id: license.id,
        device_id: newDevice.id,
        fingerprint: deviceFingerprint,
        device_name: deviceName,
        is_reactivation: false,
        activated_devices: newActiveCount,
        max_devices: license.max_devices,
      },
    });

    return {
      success: true,
      device: newDevice,
      license,
      message: 'تم تفعيل الجهاز وربطه بالترخيص بنجاح',
    };
  } catch (error: any) {
    console.error('Error during device activation:', error);
    return {
      success: false,
      message: error.message || 'حدث خطأ غير متوقع أثناء تفعيل الجهاز',
      errorCode: 'DB_ERROR',
    };
  }
}

/**
 * Deactivates an active device:
 * 1. Updates status to 'deactivated' and sets deactivated_at
 * 2. Recalculates and syncs activated_devices counter on the license
 * 3. Logs device_deactivated in activity_logs
 * Note: Historical device data is preserved, NEVER deleted.
 */
export async function deactivateDevice(
  deviceId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Fetch current device details
    const { data: device, error: fetchErr } = await supabase
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!device) {
      return { success: false, message: 'الجهاز غير موجود' };
    }

    if (device.status === 'deactivated') {
      return { success: true, message: 'الجهاز معطل بالفعل' };
    }

    // 2. Mark device as deactivated
    const nowIso = new Date().toISOString();
    const { error: updateDevErr } = await supabase
      .from('devices')
      .update({
        status: 'deactivated',
        deactivated_at: nowIso,
      })
      .eq('id', deviceId);

    if (updateDevErr) throw updateDevErr;

    // 3. Count remaining active devices for this license
    const { count: remainingActiveCount, error: countErr } = await supabase
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', device.license_id)
      .eq('status', 'active');

    if (!countErr && remainingActiveCount !== null) {
      await supabase
        .from('licenses')
        .update({
          activated_devices: remainingActiveCount,
          updated_at: nowIso,
        })
        .eq('id', device.license_id);
    }

    // 4. Log activity
    await logActivity({
      action: 'device_deactivated',
      entityType: 'device',
      entityId: device.id,
      metadata: {
        client_id: device.client_id,
        license_id: device.license_id,
        device_id: device.id,
        fingerprint: device.device_fingerprint,
        device_name: device.device_name,
        remaining_active_devices: remainingActiveCount,
        reason: reason || 'تم إلغاء التفعيل بواسطة مسؤول النظام',
      },
    });

    return { success: true, message: 'تم إلغاء تفعيل الجهاز وتحرير المقعد بنجاح' };
  } catch (error: any) {
    console.error('Error deactivating device:', error);
    return { success: false, message: error.message || 'فشل في إلغاء تفعيل الجهاز' };
  }
}

/**
 * Validates POS terminal and license in real-time.
 * First tries atomic RPC validate_pos_license; falls back to direct queries if not deployed.
 */
export async function validatePOSLicense(
  clientId?: string,
  deviceFingerprint?: string
): Promise<import('../types').POSLicenseValidationResult> {
  try {
    const { data, error } = await supabase.rpc('validate_pos_license', {
      p_client_id: clientId || null,
      p_device_fingerprint: deviceFingerprint || null,
    });

    if (!error && data && data.is_valid) {
      return data as import('../types').POSLicenseValidationResult;
    }
    
    if (data && !data.is_valid) {
      console.warn('validate_pos_license RPC returned invalid result (e.g. UNAUTHENTICATED), proceeding to direct client-side verification:', data);
    }
  } catch (err) {
    console.warn('validate_pos_license RPC error, falling back to client-side verification:', err);
  }

  // Fallback verification via direct tables
  try {
    if (!clientId) {
      return {
        is_valid: false,
        error_code: 'CLIENT_NOT_FOUND',
        message: 'معرف المنشأة مطلوب لفحص الترخيص',
      };
    }

    // 1. Client
    const { data: client, error: clientErr } = await supabaseAnonQuery
      .from('clients')
      .select('id, business_name, status')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return {
        is_valid: false,
        error_code: 'CLIENT_NOT_FOUND',
        message: 'المنشأة غير موجودة في النظام',
      };
    }

    if (client.status !== 'active') {
      return {
        is_valid: false,
        error_code: `CLIENT_${client.status.toUpperCase()}`,
        message: 'حساب المنشأة موقوف أو غير نشط. يرجى مراجعة إدارة النظام.',
        client,
      };
    }

    // 2. License
    const { data: license, error: licErr } = await supabaseAnonQuery
      .from('licenses')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (licErr || !license) {
      return {
        is_valid: false,
        error_code: 'NO_ACTIVE_LICENSE',
        message: 'لا يوجد ترخيص مسجل لهذه المنشأة. يرجى الاشتراك أو التجديد.',
        client,
      };
    }

    const now = new Date();
    const expiry = new Date(license.expiry_date);
    const diffMs = expiry.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (license.status !== 'active' || daysLeft < 0) {
      const code = daysLeft < 0 ? 'LICENSE_EXPIRED' : `LICENSE_${license.status.toUpperCase()}`;
      return {
        is_valid: false,
        error_code: code,
        message: daysLeft < 0 ? 'انتهت صلاحية ترخيص المنشأة' : `ترخيص المنشأة بحالة: ${license.status}`,
        client,
        license: {
          id: license.id,
          license_key: license.license_key,
          license_type: license.license_type,
          status: license.status,
          expiry_date: license.expiry_date,
          days_left: Math.max(0, daysLeft),
          max_devices: license.max_devices,
          activated_devices: license.activated_devices,
        },
      };
    }

    // 3. Device check
    let deviceData = null;
    if (deviceFingerprint) {
      const { data: dev } = await supabaseAnonQuery
        .from('devices')
        .select('*')
        .eq('client_id', clientId)
        .eq('device_fingerprint', deviceFingerprint)
        .maybeSingle();

      if (dev) {
        deviceData = {
          id: dev.id,
          device_name: dev.device_name,
          device_fingerprint: dev.device_fingerprint,
          status: dev.status,
          is_registered: true,
          is_active: dev.status === 'active',
          last_seen_at: dev.last_seen_at,
        };

        if (dev.status !== 'active') {
          return {
            is_valid: false,
            error_code: 'DEVICE_DEACTIVATED',
            message: 'تم إلغاء تفعيل هذا الجهاز من لوحة الإدارة',
            client,
            license: {
              id: license.id,
              license_key: license.license_key,
              license_type: license.license_type,
              status: license.status,
              expiry_date: license.expiry_date,
              days_left: daysLeft,
              max_devices: license.max_devices,
              activated_devices: license.activated_devices,
            },
            device: deviceData,
          };
        }
      } else {
        deviceData = {
          id: '',
          device_name: 'جهاز غير مسجل',
          device_fingerprint: deviceFingerprint,
          status: 'unregistered',
          is_registered: false,
          is_active: false,
        };
      }
    }

    return {
      is_valid: true,
      message: 'الترخيص والجهاز نشطان وصالحان للعمل',
      client,
      license: {
        id: license.id,
        license_key: license.license_key,
        license_type: license.license_type,
        status: license.status,
        expiry_date: license.expiry_date,
        days_left: daysLeft,
        max_devices: license.max_devices,
        activated_devices: license.activated_devices,
      },
      device: deviceData || undefined,
    };
  } catch (e: any) {
    return {
      is_valid: false,
      error_code: 'VERIFICATION_ERROR',
      message: e.message || 'فشل التحقق من صلاحية الترخيص',
    };
  }
}

/**
 * Registers / Activates a POS terminal atomically
 */
export async function registerPOSTerminal(params: {
  clientId: string;
  licenseKey: string;
  deviceName: string;
  deviceFingerprint: string;
  operatingSystem?: string;
  appVersion?: string;
}): Promise<{ success: boolean; device?: import('../types').Device; message: string; errorCode?: string }> {
  // 1. Try secure backend server API first
  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;
    if (token) {
      const res = await fetch('/api/devices/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: params.clientId,
          deviceFingerprint: params.deviceFingerprint,
          deviceName: params.deviceName,
          operatingSystem: params.operatingSystem || 'Web POS Client',
          appVersion: params.appVersion || '1.0.0',
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        return {
          success: true,
          device: json.device,
          message: json.message || 'تم تسجيل نقطة البيع بنجاح',
        };
      } else if (res.status === 403) {
        return {
          success: false,
          message: json.error || 'تم استنفاد الحد الأقصى للأجهزة المسموح بها في ترخيصكم',
          errorCode: json.error_code || 'MAX_DEVICES_REACHED',
        };
      }
    }
  } catch (apiErr) {
    console.warn('Backend device register API unavailable, falling back to RPC:', apiErr);
  }

  // 2. Try RPC register_pos_terminal
  try {
    const { data, error } = await supabase.rpc('register_pos_terminal', {
      p_client_id: params.clientId,
      p_license_key: params.licenseKey,
      p_device_name: params.deviceName,
      p_device_fingerprint: params.deviceFingerprint,
      p_operating_system: params.operatingSystem || 'Web POS Client',
      p_app_version: params.appVersion || '1.0.0',
    });

    if (!error && data) {
      if (data.success) {
        return {
          success: true,
          device: data.device,
          message: data.message || 'تم تسجيل نقطة البيع بنجاح',
        };
      } else {
        return {
          success: false,
          message: data.message || 'فشل تسجيل الجهاز',
        };
      }
    }
  } catch (err) {
    console.warn('RPC register_pos_terminal failed, falling back to activateDevice:', err);
  }

  // 3. Fallback to client-side activation logic
  const res = await activateDevice({
    licenseKey: params.licenseKey,
    deviceName: params.deviceName,
    deviceFingerprint: params.deviceFingerprint,
    operatingSystem: params.operatingSystem,
    appVersion: params.appVersion,
  });

  return {
    success: res.success,
    device: res.device,
    message: res.message,
    errorCode: res.errorCode,
  };
}

/**
 * Deactivates a POS terminal
 */
export async function deactivatePOSTerminal(
  clientId: string,
  deviceId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('deactivate_pos_terminal', {
      p_client_id: clientId,
      p_device_id: deviceId,
      p_reason: reason || null,
    });

    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn('RPC deactivate_pos_terminal failed, falling back:', err);
  }

  return await deactivateDevice(deviceId, reason);
}

