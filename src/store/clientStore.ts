import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Client, License } from '../types';
import { getEffectiveLicenseStatus } from '../lib/licenseUtils';

interface ClientState {
  client: Client | null;
  license: License | null;
  effectiveLicenseStatus: string;
  loading: boolean;
  error: string | null;
  loadClient: (clientId: string) => Promise<void>;
  resetClient: () => void;
}

export const useClientStore = create<ClientState>((set) => ({
  client: null,
  license: null,
  effectiveLicenseStatus: 'unknown',
  loading: false,
  error: null,

  loadClient: async (clientId: string) => {
    if (!clientId) {
      set({ client: null, license: null, effectiveLicenseStatus: 'unknown', loading: false, error: 'معرف العميل غير محدد' });
      return;
    }

    set({ loading: true, error: null });

    try {
      // 1. Fetch Client profile
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (clientErr) {
        throw new Error(clientErr.message || 'فشل في تحميل بيانات المنشأة');
      }

      if (!clientData) {
        throw new Error('لم يتم العثور على سجل العميل');
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
