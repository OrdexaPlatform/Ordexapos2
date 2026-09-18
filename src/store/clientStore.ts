import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Client, License } from '../types';
import { getEffectiveLicenseStatus } from '../lib/licenseUtils';
import { offlineStorage } from '../lib/offline/offlineStorage';

interface ClientState {
  client: Client | null;
  license: License | null;
  effectiveLicenseStatus: string;
  loading: boolean;
  error: string | null;
  loadClient: (clientId: string) => Promise<void>;
  loadClientByCode: (clientCode: string) => Promise<Client | null>;
  resetClient: () => void;
}

let previousManifestBlobUrl: string | null = null;

export function updateDynamicManifestLink(clientCode: string, businessName?: string) {
  if (typeof document === 'undefined') return;
  
  // 1. Update Document Title
  if (businessName) {
    document.title = `${businessName} - Ordexa POS`;
  }

  // 2. Generate Dynamic PWA Manifest Blob (Works on any static host including Vercel)
  try {
    if (previousManifestBlobUrl) {
      URL.revokeObjectURL(previousManifestBlobUrl);
      previousManifestBlobUrl = null;
    }

    const manifestData = {
      name: businessName ? `${businessName} - Ordexa POS` : 'Ordexa POS',
      short_name: businessName || 'Ordexa POS',
      description: `نظام نقاط البيع وإدارة الفواتير السحابي والأوفلاين - ${businessName || 'Ordexa POS'}`,
      start_url: `/pos/${encodeURIComponent(clientCode)}`,
      scope: '/',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      dir: 'rtl',
      lang: 'ar',
      icons: [
        {
          src: '/assets/ordexa-icon.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/assets/ordexa-icon.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    const manifestBlob = new Blob([JSON.stringify(manifestData, null, 2)], {
      type: 'application/manifest+json',
    });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    previousManifestBlobUrl = manifestUrl;

    let manifestEl = document.getElementById('app-manifest') as HTMLLinkElement | null;
    if (manifestEl) {
      manifestEl.href = manifestUrl;
    } else {
      manifestEl = document.createElement('link');
      manifestEl.id = 'app-manifest';
      manifestEl.rel = 'manifest';
      manifestEl.href = manifestUrl;
      document.head.appendChild(manifestEl);
    }
  } catch (e) {
    console.warn('Could not generate dynamic manifest blob:', e);
  }
}

export const useClientStore = create<ClientState>((set, get) => ({
  client: null,
  license: null,
  effectiveLicenseStatus: 'unknown',
  loading: false,
  error: null,

  loadClientByCode: async (clientCode: string) => {
    if (!clientCode) {
      set({ error: 'رمز المنشأة مطلوب' });
      return null;
    }

    const normalizedCode = clientCode.trim();
    set({ loading: true, error: null });

    try {
      // 1. Try public API first (fast & secure server-side isolation when running with custom server)
      try {
        const res = await fetch(`/api/client/public-pos-config/${encodeURIComponent(normalizedCode)}`);
        
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const json = await res.json().catch(() => null);
          if (json && json.success && json.client) {
            const clientData = json.client as Client;
            
            // Scoped caching for offline use
            try {
              localStorage.setItem(`ordexa_cached_client_${clientData.id}`, JSON.stringify(clientData));
              localStorage.setItem(`ordexa_cached_client_by_code_${normalizedCode.toUpperCase()}`, JSON.stringify(clientData));
              localStorage.setItem('ordexa_last_client_code', normalizedCode.toUpperCase());
            } catch {
              // Storage quota full or restricted
            }

            // Update dynamic PWA manifest and window title
            updateDynamicManifestLink(clientData.client_code, clientData.business_name);

            set({
              client: clientData,
              effectiveLicenseStatus: json.client.has_active_license ? 'active' : (json.client.license_status || 'unknown'),
              loading: false,
              error: null,
            });

            return clientData;
          }
        } else if (res.status === 403) {
          const errJson = await res.json().catch(() => ({}));
          if (errJson.error) {
            throw new Error(errJson.error);
          }
        }
      } catch (fetchErr: any) {
        if (fetchErr.message?.includes('غير نشط')) {
          throw fetchErr;
        }
        console.warn('API endpoint did not return valid JSON config (or running on static Vercel), proceeding to direct Supabase query:', fetchErr);
      }

      // 2. Direct Supabase query (Essential for Vercel production hosting and direct client connections)
      const { data: dbClient, error: dbErr } = await supabase
        .from('clients')
        .select('*')
        .ilike('client_code', normalizedCode)
        .maybeSingle();

      if (dbErr) {
        console.warn('Supabase query for client code failed:', dbErr);
      } else if (dbClient) {
        try {
          localStorage.setItem(`ordexa_cached_client_${dbClient.id}`, JSON.stringify(dbClient));
          localStorage.setItem(`ordexa_cached_client_by_code_${normalizedCode.toUpperCase()}`, JSON.stringify(dbClient));
          localStorage.setItem('ordexa_last_client_code', normalizedCode.toUpperCase());
        } catch {}

        updateDynamicManifestLink(dbClient.client_code, dbClient.business_name);

        // Fetch active license for this client
        let dbLicense: any = null;
        try {
          const { data: lic } = await supabase
            .from('licenses')
            .select('*')
            .eq('client_id', dbClient.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          dbLicense = lic;
        } catch (licErr) {
          console.warn('Could not load active license for client:', licErr);
        }

        set({
          client: dbClient as Client,
          license: dbLicense,
          effectiveLicenseStatus: dbClient.status === 'active' ? 'active' : 'inactive',
          loading: false,
          error: null,
        });

        return dbClient as Client;
      } else {
        // Client not found in database, check offline cache
        try {
          const cachedRaw = localStorage.getItem(`ordexa_cached_client_by_code_${normalizedCode.toUpperCase()}`);
          if (cachedRaw) {
            const cachedClient = JSON.parse(cachedRaw) as Client;
            updateDynamicManifestLink(cachedClient.client_code, cachedClient.business_name);
            set({
              client: cachedClient,
              effectiveLicenseStatus: cachedClient.status === 'active' ? 'active' : 'inactive',
              loading: false,
              error: null,
            });
            return cachedClient;
          }
        } catch {}

        set({
          client: null,
          loading: false,
          error: `رمز المنشأة (${normalizedCode}) غير مسجل في النظام أو تم إيقافه`,
        });
        return null;
      }
    } catch (err: any) {
      console.warn('Network fetch for client code failed, checking offline cache:', err);

      // 3. Offline Cache Fallback
      try {
        const cachedRaw = localStorage.getItem(`ordexa_cached_client_by_code_${normalizedCode.toUpperCase()}`);
        if (cachedRaw) {
          const cachedClient = JSON.parse(cachedRaw) as Client;
          updateDynamicManifestLink(cachedClient.client_code, cachedClient.business_name);
          set({
            client: cachedClient,
            effectiveLicenseStatus: cachedClient.status === 'active' ? 'active' : 'inactive',
            loading: false,
            error: null,
          });
          return cachedClient;
        }
      } catch {}

      set({
        client: null,
        loading: false,
        error: err.message || 'فشل في تحميل بيانات المنشأة',
      });
      return null;
    }
  },

  loadClient: async (clientId: string) => {
    if (!clientId) {
      set({ client: null, license: null, effectiveLicenseStatus: 'unknown', loading: false, error: 'معرف العميل غير محدد' });
      return;
    }

    set({ loading: true, error: null });

    try {
      // 1. Try secure backend server route first (guaranteed isolation & reliable auth)
      const sessionRes = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const token = sessionRes.data?.session?.access_token;
      if (token) {
        try {
          const apiRes = await fetch(`/api/client-by-id/${clientId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (apiRes.ok) {
            const json = await apiRes.json();
            if (json.success && json.client) {
              const clientData = json.client as Client;
              const licenseData = json.license as License | null;
              const effectiveStatus = json.effectiveLicenseStatus || (licenseData ? getEffectiveLicenseStatus(licenseData.status, licenseData.expiry_date) : 'no_license');

              try {
                localStorage.setItem(`ordexa_cached_client_${clientId}`, JSON.stringify(clientData));
                if (clientData.client_code) {
                  localStorage.setItem(`ordexa_cached_client_by_code_${clientData.client_code.toUpperCase()}`, JSON.stringify(clientData));
                  localStorage.setItem('ordexa_last_client_code', clientData.client_code.toUpperCase());
                }
              } catch {}

              set({
                client: clientData,
                license: licenseData,
                effectiveLicenseStatus: effectiveStatus,
                loading: false,
                error: null,
              });
              return;
            }
          }
        } catch (apiErr) {
          console.warn('Backend client-by-id API failed, falling back to direct DB:', apiErr);
        }
      }

      // Check offline cached license first if available
      const cachedLicenseRecord = await offlineStorage.getCachedLicense(clientId).catch(() => null);

      // 2. Fetch Client profile
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (clientErr) {
        // If offline or network error and we have cached data in localStorage
        const localClient = localStorage.getItem(`ordexa_cached_client_${clientId}`);
        if (localClient) {
          const parsedClient = JSON.parse(localClient);
          set({
            client: parsedClient,
            license: cachedLicenseRecord ? ({
              id: cachedLicenseRecord.license_id,
              client_id: cachedLicenseRecord.client_id,
              license_key: cachedLicenseRecord.license_key,
              status: cachedLicenseRecord.status,
            } as any) : null,
            effectiveLicenseStatus: cachedLicenseRecord ? cachedLicenseRecord.status : (parsedClient.status === 'active' ? 'active' : 'unknown'),
            loading: false,
            error: null,
          });
          return;
        }
        throw new Error(clientErr.message || 'فشل في تحميل بيانات المنشأة');
      }

      if (!clientData) {
        throw new Error('لم يتم العثور على سجل العميل');
      }

      // Cache client profile for offline access
      try {
        localStorage.setItem(`ordexa_cached_client_${clientId}`, JSON.stringify(clientData));
      } catch {
        // localStorage full or restricted
      }

      // 2. Fetch primary/active license for this client
      const { data: licenseData, error: licenseErr } = await supabase
        .from('licenses')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (licenseErr) {
        console.warn('License query error:', licenseErr);
      }

      let effectiveStatus = 'no_license';
      if (licenseData) {
        effectiveStatus = getEffectiveLicenseStatus(licenseData.status, licenseData.expiry_date);
        // Automatically cache license for offline grace period
        try {
          await offlineStorage.cacheLicenseValidation({
            clientId: licenseData.client_id,
            licenseId: licenseData.id,
            licenseKey: licenseData.license_key || '',
            deviceFingerprint: licenseData.device_fingerprint || 'default_device',
            status: licenseData.status,
            maxOfflineHours: licenseData.max_offline_hours || 72,
          });
        } catch (cacheErr) {
          console.warn('Could not cache license for offline mode:', cacheErr);
        }
      }

      set({
        client: clientData as Client,
        license: licenseData as License | null,
        effectiveLicenseStatus: effectiveStatus,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.error('Error loading client store:', err);

      // Offline fallback from cache
      try {
        const localClient = localStorage.getItem(`ordexa_cached_client_${clientId}`);
        const cachedLicenseRecord = await offlineStorage.getCachedLicense(clientId).catch(() => null);
        if (localClient) {
          const parsedClient = JSON.parse(localClient);
          set({
            client: parsedClient,
            license: cachedLicenseRecord ? ({
              id: cachedLicenseRecord.license_id,
              client_id: cachedLicenseRecord.client_id,
              license_key: cachedLicenseRecord.license_key,
              status: cachedLicenseRecord.status,
            } as any) : null,
            effectiveLicenseStatus: cachedLicenseRecord ? cachedLicenseRecord.status : 'active',
            loading: false,
            error: null,
          });
          return;
        }
      } catch {
        // fallback failed
      }

      set({
        client: null,
        license: null,
        effectiveLicenseStatus: 'unknown',
        loading: false,
        error: err.message || 'حدث خطأ أثناء تحميل بيانات العميل',
      });
    }
  },

  resetClient: () => {
    set({
      client: null,
      license: null,
      effectiveLicenseStatus: 'unknown',
      loading: false,
      error: null,
    });
  },
}));
