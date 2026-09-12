import { supabase } from './supabase';
import { Warehouse } from '../types';
import { logActivity } from './activityLogger';

export async function fetchWarehouses(clientId: string): Promise<Warehouse[]> {
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('client_id', clientId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching warehouses:', error);
    throw new Error(error.message || 'فشل في جلب قائمة المستودعات');
  }

  return (data || []) as Warehouse[];
}

export async function createWarehouse(
  clientId: string,
  params: {
    name: string;
    code?: string;
    address?: string;
    is_default?: boolean;
  }
): Promise<Warehouse> {
  if (!clientId) throw new Error('معرف المنشأة مطلوب');
  if (!params.name?.trim()) throw new Error('اسم المستودع مطلوب');

  // If this warehouse is marked as default, unset other defaults first
  if (params.is_default) {
    await supabase
      .from('warehouses')
      .update({ is_default: false })
      .eq('client_id', clientId);
  }

  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      client_id: clientId,
      name: params.name.trim(),
      code: params.code?.trim() || null,
      address: params.address?.trim() || null,
      is_default: !!params.is_default,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('يوجد مستودع آخر مسجل بنفس الاسم');
    }
    throw new Error(error.message || 'فشل في إنشاء المستودع');
  }

  await logActivity({
    action: 'warehouse_created',
    entityType: 'warehouse',
    entityId: data.id,
    metadata: { name: data.name, code: data.code },
  });

  return data as Warehouse;
}

export async function updateWarehouse(
  warehouseId: string,
  clientId: string,
  updates: Partial<Pick<Warehouse, 'name' | 'code' | 'address' | 'is_default' | 'is_active'>>
): Promise<Warehouse> {
  if (updates.is_default) {
    await supabase
      .from('warehouses')
      .update({ is_default: false })
      .eq('client_id', clientId);
  }

  const { data, error } = await supabase
    .from('warehouses')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', warehouseId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'فشل في تحديث بيانات المستودع');
  }

  await logActivity({
    action: 'warehouse_updated',
    entityType: 'warehouse',
    entityId: data.id,
    metadata: updates,
  });

  return data as Warehouse;
}

/**
 * Ensures that a client has at least one active default warehouse (e.g. Main Warehouse)
 */
export async function ensureDefaultWarehouse(clientId: string): Promise<Warehouse> {
  const warehouses = await fetchWarehouses(clientId);
  if (warehouses.length > 0) {
    return warehouses[0];
  }

  return await createWarehouse(clientId, {
    name: 'المستودع الرئيسي',
    code: 'WH-MAIN',
    address: 'الفرع الرئيسي',
    is_default: true,
  });
}

export const warehouseService = {
  fetchWarehouses,
  createWarehouse,
  updateWarehouse,
  ensureDefaultWarehouse,
};
