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
  Store,
  X,
  ChevronRight,
  ChevronLeft
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

interface ClientSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ClientSidebar({ 
  isOpen = false, 
  onClose,
  isCollapsed = false,
  onToggleCollapse
}: ClientSidebarProps) {
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

  const renderContent = (isMobile = false) => (
    <>
      {/* Client Branding Header */}
      <div className="flex h-20 shrink-0 items-center justify-between gap-3 px-4 bg-slate-950 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
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

        {/* Close button on mobile */}
        {isMobile ? (
          <button
            type="button"
            id="client-mobile-sidebar-close"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          onToggleCollapse && (
            <button
              type="button"
              id="client-desktop-sidebar-toggle"
              onClick={onToggleCollapse}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              title="طي القائمة الجانبية لتوسيع الشاشة"
              aria-label="طي القائمة الجانبية"
            >
              <ChevronRight className="h-5 w-5 rtl:inline ltr:hidden" />
              <ChevronLeft className="h-5 w-5 ltr:inline rtl:hidden" />
            </button>
          )
        )}
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
                onClick={() => onClose?.()}
                className={cn(
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-semibold'
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
    </>
  );

  return (
    <>
      {/* 1. Desktop Static / Fixed Sidebar (Visible only on lg+) */}
      <aside 
        id="client-desktop-sidebar"
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:start-0 lg:z-30 bg-slate-900 border-e border-slate-800 select-none transition-all duration-300 ease-in-out",
          isCollapsed 
            ? "-translate-x-full rtl:translate-x-full opacity-0 pointer-events-none w-0" 
            : "translate-x-0 opacity-100 w-64"
        )}
      >
        {renderContent(false)}
      </aside>

      {/* 2. Mobile Responsive Slide-Over Drawer & Backdrop (Only on < lg) */}
      <div 
        id="client-mobile-sidebar-container"
        className={cn(
          "fixed inset-0 z-50 lg:hidden transition-all duration-300",
          isOpen ? "visible" : "invisible pointer-events-none"
        )}
      >
        {/* Backdrop */}
        <div
          id="client-sidebar-backdrop"
          className={cn(
            "fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Off-canvas Sliding Drawer */}
        <aside
          id="client-mobile-sidebar-drawer"
          className={cn(
            "fixed inset-y-0 start-0 w-72 max-w-[85vw] bg-slate-900 border-e border-slate-800 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out z-50 select-none",
            isOpen ? "translate-x-0" : "rtl:translate-x-full ltr:-translate-x-full"
          )}
          aria-label="قائمة النظام"
        >
          {renderContent(true)}
        </aside>
      </div>
    </>
  );
}

