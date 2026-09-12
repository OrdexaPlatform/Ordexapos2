import { ClientUserRole, Permission, PermissionModule, PermissionAction } from '../types';

/**
 * Module metadata for human-readable UI displays
 */
export interface ModuleMeta {
  id: PermissionModule;
  label: string;
  description: string;
  actions: PermissionAction[];
}

export const PERMISSION_MODULES: ModuleMeta[] = [
  {
    id: 'dashboard',
    label: 'لوحة التحكم',
    description: 'الاطلاع على ملخص المنشأة وحالة النظام',
    actions: ['view'],
  },
  {
    id: 'pos',
    label: 'نقطة البيع (POS)',
    description: 'عمليات الكاشير والبيع المباشر وإصدار الفواتير',
    actions: ['view', 'create', 'edit', 'delete', 'print', 'edit_price'],
  },
  {
    id: 'sales',
    label: 'المبيعات والفواتير',
    description: 'سجل المبيعات، الفواتير، والمرتجعات',
    actions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'manage', 'void'],
  },
  {
    id: 'products',
    label: 'المنتجات والأصناف',
    description: 'إدارة كتالوج المنتجات، الباركود، والأسعار',
    actions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'manage'],
  },
  {
    id: 'inventory',
    label: 'المخزون والمستودعات',
    description: 'حركات المخازن، الجرد، والتحويلات المخزنية',
    actions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'manage', 'adjust', 'transfer'],
  },
  {
    id: 'purchases',
    label: 'المشتريات والتوريدات',
    description: 'أوامر الشراء وفواتير الموردين واستلام البضائع',
    actions: ['view', 'create', 'edit', 'delete', 'print', 'export'],
  },
  {
    id: 'customers',
    label: 'العملاء والحسابات',
    description: 'بيانات العملاء وأرصدة الديون ونقاط الولاء',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    id: 'suppliers',
    label: 'الموردون والحسابات',
    description: 'بيانات الموردين والأرصدة المستحقة',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    id: 'expenses',
    label: 'المصروفات والنثريات',
    description: 'تسجيل المصروفات التشغيلية والبنود المالية',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
  },
  {
    id: 'treasury',
    label: 'الخزنة والحسابات النقدية',
    description: 'حركات الصندوق والبنوك والتحويلات المالية',
    actions: ['view', 'create', 'edit', 'export', 'manage'],
  },
  {
    id: 'shifts',
    label: 'الورديات وجلسات الصندوق',
    description: 'فتح وإغلاق الورديات واستلام وتسليم العهد النقدية',
    actions: ['view', 'create', 'edit', 'print', 'manage'],
  },
  {
    id: 'reports',
    label: 'التقارير المالية والتحليلات',
    description: 'التقارير التحليلية، الأرباح، والضرائب',
    actions: ['view', 'export', 'print'],
  },
  {
    id: 'staff',
    label: 'الموظفون والمستخدمون',
    description: 'إدارة حسابات مستخدمي المنشأة والأدوار والصلاحيات',
    actions: ['view', 'create', 'edit', 'delete', 'manage'],
  },
  {
    id: 'settings',
    label: 'إعدادات المنشأة',
    description: 'بيانات المنشأة، الطابعات، وتخصيص الفواتير',
    actions: ['view', 'edit', 'manage'],
  },
];

