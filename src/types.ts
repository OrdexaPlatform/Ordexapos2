export type ClientStatus = 'active' | 'inactive' | 'suspended';

export interface Client {
  id: string;
  client_code: string;
  customer_name: string;
  business_name: string;
  business_type?: string | null;
  owner_name?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  logo?: string | null;
  currency: string;
  language: string;
  status: ClientStatus;
  created_at: string;
  updated_at: string;
}

export type LicenseType = 
  | 'trial' 
  | 'monthly' 
  | 'quarterly' 
  | 'semi_annual' 
  | 'annual' 
  | 'lifetime' 
  | 'custom';

export type LicenseStatus = 'active' | 'suspended' | 'expired' | 'revoked';

export interface License {
  id: string;
  client_id: string;
  license_key: string;
  license_type: LicenseType | string;
  max_devices: number;
  activated_devices: number;
  start_date: string;
  expiry_date: string;
  status: LicenseStatus | string;
  days_left?: number;
  created_at: string;
  updated_at: string;
  client?: Client | null;
}

export interface Device {
  id: string;
  client_id: string;
  license_id: string;
  device_name: string;
  device_fingerprint: string;
  operating_system?: string | null;
  app_version?: string | null;
  activated_at: string;
  last_seen_at?: string | null;
  status: 'active' | 'deactivated';
  deactivated_at?: string | null;
  client?: Client | null;
  license?: License | null;
}

export type BuildStatus = 'draft' | 'building' | 'ready' | 'failed' | 'archived' | 'published' | 'deprecated';

export interface Build {
  id: string;
  client_id?: string | null;
  version: string;
  build_number: number;
  release_date: string;
  status: BuildStatus;
  minimum_supported_version?: string | null;
  release_notes?: string | null;
  download_enabled: boolean;
  created_at: string;
  client?: Client | null;
}

export interface ClientBuildConfig {
  generated_at: string;
  environment: 'production' | 'staging';
  build: {
    id: string;
    version: string;
    build_number: number;
    release_date: string;
    status: string;
    minimum_supported_version?: string | null;
  };
  client: {
    id: string;
    client_code: string;
    customer_name: string;
    business_name: string;
    logo?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    currency: string;
    language: string;
  };
  license?: {
    id: string;
    license_key: string;
    license_type: string;
    status: string;
    max_devices: number;
    activated_devices: number;
    expiry_date: string;
  } | null;
}

