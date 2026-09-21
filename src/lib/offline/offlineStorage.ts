import { Product, Category, Customer, Warehouse, Shift } from '../../types';
import { PasswordVerifier } from './offlineCrypto';

export interface OfflineCredentialRecord {
  id: string; // Composite key `${client_id}:${auth_user_id}`
  auth_user_id: string;
  client_user_id: string;
  client_id: string;
  client_code: string;
  business_name?: string;
  email: string;
  name?: string;
  phone?: string;
  role: string;
  permissions: string[];
  device_id: string;
  device_fingerprint: string;
  device_authorization: string; // 'active'
  license_id: string;
  license_key?: string;
  license_status: string; // 'active'
  license_expiry: string;
  offline_grace_expiry: string;
  password_verifier: PasswordVerifier;
  created_at: string;
  last_online_login_at: string;
}

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

export interface OfflineAuthSnapshot {
  client_id: string;
  client_code: string;
  client_name: string;
  client_user_id: string;
  user_role: string;
  permissions: string[];
  device_id: string;
  device_fingerprint: string;
  device_authorization_status: string; // 'active'
  license_id: string;
  license_key: string;
  license_status: string; // 'active'
  license_expiry: string;
  max_offline_hours: number;
  created_at: string;
  last_validated_at: string;
  offline_grace_expiry: string;
  checksum: string;
}

export interface OfflineCashMovementRecord {
  local_transaction_id: string;
  client_id: string;
  local_shift_id: string;
  transaction_type: 'cash_in' | 'cash_out' | 'drop_to_safe';
  amount: number;
  reason: string;
  performed_by: string;
  status: 'pending' | 'syncing' | 'failed';
  retry_count: number;
  created_at: string;
  last_error?: string;
}

export interface PendingShiftRecord {
  local_shift_id: string;
  client_id: string;
  warehouse_id: string;
  register_id?: string;
  opened_by: string;
  opening_cash: number;
  opening_notes?: string;
  cashier_name?: string;
  device_fingerprint?: string;
  device_id?: string;
  status: 'pending' | 'syncing' | 'failed';
  created_at: string;
  retry_count: number;
}