/**
 * Logical default permission matrix per role
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<ClientUserRole, Permission[]> = {
  // Owner has absolute authority over the entire client organization
  owner: ['*'],

  // Admin manages day-to-day business, staff, inventory, finances, and system settings
  admin: [
    'dashboard.*',
    'pos.*',
    'sales.*',
    'products.*',
    'inventory.*',
    'purchases.*',
    'customers.*',
    'suppliers.*',
    'expenses.*',
    'treasury.*',
    'shifts.*',
    'reports.*',
    'staff.*',
    'settings.view',
    'settings.edit',
    'settings.manage',
  ],

  // Manager oversees operations, sales, inventory, shifts, and reports (restricted from modifying staff or business settings)
  manager: [
    'dashboard.view',
    'pos.*',
    'sales.view',
    'sales.create',
    'sales.edit',
    'sales.print',
    'sales.export',
    'sales.manage',
    'sales.void',
    'products.view',
    'products.create',
    'products.edit',
    'products.print',
    'products.export',
    'inventory.*',
    'purchases.view',
    'purchases.create',
    'purchases.edit',
    'purchases.print',
    'purchases.export',
    'customers.view',
    'customers.create',
    'customers.edit',
    'customers.export',
    'suppliers.view',
    'suppliers.create',
    'suppliers.edit',
    'expenses.view',
    'expenses.create',
    'treasury.view',
    'shifts.*',
    'reports.view',
    'reports.export',
    'reports.print',
    'staff.view',
  ],

  // Cashier is strictly restricted to POS operations, creating sales, printing, customer registry, and their own shifts
  cashier: [
    'dashboard.view',
    'pos.view',
    'pos.create',
    'pos.edit',
    'pos.print',
    'sales.view',
    'sales.create',
    'sales.print',
    'customers.view',
    'customers.create',
    'shifts.view',
    'shifts.create',
    'shifts.edit',
    'shifts.print',
    'products.view',
  ],

  // Inventory officer focuses on products catalog, stock movements, and incoming supplier purchase orders
  inventory: [
    'dashboard.view',
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'products.print',
    'products.export',
    'inventory.*',
    'purchases.view',
    'purchases.create',
    'purchases.edit',
    'purchases.print',
    'purchases.export',
    'suppliers.view',
    'suppliers.create',
    'suppliers.edit',
  ],

  // Accountant focuses on treasury, expenses, sales financial review, and tax/financial reports
  accountant: [
    'dashboard.view',
    'sales.view',
    'sales.print',
    'sales.export',
    'expenses.*',
    'treasury.*',
    'reports.*',
    'customers.view',
    'customers.export',
    'suppliers.view',
    'suppliers.export',
    'shifts.view',
    'shifts.print',
  ],
};

/**
 * Resolves all active permissions for a user (combining role defaults + custom permissions)
 */
export function resolveUserPermissions(
  role?: ClientUserRole,
  customPermissions?: string[] | null
): Set<string> {
  const permissions = new Set<string>();

  if (!role) {
    return permissions;
  }

  // 1. Load role default permissions
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || [];
  for (const perm of defaults) {
    permissions.add(perm);
  }

  // 2. Overlay custom permissions if provided
  if (Array.isArray(customPermissions)) {
    for (const custom of customPermissions) {
      if (typeof custom === 'string' && custom.trim().length > 0) {
        permissions.add(custom.trim());
      }
    }
  }

  return permissions;
}

/**
 * Central Permission Resolver
 * Checks whether a given role + custom permissions grants access to a specific permission.
 * Examples:
 *   hasPermission('cashier', null, 'pos.create') -> true
 *   hasPermission('cashier', null, 'staff.create') -> false
 *   hasPermission('owner', null, 'anything') -> true
 */
export function hasPermission(
  role?: ClientUserRole,
  customPermissions?: string[] | null,
  requiredPermission?: Permission
): boolean {
  if (!role || !requiredPermission) {
    return false;
  }

  const permissions = resolveUserPermissions(role, customPermissions);

  // Wildcard check: global owner privilege
  if (permissions.has('*')) {
    return true;
  }

  // Exact match check
  if (permissions.has(requiredPermission)) {
    return true;
  }

  // Module wildcard check (e.g. 'pos.*' satisfies 'pos.create')
  const [mod] = requiredPermission.split('.');
  if (mod && permissions.has(`${mod}.*`)) {
    return true;
  }

  return false;
}

/**
 * Checks if a user has any permission to access a module (for Sidebar navigation & Route Guarding)
 */
export function canAccessModule(
  role?: ClientUserRole,
  customPermissions?: string[] | null,
  module?: PermissionModule
): boolean {
  if (!role || !module) {
    return false;
  }

  const permissions = resolveUserPermissions(role, customPermissions);

  // Global wildcard
  if (permissions.has('*')) {
    return true;
  }

  // Module wildcard
  if (permissions.has(`${module}.*`)) {
    return true;
  }

  // Any explicit action in module
  for (const perm of permissions) {
    if (perm.startsWith(`${module}.`)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a translated human-friendly role name
 */
export function getRoleArabicLabel(role: ClientUserRole): string {
  switch (role) {
    case 'owner':
      return 'مالك المنشأة';
    case 'admin':
      return 'مدير النظام';
    case 'manager':
      return 'مدير فرع / تشغيل';
    case 'cashier':
      return 'كاشير';
    case 'inventory':
      return 'مسؤول مخزون';
    case 'accountant':
      return 'محاسب مالي';
    default:
      return role;
  }
}
