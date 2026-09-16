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
      const pending = await offlineStorage.getPendingSales(clientId);
      set({ pendingCount: pending.length });
      return pending.length;
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

          // 2. Transmit to server using standard atomic sale checkout
          const result = await executeCompleteSale({
            clientId: sale.client_id,
            warehouseId: sale.warehouse_id,
            items: sale.items.map(item => ({
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_amount: item.discount_amount || 0
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
            shiftId: sale.shift_id,
            deviceFingerprint: sale.device_fingerprint
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

            // Remove from offline IndexedDB queue
            await offlineStorage.removePendingSale(sale.local_transaction_id);
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
