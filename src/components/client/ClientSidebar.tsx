import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useClientStore } from '../../store/clientStore';
import { usePermissions } from '../../hooks/usePermissions';
import { PermissionModule } from '../../types';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Receipt, 
  Package, 
  Boxes, 
  Truck, 
  Users, 
  Building2, 
  Wallet, 
  Vault, 
  History, 
  BarChart3, 
  UserCheck, 
  Settings,
  Store
} from 'lucide-react';

export interface ClientNavItem {
  name: string;
  href: string;
  module: PermissionModule;
  icon: any;
}

export const CLIENT_NAV_ITEMS: ClientNavItem[] = [
  { name: 'الرئيسية', href: '/dashboard', module: 'dashboard', icon: LayoutDashboard },
  { name: 'نقطة البيع', href: '/pos', module: 'pos', icon: ShoppingCart },
  { name: 'المبيعات', href: '/sales', module: 'sales', icon: Receipt },
  { name: 'المنتجات', href: '/products', module: 'products', icon: Package },
  { name: 'المخزون', href: '/inventory', module: 'inventory', icon: Boxes },
  { name: 'المشتريات', href: '/purchases', module: 'purchases', icon: Truck },
  { name: 'العملاء', href: '/customers', module: 'customers', icon: Users },
  { name: 'الموردون', href: '/suppliers', module: 'suppliers', icon: Building2 },
  { name: 'المصروفات', href: '/expenses', module: 'expenses', icon: Wallet },
  { name: 'الخزنة', href: '/treasury', module: 'treasury', icon: Vault },
  { name: 'الورديات', href: '/shifts', module: 'shifts', icon: History },
  { name: 'التقارير', href: '/reports', module: 'reports', icon: BarChart3 },
  { name: 'الموظفون', href: '/staff', module: 'staff', icon: UserCheck },
  { name: 'الإعدادات', href: '/settings', module: 'settings', icon: Settings },
];

export function ClientSidebar() {
  const location = useLocation();
  const { client } = useClientStore();
  const { canAccessModule } = usePermissions();

  // Extract initials if no logo exists
  const getInitials = (name?: string) => {
    if (!name) return 'OP';
    const words = name.trim().split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Filter modules based on resolved permissions
  const visibleNavItems = CLIENT_NAV_ITEMS.filter((item) => canAccessModule(item.module));

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 border-e border-slate-800 w-64 fixed inset-y-0 start-0 z-50 select-none">
      {/* Client Branding Header */}
      <div className="flex h-20 shrink-0 items-center gap-3 px-4 bg-slate-950 border-b border-slate-800/80">
        <div className="h-11 w-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
          {client?.logo ? (
            <img
              src={client.logo}
              alt={client.business_name}
              className="h-full w-full object-contain p-1"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="font-bold text-sm text-slate-200">
              {getInitials(client?.business_name)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white truncate" title={client?.business_name}>
            {client?.business_name || 'منشأة العميل'}
          </h1>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {client?.customer_name || 'Ordexa POS Client'}
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4 space-y-1">
        <nav className="flex-1 space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white',
                  'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors'
                )}
              >
                <Icon
                  className={cn(
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-white',
                    'me-3 h-4 w-4 shrink-0 transition-colors'
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
                {item.href === '/dashboard' && (
                  <span className="ms-auto inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Metadata */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <div className="flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-mono text-slate-300">{client?.client_code || '---'}</span>
          </div>
          <span className="font-mono text-[11px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
            v1.0.0
          </span>
        </div>
      </div>
    </div>
  );
}
