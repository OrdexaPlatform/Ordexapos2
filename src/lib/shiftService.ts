import { supabase } from './supabase';
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
    try {
      const { data, error } = await supabase.rpc('get_active_shift', {
        p_client_id: clientId || null,
      });

      if (error) {
        // If RPC isn't executed in DB yet or fails, fallback to direct query
        console.warn('RPC get_active_shift returned error, trying fallback:', error.message);
        return await this.getActiveShiftFallback(clientId);
      }

      if (!data) return null;

      // Extract shift object
      return {
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
    } catch (err: any) {
      console.error('Failed to get active shift:', err);
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
          opened_by_user:client_users!shifts_opened_by_fkey(id, full_name, role)
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
        cashier_name: item.opened_by_user?.full_name || 'الكاشير',
        register_name: item.register?.name || 'نقطة البيع',
        warehouse_name: item.warehouse?.name || 'المستودع الرئيسي',
      };
    } catch {
      return null;
    }
  },

  /**
   * Open a new shift atomically
   */
  async openShift(payload: OpenShiftPayload): Promise<{ success: boolean; shift_id: string; shift_number: string }> {
    const { data, error } = await supabase.rpc('open_shift', {
      p_client_id: payload.client_id,
      p_warehouse_id: payload.warehouse_id,
      p_register_id: payload.register_id || null,
      p_opening_cash: payload.opening_cash,
      p_opening_notes: payload.opening_notes || null,
      p_device_fingerprint: payload.device_fingerprint || null,
    });

    if (error) {
      // If RPC failed due to signature mismatch from older version without fingerprint parameter, retry with 5 params
      if (error.message?.includes('p_device_fingerprint') || error.code === '42883') {
        const { data: retryData, error: retryError } = await supabase.rpc('open_shift', {
          p_client_id: payload.client_id,
          p_warehouse_id: payload.warehouse_id,
          p_register_id: payload.register_id || null,
          p_opening_cash: payload.opening_cash,
          p_opening_notes: payload.opening_notes || null,
        });
        if (retryError) throw new Error(retryError.message || 'فشل فتح الوردية');
        return retryData;
      }
      throw new Error(error.message || 'فشل فتح الوردية');
    }

    return data;
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
    const { data, error } = await supabase.rpc('close_shift', {
      p_client_id: payload.client_id,
      p_shift_id: payload.shift_id,
      p_closing_cash_actual: payload.closing_cash_actual,
      p_closing_notes: payload.closing_notes || null,
    });

    if (error) {
      throw new Error(error.message || 'فشل إغلاق الوردية');
    }

    return data;
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
        opened_by_user:client_users!shifts_opened_by_fkey(id, full_name, email, role),
        closed_by_user:client_users!shifts_closed_by_fkey(id, full_name, email, role)
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
      cashier_name: item.opened_by_user?.full_name || 'الكاشير',
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
        opened_by_user:client_users!shifts_opened_by_fkey(id, full_name, email, role),
        closed_by_user:client_users!shifts_closed_by_fkey(id, full_name, email, role)
      `)
      .eq('id', shiftId)
      .single();

    if (error || !data) return null;

    return {
      ...data,
      cashier_name: data.opened_by_user?.full_name || 'الكاشير',
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
        performed_by_user:client_users!cash_drawer_transactions_performed_by_fkey(id, full_name, role)
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
