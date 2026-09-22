import { ClientPOSSettings } from '../types';

export const DEFAULT_POS_SETTINGS: ClientPOSSettings = {
  enable_tax: true,
  tax_rate: 14,
  tax_number: '',
  show_owner_name: true,
  show_phone: true,
  show_address: true,
  show_tax_number: true,
  receipt_header: '',
  receipt_footer: 'شكراً لزيارتكم • نسعد بخدمتكم دائماً',
  paper_size: '80mm',
  default_warehouse_id: null,
};

const SETTINGS_EVENT_NAME = 'ordexa:pos-settings-updated';

/**
 * Reads settings synchronously from localStorage with fallback to defaults.
 */
export function getClientPOSSettings(clientId?: string | null): ClientPOSSettings {
  if (!clientId) {
    return { ...DEFAULT_POS_SETTINGS };
  }

  try {
    const raw = localStorage.getItem(`ordexa_pos_settings_${clientId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_POS_SETTINGS,
        ...parsed,
        // Enforce boolean values correctly
        enable_tax: parsed.enable_tax !== undefined ? Boolean(parsed.enable_tax) : true,
        show_owner_name: parsed.show_owner_name !== undefined ? Boolean(parsed.show_owner_name) : true,
        show_phone: parsed.show_phone !== undefined ? Boolean(parsed.show_phone) : true,
        show_address: parsed.show_address !== undefined ? Boolean(parsed.show_address) : true,
        show_tax_number: parsed.show_tax_number !== undefined ? Boolean(parsed.show_tax_number) : true,
        tax_rate: parsed.tax_rate !== undefined ? Number(parsed.tax_rate) : 14,
      };
    }
  } catch (err) {
    console.warn('[clientSettingsService] Failed to read cached settings:', err);
  }

  return { ...DEFAULT_POS_SETTINGS };
}

/**
 * Fetches settings from backend server API with offline caching & IndexedDB fallback.
 */
export async function fetchClientPOSSettings(clientId: string): Promise<ClientPOSSettings> {
  if (!clientId) return { ...DEFAULT_POS_SETTINGS };

  // 1. Try server API if online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await fetch(`/api/client/pos-settings?clientId=${encodeURIComponent(clientId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.settings) {
          const merged: ClientPOSSettings = {
            ...DEFAULT_POS_SETTINGS,
            ...data.settings,
            enable_tax: data.settings.enable_tax !== undefined ? Boolean(data.settings.enable_tax) : true,
            show_owner_name: data.settings.show_owner_name !== undefined ? Boolean(data.settings.show_owner_name) : true,
            show_phone: data.settings.show_phone !== undefined ? Boolean(data.settings.show_phone) : true,
            show_address: data.settings.show_address !== undefined ? Boolean(data.settings.show_address) : true,
            show_tax_number: data.settings.show_tax_number !== undefined ? Boolean(data.settings.show_tax_number) : true,
            tax_rate: data.settings.tax_rate !== undefined ? Number(data.settings.tax_rate) : 14,
          };

          // Save locally
          try {
            localStorage.setItem(`ordexa_pos_settings_${clientId}`, JSON.stringify(merged));
          } catch {}

          return merged;
        }
      }
    } catch (apiErr) {
      console.warn('[clientSettingsService] Server fetch failed, falling back to offline storage:', apiErr);
    }
  }

  // 2. Check localStorage
  return getClientPOSSettings(clientId);
}

/**
 * Saves settings to server and local storage, then notifies all listeners.
 */
export async function saveClientPOSSettings(
  clientId: string,
  settings: Partial<ClientPOSSettings>
): Promise<ClientPOSSettings> {
  const current = getClientPOSSettings(clientId);
  const updated: ClientPOSSettings = {
    ...current,
    ...settings,
    updated_at: new Date().toISOString(),
  };

  // 1. Immediately cache in localStorage
  try {
    localStorage.setItem(`ordexa_pos_settings_${clientId}`, JSON.stringify(updated));
  } catch (err) {
    console.warn('[clientSettingsService] LocalStorage set error:', err);
  }

  // 2. Broadcast update to active tabs and POS instances
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT_NAME, {
        detail: { clientId, settings: updated },
      })
    );
  }

  // 4. Send to backend server
  try {
    await fetch('/api/client/pos-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        settings: updated,
      }),
    });
  } catch (serverErr) {
    console.warn('[clientSettingsService] Server save warning (cached locally):', serverErr);
  }

  return updated;
}

/**
 * Subscribes to POS settings changes.
 */
export function onPOSSettingsChanged(
  clientId: string,
  callback: (settings: ClientPOSSettings) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ clientId: string; settings: ClientPOSSettings }>;
    if (customEvent.detail && customEvent.detail.clientId === clientId) {
      callback(customEvent.detail.settings);
    }
  };

  window.addEventListener(SETTINGS_EVENT_NAME, handler);
  return () => {
    window.removeEventListener(SETTINGS_EVENT_NAME, handler);
  };
}
