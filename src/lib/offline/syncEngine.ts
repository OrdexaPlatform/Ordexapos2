import { create } from 'zustand';
import { supabase } from '../supabase';
import { offlineStorage, OfflineSaleRecord } from './offlineStorage';
import { executeCompleteSale } from '../salesService';

export interface SyncState {
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingCount: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  setOnline: (online: boolean) => void;
  updatePendingCount: (clientId?: string) => Promise<number>;
  enqueueOfflineSale: (saleData: Omit<OfflineSaleRecord, 'local_transaction_id' | 'status' | 'retry_count' | 'created_at'>) => Promise<OfflineSaleRecord>;
  syncNow: (clientId?: string) => Promise<{ success: boolean; syncedCount: number; failedCount: number }>;
}

export function generateLocalTransactionId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  const timePart = Date.now().toString().slice(-4);
  return `OFF-${dateStr}-${randomPart}${timePart}`;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncStatus: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  errorMessage: null,

  setOnline: (online: boolean) => {
    const wasOffline = !get().isOnline;
    set({ isOnline: online });
    if (online && wasOffline) {
      // Auto-trigger sync when transitioning from offline to online
      setTimeout(() => {
        get().syncNow();
      }, 1500);
    }
  },

  updatePendingCount: async (clientId?: string) => {
    try {
      const [pendingSales, pendingShifts, pendingCash] = await Promise.all([
        offlineStorage.getPendingSales(clientId),
        offlineStorage.getPendingShifts(clientId),
        offlineStorage.getPendingCashMovements(clientId),
      ]);
      const total = (pendingSales?.length || 0) + (pendingShifts?.length || 0) + (pendingCash?.length || 0);
      set({ pendingCount: total });
      return total;
    } catch {
      return 0;
    }
  },

  enqueueOfflineSale: async (saleData) => {
    const local_transaction_id = generateLocalTransactionId();
    const newRecord: OfflineSaleRecord = {
      ...saleData,
      local_transaction_id,
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0
    };

    await offlineStorage.savePendingSale(newRecord);
    await get().updatePendingCount(saleData.client_id);
    return newRecord;
  },

  syncNow: async (clientId?: string) => {
    if (get().syncStatus === 'syncing') {
      return { success: false, syncedCount: 0, failedCount: 0 };
    }

    if (!get().isOnline) {
      set({ syncStatus: 'error', errorMessage: 'لا يوجد اتصال بالإنترنت لإجراء المزامنة' });
      return { success: false, syncedCount: 0, failedCount: 0 };
    }

    set({ syncStatus: 'syncing', errorMessage: null });

    let syncedCount = 0;
    let failedCount = 0;

    try {
      // ==========================================
      // PHASE 1: Sync Pending Shifts (Open / Close)
      // ==========================================
      try {
        const pendingShifts = await offlineStorage.getPendingShifts(clientId);
        for (const pShift of pendingShifts) {
          try {
            // Check if already mapped to a server shift
            const existingMapping = await offlineStorage.getShiftMapping(pShift.local_shift_id);
            if (existingMapping) {
              await offlineStorage.removePendingShift(pShift.local_shift_id);
              continue;
            }

            let serverShiftId: string | null = null;
            const res = await fetch('/api/shifts/open', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: pShift.client_id,
                warehouse_id: pShift.warehouse_id,
                register_id: pShift.register_id,
                opening_cash: pShift.opening_cash,
                opening_notes: `[Offline: ${pShift.local_shift_id}] ${pShift.opening_notes || ''}`,
                opened_by: pShift.opened_by,
              }),
            });

            const data = await res.json();
            if (res.ok && (data.shift_id || data.shift?.id)) {
              serverShiftId = data.shift_id || data.shift?.id;
            } else if (data.message && data.message.includes('مفتوحة بالفعل')) {
              // Retrieve the currently active shift on server
              const { data: activeShifts } = await supabase
                .from('shifts')
                .select('id')
                .eq('client_id', pShift.client_id)
                .eq('status', 'open')
                .order('opened_at', { ascending: false })
                .limit(1);
              if (activeShifts && activeShifts.length > 0) {
                serverShiftId = activeShifts[0].id;
              }
            }

            if (serverShiftId) {
              await offlineStorage.saveShiftMapping(pShift.local_shift_id, serverShiftId);
              await offlineStorage.removePendingShift(pShift.local_shift_id);

              // Update local active shift cache if it matches the offline shift
              const cur = await offlineStorage.getCurrentShift(pShift.client_id);
              if (cur && cur.id === pShift.local_shift_id) {
                cur.id = serverShiftId;
                await offlineStorage.saveCurrentShift(pShift.client_id, cur);
                try {
                  localStorage.setItem(`ordexa_active_shift_${pShift.client_id}`, JSON.stringify(cur));
                } catch {}
              }
              syncedCount++;
            } else {
              console.warn('Could not establish server shift for offline shift:', pShift.local_shift_id);
              failedCount++;
            }
          } catch (shiftErr) {
            console.error(`Error syncing shift ${pShift.local_shift_id}:`, shiftErr);
            failedCount++;
          }
        }
      } catch (err) {
        console.warn('Error during phase 1 shift sync:', err);
      }

      // ==========================================
      // PHASE 2: Sync Pending Sales
      // ==========================================
      const pendingSales = await offlineStorage.getPendingSales(clientId);

      for (const sale of pendingSales) {
        try {
          await offlineStorage.updatePendingSaleStatus(sale.local_transaction_id, 'syncing');

          // 1. Idempotency Check: Verify if sale was already synced
          let existingSale: { id: string; invoice_number: string } | null = null;
          try {
            const { data } = await supabase
              .from('sales')
              .select('id, invoice_number')
              .eq('client_id', sale.client_id)
              .ilike('notes', `%${sale.local_transaction_id}%`)
              .maybeSingle();
            existingSale = data;
          } catch {
            // fallback
          }

          if (existingSale) {
            // Already synced, safely remove from local queue
            await offlineStorage.removePendingSale(sale.local_transaction_id);
            syncedCount++;
            continue;
          }

          // 2. Resolve server shift ID if created while offline
          let effectiveShiftId = sale.shift_id;
          if (sale.shift_id && sale.shift_id.startsWith('OFF-SHIFT-')) {
            const mapped = await offlineStorage.getShiftMapping(sale.shift_id);
            if (mapped) {
              effectiveShiftId = mapped;
            }
          }

          // 3. Transmit to server using standard atomic sale checkout
          const result = await executeCompleteSale({
            clientId: sale.client_id,
            warehouseId: sale.warehouse_id,
            items: sale.items.map(item => ({
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_amount: item.discount_amount || 0,
              product_name: item.product_name_snapshot,
              sku: item.sku_snapshot,
              barcode: item.barcode_snapshot,
              tax_rate: item.tax_rate,
            })),
            payments: sale.payments.map(p => ({
              payment_method: p.payment_method as any,
              amount: p.amount,
              reference: p.reference
            })),
            discountAmount: sale.discount_amount || 0,
            customerId: sale.customer_id,
            notes: `Synced offline sale (${sale.local_transaction_id})`,
            createdBy: sale.cashier_id,
            shiftId: effectiveShiftId,
            deviceFingerprint: sale.device_fingerprint,
            isSyncing: true
          });

          if (result && result.success && result.sale_id) {
            // Safely tag sale with local_transaction_id
            try {
              await supabase
                .from('sales')
                .update({
                  local_transaction_id: sale.local_transaction_id,
                  is_offline_sync: true
                })
                .eq('id', result.sale_id);
            } catch {
              // Ignore schema column discrepancy if columns do not exist yet
            }

            // Remove from offline IndexedDB queue and localStorage backup
            await offlineStorage.removePendingSale(sale.local_transaction_id);
            try {
              const lsKey = `ordexa_pending_sales_${sale.client_id}`;
              const raw = localStorage.getItem(lsKey);
              if (raw) {
                const parsed: OfflineSaleRecord[] = JSON.parse(raw);
                const updated = parsed.filter(s => s.local_transaction_id !== sale.local_transaction_id);
                localStorage.setItem(lsKey, JSON.stringify(updated));
              }
            } catch {}
            syncedCount++;
          } else {
            throw new Error('Server did not return success for offline sale sync');
          }
        } catch (itemErr: any) {
          console.error(`Sync error for sale ${sale.local_transaction_id}:`, itemErr);
          await offlineStorage.updatePendingSaleStatus(
            sale.local_transaction_id,
            'failed',
            itemErr?.message || 'Unknown sync failure'
          );
          failedCount++;
        }
      }

      // ==========================================
      // PHASE 3: Sync Pending Cash Drawer Movements
      // ==========================================
      try {
        const pendingCash = await offlineStorage.getPendingCashMovements(clientId);
        for (const cMove of pendingCash) {
          try {
            let effectiveShiftId = cMove.local_shift_id;
            if (cMove.local_shift_id && cMove.local_shift_id.startsWith('OFF-SHIFT-')) {
              const mapped = await offlineStorage.getShiftMapping(cMove.local_shift_id);
              if (mapped) {
                effectiveShiftId = mapped;
              }
            }

            const res = await fetch('/api/shifts/cash-movement', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId: cMove.client_id,
                shiftId: effectiveShiftId,
                transactionType: cMove.transaction_type,
                amount: cMove.amount,
                reason: cMove.reason,
                performedBy: cMove.performed_by,
                localTransactionId: cMove.local_transaction_id,
              }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
              await offlineStorage.removePendingCashMovement(cMove.local_transaction_id);
              syncedCount++;
            } else {
              console.error(`Cash movement sync error for ${cMove.local_transaction_id}:`, data.message);
              failedCount++;
            }
          } catch (cErr) {
            console.error(`Sync error for cash movement ${cMove.local_transaction_id}:`, cErr);
            failedCount++;
          }
        }
      } catch (err) {
        console.warn('Error during phase 3 cash movements sync:', err);
      }

      const remaining = await get().updatePendingCount(clientId);
      set({
        syncStatus: failedCount > 0 ? 'error' : 'idle',
        lastSyncedAt: new Date().toISOString(),
        errorMessage: failedCount > 0 ? `فشلت مزامنة ${failedCount} عملية، سيتم إعادة المحاولة لاحقاً` : null
      });

      return {
        success: failedCount === 0,
        syncedCount,
        failedCount
      };
    } catch (err: any) {
      console.error('Fatal sync error:', err);
      set({ syncStatus: 'error', errorMessage: err?.message || 'حدث خطأ أثناء المزامنة' });
      return { success: false, syncedCount, failedCount };
    }
  }
}));

// Setup global window event listeners for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useSyncStore.getState().setOnline(true);
  });
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false);
  });
}
