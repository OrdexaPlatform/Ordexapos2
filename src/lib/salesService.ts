import { supabase } from './supabase';
import { 
  Sale, 
  SaleItem, 
  SalePayment, 
  PaymentMethod, 
  PaymentStatus, 
  SaleStatus,
  Product 
} from '../types';
import { logActivity } from './activityLogger';
import { getCurrencySymbol, formatCurrencyAmount } from './currency';
import { offlineStorage, OfflineSaleRecord } from './offline/offlineStorage';

export interface CompleteSaleItemInput {
  product_id: string;
  quantity: number;
  unit_price?: number;
  discount_amount?: number;
  product_name?: string;
  sku?: string;
  barcode?: string;
  tax_rate?: number;
  cost_price?: number;
  track_stock?: boolean;
}

export interface CompleteSalePaymentInput {
  payment_method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CompleteSalePayload {
  clientId: string;
  warehouseId: string;
  items: CompleteSaleItemInput[];
  payments: CompleteSalePaymentInput[];
  discountAmount?: number;
  customerId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  shiftId?: string | null;
  deviceFingerprint?: string | null;
  isSyncing?: boolean;
}

export interface CompleteSaleResult {
  success: boolean;
  sale_id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_status: PaymentStatus;
  sale_date: string;
  shift_id?: string | null;
  is_offline?: boolean;
}

/**
 * Utility to identify network disconnection or fetch failure
 */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = String(err?.message || err?.error_description || err?.details || err || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return (
    name === 'typeerror' ||
    name === 'networkerror' ||
    name === 'aborterror' ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('networkerror') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('offline') ||
    msg.includes('load failed') ||
    msg.includes('econnrefused') ||
    msg.includes('abort') ||
    msg.includes('cors')
  );
}

export interface FetchSalesFilter {
  search?: string;
  warehouseId?: string;
  saleStatus?: SaleStatus | 'all';
  paymentStatus?: PaymentStatus | 'all';
  paymentMethod?: PaymentMethod | 'all';
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface FetchSalesResult {
  sales: Sale[];
  totalCount: number;
  stats: {
    totalSalesAmount: number;
    todaySalesAmount: number;
    completedCount: number;
    voidedCount: number;
  };
}

/**
 * Format currency display
 */
export function formatCurrency(amount: number, currency?: string): string {
  if (!currency) {
    return formatCurrencyAmount(amount);
  }
  return `${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${getCurrencySymbol(currency)}`;
}

/**
 * Executes a complete atomic sale transaction
 */
export async function executeCompleteSale(payload: CompleteSalePayload): Promise<CompleteSaleResult> {
  const {
    clientId,
    warehouseId,
    items,
    payments,
    discountAmount = 0,
    customerId = null,
    notes = null,
    createdBy = null
  } = payload;

  if (!clientId) {
    throw new Error('معرف المنشأة مطلوب لإتمام البيع');
  }
  if (!warehouseId) {
    throw new Error('يرجى تحديد المستودع / الفرع الذي يتم البيع منه');
  }
  if (!items || items.length === 0) {
    throw new Error('سلة البيع فارغة، يرجى إضافة صنف واحد على الأقل');
  }
  if (!payments || payments.length === 0) {
    throw new Error('يرجى اختيار وسيلة دفع واحدة على الأقل');
  }

  // 0. If device is explicitly offline, immediately run atomic offline checkout without network delays
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline && !payload.isSyncing) {
    return await executeOfflineCompleteSale(payload);
  }

  let networkFailed = false;

  // 1. First priority: Try secure atomic server endpoint
  try {
    const res = await fetch('/api/sales/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.sale_id) {
        await logActivity({
          action: 'sale_created',
          entityType: 'sale',
          entityId: json.sale_id,
          metadata: {
            invoice_number: json.invoice_number,
            total_amount: json.total_amount,
            items_count: items.length,
          },
        }).catch(() => {});

        return json as CompleteSaleResult;
      }
    }
  } catch (apiErr: any) {
    if (isNetworkError(apiErr)) {
      networkFailed = true;
    }
  }

  // 2. Second priority: Try calling atomic Supabase RPC
  let rpcData: any = null;
  let rpcError: any = null;

