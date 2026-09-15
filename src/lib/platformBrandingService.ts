/**
 * Platform Branding Service for Ordexa Windows Application
 * Handles the platform-wide Windows App Icon, separate from individual client logos.
 */

import { processAndOptimizeImage, ImageValidationResult } from './imageUploadUtils';
import { supabase } from './supabase';

export interface PlatformIconInfo {
  iconUrl: string;
  isCustom: boolean;
  updatedAt?: string;
  fileName?: string;
  fileSizeFormatted?: string;
}

const STORAGE_KEY_PLATFORM_ICON = 'ordexa_platform_windows_icon';
const STORAGE_KEY_PLATFORM_META = 'ordexa_platform_windows_icon_meta';
export const DEFAULT_PLATFORM_ICON_URL = '/assets/ordexa-icon.png';

/**
 * Retrieve the current Platform Windows Icon information.
 */
export async function getPlatformWindowsIconInfo(): Promise<PlatformIconInfo> {
  // 1. Check local cached state
  const cachedDataUrl = localStorage.getItem(STORAGE_KEY_PLATFORM_ICON);
  const cachedMetaRaw = localStorage.getItem(STORAGE_KEY_PLATFORM_META);
  let meta: any = {};
  if (cachedMetaRaw) {
    try {
      meta = JSON.parse(cachedMetaRaw);
    } catch {
      // ignore
    }
  }

  // 2. Try fetching from server API
  try {
    const res = await fetch('/api/platform/icon');
    if (res.ok) {
      const serverData = await res.json();
      if (serverData.success && serverData.hasCustomIcon) {
        return {
          iconUrl: serverData.iconUrl || cachedDataUrl || DEFAULT_PLATFORM_ICON_URL,
          isCustom: true,
          updatedAt: serverData.updatedAt || meta.updatedAt,
          fileName: serverData.fileName || meta.fileName,
          fileSizeFormatted: serverData.fileSizeFormatted || meta.fileSizeFormatted,
        };
      }
    }
  } catch {
    // offline or static fallback
  }

  if (cachedDataUrl) {
    return {
      iconUrl: cachedDataUrl,
      isCustom: true,
      updatedAt: meta.updatedAt,
      fileName: meta.fileName,
      fileSizeFormatted: meta.fileSizeFormatted,
    };
  }

  return {
    iconUrl: DEFAULT_PLATFORM_ICON_URL,
    isCustom: false,
  };
}

/**
 * Upload and save a new Platform Windows Icon from a local file.
 * Stored safely on the server and cached in client storage.
 */
export async function savePlatformWindowsIcon(file: File): Promise<{
  success: boolean;
  message?: string;
  iconInfo?: PlatformIconInfo;
}> {
  try {
    // 1. Optimize image (max 512x512 PNG, preserve crispness)
    const result: ImageValidationResult = await processAndOptimizeImage(file, {
      maxWidth: 512,
      maxHeight: 512,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    if (!result.valid || !result.dataUrl) {
      return { success: false, message: result.error || 'فشل في معالجة ملف الصورة.' };
    }

    const updatedAt = new Date().toISOString();
    const meta = {
      updatedAt,
      fileName: file.name,
      fileSizeFormatted: result.fileSizeFormatted,
      width: result.width,
      height: result.height,
    };

    // 2. Save in client local storage
    localStorage.setItem(STORAGE_KEY_PLATFORM_ICON, result.dataUrl);
    localStorage.setItem(STORAGE_KEY_PLATFORM_META, JSON.stringify(meta));

    // 3. Sync with Express server
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const response = await fetch('/api/platform/icon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          imageBase64: result.dataUrl,
          mimeType: 'image/png',
          fileName: file.name,
          updatedAt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('Server icon sync returned non-200:', errorData.error || response.statusText);
      }
    } catch (serverErr) {
      console.warn('Server icon sync network error, saved locally:', serverErr);
    }

    return {
      success: true,
      message: 'تم تحديث شعار أيقونة نظام Ordexa للـ Windows بنجاح',
      iconInfo: {
        iconUrl: result.dataUrl,
        isCustom: true,
        updatedAt,
        fileName: file.name,
        fileSizeFormatted: result.fileSizeFormatted,
      },
    };
  } catch (err: any) {
    console.error('Error saving platform windows icon:', err);
    return {
      success: false,
      message: err.message || 'حدث خطأ غير متوقع أثناء حفظ أيقونة المنصة.',
    };
  }
}

/**
 * Reset the Platform Windows Icon back to the default Ordexa icon.
 */
export async function resetPlatformWindowsIcon(): Promise<{ success: boolean; message: string }> {
  try {
    localStorage.removeItem(STORAGE_KEY_PLATFORM_ICON);
    localStorage.removeItem(STORAGE_KEY_PLATFORM_META);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      await fetch('/api/platform/icon', {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
    } catch {
      // offline fallback
    }

    return {
      success: true,
      message: 'تمت استعادة أيقونة Ordexa الافتراضية بنجاح.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'فشل في استعادة الأيقونة الافتراضية.',
    };
  }
}
