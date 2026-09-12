import { Product, Category, Customer, Warehouse, Shift } from '../../types';

export interface OfflineSaleRecord {
  local_transaction_id: string;
  client_id: string;
  warehouse_id: string;
  shift_id?: string | null;
  items: Array<{
    product_id: string;
    product_name_snapshot: string;
    sku_snapshot?: string;
    barcode_snapshot?: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    tax_rate?: number;
    tax_amount?: number;
    line_total: number;
  }>;
  payments: Array<{
    payment_method: string;
    amount: number;
    reference?: string;
  }>;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_method: string;
  customer_id?: string | null;
  cashier_id?: string | null;
  cashier_name?: string | null;
  device_fingerprint?: string | null;
  created_at: string;
  status: 'pending' | 'syncing' | 'failed';
  retry_count: number;
  last_error?: string;
}

export interface CachedLicenseRecord {
  client_id: string;
  license_id: string;
  license_key: string;
  device_fingerprint: string;
  status: string;
  last_validated_at: string;
  max_offline_hours: number;
  checksum: string;
}

const DB_NAME = 'ordexa_pos_offline_db';
const DB_VERSION = 2;

export class OfflineStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('warehouses')) {
          db.createObjectStore('warehouses', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('current_shift')) {
          db.createObjectStore('current_shift', { keyPath: 'client_id' });
        }
        if (!db.objectStoreNames.contains('pending_sales')) {
          const salesStore = db.createObjectStore('pending_sales', { keyPath: 'local_transaction_id' });
          salesStore.createIndex('status', 'status', { unique: false });
          salesStore.createIndex('client_id', 'client_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('license_cache')) {
          db.createObjectStore('license_cache', { keyPath: 'client_id' });
        }
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- Catalog Caching ---

  async saveProducts(products: Product[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const p of products) {
          store.put(p);
        }
        resolve();
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
  }

  async getProducts(): Promise<Product[]> {
    const db = await this.getDB();
    return new Promise<Product[]>((resolve, reject) => {
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async saveCategories(categories: Category[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('categories', 'readwrite');
    const store = tx.objectStore('categories');
    store.clear();
    for (const c of categories) {
      store.put(c);
    }
  }

  async getCategories(): Promise<Category[]> {
    const db = await this.getDB();
    return new Promise<Category[]>((resolve, reject) => {
      const tx = db.transaction('categories', 'readonly');
      const req = tx.objectStore('categories').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async saveWarehouses(warehouses: Warehouse[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('warehouses', 'readwrite');
    const store = tx.objectStore('warehouses');
    store.clear();
    for (const w of warehouses) {
      store.put(w);
    }
  }

  async getWarehouses(): Promise<Warehouse[]> {
    const db = await this.getDB();
    return new Promise<Warehouse[]>((resolve, reject) => {
      const tx = db.transaction('warehouses', 'readonly');
      const req = tx.objectStore('warehouses').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async saveCustomers(customers: Customer[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('customers', 'readwrite');
    const store = tx.objectStore('customers');
    store.clear();
    for (const c of customers) {
      store.put(c);
    }
  }

  async getCustomers(): Promise<Customer[]> {
    const db = await this.getDB();
    return new Promise<Customer[]>((resolve, reject) => {
      const tx = db.transaction('customers', 'readonly');
      const req = tx.objectStore('customers').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Current Shift Caching ---

  async saveCurrentShift(clientId: string, shift: Shift | null): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('current_shift', 'readwrite');
    const store = tx.objectStore('current_shift');
    if (!shift) {
      store.delete(clientId);
    } else {
      store.put({ client_id: clientId, ...shift });
    }
  }

  async getCurrentShift(clientId: string): Promise<Shift | null> {
    const db = await this.getDB();
    return new Promise<Shift | null>((resolve) => {
      const tx = db.transaction('current_shift', 'readonly');
      const req = tx.objectStore('current_shift').get(clientId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  // --- Offline Sales Queue (Idempotent Local Storage) ---

  async savePendingSale(sale: OfflineSaleRecord): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending_sales', 'readwrite');
      const store = tx.objectStore('pending_sales');
      const req = store.put(sale);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getPendingSales(clientId?: string): Promise<OfflineSaleRecord[]> {
    const db = await this.getDB();
    return new Promise<OfflineSaleRecord[]>((resolve, reject) => {
      const tx = db.transaction('pending_sales', 'readonly');
      const store = tx.objectStore('pending_sales');
      const req = store.getAll();
      req.onsuccess = () => {
        let results = (req.result || []) as OfflineSaleRecord[];
        if (clientId) {
          results = results.filter(s => s.client_id === clientId);
        }
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async removePendingSale(local_transaction_id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending_sales', 'readwrite');
      const store = tx.objectStore('pending_sales');
      const req = store.delete(local_transaction_id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async updatePendingSaleStatus(
    local_transaction_id: string,
    status: 'pending' | 'syncing' | 'failed',
    last_error?: string
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending_sales', 'readwrite');
      const store = tx.objectStore('pending_sales');
      const getReq = store.get(local_transaction_id);
      getReq.onsuccess = () => {
        const record = getReq.result as OfflineSaleRecord | undefined;
        if (record) {
          record.status = status;
          if (status === 'failed') {
            record.retry_count = (record.retry_count || 0) + 1;
            record.last_error = last_error || 'Sync failed';
          }
          store.put(record);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // --- Tamper-Resistant Offline Licensing & Grace Period ---

  computeLicenseChecksum(data: {
    client_id: string;
    license_id: string;
    license_key: string;
    device_fingerprint: string;
    status: string;
    last_validated_at: string;
    max_offline_hours: number;
  }): string {
    const raw = `${data.client_id}::${data.license_id}::${data.license_key}::${data.device_fingerprint}::${data.status}::${data.last_validated_at}::${data.max_offline_hours}::ORDEXA_INTEGRITY_SALT_V1`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  async cacheLicenseValidation(params: {
    clientId: string;
    licenseId: string;
    licenseKey: string;
    deviceFingerprint: string;
    status: string;
    maxOfflineHours?: number;
  }): Promise<void> {
    const max_offline_hours = params.maxOfflineHours || 24;
    const last_validated_at = new Date().toISOString();
    const checksum = this.computeLicenseChecksum({
      client_id: params.clientId,
      license_id: params.licenseId,
      license_key: params.licenseKey,
      device_fingerprint: params.deviceFingerprint,
      status: params.status,
      last_validated_at,
      max_offline_hours
    });

    const record: CachedLicenseRecord = {
      client_id: params.clientId,
      license_id: params.licenseId,
      license_key: params.licenseKey,
      device_fingerprint: params.deviceFingerprint,
      status: params.status,
      last_validated_at,
      max_offline_hours,
      checksum
    };

    const db = await this.getDB();
    const tx = db.transaction('license_cache', 'readwrite');
    tx.objectStore('license_cache').put(record);
  }

  async getCachedLicense(clientId: string): Promise<CachedLicenseRecord | null> {
    const db = await this.getDB();
    return new Promise<CachedLicenseRecord | null>((resolve) => {
      const tx = db.transaction('license_cache', 'readonly');
      const req = tx.objectStore('license_cache').get(clientId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async verifyOfflineGracePeriod(
    clientId: string,
    currentFingerprint: string
  ): Promise<{
    permitted: boolean;
    remainingHours: number;
    reason?: string;
    cachedLicense?: CachedLicenseRecord;
  }> {
    const cache = await this.getCachedLicense(clientId);
    if (!cache) {
      return {
        permitted: false,
        remainingHours: 0,
        reason: 'لا يوجد ترخيص معتمد مسبقاً لهذا الجهاز. يلزم الاتصال بالإنترنت لتفعيل نقطة البيع لأول مرة.'
      };
    }

    // Check device fingerprint matching
    if (cache.device_fingerprint !== currentFingerprint) {
      return {
        permitted: false,
        remainingHours: 0,
        reason: 'بصمة الجهاز العتادية الحالية لا تتطابق مع رخصة الجهاز المعتمدة محلياً.'
      };
    }

    // Check tamper-proof checksum
    const expectedChecksum = this.computeLicenseChecksum({
      client_id: cache.client_id,
      license_id: cache.license_id,
      license_key: cache.license_key || '',
      device_fingerprint: cache.device_fingerprint,
      status: cache.status,
      last_validated_at: cache.last_validated_at,
      max_offline_hours: cache.max_offline_hours
    });

    if (expectedChecksum !== cache.checksum) {
      return {
        permitted: false,
        remainingHours: 0,
        reason: 'تم اكتشاف تلاعب في سجلات الترخيص المحلية. تم تعطيل التشغيل بدون اتصال.'
      };
    }

    // Check status
    if (cache.status !== 'active') {
      return {
        permitted: false,
        remainingHours: 0,
        reason: 'حالة الترخيص المحلي غير نشطة أو معلقة.'
      };
    }

    // Compute elapsed time vs grace period
    const validatedTime = new Date(cache.last_validated_at).getTime();
    const now = Date.now();
    const elapsedHours = (now - validatedTime) / (1000 * 60 * 60);
    const remainingHours = Math.max(0, Math.floor(cache.max_offline_hours - elapsedHours));

    if (elapsedHours > cache.max_offline_hours) {
      return {
        permitted: false,
        remainingHours: 0,
        reason: `انتهت فترة السماح للعمل بدون اتصال (${cache.max_offline_hours} ساعة). يجب الاتصال بالإنترنت لإعادة تفعيل الترخيص.`
      };
    }

    return {
      permitted: true,
      remainingHours,
      cachedLicense: cache
    };
  }

  async verifyOfflineLicense(
    clientId: string,
    currentFingerprint: string
  ) {
    return this.verifyOfflineGracePeriod(clientId, currentFingerprint);
  }
}

export const offlineStorage = new OfflineStorageManager();