  try {
    const res = await supabase.rpc('complete_sale', {
      p_client_id: clientId,
      p_warehouse_id: warehouseId,
      p_items: items,
      p_payments: payments,
      p_discount_amount: discountAmount,
      p_customer_id: customerId,
      p_notes: notes,
      p_created_by: createdBy,
      p_device_fingerprint: payload.deviceFingerprint || null
    });
    rpcData = res.data;
    rpcError = res.error;

    // If signature mismatch occurred because server has older 8-param version, retry with 8 params
    if (rpcError && (rpcError.message?.includes('p_device_fingerprint') || rpcError.code === '42883')) {
      const retry = await supabase.rpc('complete_sale', {
        p_client_id: clientId,
        p_warehouse_id: warehouseId,
        p_items: items,
        p_payments: payments,
        p_discount_amount: discountAmount,
        p_customer_id: customerId,
        p_notes: notes,
        p_created_by: createdBy
      });
      rpcData = retry.data;
      rpcError = retry.error;
    }
  } catch (rpcCatchErr: any) {
    if (isNetworkError(rpcCatchErr)) {
      networkFailed = true;
    }
    rpcError = rpcCatchErr;
  }

  if (rpcError && isNetworkError(rpcError)) {
    networkFailed = true;
  }

  if (!rpcError && rpcData && rpcData.success) {
    // Activity log
    await logActivity({
      action: 'sale_created',
      entityType: 'sale',
      entityId: rpcData.sale_id,
      metadata: {
        invoice_number: rpcData.invoice_number,
        total_amount: rpcData.total_amount,
        items_count: items.length
      }
    }).catch(() => {});

    return rpcData as CompleteSaleResult;
  }

  // If network failure occurred and not in background sync, fallback directly to offline execution
  if (networkFailed && !payload.isSyncing) {
    console.warn('Network error detected during checkout, falling back seamlessly to offline sale:', rpcError?.message);
    return await executeOfflineCompleteSale(payload);
  }

  // 3. Third priority: Direct fallback client transaction
  console.warn('Falling back to direct client transaction for checkout:', rpcError?.message);
  try {
    return await executeFallbackCompleteSale(payload);
  } catch (fallbackErr: any) {
    if (isNetworkError(fallbackErr) && !payload.isSyncing) {
      console.warn('Network error during fallback client transaction, executing offline checkout:', fallbackErr);
      return await executeOfflineCompleteSale(payload);
    }
    throw fallbackErr;
  }
}

/**
 * Fallback checkout execution when RPC is awaiting manual execution on Supabase
 */
