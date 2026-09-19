import { supabase } from './supabase';
import { offlineStorage } from './offline/offlineStorage';
import { 
  Shift, 
  ShiftSummary, 
  CashRegister, 
  CashDrawerTransaction, 
  OpenShiftPayload, 
  CloseShiftPayload, 
  CashDrawerMovementPayload 
} from '../types';

export const shiftService = {
  /**
   * Fetch current active open shift for the authenticated user / register
   */
  async getActiveShift(clientId?: string): Promise<Shift | null> {
    // 0. If offline, immediately return locally cached shift
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (clientId) {
        const cached = await offlineStorage.getCurrentShift(clientId);
        if (cached && cached.status === 'open') return cached;
        try {
          const raw = localStorage.getItem(`ordexa_active_shift_${clientId}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.status === 'open') return parsed;
          }
        } catch {}
      }
      return null;
    }

    try {
      const { data, error } = await supabase.rpc('get_active_shift', {
        p_client_id: clientId || null,
      });

      if (error) {
        // If RPC isn't executed in DB yet or fails, fallback to direct query
        console.warn('RPC get_active_shift returned error, trying fallback:', error.message);
        const fallbackShift = await this.getActiveShiftFallback(clientId);
        if (fallbackShift && clientId) {
          offlineStorage.saveCurrentShift(clientId, fallbackShift).catch(() => {});
          try { localStorage.setItem(`ordexa_active_shift_${clientId}`, JSON.stringify(fallbackShift)); } catch {}
        }
        return fallbackShift;
      }

      if (!data) {
        if (clientId) {
          // If server explicitly says no open shift, clear local shift
          offlineStorage.saveCurrentShift(clientId, null).catch(() => {});
          try { localStorage.removeItem(`ordexa_active_shift_${clientId}`); } catch {}
        }
        return null;
      }

      // Extract shift object
      const shiftObj: Shift = {
        id: data.id,
        client_id: data.client_id,
        shift_number: data.shift_number,
        status: data.status,
        opened_at: data.opened_at,
        opened_by: data.opened_by,
        cashier_name: data.cashier_name,
        register_id: data.register_id,
        register_name: data.register_name,
        warehouse_id: data.warehouse_id,
        warehouse_name: data.warehouse_name,
        opening_cash: Number(data.opening_cash || 0),
        opening_notes: data.opening_notes,
        closing_cash_expected: Number(data.summary?.expected_cash || 0),
        closing_cash_actual: data.summary?.closing_cash_actual,
        cash_difference: Number(data.summary?.cash_difference || 0),
        total_sales_amount: Number(data.summary?.total_sales_amount || 0),
        total_cash_sales: Number(data.summary?.total_cash_sales || 0),
        total_card_sales: Number(data.summary?.total_card_sales || 0),
        total_other_sales: Number(data.summary?.total_other_sales || 0),
        total_refunds_amount: Number(data.summary?.total_refunds_amount || 0),
        total_cash_in: Number(data.summary?.total_cash_in || 0),
        total_cash_out: Number(data.summary?.total_cash_out || 0),
        orders_count: Number(data.summary?.orders_count || 0),
        created_at: data.opened_at,
        updated_at: data.opened_at,
      };

      if (clientId) {
        offlineStorage.saveCurrentShift(clientId, shiftObj).catch(() => {});
        try { localStorage.setItem(`ordexa_active_shift_${clientId}`, JSON.stringify(shiftObj)); } catch {}
      }

      return shiftObj;
    } catch (err: any) {
      console.error('Failed to get active shift, trying local cache fallback:', err);
      if (clientId) {
        const cached = await offlineStorage.getCurrentShift(clientId);
        if (cached && cached.status === 'open') return cached;
        try {
          const raw = localStorage.getItem(`ordexa_active_shift_${clientId}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.status === 'open') return parsed;
          }
        } catch {}
      }
      return null;
    }
  },

  /**
   * Fallback query in case RPC execution hasn't run yet in dev
   */
  async getActiveShiftFallback(clientId?: string): Promise<Shift | null> {
    try {
      let query = supabase
        .from('shifts')
        .select(`
          *,
          warehouse:warehouses(id, name, code),
          register:cash_registers(id, name, code),
          device:devices(id, device_name, device_fingerprint, status),
          opened_by_user:client_users!shifts_opened_by_fkey(id, name, role)
        `)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1);

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      const item = data[0];
      return {
        ...item,
        cashier_name: (item.opened_by_user as any)?.name || (item.opened_by_user as any)?.full_name || 'الكاشير',
        register_name: item.register?.name || 'نقطة البيع',
        warehouse_name: item.warehouse?.name || 'المستودع الرئيسي',
      };
    } catch {
      return null;
    }
  },

  /**
   * Open a new shift atomically with authenticated cashier identity
   */
  async openShift(payload: OpenShiftPayload): Promise<{ success: boolean; shift_id: string; shift_number: string }> {
    // 1. Resolve Authenticated User and Profile Mapping (Requirement 2, 4, 7)
    let authUser: any = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      authUser = authData?.user || null;
    } catch {}

    // Check cached auth user in localStorage if network error or offline
    const cachedAuthUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_cached_auth_user') : null;
    const cachedClientUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_cached_client_user') : null;
    let cachedAuthUser: any = null;
    let cachedClientUser: any = null;
    try { if (cachedAuthUserStr) cachedAuthUser = JSON.parse(cachedAuthUserStr); } catch {}
    try { if (cachedClientUserStr) cachedClientUser = JSON.parse(cachedClientUserStr); } catch {}

    const effectiveAuthUserId = authUser?.id || cachedAuthUser?.id || payload.user_id || null;
    let clientUserId: string | null = payload.opened_by || null;
    let cashierName: string = 'الكاشير';

    if (cachedClientUser && cachedClientUser.client_id === payload.client_id) {
      clientUserId = clientUserId || cachedClientUser.id;
      cashierName = cachedClientUser.name || cashierName;
    }

    // If online and we have an auth user, verify/resolve against client_users table
    if (typeof navigator !== 'undefined' && navigator.onLine && (effectiveAuthUserId || authUser?.email)) {
      try {
        if (effectiveAuthUserId) {
          const { data: cuList } = await supabase
            .from('client_users')
            .select('id, client_id, name, status, role')
            .eq('client_id', payload.client_id)
            .or(`auth_user_id.eq.${effectiveAuthUserId},id.eq.${effectiveAuthUserId}`)
            .eq('status', 'active')
            .limit(1);

          if (cuList && cuList.length > 0) {
            clientUserId = cuList[0].id;
            cashierName = cuList[0].name || cashierName;
          }
        }

        if (!clientUserId && authUser?.email) {
          const { data: cuByEmail } = await supabase
            .from('client_users')
            .select('id, client_id, name, status, role')
            .eq('client_id', payload.client_id)
            .ilike('email', authUser.email.trim().toLowerCase())
            .eq('status', 'active')
            .limit(1);

          if (cuByEmail && cuByEmail.length > 0) {
            clientUserId = cuByEmail[0].id;
            cashierName = cuByEmail[0].name || cashierName;
          }
        }
      } catch (e) {
        console.warn('Could not query client_users from client:', e);
      }
    }

    const finalOpenedBy = clientUserId || effectiveAuthUserId;

    // Requirement 7: If no authenticated user can be resolved, DO NOT send NULL or proceed
    if (!finalOpenedBy) {
      throw new Error('تعذر تحديد حساب الكاشير. يرجى تسجيل الدخول مرة أخرى.');
    }

    // 0. Offline creation if network disconnected (Requirement 6)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineShiftId = `OFF-SHIFT-${Date.now()}`;
      const shiftNumber = `SH-OFF-${Date.now().toString().slice(-4)}`;
      const offlineShift: Shift = {
        id: offlineShiftId,
        client_id: payload.client_id,
        warehouse_id: payload.warehouse_id,
        register_id: payload.register_id || 'reg-offline',
        shift_number: shiftNumber,
        opened_by: finalOpenedBy,
        opened_at: new Date().toISOString(),
        opening_cash: Number(payload.opening_cash || 0),
        status: 'open',
        opening_notes: payload.opening_notes || 'وردية تم فتحها بدون اتصال بالإنترنت',
        cashier_name: cashierName,
        register_name: 'نقطة البيع الرئيسية',
        warehouse_name: 'المستودع الرئيسي',
        closing_cash_expected: Number(payload.opening_cash || 0),
        cash_difference: 0,
        total_sales_amount: 0,
        total_cash_sales: 0,
        total_card_sales: 0,
        total_other_sales: 0,
        total_refunds_amount: 0,
        total_cash_in: 0,
        total_cash_out: 0,
        orders_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await offlineStorage.saveCurrentShift(payload.client_id, offlineShift);
      try {
        localStorage.setItem(`ordexa_active_shift_${payload.client_id}`, JSON.stringify(offlineShift));
      } catch {}

      return {
        success: true,
        shift_id: offlineShift.id,
        shift_number: offlineShift.shift_number,
      };
    }

    // 1. Primary: Server endpoint (passes user credentials and ensures DB foreign keys)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
      }

      const res = await fetch('/api/shifts/open', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: payload.client_id,
          warehouseId: payload.warehouse_id,
          registerId: payload.register_id || null,
          openingCash: payload.opening_cash,
          openingNotes: payload.opening_notes || null,
          deviceFingerprint: payload.device_fingerprint || null,
          deviceId: payload.device_id || null,
          userId: effectiveAuthUserId,
          clientUserId: finalOpenedBy,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.shift_id) {
          const effectiveOpenedByInShift = json.opened_by || finalOpenedBy;
          const effectiveCashierNameInShift = json.cashier_name || cashierName;
          const newShift: Shift = {
            id: json.shift_id,
            client_id: payload.client_id,
            shift_number: json.shift_number,
            status: 'open',
            opened_at: new Date().toISOString(),
            opened_by: effectiveOpenedByInShift,
            cashier_name: effectiveCashierNameInShift,
            register_id: json.register_id || payload.register_id || 'reg-default',
            register_name: 'نقطة البيع',
            warehouse_id: payload.warehouse_id,
            warehouse_name: 'المستودع الرئيسي',
            opening_cash: Number(payload.opening_cash || 0),
            opening_notes: payload.opening_notes || null,
            closing_cash_expected: Number(payload.opening_cash || 0),
            cash_difference: 0,
            total_sales_amount: 0,
            total_cash_sales: 0,
            total_card_sales: 0,
            total_other_sales: 0,
            total_refunds_amount: 0,
            total_cash_in: 0,
            total_cash_out: 0,
            orders_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          offlineStorage.saveCurrentShift(payload.client_id, newShift).catch(() => {});
          try { localStorage.setItem(`ordexa_active_shift_${payload.client_id}`, JSON.stringify(newShift)); } catch {}
          return json;
        }
      } else {
        const errorJson = await res.json().catch(() => ({}));
        if (errorJson.error) {
          throw new Error(errorJson.error);
        }
      }
    } catch (apiErr: any) {
      if (apiErr.message && !apiErr.message.includes('fetch')) {
        throw apiErr;
      }
      console.warn('Server shift open failed or offline, trying fallback...', apiErr);
    }

    // 2. Direct Supabase Fallback (Strictly non-null opened_by)
    try {
      if (!finalOpenedBy) {
        throw new Error('تعذر تحديد حساب الكاشير. يرجى تسجيل الدخول مرة أخرى.');
      }

      let registerId = payload.register_id;
      if (!registerId) {
        const { data: regs } = await supabase
          .from('cash_registers')
          .select('id')
          .eq('client_id', payload.client_id)
          .eq('warehouse_id', payload.warehouse_id)
          .limit(1);
        registerId = regs?.[0]?.id;
      }

      const { count } = await supabase
        .from('shifts')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', payload.client_id);
      const shiftNumber = 'SH-' + String((count || 0) + 1).padStart(6, '0');

      const shiftId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'sh_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

      const { data: insertedShift, error: insertErr } = await supabase
        .from('shifts')
        .insert({
          id: shiftId,
          client_id: payload.client_id,
          warehouse_id: payload.warehouse_id,
          register_id: registerId || null,
          shift_number: shiftNumber,
          opened_by: finalOpenedBy,
          opened_at: new Date().toISOString(),
          opening_cash: Number(payload.opening_cash || 0),
          status: 'open',
          opening_notes: payload.opening_notes || null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      if (registerId) {
        await supabase
          .from('cash_registers')
          .update({ status: 'open' })
          .eq('id', registerId);
      }

      const newShift: Shift = {
        id: insertedShift.id,
        client_id: payload.client_id,
        shift_number: insertedShift.shift_number,
        status: 'open',
        opened_at: insertedShift.opened_at,
        opened_by: insertedShift.opened_by,
        cashier_name: cashierName,
        register_id: registerId || 'reg-default',
        register_name: 'نقطة البيع',
        warehouse_id: payload.warehouse_id,
        warehouse_name: 'المستودع الرئيسي',
        opening_cash: Number(payload.opening_cash || 0),
        opening_notes: payload.opening_notes || null,
        closing_cash_expected: Number(payload.opening_cash || 0),
        cash_difference: 0,
        total_sales_amount: 0,
        total_cash_sales: 0,
        total_card_sales: 0,
        total_other_sales: 0,
        total_refunds_amount: 0,
        total_cash_in: 0,
        total_cash_out: 0,
        orders_count: 0,
        created_at: insertedShift.opened_at,
        updated_at: insertedShift.opened_at,
      };
      offlineStorage.saveCurrentShift(payload.client_id, newShift).catch(() => {});
      try { localStorage.setItem(`ordexa_active_shift_${payload.client_id}`, JSON.stringify(newShift)); } catch {}

      return {
        success: true,
        shift_id: insertedShift.id,
        shift_number: insertedShift.shift_number,
      };
    } catch (fallbackErr: any) {
      console.error('All shift opening attempts failed:', fallbackErr);
      throw new Error(fallbackErr.message || 'فشل فتح الوردية');
    }
  },

  /**
   * Close an open shift atomically (reconciles cash and generates Z-Report)
   */
  async closeShift(payload: CloseShiftPayload): Promise<{
    success: boolean;
    shift_id: string;
    shift_number: string;
    closing_cash_actual: number;
    closing_cash_expected: number;
    cash_difference: number;
    total_sales_amount: number;
    total_cash_sales: number;
    total_card_sales: number;
    total_refunds_amount: number;
    orders_count: number;
  }> {
    // 0. Offline closing
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cachedShift = await offlineStorage.getCurrentShift(payload.client_id);
      const openingCash = Number(cachedShift?.opening_cash || 0);
      const totalSales = Number(cachedShift?.total_sales_amount || 0);
      const expectedCash = openingCash + Number(cachedShift?.total_cash_sales || 0);
      const actualCash = Number(payload.closing_cash_actual || 0);
      const diff = actualCash - expectedCash;

      await offlineStorage.saveCurrentShift(payload.client_id, null);
      try {
        localStorage.removeItem(`ordexa_active_shift_${payload.client_id}`);
      } catch {}

      return {
        success: true,
        shift_id: payload.shift_id,
        shift_number: cachedShift?.shift_number || 'SH-OFFLINE',
        closing_cash_actual: actualCash,
        closing_cash_expected: expectedCash,
        cash_difference: diff,
        total_sales_amount: totalSales,
        total_cash_sales: Number(cachedShift?.total_cash_sales || 0),
        total_card_sales: Number(cachedShift?.total_card_sales || 0),
        total_refunds_amount: Number(cachedShift?.total_refunds_amount || 0),
        orders_count: Number(cachedShift?.orders_count || 0),
      };
    }

    // 1. Primary: Server atomic reconciliation
    try {
      const res = await fetch('/api/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: payload.client_id,
          shiftId: payload.shift_id,
          closingCashActual: payload.closing_cash_actual,
          closingNotes: payload.closing_notes || null,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          offlineStorage.saveCurrentShift(payload.client_id, null).catch(() => {});
          try { localStorage.removeItem(`ordexa_active_shift_${payload.client_id}`); } catch {}
          return json;
        }
      } else {
        const errorJson = await res.json().catch(() => ({}));
        if (errorJson.error) {
          throw new Error(errorJson.error);
        }
      }
    } catch (apiErr: any) {
      if (apiErr.message && !apiErr.message.includes('fetch')) {
        throw apiErr;
      }
      console.warn('Server shift close failed, trying fallback...', apiErr);
    }

    // 2. Direct fallback
    const { data: updatedShift, error: updateErr } = await supabase
      .from('shifts')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closing_cash_actual: payload.closing_cash_actual,
        closing_notes: payload.closing_notes || null,
      })
      .eq('id', payload.shift_id)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message || 'فشل إغلاق الوردية');

    return {
      success: true,
      shift_id: updatedShift.id,
      shift_number: updatedShift.shift_number,
      closing_cash_actual: Number(payload.closing_cash_actual),
      closing_cash_expected: Number(updatedShift.closing_cash_expected || 0),
      cash_difference: Number(updatedShift.cash_difference || 0),
      total_sales_amount: Number(updatedShift.total_sales_amount || 0),
      total_cash_sales: Number(updatedShift.total_cash_sales || 0),
      total_card_sales: Number(updatedShift.total_card_sales || 0),
      total_refunds_amount: Number(updatedShift.total_refunds_amount || 0),
      orders_count: Number(updatedShift.orders_count || 0),
    };
  },

  /**
   * Record Cash In / Cash Out drawer movement
   */
  async recordCashDrawerMovement(payload: CashDrawerMovementPayload): Promise<{ success: boolean; movement_id: string }> {
    const { data, error } = await supabase.rpc('record_cash_drawer_movement', {
      p_client_id: payload.client_id,
      p_shift_id: payload.shift_id,
      p_transaction_type: payload.transaction_type,
      p_amount: payload.amount,
      p_reason: payload.reason,
    });

    if (error) {
      throw new Error(error.message || 'فشل تسجيل حركة النقدية');
    }

    return data;
  },

  /**
   * Get shift live summary & audit calculations
   */
  async getShiftSummary(shiftId: string, clientId?: string): Promise<ShiftSummary> {
    const { data, error } = await supabase.rpc('get_shift_summary', {
      p_shift_id: shiftId,
      p_client_id: clientId || null,
    });

    if (error) {
      throw new Error(error.message || 'فشل جلب ملخص الوردية');
    }

    return data as ShiftSummary;
  },

  /**
   * Fetch all shifts with optional filters
   */
  async fetchShifts(
    clientId: string,
    filters?: {
      status?: string;
      warehouseId?: string;
      limit?: number;
    }
  ): Promise<Shift[]> {
    let query = supabase
      .from('shifts')
      .select(`
        *,
        warehouse:warehouses(id, name, code),
        register:cash_registers(id, name, code),
        opened_by_user:client_users!shifts_opened_by_fkey(id, name, email, role),
        closed_by_user:client_users!shifts_closed_by_fkey(id, name, email, role)
      `)
      .eq('client_id', clientId)
      .order('opened_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.warehouseId) {
      query = query.eq('warehouse_id', filters.warehouseId);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((item) => ({
      ...item,
      cashier_name: (item.opened_by_user as any)?.name || (item.opened_by_user as any)?.full_name || 'الكاشير',
      register_name: item.register?.name || 'الصندوق الرئيسي',
      warehouse_name: item.warehouse?.name || 'المستودع',
    }));
  },

  /**
   * Fetch a single shift with full relations
   */
  async fetchShiftDetails(shiftId: string): Promise<Shift | null> {
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        *,
        warehouse:warehouses(id, name, code, address),
        register:cash_registers(id, name, code),
        opened_by_user:client_users!shifts_opened_by_fkey(id, name, email, role),
        closed_by_user:client_users!shifts_closed_by_fkey(id, name, email, role)
      `)
      .eq('id', shiftId)
      .single();

    if (error || !data) return null;

    return {
      ...data,
      cashier_name: (data.opened_by_user as any)?.name || (data.opened_by_user as any)?.full_name || 'الكاشير',
      register_name: data.register?.name || 'الصندوق الرئيسي',
      warehouse_name: data.warehouse?.name || 'المستودع',
    };
  },

  /**
   * Fetch cash drawer movements for a shift
   */
  async fetchShiftTransactions(shiftId: string): Promise<CashDrawerTransaction[]> {
    const { data, error } = await supabase
      .from('cash_drawer_transactions')
      .select(`
        *,
        performed_by_user:client_users!cash_drawer_transactions_performed_by_fkey(id, name, role)
      `)
      .eq('shift_id', shiftId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Fetch cash registers for warehouse / client
   */
  async fetchRegisters(clientId: string, warehouseId?: string): Promise<CashRegister[]> {
    let query = supabase
      .from('cash_registers')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (warehouseId) {
      query = query.or(`warehouse_id.eq.${warehouseId},warehouse_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Could not fetch cash registers:', error.message);
      return [];
    }
    return data || [];
  },
};