const DB_NAME = 'ordexa_pos_offline_db';
const DB_VERSION = 4;

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
        if (!db.objectStoreNames.contains('pending_shifts')) {
          const shiftStore = db.createObjectStore('pending_shifts', { keyPath: 'local_shift_id' });
          shiftStore.createIndex('client_id', 'client_id', { unique: false });
          shiftStore.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('pending_cash_movements')) {
          const cashStore = db.createObjectStore('pending_cash_movements', { keyPath: 'local_transaction_id' });
          cashStore.createIndex('client_id', 'client_id', { unique: false });
          cashStore.createIndex('local_shift_id', 'local_shift_id', { unique: false });
          cashStore.createIndex('status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('shift_mappings')) {
          db.createObjectStore('shift_mappings', { keyPath: 'local_shift_id' });
        }
        if (!db.objectStoreNames.contains('auth_snapshots')) {
          db.createObjectStore('auth_snapshots', { keyPath: 'client_id' });
        }
        if (!db.objectStoreNames.contains('offline_credentials')) {
          const credStore = db.createObjectStore('offline_credentials', { keyPath: 'id' });
          credStore.createIndex('email', 'email', { unique: false });
          credStore.createIndex('client_id', 'client_id', { unique: false });
          credStore.createIndex('client_code', 'client_code', { unique: false });
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

  async decrementLocalProductStock(productId: string, quantity: number): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');
      const req = store.get(productId);
      req.onsuccess = () => {
        const product = req.result as Product | undefined;
        if (product && product.track_stock) {
          product.current_stock = Math.max(0, Number(product.current_stock || 0) - Number(quantity));
          store.put(product);
        }
      };
    } catch (e) {
      console.warn('Failed to decrement local product stock:', e);
    }
  }

  async saveCachedClient(client: any, license?: any): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('config', 'readwrite');
      const store = tx.objectStore('config');
      store.put(client, `client_${client.id}`);
      if (client.client_code) {
        store.put(client, `client_code_${client.client_code.toUpperCase()}`);
      }
      if (license) {
        store.put(license, `license_${client.id}`);
      }
    } catch (e) {
      console.warn('Failed to cache client in IndexedDB:', e);
    }
    try {
      localStorage.setItem(`ordexa_cached_client_${client.id}`, JSON.stringify(client));
      if (client.client_code) {
        localStorage.setItem(`ordexa_cached_client_by_code_${client.client_code.toUpperCase()}`, JSON.stringify(client));
        localStorage.setItem('ordexa_last_client_code', client.client_code.toUpperCase());
      }
      if (license) {
        localStorage.setItem(`ordexa_cached_license_${client.id}`, JSON.stringify(license));
      }
    } catch {}
  }

  async getCachedClient(idOrCode?: string): Promise<any | null> {
    const effectiveKey = idOrCode || (typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_last_client_code') : null);
    if (!effectiveKey) return null;
    try {
      const db = await this.getDB();
      const fromDb = await new Promise<any | null>((resolve) => {
        const tx = db.transaction('config', 'readonly');
        const store = tx.objectStore('config');
        const key = effectiveKey.toUpperCase().startsWith('ORD-') ? `client_code_${effectiveKey.toUpperCase()}` : `client_${effectiveKey}`;
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (fromDb) return fromDb;
    } catch {}

    // Fallback to localStorage
    try {
      const byCode = localStorage.getItem(`ordexa_cached_client_by_code_${effectiveKey.toUpperCase()}`);
      if (byCode) return JSON.parse(byCode);
      const byId = localStorage.getItem(`ordexa_cached_client_${effectiveKey}`);
      if (byId) return JSON.parse(byId);
    } catch {}
    return null;
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
    const max_offline_hours = params.maxOfflineHours || 168; // 7 days offline allowance
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
    currentFingerprint?: string
  ): Promise<{
    permitted: boolean;
    remainingHours: number;
    reason?: string;
    cachedLicense?: CachedLicenseRecord;
  }> {
    const effectiveFingerprint = currentFingerprint || (typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_device_fingerprint') : null) || '';
    let cache = await this.getCachedLicense(clientId);
    if (!cache) {
      try {
        const rawLic = typeof localStorage !== 'undefined' ? localStorage.getItem(`ordexa_cached_license_${clientId}`) : null;
        if (rawLic) {
          const parsed = JSON.parse(rawLic);
          if (parsed && (parsed.status === 'active' || parsed.license_key)) {
            await this.cacheLicenseValidation({
              clientId,
              licenseId: parsed.id || 'lic-cached',
              licenseKey: parsed.license_key || 'LIC-CACHED',
              deviceFingerprint: currentFingerprint,
              status: 'active',
              maxOfflineHours: 168
            });
            cache = await this.getCachedLicense(clientId);
          }
        }
      } catch (err) {
        console.warn('Fallback license cache reconstruction warning:', err);
      }
    }

    if (!cache) {
      return {
        permitted: false,
        remainingHours: 0,
        reason: 'لا يوجد ترخيص معتمد مسبقاً لهذا الجهاز. يلزم الاتصال بالإنترنت لتفعيل نقطة البيع لأول مرة.'
      };
    }

    // Check device fingerprint matching
    if (effectiveFingerprint && cache.device_fingerprint && cache.device_fingerprint !== effectiveFingerprint) {
      const storedFp = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_device_fingerprint') : null;
      if (storedFp && (storedFp === effectiveFingerprint || storedFp === cache.device_fingerprint)) {
        // Re-align fingerprint if valid local device
        cache.device_fingerprint = effectiveFingerprint;
      } else {
        return {
          permitted: false,
          remainingHours: 0,
          reason: 'بصمة الجهاز العتادية الحالية لا تتطابق مع رخصة الجهاز المعتمدة محلياً.'
        };
      }
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
    currentFingerprint?: string
  ) {
    return this.verifyOfflineGracePeriod(clientId, currentFingerprint);
  }

  // --- Offline Authorization Snapshot (Bug #2) ---

  computeAuthSnapshotChecksum(snapshot: Omit<OfflineAuthSnapshot, 'checksum'>): string {
    const raw = [
      snapshot.client_id,
      snapshot.client_code,
      snapshot.client_user_id,
      snapshot.device_id,
      snapshot.device_fingerprint,
      snapshot.license_id,
      snapshot.license_status,
      snapshot.device_authorization_status,
      snapshot.last_validated_at,
      snapshot.max_offline_hours
    ].join('::');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `ORD-AUTH-HASH-${Math.abs(hash).toString(16).toUpperCase()}-${raw.length}`;
  }

  async saveAuthSnapshot(snapshot: OfflineAuthSnapshot): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('auth_snapshots', 'readwrite');
      tx.objectStore('auth_snapshots').put(snapshot);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Could not save auth snapshot to IndexedDB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`ordexa_auth_snapshot_${snapshot.client_id}`, JSON.stringify(snapshot));
      }
    } catch {}
  }

  async getAuthSnapshot(clientId: string): Promise<OfflineAuthSnapshot | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('auth_snapshots', 'readonly');
      const store = tx.objectStore('auth_snapshots');
      const req = store.get(clientId);
      const res = await new Promise<OfflineAuthSnapshot | null>((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (res) return res;
    } catch {}

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`ordexa_auth_snapshot_${clientId}`);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  async verifyAuthSnapshot(clientId: string, currentFingerprint?: string): Promise<{ valid: boolean; reason?: string; snapshot?: OfflineAuthSnapshot }> {
    const snapshot = await this.getAuthSnapshot(clientId);
    if (!snapshot) {
      return { valid: false, reason: 'لا توجد بيانات اعتماد محفوظة محلياً لهذا العميل' };
    }

    if (snapshot.client_id !== clientId) {
      return { valid: false, reason: 'عدم تطابق منشأة الترخيص المحفوظ' };
    }

    if (snapshot.device_authorization_status !== 'active') {
      return { valid: false, reason: 'هذا الجهاز غير مصرح به أو تم إيقافه' };
    }

    if (snapshot.license_status !== 'active') {
      return { valid: false, reason: 'الترخيص غير نشط' };
    }

    if (currentFingerprint && snapshot.device_fingerprint !== currentFingerprint) {
      const localFp = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_device_fingerprint') : null;
      if (localFp !== currentFingerprint && snapshot.device_fingerprint !== localFp) {
        return { valid: false, reason: 'بصمة الجهاز لا تتطابق مع سجل الترخيص المعتمد' };
      }
    }

    const expectedChecksum = this.computeAuthSnapshotChecksum(snapshot);
    if (snapshot.checksum && snapshot.checksum !== expectedChecksum) {
      return { valid: false, reason: 'تم اكتشاف تلاعب في سجل الاعتماد المحلي' };
    }

    const now = Date.now();
    const graceExpiry = new Date(snapshot.offline_grace_expiry).getTime();
    if (now > graceExpiry) {
      return { valid: false, reason: 'انتهت فترة السماح للعمل بدون اتصال. يلزم الاتصال بالإنترنت' };
    }

    return { valid: true, snapshot };
  }

  // --- Offline Shift Queue (Bug #1) ---

  async savePendingShift(record: PendingShiftRecord): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_shifts', 'readwrite');
      tx.objectStore('pending_shifts').put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Could not save pending shift to IndexedDB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const key = `ordexa_pending_shifts_${record.client_id}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = existing.findIndex((s: any) => s.local_shift_id === record.local_shift_id);
        if (idx >= 0) existing[idx] = record;
        else existing.push(record);
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch {}
  }

  async getPendingShifts(clientId?: string): Promise<PendingShiftRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_shifts', 'readonly');
      const store = tx.objectStore('pending_shifts');
      const req = store.getAll();
      const records = await new Promise<PendingShiftRecord[]>((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      if (clientId) {
        return records.filter(r => r.client_id === clientId);
      }
      return records;
    } catch {
      if (clientId && typeof localStorage !== 'undefined') {
        try {
          return JSON.parse(localStorage.getItem(`ordexa_pending_shifts_${clientId}`) || '[]');
        } catch {}
      }
      return [];
    }
  }

  async removePendingShift(localShiftId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_shifts', 'readwrite');
      tx.objectStore('pending_shifts').delete(localShiftId);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ordexa_pending_shifts_')) {
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const filtered = list.filter((s: any) => s.local_shift_id !== localShiftId);
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      }
    } catch {}
  }

  // --- Local Shift to Server Shift ID Mappings ---

  async saveShiftMapping(localShiftId: string, serverShiftId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('shift_mappings', 'readwrite');
      tx.objectStore('shift_mappings').put({ local_shift_id: localShiftId, server_shift_id: serverShiftId, created_at: new Date().toISOString() });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`ordexa_shift_map_${localShiftId}`, serverShiftId);
      }
    } catch {}
  }

  async getShiftMapping(localShiftId: string): Promise<string | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('shift_mappings', 'readonly');
      const req = tx.objectStore('shift_mappings').get(localShiftId);
      const res = await new Promise<any>((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (res && res.server_shift_id) return res.server_shift_id;
    } catch {}
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(`ordexa_shift_map_${localShiftId}`) || null;
      }
    } catch {}
    return null;
  }

  // --- Offline Cash Movement Queue (Bug #1) ---

  async savePendingCashMovement(record: OfflineCashMovementRecord): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_cash_movements', 'readwrite');
      tx.objectStore('pending_cash_movements').put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Could not save pending cash movement to IndexedDB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const key = `ordexa_pending_cash_${record.client_id}`;
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = list.findIndex((m: any) => m.local_transaction_id === record.local_transaction_id);
        if (idx >= 0) list[idx] = record;
        else list.push(record);
        localStorage.setItem(key, JSON.stringify(list));
      }
    } catch {}
  }

  async getPendingCashMovements(clientId?: string): Promise<OfflineCashMovementRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_cash_movements', 'readonly');
      const store = tx.objectStore('pending_cash_movements');
      const req = store.getAll();
      const records = await new Promise<OfflineCashMovementRecord[]>((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      if (clientId) {
        return records.filter(r => r.client_id === clientId);
      }
      return records;
    } catch {
      if (clientId && typeof localStorage !== 'undefined') {
        try {
          return JSON.parse(localStorage.getItem(`ordexa_pending_cash_${clientId}`) || '[]');
        } catch {}
      }
      return [];
    }
  }

  async removePendingCashMovement(localTransactionId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_cash_movements', 'readwrite');
      tx.objectStore('pending_cash_movements').delete(localTransactionId);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {}
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('ordexa_pending_cash_')) {
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            const filtered = list.filter((m: any) => m.local_transaction_id !== localTransactionId);
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      }
    } catch {}
  }

  async updatePendingCashMovementStatus(localTransactionId: string, status: 'pending' | 'syncing' | 'failed', error?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('pending_cash_movements', 'readwrite');
      const store = tx.objectStore('pending_cash_movements');
      const req = store.get(localTransactionId);
      req.onsuccess = () => {
        if (req.result) {
          const updated = {
            ...req.result,
            status,
            retry_count: (req.result.retry_count || 0) + (status === 'failed' ? 1 : 0),
            last_error: error || req.result.last_error
          };
          store.put(updated);
        }
      };
    } catch {}
  }

  // --- Offline Authentication & Credentials (Bug #3) ---

  async saveOfflineCredential(record: OfflineCredentialRecord): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('offline_credentials', 'readwrite');
      tx.objectStore('offline_credentials').put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Could not save offline credential to IndexedDB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const key = `ordexa_cred_${record.client_id}_${record.email.toLowerCase()}`;
        localStorage.setItem(key, JSON.stringify(record));
        localStorage.setItem('ordexa_last_offline_email', record.email.toLowerCase());

        // Keep index of credentials
        const indexKey = 'ordexa_offline_credentials_index';
        const list = JSON.parse(localStorage.getItem(indexKey) || '[]');
        if (!list.includes(key)) {
          list.push(key);
          localStorage.setItem(indexKey, JSON.stringify(list));
        }
      }
    } catch {}
  }

  async getAllOfflineCredentials(): Promise<OfflineCredentialRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('offline_credentials', 'readonly');
      const store = tx.objectStore('offline_credentials');
      const req = store.getAll();
      const records = await new Promise<OfflineCredentialRecord[]>((resolve) => {
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      if (records && records.length > 0) return records;
    } catch {}

    const list: OfflineCredentialRecord[] = [];
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ordexa_cred_')) {
            try {
              const item = JSON.parse(localStorage.getItem(k) || '');
              if (item && item.email && item.password_verifier) {
                list.push(item);
              }
            } catch {}
          }
        }
      }
    } catch {}
    return list;
  }

  async getOfflineCredentialByIdentifier(
    identifier: string,
    clientId?: string
  ): Promise<OfflineCredentialRecord | null> {
    const all = await this.getAllOfflineCredentials();
    const cleanId = (identifier || '').trim().toLowerCase();

    // 1. Exact email match (scoped to client if specified)
    let match = all.find(c => {
      const emailMatch = c.email?.toLowerCase() === cleanId;
      const clientMatch = !clientId || c.client_id === clientId || c.client_code?.toUpperCase() === clientId.toUpperCase();
      return emailMatch && clientMatch;
    });

    // 2. Name / phone / username match (scoped to client if specified)
    if (!match) {
      match = all.find(c => {
        const nameMatch = c.name?.trim().toLowerCase() === cleanId;
        const phoneMatch = c.phone?.trim() === cleanId;
        const clientMatch = !clientId || c.client_id === clientId || c.client_code?.toUpperCase() === clientId.toUpperCase();
        return (nameMatch || phoneMatch) && clientMatch;
      });
    }

    // 3. Fallback match across all clients
    if (!match) {
      match = all.find(c => c.email?.toLowerCase() === cleanId || c.name?.trim().toLowerCase() === cleanId);
    }

    return match || null;
  }

  async removeOfflineCredential(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('offline_credentials', 'readwrite');
      tx.objectStore('offline_credentials').delete(id);
    } catch {}
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ordexa_cred_')) {
            try {
              const item = JSON.parse(localStorage.getItem(k) || '');
              if (item && item.id === id) {
                localStorage.removeItem(k);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }
}

export const offlineStorage = new OfflineStorageManager();
