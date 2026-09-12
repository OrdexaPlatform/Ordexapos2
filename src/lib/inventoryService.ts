import { supabase } from './supabase';
import { 
  InventoryBalance, 
  InventoryTransaction, 
  InventoryTransfer 
} from '../types';
import { logActivity } from './activityLogger';

export interface FetchStockOptions {
  warehouseId?: string;
  categoryId?: string;
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  search?: string;
}

export interface ProductStockRow {
  productId: string;
  productName: string;
  sku: string;
  barcode?: string | null;
  categoryName?: string;
  warehouseId: string;
  warehouseName: string;
  currentQuantity: number;
  minStock: number;
  costPrice: number;
  sellingPrice: number;
  trackStock: boolean;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export async function fetchInventoryStock(
  clientId: string,
  options: FetchStockOptions = {}
): Promise<ProductStockRow[]> {
  if (!clientId) return [];

  // Query products with their balances and warehouse
  let query = supabase
    .from('products')
    .select(`
      id,
      name,
      sku,
      barcode,
      min_stock,
      cost_price,
      selling_price,
      track_stock,
      category_id,
      category:product_categories(name),
      balances:inventory_balances(
        id,
        warehouse_id,
        quantity,
        warehouse:warehouses(id, name, is_default)
      )
    `)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (options.categoryId && options.categoryId !== 'all') {
    query = query.eq('category_id', options.categoryId);
  }

  if (options.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching inventory stock:', error);
    throw new Error(error.message || 'فشل في جلب أرصدة المخزون');
  }

  const rows: ProductStockRow[] = [];

  for (const prod of (data || [])) {
    const balances = (prod.balances as any[]) || [];

    if (balances.length === 0) {
      // Product has no warehouse balances yet
      const currentQty = 0;
      let status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'out_of_stock';
      if (!prod.track_stock) {
        status = 'in_stock';
      }

      rows.push({
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        barcode: prod.barcode,
        categoryName: (prod.category as any)?.name || 'غير مصنف',
        warehouseId: '',
        warehouseName: 'المستودع الافتراضي',
        currentQuantity: currentQty,
        minStock: Number(prod.min_stock) || 0,
        costPrice: Number(prod.cost_price) || 0,
        sellingPrice: Number(prod.selling_price) || 0,
        trackStock: prod.track_stock,
        status,
      });
    } else {
      for (const b of balances) {
        if (options.warehouseId && options.warehouseId !== 'all' && b.warehouse_id !== options.warehouseId) {
          continue;
        }

        const qty = Number(b.quantity) || 0;
        let status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';

        if (prod.track_stock) {
          if (qty <= 0) {
            status = 'out_of_stock';
          } else if (qty <= (Number(prod.min_stock) || 0)) {
            status = 'low_stock';
          }
        }

        rows.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          barcode: prod.barcode,
          categoryName: (prod.category as any)?.name || 'غير مصنف',
          warehouseId: b.warehouse_id,
          warehouseName: b.warehouse?.name || 'مستودع',
          currentQuantity: qty,
          minStock: Number(prod.min_stock) || 0,
          costPrice: Number(prod.cost_price) || 0,
          sellingPrice: Number(prod.selling_price) || 0,
          trackStock: prod.track_stock,
          status,
        });
      }
    }
  }

  // Filter stock status
  if (options.stockStatus && options.stockStatus !== 'all') {
    return rows.filter(r => r.status === options.stockStatus);
  }

  return rows;
}