export interface ActivityLogItem {
  id: string;
  actor_type: 'super_admin' | 'client_device' | 'system' | 'client_user';
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: any;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export type ClientUserRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'inventory' | 'accountant';

export type ClientUserStatus = 'active' | 'inactive';

export interface ClientUser {
  id: string;
  client_id: string;
  auth_user_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: ClientUserRole;
  status: ClientUserStatus;
  custom_permissions?: string[] | null;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type PermissionModule = 
  | 'dashboard' 
  | 'pos' 
  | 'sales' 
  | 'products' 
  | 'inventory' 
  | 'purchases' 
  | 'customers' 
  | 'suppliers' 
  | 'expenses' 
  | 'treasury' 
  | 'shifts' 
  | 'reports' 
  | 'staff' 
  | 'settings';

export type PermissionAction = 
  | 'view' 
  | 'create' 
  | 'edit' 
  | 'delete' 
  | 'print' 
  | 'export' 
  | 'manage'
  | 'adjust'
  | 'transfer'
  | 'void'
  | 'edit_price';

export type Permission = `${PermissionModule}.${PermissionAction}` | `${PermissionModule}.*` | '*';

// ==========================================
// Phase 8: Products & Inventory Types
// ==========================================

export interface ProductCategory {
  id: string;
  client_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Category = ProductCategory;

export interface Customer {
  id: string;
  client_id?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ProductBrand {
  id: string;
  client_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductUnit {
  id: string;
  client_id: string;
  name: string;
  symbol: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductBarcode {
  id: string;
  client_id: string;
  product_id: string;
  barcode: string;
  is_primary: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  client_id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  client_id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  unit_id?: string | null;
  cost_price: number;
  selling_price: number;
  tax_rate: number;
  min_stock: number;
  current_stock: number;
  track_stock: boolean;
  is_active: boolean;
  has_variants?: boolean;
  parent_product_id?: string | null;
  variant_attributes?: Record<string, any> | null;
  created_at: string;
  updated_at: string;

  // Joined metadata for UI convenience
  category?: ProductCategory | null;
  brand?: ProductBrand | null;
  unit?: ProductUnit | null;
  barcodes?: ProductBarcode[];
  balances?: InventoryBalance[];
}

export interface InventoryBalance {
  id: string;
  client_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  updated_at: string;

  // Joined metadata
  warehouse?: Warehouse;
  product?: Product;
}

export type InventoryTransactionType = 
  | 'opening' 
  | 'purchase' 
  | 'sale' 
  | 'sale_return' 
  | 'purchase_return' 
  | 'adjustment_in' 
  | 'adjustment_out' 
  | 'transfer_in' 
  | 'transfer_out' 
  | 'damage';

export interface InventoryTransaction {
  id: string;
  client_id: string;
  product_id: string;
  warehouse_id: string;
  transaction_type: InventoryTransactionType;
  quantity: number;
  unit_cost?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;

  // Joined metadata
  product?: Product;
  warehouse?: Warehouse;
}

export type TransferStatus = 'pending' | 'completed' | 'cancelled';

export interface InventoryTransfer {
  id: string;
  client_id: string;
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: TransferStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined metadata
  from_warehouse?: Warehouse;
  to_warehouse?: Warehouse;
  items?: InventoryTransferItem[];
}

export interface InventoryTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  unit_cost?: number | null;

  // Joined metadata
  product?: Product;
}

export interface ClientDeviceContext {
  fingerprint: string;
  deviceName: string;
  operatingSystem: string;
  appVersion: string;
  isRegistered: boolean;
  status: 'active' | 'deactivated' | 'unregistered' | 'unknown';
  deviceId?: string;
  clientId?: string;
  licenseId?: string;
  lastSeenAt?: string;
}

// ==========================================
// Phase 9: POS & Sales Types
// ==========================================

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'wallet' | 'other';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type SaleStatus = 'draft' | 'completed' | 'voided' | 'returned' | 'partially_returned';

export interface Sale {
  id: string;
  client_id: string;
  shift_id?: string | null;
  invoice_number: string;
  sale_date: string;
  customer_id?: string | null;
  warehouse_id: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_status: PaymentStatus;
  sale_status: SaleStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined relations
  warehouse?: Warehouse;
  cashier?: ClientUser | null;
  shift?: Shift | null;
  items?: SaleItem[];
  payments?: SalePayment[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  client_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  barcode_snapshot?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  created_at: string;

  // Joined relations
  product?: Product;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  client_id: string;
  payment_method: PaymentMethod;
  amount: number;
  reference?: string | null;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
}

export interface ClientInvoiceSequence {
  client_id: string;
  prefix: string;
  last_val: number;
  updated_at: string;
}

// ==========================================
// Phase 10: Cash Drawer & Shifts Interfaces
// ==========================================

export type ShiftStatus = 'open' | 'closed' | 'audited';
export type CashDrawerMovementType = 'cash_in' | 'cash_out' | 'drop_to_safe';

export interface CashRegister {
  id: string;
  client_id: string;
  warehouse_id?: string | null;
  device_id?: string | null;
  name: string;
  code?: string | null;
  status: 'open' | 'closed' | 'maintenance';
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Joined
  warehouse?: Warehouse;
}

export interface Shift {
  id: string;
  client_id: string;
  register_id?: string | null;
  device_id?: string | null;
  warehouse_id: string;
  shift_number: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  closed_by?: string | null;
  closed_at?: string | null;
  closing_cash_actual?: number | null;
  closing_cash_expected: number;
  cash_difference: number;
  total_sales_amount: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_other_sales: number;
  total_refunds_amount: number;
  total_cash_in: number;
  total_cash_out: number;
  orders_count: number;
  status: ShiftStatus;
  opening_notes?: string | null;
  closing_notes?: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  register?: CashRegister;
  device?: Device;
  warehouse?: Warehouse;
  opened_by_user?: ClientUser;
  closed_by_user?: ClientUser;
  cashier_name?: string;
  register_name?: string;
  warehouse_name?: string;
}

export interface CashDrawerTransaction {
  id: string;
  client_id: string;
  shift_id: string;
  transaction_type: CashDrawerMovementType;
  amount: number;
  reason: string;
  performed_by: string;
  created_at: string;

  // Joined
  performed_by_user?: ClientUser;
}

export interface ShiftSummary {
  shift_id: string;
  shift_number: string;
  status: ShiftStatus;
  opened_at: string;
  closed_at?: string | null;
  opening_cash: number;
  closing_cash_actual?: number | null;
  total_sales_amount: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_other_sales: number;
  total_refunds_amount: number;
  total_cash_in: number;
  total_cash_out: number;
  orders_count: number;
  expected_cash: number;
  cash_difference: number;
}

export interface OpenShiftPayload {
  client_id: string;
  warehouse_id: string;
  register_id?: string;
  device_id?: string;
  device_fingerprint?: string;
  opening_cash: number;
  opening_notes?: string;
  user_id?: string;
  opened_by?: string;
}

export interface CloseShiftPayload {
  client_id: string;
  shift_id: string;
  closing_cash_actual: number;
  closing_notes?: string;
}

export interface CashDrawerMovementPayload {
  client_id: string;
  shift_id: string;
  transaction_type: CashDrawerMovementType;
  amount: number;
  reason: string;
}

// ==========================================
// Phase 11: POS Licensing & Terminal Types
// ==========================================

export interface POSLicenseValidationResult {
  is_valid: boolean;
  error_code?: string;
  message: string;
  client?: {
    id: string;
    business_name: string;
    status: string;
  };
  license?: {
    id: string;
    license_key: string;
    license_type: string;
    status: string;
    expiry_date: string;
    days_left: number;
    max_devices: number;
    activated_devices: number;
  };
  device?: {
    id: string;
    device_name: string;
    device_fingerprint: string;
    status: string;
    is_registered: boolean;
    is_active: boolean;
    last_seen_at?: string;
  };
}