async function executeFallbackCompleteSale(payload: CompleteSalePayload): Promise<CompleteSaleResult> {
  const {
    clientId,
    warehouseId,
    items,
    payments,
    discountAmount = 0,
    customerId = null,
    notes = null,
    createdBy = null
  } = payload;

  // 1. Fetch products to verify pricing, stock, and snapshots
  const productIds = items.map(i => i.product_id);
  let productsData: any = null;
  let productsError: any = null;

  try {
    const res = await supabase
      .from('products')
      .select('id, name, sku, barcode, selling_price, cost_price, tax_rate, track_stock, current_stock, is_active')
      .eq('client_id', clientId)
      .in('id', productIds);
    productsData = res.data;
    productsError = res.error;
  } catch (prodFetchErr: any) {
    if (isNetworkError(prodFetchErr) && !payload.isSyncing) {
      console.warn('Network error fetching products during checkout, falling back to offline checkout');
      return await executeOfflineCompleteSale(payload);
    }
    productsError = prodFetchErr;
  }

  if (productsError || !productsData) {
    if (isNetworkError(productsError) && !payload.isSyncing) {
      console.warn('Network error in productsError during checkout, falling back to offline checkout');
      return await executeOfflineCompleteSale(payload);
    }
    throw new Error('فشل جلب بيانات الأصناف: ' + (productsError?.message || ''));
  }

  const productsMap = new Map<string, any>(productsData.map((p: any) => [p.id, p]));

  // 2. Fetch stock balances in selected warehouse
  const { data: balancesData } = await supabase
    .from('inventory_balances')
    .select('product_id, quantity')
    .eq('client_id', clientId)
    .eq('warehouse_id', warehouseId)
    .in('product_id', productIds);

  const balancesMap = new Map(balancesData?.map(b => [b.product_id, Number(b.quantity)]) || []);

  // Validate stock and compute totals
  let totalSubtotal = 0;
  let totalLineDiscounts = 0;
  let totalTax = 0;

  const preparedItems: any[] = [];

  for (const item of items) {
    const product = productsMap.get(item.product_id);
    if (!product) {
      throw new Error(`المنتج المحدد غير موجود في قاعدة البيانات`);
    }
    if (!product.is_active) {
      throw new Error(`المنتج (${product.name}) غير نشط ولا يمكن بيعه`);
    }

    if (item.quantity <= 0) {
      throw new Error(`كمية الصنف (${product.name}) يجب أن تكون أكبر من الصفر`);
    }

    // Verify stock availability
    if (product.track_stock) {
      const availableStock = balancesMap.get(item.product_id) ?? 0;
      if (availableStock < item.quantity) {
        throw new Error(`لا يتوفر رصيد كافٍ للصنف (${product.name}): المتاح حالياً (${availableStock}) والمطلوب (${item.quantity})`);
      }
    }

    const unitPrice = item.unit_price != null && item.unit_price >= 0 ? item.unit_price : Number(product.selling_price);
    const lineDiscount = Math.min(item.discount_amount || 0, item.quantity * unitPrice);
    const taxableAmount = (item.quantity * unitPrice) - lineDiscount;
    const itemTax = Math.round(taxableAmount * (Number(product.tax_rate || 0) / 100) * 10000) / 10000;
    const lineTotal = taxableAmount + itemTax;

    totalSubtotal += item.quantity * unitPrice;
    totalLineDiscounts += lineDiscount;
    totalTax += itemTax;

    preparedItems.push({
      product_id: product.id,
      product_name_snapshot: product.name,
      sku_snapshot: product.sku,
      barcode_snapshot: product.barcode,
      quantity: item.quantity,
      unit_price: unitPrice,
      discount_amount: lineDiscount,
      tax_rate: Number(product.tax_rate || 0),
      tax_amount: itemTax,
      line_total: lineTotal,
      track_stock: product.track_stock,
      cost_price: Number(product.cost_price || 0)
    });
  }

  const finalTotal = Math.max(0, totalSubtotal - totalLineDiscounts - discountAmount + totalTax);

  // Compute total paid and change
  let totalPaid = 0;
  for (const p of payments) {
    if (p.amount <= 0) {
      throw new Error('مبلغ الدفع يجب أن يكون أكبر من الصفر');
    }
    totalPaid += p.amount;
  }

  const paymentStatus: PaymentStatus = totalPaid >= finalTotal ? 'paid' : 'partial';
  const changeAmount = totalPaid > finalTotal ? totalPaid - finalTotal : 0;
  const actualPaidAmount = Math.min(totalPaid, finalTotal);

  // Generate invoice number
  let nextInvoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  try {
    const { data: nextSeq } = await supabase.rpc('get_next_invoice_number', { p_client_id: clientId });
    if (nextSeq) nextInvoiceNumber = nextSeq;
  } catch (e) {
    // ignore, keep fallback timestamp-based unique sequence
  }

  // 3. Create Sale record
  let saleData: any = null;
  let saleError: any = null;
  try {
    const res = await supabase
      .from('sales')
      .insert({
        client_id: clientId,
        shift_id: payload.shiftId || null,
        invoice_number: nextInvoiceNumber,
        sale_date: new Date().toISOString(),
        customer_id: customerId,
        warehouse_id: warehouseId,
        subtotal: totalSubtotal,
        discount_amount: totalLineDiscounts + discountAmount,
        tax_amount: totalTax,
        total_amount: finalTotal,
        paid_amount: actualPaidAmount,
        change_amount: changeAmount,
        payment_status: paymentStatus,
        sale_status: 'completed',
        notes,
        created_by: createdBy
      })
      .select('id, invoice_number, total_amount, sale_date')
      .single();
    saleData = res.data;
    saleError = res.error;
  } catch (insertCatchErr: any) {
    if (isNetworkError(insertCatchErr) && !payload.isSyncing) {
      console.warn('Network error creating sale during fallback sale, using offline sale:', insertCatchErr);
      return await executeOfflineCompleteSale(payload);
    }
    saleError = insertCatchErr;
  }

  if (saleError || !saleData) {
    if (isNetworkError(saleError) && !payload.isSyncing) {
      console.warn('Network error in saleError during fallback sale, using offline sale:', saleError);
      return await executeOfflineCompleteSale(payload);
    }
    throw new Error('فشل إنشاء فاتورة البيع: ' + (saleError?.message || ''));
  }

  const saleId = saleData.id;

  // 4. Create Sale Items
  const itemsToInsert = preparedItems.map(item => ({
    sale_id: saleId,
    client_id: clientId,
    product_id: item.product_id,
    product_name_snapshot: item.product_name_snapshot,
    sku_snapshot: item.sku_snapshot,
    barcode_snapshot: item.barcode_snapshot,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_amount: item.discount_amount,
    tax_rate: item.tax_rate,
    tax_amount: item.tax_amount,
    line_total: item.line_total
  }));

  const { error: itemsError } = await supabase.from('sale_items').insert(itemsToInsert);
  if (itemsError) {
    console.error('Error inserting sale items:', itemsError);
  }

  // 5. Create Payments
  const paymentsToInsert = payments.map(p => ({
    sale_id: saleId,
    client_id: clientId,
    payment_method: p.payment_method,
    amount: p.amount,
    reference: p.reference || null
  }));

  const { error: paymentsError } = await supabase.from('sale_payments').insert(paymentsToInsert);
  if (paymentsError) {
    console.error('Error inserting sale payments:', paymentsError);
  }

  // 6. Deduct inventory & record ledger transactions for tracked products
  for (const item of preparedItems) {
    if (item.track_stock) {
      // Update balance
      const currentBal = balancesMap.get(item.product_id) ?? 0;
      const newBal = currentBal - item.quantity;

      await supabase
        .from('inventory_balances')
        .update({ quantity: newBal, updated_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .eq('product_id', item.product_id)
        .eq('warehouse_id', warehouseId);

      // Update product current stock
      const currentGlobalStock = productsMap.get(item.product_id)?.current_stock ?? 0;
      await supabase
        .from('products')
        .update({ current_stock: currentGlobalStock - item.quantity, updated_at: new Date().toISOString() })
        .eq('id', item.product_id)
        .eq('client_id', clientId);

      // Record inventory transaction ledger entry
      await supabase.from('inventory_transactions').insert({
        client_id: clientId,
        product_id: item.product_id,
        warehouse_id: warehouseId,
        transaction_type: 'sale',
        quantity: -item.quantity,
        unit_cost: item.cost_price,
        reference_type: 'sale',
        reference_id: nextInvoiceNumber,
        notes: `فاتورة مبيعات رقم ${nextInvoiceNumber}`,
        created_by: createdBy
      });
    }
  }

  // Activity log
  await logActivity({
    action: 'sale_created',
    entityType: 'sale',
    entityId: saleId,
    metadata: {
      invoice_number: nextInvoiceNumber,
      total_amount: finalTotal,
      items_count: items.length
    }
  });

  return {
    success: true,
    sale_id: saleId,
    invoice_number: nextInvoiceNumber,
    subtotal: totalSubtotal,
    discount_amount: totalLineDiscounts + discountAmount,
    tax_amount: totalTax,
    total_amount: finalTotal,
    paid_amount: actualPaidAmount,
    change_amount: changeAmount,
    payment_status: paymentStatus,
    sale_date: saleData.sale_date,
    shift_id: payload.shiftId || null,
  };
}

/**
 * Executes an offline complete sale transaction without any internet dependency.
 * Persists sale locally into IndexedDB and LocalStorage queues, decrements local catalog stock,
 * updates offline shift totals, and returns complete receipt data.
 */
export async function executeOfflineCompleteSale(payload: CompleteSalePayload): Promise<CompleteSaleResult> {
  const {
    clientId,
    warehouseId,
    items,
    payments,
    discountAmount = 0,
    customerId = null,
    notes = null,
    createdBy = null,
    shiftId = null,
    deviceFingerprint = null,
  } = payload;

  if (!clientId) {
    throw new Error('معرف المنشأة مطلوب لإتمام البيع');
  }
  if (!warehouseId) {
    throw new Error('يرجى تحديد المستودع / الفرع الذي يتم البيع منه');
  }
  if (!items || items.length === 0) {
    throw new Error('سلة البيع فارغة، يرجى إضافة صنف واحد على الأقل');
  }
  if (!payments || payments.length === 0) {
    throw new Error('يرجى اختيار وسيلة دفع واحدة على الأقل');
  }

  // 1. Fetch cached products from IndexedDB or LocalStorage
  let cachedProducts: Product[] = [];
  try {
    cachedProducts = await offlineStorage.getProducts();
  } catch (idbErr) {
    console.warn('Could not read products from IndexedDB:', idbErr);
  }

  if (!cachedProducts || cachedProducts.length === 0) {
    try {
      const raw = localStorage.getItem(`ordexa_cached_products_${clientId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cachedProducts = parsed;
      }
    } catch {}
  }

  const productsMap = new Map<string, Product>();
  if (Array.isArray(cachedProducts)) {
    for (const p of cachedProducts) {
      if (p && p.id) productsMap.set(p.id, p);
    }
  }

  // 2. Validate items and compute totals
  let totalSubtotal = 0;
  let totalLineDiscounts = 0;
  let totalTax = 0;

  const preparedItems: Array<{
    product_id: string;
    product_name_snapshot: string;
    sku_snapshot?: string;
    barcode_snapshot?: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    tax_rate: number;
    tax_amount: number;
    line_total: number;
    track_stock?: boolean;
  }> = [];

  for (const item of items) {
    const product = productsMap.get(item.product_id);
    const productName = item.product_name || product?.name || 'صنف غير محدد';
    const sku = item.sku || product?.sku || '';
    const barcode = item.barcode || product?.barcode || '';
    const taxRate = item.tax_rate != null ? Number(item.tax_rate) : (Number(product?.tax_rate) || 0);
    const unitPrice = item.unit_price != null && item.unit_price >= 0
      ? Number(item.unit_price)
      : (product?.selling_price != null ? Number(product.selling_price) : 0);
    const trackStock = item.track_stock != null ? Boolean(item.track_stock) : Boolean(product?.track_stock);

    if (item.quantity <= 0) {
      throw new Error(`كمية الصنف (${productName}) يجب أن تكون أكبر من الصفر`);
    }

    const lineDiscount = Math.min(item.discount_amount || 0, item.quantity * unitPrice);
    const taxableAmount = (item.quantity * unitPrice) - lineDiscount;
    const itemTax = Math.round(taxableAmount * (taxRate / 100) * 10000) / 10000;
    const lineTotal = taxableAmount + itemTax;

    totalSubtotal += item.quantity * unitPrice;
    totalLineDiscounts += lineDiscount;
    totalTax += itemTax;

    preparedItems.push({
      product_id: item.product_id,
      product_name_snapshot: productName,
      sku_snapshot: sku,
      barcode_snapshot: barcode,
      quantity: item.quantity,
      unit_price: unitPrice,
      discount_amount: lineDiscount,
      tax_rate: taxRate,
      tax_amount: itemTax,
      line_total: lineTotal,
      track_stock: trackStock,
    });
  }

  const finalTotal = Math.max(0, totalSubtotal - totalLineDiscounts - discountAmount + totalTax);

  // 3. Compute payments & change
  let totalPaid = 0;
  for (const p of payments) {
    if (p.amount <= 0) {
      throw new Error('مبلغ الدفع يجب أن يكون أكبر من الصفر');
    }
    totalPaid += Number(p.amount);
  }

  const paymentStatus: PaymentStatus = totalPaid >= finalTotal ? 'paid' : 'partial';
  const changeAmount = totalPaid > finalTotal ? totalPaid - finalTotal : 0;
  const actualPaidAmount = Math.min(totalPaid, finalTotal);

  // 4. Generate local idempotent IDs
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timePart = Date.now().toString().slice(-4);
  const local_transaction_id = `OFF-${dateStr}-${randPart}${timePart}`;
  const invoice_number = `INV-OFF-${dateStr.slice(2)}-${randPart}${timePart}`;
  const saleDate = new Date().toISOString();

  // 5. Build OfflineSaleRecord
  const offlineRecord: OfflineSaleRecord = {
    local_transaction_id,
    client_id: clientId,
    warehouse_id: warehouseId,
    shift_id: shiftId || null,
    items: preparedItems.map(item => ({
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      sku_snapshot: item.sku_snapshot,
      barcode_snapshot: item.barcode_snapshot,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount,
      tax_rate: item.tax_rate,
      tax_amount: item.tax_amount,
      line_total: item.line_total,
    })),
    payments: payments.map(p => ({
      payment_method: p.payment_method,
      amount: p.amount,
      reference: p.reference,
    })),
    subtotal: totalSubtotal,
    discount_amount: totalLineDiscounts + discountAmount,
    tax_amount: totalTax,
    total_amount: finalTotal,
    paid_amount: actualPaidAmount,
    change_amount: changeAmount,
    payment_method: payments[0]?.payment_method || 'cash',
    customer_id: customerId,
    cashier_id: createdBy,
    device_fingerprint: deviceFingerprint,
    created_at: saleDate,
    status: 'pending',
    retry_count: 0,
    notes: notes || null,
  };

  // 6. Save in IndexedDB queue and LocalStorage fallback
  try {
    await offlineStorage.savePendingSale(offlineRecord);
  } catch (queueErr) {
    console.warn('Could not save to IndexedDB pending_sales:', queueErr);
  }

  try {
    const lsKey = `ordexa_pending_sales_${clientId}`;
    const rawExisting = localStorage.getItem(lsKey);
    const existingList: OfflineSaleRecord[] = rawExisting ? JSON.parse(rawExisting) : [];
    existingList.push(offlineRecord);
    localStorage.setItem(lsKey, JSON.stringify(existingList));
  } catch {}

  // 7. Decrement stock in cached products for real-time offline stock awareness
  if (cachedProducts && cachedProducts.length > 0) {
    let stockChanged = false;
    for (const item of preparedItems) {
      if (item.track_stock) {
        const prod = productsMap.get(item.product_id);
        if (prod && typeof prod.current_stock === 'number') {
          prod.current_stock = Math.max(0, prod.current_stock - item.quantity);
          stockChanged = true;
        }
      }
    }
    if (stockChanged) {
      try {
        await offlineStorage.saveProducts(cachedProducts);
        localStorage.setItem(`ordexa_cached_products_${clientId}`, JSON.stringify(cachedProducts));
      } catch (err) {
        console.warn('Could not update cached products stock offline:', err);
      }
    }
  }

  // 8. Update offline shift running totals if active shift is present
  try {
    let currentShift = await offlineStorage.getCurrentShift(clientId);
    if (!currentShift) {
      const rawShift = localStorage.getItem(`ordexa_active_shift_${clientId}`);
      if (rawShift) currentShift = JSON.parse(rawShift);
    }

    if (currentShift && currentShift.status === 'open') {
      const isCash = payments[0]?.payment_method === 'cash';
      const isCard = payments[0]?.payment_method === 'card';

      currentShift.total_sales_amount = (Number(currentShift.total_sales_amount) || 0) + finalTotal;
      if (isCash) {
        currentShift.total_cash_sales = (Number(currentShift.total_cash_sales) || 0) + actualPaidAmount;
      } else if (isCard) {
        currentShift.total_card_sales = (Number(currentShift.total_card_sales) || 0) + actualPaidAmount;
      } else {
        currentShift.total_other_sales = (Number(currentShift.total_other_sales) || 0) + actualPaidAmount;
      }
      currentShift.orders_count = (Number(currentShift.orders_count) || 0) + 1;
      currentShift.updated_at = saleDate;

      await offlineStorage.saveCurrentShift(clientId, currentShift);
      localStorage.setItem(`ordexa_active_shift_${clientId}`, JSON.stringify(currentShift));
    }
  } catch (shiftErr) {
    console.warn('Could not update offline shift running totals:', shiftErr);
  }

  // 9. Dispatch custom event so UI and sync engines know a new sale is queued
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ordexa:offline_sale_completed', {
      detail: { clientId, transactionId: local_transaction_id }
    }));
  }

  return {
    success: true,
    sale_id: local_transaction_id,
    invoice_number,
    subtotal: totalSubtotal,
    discount_amount: totalLineDiscounts + discountAmount,
    tax_amount: totalTax,
    total_amount: finalTotal,
    paid_amount: actualPaidAmount,
    change_amount: changeAmount,
    payment_status: paymentStatus,
    sale_date: saleDate,
    shift_id: shiftId || null,
    is_offline: true,
  };
}

/**
 * Void an existing completed sale with stock reversal
 */
export async function voidSale(
  clientId: string,
  saleId: string,
  reason: string,
  voidedBy?: string | null
): Promise<{ success: boolean; message: string }> {
  if (!clientId || !saleId) {
    throw new Error('معرف المنشأة ومعرف الفاتورة مطلوبان');
  }

  // Try RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc('void_sale', {
    p_client_id: clientId,
    p_sale_id: saleId,
    p_reason: reason,
    p_voided_by: voidedBy
  });

  if (!rpcError && rpcData && rpcData.success) {
    await logActivity({
      action: 'sale_voided',
      entityType: 'sale',
      entityId: saleId,
      metadata: { reason, invoice_number: rpcData.invoice_number }
    });
    return { success: true, message: rpcData.message || 'تم إلغاء الفاتورة بنجاح وإرجاع المخزون' };
  }

  // If the RPC threw an intentional exception (e.g. lack of sales.void permission, already voided), throw it directly
  const isFunctionNotFound = rpcError && (
    rpcError.code === '42883' || 
    rpcError.code === 'PGRST202' ||
    rpcError.message?.toLowerCase().includes('could not find the function') ||
    rpcError.message?.toLowerCase().includes('schema cache')
  );

  if (rpcError && !isFunctionNotFound) {
    throw new Error(rpcError.message);
  }

  // Fallback only if RPC is not deployed yet on Supabase
  console.warn('void_sale RPC not found on database, executing fallback:', rpcError?.message);

  const { data: sale, error: fetchError } = await supabase
    .from('sales')
    .select('*, items:sale_items(*)')
    .eq('id', saleId)
    .eq('client_id', clientId)
    .single();

  if (fetchError || !sale) {
    throw new Error('لم يتم العثور على الفاتورة المحددة');
  }

  if (sale.sale_status === 'voided') {
    throw new Error('هذه الفاتورة ملغاة مسبقاً');
  }

  // Mark sale as voided
  const updatedNotes = (sale.notes ? sale.notes + '\n' : '') + `[ملغاة]: ${reason || 'إلغاء الفاتورة'}`;
  const { error: updateError } = await supabase
    .from('sales')
    .update({ sale_status: 'voided', notes: updatedNotes, updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .eq('client_id', clientId);

  if (updateError) {
    throw new Error('فشل تحديث حالة الفاتورة: ' + updateError.message);
  }

  // Reverse inventory
  if (sale.items && sale.items.length > 0) {
    for (const item of sale.items) {
      // Check if product tracks stock
      const { data: product } = await supabase
        .from('products')
        .select('track_stock, cost_price, current_stock')
        .eq('id', item.product_id)
        .eq('client_id', clientId)
        .single();

      if (product && product.track_stock) {
        // Return stock to warehouse balance
        const { data: bal } = await supabase
          .from('inventory_balances')
          .select('quantity')
          .eq('client_id', clientId)
          .eq('product_id', item.product_id)
          .eq('warehouse_id', sale.warehouse_id)
          .single();

        const curBal = bal ? Number(bal.quantity) : 0;
        await supabase
          .from('inventory_balances')
          .update({ quantity: curBal + Number(item.quantity), updated_at: new Date().toISOString() })
          .eq('client_id', clientId)
          .eq('product_id', item.product_id)
          .eq('warehouse_id', sale.warehouse_id);

        // Update global product stock
        await supabase
          .from('products')
          .update({ current_stock: Number(product.current_stock || 0) + Number(item.quantity), updated_at: new Date().toISOString() })
          .eq('id', item.product_id)
          .eq('client_id', clientId);

        // Record reverse ledger transaction
        await supabase.from('inventory_transactions').insert({
          client_id: clientId,
          product_id: item.product_id,
          warehouse_id: sale.warehouse_id,
          transaction_type: 'sale_return',
          quantity: Number(item.quantity),
          unit_cost: product.cost_price,
          reference_type: 'sale_void',
          reference_id: sale.invoice_number,
          notes: `إلغاء فاتورة المبيعات ${sale.invoice_number}: ${reason || ''}`,
          created_by: voidedBy
        });
      }
    }
  }

  await logActivity({
    action: 'sale_voided',
    entityType: 'sale',
    entityId: saleId,
    metadata: { reason, invoice_number: sale.invoice_number }
  });

  return { success: true, message: 'تم إلغاء الفاتورة بنجاح وإرجاع المخزون' };
}

/**
 * Fetch list of sales with multi-dimensional filtering & pagination
 */
export async function fetchSales(
  clientId: string,
  filters: FetchSalesFilter = {}
): Promise<FetchSalesResult> {
  if (!clientId) {
    return {
      sales: [],
      totalCount: 0,
      stats: { totalSalesAmount: 0, todaySalesAmount: 0, completedCount: 0, voidedCount: 0 }
    };
  }

  const {
    search = '',
    warehouseId,
    saleStatus = 'all',
    paymentStatus = 'all',
    startDate,
    endDate,
    page = 1,
    pageSize = 20
  } = filters;

  let query = supabase
    .from('sales')
    .select(`
      *,
      warehouse:warehouses(id, name, code),
      cashier:client_users!sales_created_by_fkey(id, full_name, role, email),
      items:sale_items(id, product_name_snapshot, sku_snapshot, quantity, unit_price, line_total),
      payments:sale_payments(id, payment_method, amount, reference)
    `, { count: 'exact' })
    .eq('client_id', clientId);

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  }

  if (saleStatus && saleStatus !== 'all') {
    query = query.eq('sale_status', saleStatus);
  }

  if (paymentStatus && paymentStatus !== 'all') {
    query = query.eq('payment_status', paymentStatus);
  }

  if (startDate) {
    query = query.gte('sale_date', `${startDate}T00:00:00.000Z`);
  }

  if (endDate) {
    query = query.lte('sale_date', `${endDate}T23:59:59.999Z`);
  }

  if (search.trim()) {
    query = query.ilike('invoice_number', `%${search.trim()}%`);
  }

  // Ordering and pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order('sale_date', { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching sales:', error);
    return {
      sales: [],
      totalCount: 0,
      stats: { totalSalesAmount: 0, todaySalesAmount: 0, completedCount: 0, voidedCount: 0 }
    };
  }

  // Compute aggregated stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: allStatsData } = await supabase
    .from('sales')
    .select('total_amount, sale_status, sale_date')
    .eq('client_id', clientId);

  let totalSalesAmount = 0;
  let todaySalesAmount = 0;
  let completedCount = 0;
  let voidedCount = 0;

  if (allStatsData) {
    for (const s of allStatsData) {
      if (s.sale_status === 'completed') {
        completedCount++;
        totalSalesAmount += Number(s.total_amount || 0);
        if (s.sale_date && s.sale_date.startsWith(todayStr)) {
          todaySalesAmount += Number(s.total_amount || 0);
        }
      } else if (s.sale_status === 'voided') {
        voidedCount++;
      }
    }
  }

  return {
    sales: (data as Sale[]) || [],
    totalCount: count || 0,
    stats: {
      totalSalesAmount,
      todaySalesAmount,
      completedCount,
      voidedCount
    }
  };
}

/**
 * Fetch full details of a single sale by ID
 */
export async function fetchSaleDetails(saleId: string, clientId: string): Promise<Sale | null> {
  if (!saleId || !clientId) return null;

  const { data, error } = await supabase
    .from('sales')
    .select(`
      *,
      warehouse:warehouses(id, name, code, address),
      cashier:client_users!sales_created_by_fkey(id, full_name, email, role),
      items:sale_items(
        id,
        product_id,
        product_name_snapshot,
        sku_snapshot,
        barcode_snapshot,
        quantity,
        unit_price,
        discount_amount,
        tax_rate,
        tax_amount,
        line_total
      ),
      payments:sale_payments(
        id,
        payment_method,
        amount,
        reference,
        created_at
      )
    `)
    .eq('id', saleId)
    .eq('client_id', clientId)
    .single();

  if (error || !data) {
    console.error('Error fetching sale details:', error);
    return null;
  }

  return data as Sale;
}

/**
 * Fetch or generate the next atomic invoice number for a client via get_next_invoice_number RPC
 */
export async function fetchNextInvoiceNumber(clientId: string): Promise<string> {
  if (!clientId) throw new Error('Client ID is required');

  try {
    const { data, error } = await supabase.rpc('get_next_invoice_number', {
      p_client_id: clientId
    });

    if (error) {
      console.warn('RPC get_next_invoice_number error, generating fallback sequence:', error.message);
      return `INV-${Date.now().toString().slice(-6)}`;
    }

    return (data as string) || `INV-${Date.now().toString().slice(-6)}`;
  } catch (err: any) {
    console.warn('Exception calling get_next_invoice_number, generating fallback sequence:', err?.message);
    return `INV-${Date.now().toString().slice(-6)}`;
  }
}