export async function fetchInventoryLedger(
  clientId: string,
  options: {
    productId?: string;
    warehouseId?: string;
    limit?: number;
  } = {}
): Promise<InventoryTransaction[]> {
  if (!clientId) return [];

  let query = supabase
    .from('inventory_transactions')
    .select(`
      *,
      product:products(name, sku, barcode),
      warehouse:warehouses(name)
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (options.productId) {
    query = query.eq('product_id', options.productId);
  }

  if (options.warehouseId && options.warehouseId !== 'all') {
    query = query.eq('warehouse_id', options.warehouseId);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching inventory ledger:', error);
    throw new Error(error.message || 'فشل في جلب سجل حركات المخزون');
  }

  return (data || []) as InventoryTransaction[];
}

export async function recordOpeningStock(
  clientId: string,
  params: {
    productId: string;
    warehouseId: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
    createdBy?: string;
  }
): Promise<void> {
  if (!clientId) throw new Error('معرف المنشأة مطلوب');
  if (!params.productId) throw new Error('يرجى تحديد المنتج');
  if (!params.warehouseId) throw new Error('يرجى تحديد المستودع');
  if (params.quantity <= 0) throw new Error('الكمية الافتتاحية يجب أن تكون أكبر من الصفر');

  // Try RPC first for atomic DB-level execution
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_stock_opening', {
    p_client_id: clientId,
    p_product_id: params.productId,
    p_warehouse_id: params.warehouseId,
    p_quantity: Number(params.quantity),
    p_unit_cost: Number(params.unitCost) || 0,
    p_notes: params.notes || 'رصيد افتتاحي للمخزون',
    p_created_by: params.createdBy || null,
  });

  if (rpcError) {
    console.warn('RPC record_stock_opening not available or returned error, executing transactional fallback:', rpcError.message);

    // Fallback: Direct database updates
    // 1. Insert transaction
    const { error: txError } = await supabase.from('inventory_transactions').insert({
      client_id: clientId,
      product_id: params.productId,
      warehouse_id: params.warehouseId,
      transaction_type: 'opening',
      quantity: Number(params.quantity),
      unit_cost: Number(params.unitCost) || 0,
      reference_type: 'manual_opening',
      notes: params.notes || 'رصيد افتتاحي للمخزون',
      created_by: params.createdBy || null,
    });

    if (txError) throw new Error(txError.message || 'فشل في تسجيل حركة الرصيد الافتتاحي');

    // 2. Fetch existing balance
    const { data: existingBal } = await supabase
      .from('inventory_balances')
      .select('id, quantity')
      .eq('client_id', clientId)
      .eq('product_id', params.productId)
      .eq('warehouse_id', params.warehouseId)
      .maybeSingle();

    if (existingBal) {
      await supabase
        .from('inventory_balances')
        .update({
          quantity: Number(existingBal.quantity) + Number(params.quantity),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBal.id);
    } else {
      await supabase
        .from('inventory_balances')
        .insert({
          client_id: clientId,
          product_id: params.productId,
          warehouse_id: params.warehouseId,
          quantity: Number(params.quantity),
        });
    }

    // 3. Update product current_stock
    const { data: allBalances } = await supabase
      .from('inventory_balances')
      .select('quantity')
      .eq('client_id', clientId)
      .eq('product_id', params.productId);

    const totalStock = (allBalances || []).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

    await supabase
      .from('products')
      .update({
        current_stock: totalStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.productId)
      .eq('client_id', clientId);
  }

  await logActivity({
    action: 'stock_opening',
    entityType: 'product',
    entityId: params.productId,
    metadata: {
      warehouse_id: params.warehouseId,
      quantity: params.quantity,
      unit_cost: params.unitCost,
      notes: params.notes,
    },
  });
}

export async function recordStockAdjustment(
  clientId: string,
  params: {
    productId: string;
    warehouseId: string;
    adjustmentType: 'adjustment_in' | 'adjustment_out';
    quantity: number;
    unitCost?: number;
    reason?: string;
    notes?: string;
    createdBy?: string;
  }
): Promise<void> {
  if (!clientId) throw new Error('معرف المنشأة مطلوب');
  if (!params.productId) throw new Error('يرجى تحديد المنتج');
  if (!params.warehouseId) throw new Error('يرجى تحديد المستودع');
  if (params.quantity <= 0) throw new Error('كمية التسوية يجب أن تكون أكبر من الصفر');

  // Try RPC first for atomic DB-level execution
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_stock_adjustment', {
    p_client_id: clientId,
    p_product_id: params.productId,
    p_warehouse_id: params.warehouseId,
    p_adjustment_type: params.adjustmentType,
    p_quantity: Number(params.quantity),
    p_unit_cost: Number(params.unitCost) || 0,
    p_reason: params.reason || 'تسوية مخزنية يدوية',
    p_notes: params.notes || null,
    p_created_by: params.createdBy || null,
  });

  if (rpcError) {
    console.warn('RPC record_stock_adjustment fallback:', rpcError.message);

    const signedQty = params.adjustmentType === 'adjustment_in' ? Number(params.quantity) : -Number(params.quantity);

    // 1. Insert transaction
    const { error: txError } = await supabase.from('inventory_transactions').insert({
      client_id: clientId,
      product_id: params.productId,
      warehouse_id: params.warehouseId,
      transaction_type: params.adjustmentType,
      quantity: signedQty,
      unit_cost: Number(params.unitCost) || 0,
      reference_type: params.reason || 'manual_adjustment',
      notes: params.notes || null,
      created_by: params.createdBy || null,
    });

    if (txError) throw new Error(txError.message || 'فشل في تسجيل حركة تسوية المخزون');

    // 2. Upsert balance
    const { data: existingBal } = await supabase
      .from('inventory_balances')
      .select('id, quantity')
      .eq('client_id', clientId)
      .eq('product_id', params.productId)
      .eq('warehouse_id', params.warehouseId)
      .maybeSingle();

    if (existingBal) {
      await supabase
        .from('inventory_balances')
        .update({
          quantity: Number(existingBal.quantity) + signedQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBal.id);
    } else {
      await supabase
        .from('inventory_balances')
        .insert({
          client_id: clientId,
          product_id: params.productId,
          warehouse_id: params.warehouseId,
          quantity: signedQty,
        });
    }

    // 3. Update total product stock
    const { data: allBalances } = await supabase
      .from('inventory_balances')
      .select('quantity')
      .eq('client_id', clientId)
      .eq('product_id', params.productId);

    const totalStock = (allBalances || []).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

    await supabase
      .from('products')
      .update({
        current_stock: totalStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.productId)
      .eq('client_id', clientId);
  }

  await logActivity({
    action: 'stock_adjustment',
    entityType: 'product',
    entityId: params.productId,
    metadata: {
      warehouse_id: params.warehouseId,
      type: params.adjustmentType,
      quantity: params.quantity,
      reason: params.reason,
    },
  });
}

export async function executeTransfer(
  clientId: string,
  params: {
    fromWarehouseId: string;
    toWarehouseId: string;
    items: Array<{ productId: string; quantity: number; unitCost?: number }>;
    notes?: string;
    createdBy?: string;
  }
): Promise<{ transferNumber: string }> {
  if (!clientId) throw new Error('معرف المنشأة مطلوب');
  if (!params.fromWarehouseId || !params.toWarehouseId) throw new Error('يرجى تحديد مستودع المصدر ومستودع الوجهة');
  if (params.fromWarehouseId === params.toWarehouseId) throw new Error('لا يمكن التحويل لنفس المستودع');
  if (!params.items || params.items.length === 0) throw new Error('يرجى إضافة صنف واحد على الأقل للتحويل');

  // Validate items
  for (const it of params.items) {
    if (it.quantity <= 0) throw new Error('كميات التحويل يجب أن تكون أكبر من الصفر');
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('execute_inventory_transfer', {
    p_client_id: clientId,
    p_from_warehouse_id: params.fromWarehouseId,
    p_to_warehouse_id: params.toWarehouseId,
    p_items: params.items.map(i => ({
      product_id: i.productId,
      quantity: Number(i.quantity),
      unit_cost: Number(i.unitCost) || 0,
    })),
    p_notes: params.notes || null,
    p_created_by: params.createdBy || null,
  });

  if (rpcError) {
    console.warn('RPC execute_inventory_transfer fallback:', rpcError.message);

    // Fallback: Create transfer and process items
    const transferNumber = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: transferData, error: trfErr } = await supabase
      .from('inventory_transfers')
      .insert({
        client_id: clientId,
        transfer_number: transferNumber,
        from_warehouse_id: params.fromWarehouseId,
        to_warehouse_id: params.toWarehouseId,
        status: 'completed',
        notes: params.notes || null,
        created_by: params.createdBy || null,
      })
      .select()
      .single();

    if (trfErr) throw new Error(trfErr.message || 'فشل في إنشاء إذن التحويل');

    for (const item of params.items) {
      const qty = Number(item.quantity);
      const cost = Number(item.unitCost) || 0;

      // Transfer item
      await supabase.from('inventory_transfer_items').insert({
        transfer_id: transferData.id,
        product_id: item.productId,
        quantity: qty,
        unit_cost: cost,
      });

      // Transfer out transaction
      await supabase.from('inventory_transactions').insert({
        client_id: clientId,
        product_id: item.productId,
        warehouse_id: params.fromWarehouseId,
        transaction_type: 'transfer_out',
        quantity: -qty,
        unit_cost: cost,
        reference_type: 'inventory_transfer',
        reference_id: transferNumber,
        notes: 'تحويل صادر إلى المستودع الهدف',
        created_by: params.createdBy || null,
      });

      // Transfer in transaction
      await supabase.from('inventory_transactions').insert({
        client_id: clientId,
        product_id: item.productId,
        warehouse_id: params.toWarehouseId,
        transaction_type: 'transfer_in',
        quantity: qty,
        unit_cost: cost,
        reference_type: 'inventory_transfer',
        reference_id: transferNumber,
        notes: 'تحويل وارد من المستودع المصدر',
        created_by: params.createdBy || null,
      });

      // Deduct from source
      const { data: srcBal } = await supabase
        .from('inventory_balances')
        .select('id, quantity')
        .eq('client_id', clientId)
        .eq('product_id', item.productId)
        .eq('warehouse_id', params.fromWarehouseId)
        .maybeSingle();

      if (srcBal) {
        await supabase
          .from('inventory_balances')
          .update({
            quantity: Number(srcBal.quantity) - qty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', srcBal.id);
      } else {
        await supabase.from('inventory_balances').insert({
          client_id: clientId,
          product_id: item.productId,
          warehouse_id: params.fromWarehouseId,
          quantity: -qty,
        });
      }

      // Add to dest
      const { data: destBal } = await supabase
        .from('inventory_balances')
        .select('id, quantity')
        .eq('client_id', clientId)
        .eq('product_id', item.productId)
        .eq('warehouse_id', params.toWarehouseId)
        .maybeSingle();

      if (destBal) {
        await supabase
          .from('inventory_balances')
          .update({
            quantity: Number(destBal.quantity) + qty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', destBal.id);
      } else {
        await supabase.from('inventory_balances').insert({
          client_id: clientId,
          product_id: item.productId,
          warehouse_id: params.toWarehouseId,
          quantity: qty,
        });
      }
    }

    await logActivity({
      action: 'stock_transfer',
      entityType: 'transfer',
      entityId: transferData.id,
      metadata: {
        transfer_number: transferNumber,
        from_warehouse: params.fromWarehouseId,
        to_warehouse: params.toWarehouseId,
        items_count: params.items.length,
      },
    });

    return { transferNumber };
  }

  await logActivity({
    action: 'stock_transfer',
    entityType: 'transfer',
    entityId: rpcData?.transfer_id,
    metadata: {
      transfer_number: rpcData?.transfer_number,
      from_warehouse: params.fromWarehouseId,
      to_warehouse: params.toWarehouseId,
      items_count: params.items.length,
    },
  });

  return { transferNumber: rpcData?.transfer_number || 'TRF-DONE' };
}

export async function fetchTransfers(clientId: string): Promise<InventoryTransfer[]> {
  if (!clientId) return [];

  const { data, error } = await supabase
    .from('inventory_transfers')
    .select(`
      *,
      from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(name),
      to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(name),
      items:inventory_transfer_items(
        *,
        product:products(name, sku)
      )
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    // If foreign key naming difference in select join, fallback to simpler select
    const { data: simpleData } = await supabase
      .from('inventory_transfers')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    return (simpleData || []) as InventoryTransfer[];
  }

  return (data || []) as InventoryTransfer[];
}
