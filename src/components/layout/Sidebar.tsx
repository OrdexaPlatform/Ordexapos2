import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { 
  LayoutDashboard, 
  Users, 
  Key, 
  Monitor, 
  Box, 
  Download, 
  Activity, 
  Settings,
  X
} from 'lucide-react';

const navigation = [
  { name: 'الرئيسية', href: '/super-admin', icon: LayoutDashboard },
  { name: 'العملاء', href: '/super-admin/clients', icon: Users },
  { name: 'التراخيص', href: '/super-admin/licenses', icon: Key },
  { name: 'الأجهزة', href: '/super-admin/devices', icon: Monitor },
  { name: 'الإصدارات', href: '/super-admin/builds', icon: Box },
  { name: 'التحميلات', href: '/super-admin/downloads', icon: Download },
  { name: 'سجل النشاط', href: '/super-admin/activity-logs', icon: Activity },
  { name: 'الإعدادات', href: '/super-admin/settings', icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

function SidebarNav({ onClose }: { onClose?: () => void }) {
  const location = useLocation();

  return (
    <nav className="flex-1 space-y-1">
      {navigation.map((item) => {
        const isActive = location.pathname === item.href;
        const Icon = item.icon;
        
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={() => onClose?.()}
            className={cn(
              isActive
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white',
              'group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
            )}
          >
            <Icon
              className={cn(
                isActive ? 'text-white' : 'text-slate-500 group-hover:text-white',
                'me-3 h-5 w-5 shrink-0 transition-colors'
              )}
              aria-hidden="true"
            />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="p-4 border-t border-slate-800 bg-slate-950/30">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white">
          SA
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-white truncate">Super Admin</span>
          <span className="text-xs text-slate-400 truncate">admin@ordexa.com</span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  return (
    <>
      {/* 1. Desktop Static / Fixed Sidebar (Only visible on lg screens and up) */}
      <aside 
        id="superadmin-desktop-sidebar"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:start-0 lg:z-30 bg-slate-900 border-e border-slate-800"
      >
        <div className="flex h-16 shrink-0 items-center px-6 bg-slate-950 border-b border-slate-800/80">
          <h1 className="text-xl font-bold text-white tracking-wide">
            Ordexa <span className="text-slate-400 font-normal text-sm">Control</span>
          </h1>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
          <SidebarNav />
        </div>
        <SidebarFooter />
      </aside>

      {/* 2. Mobile Responsive Slide-Over Drawer & Backdrop (Only on < lg screens) */}
      <div 
        id="superadmin-mobile-sidebar-container"
        className={cn(
          "fixed inset-0 z-50 lg:hidden transition-all duration-300",
          isOpen ? "visible" : "invisible pointer-events-none"
        )}
      >
        {/* Dark Dimmed Backdrop */}
        <div
          id="superadmin-sidebar-backdrop"
          className={cn(
            "fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Off-canvas Sliding Panel */}
        <aside
          id="superadmin-mobile-sidebar-drawer"
          className={cn(
            "fixed inset-y-0 start-0 w-72 max-w-[85vw] bg-slate-900 border-e border-slate-800 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out z-50",
            isOpen ? "translate-x-0" : "rtl:translate-x-full ltr:-translate-x-full"
          )}
          aria-label="القائمة الجانبية للنظام"
        >
          {/* Mobile Drawer Header with Close Button */}
          <div className="flex h-16 shrink-0 items-center justify-between px-5 bg-slate-950 border-b border-slate-800/80">
            <h1 className="text-lg font-bold text-white tracking-wide">
              Ordexa <span className="text-slate-400 font-normal text-xs">Control</span>
            </h1>
            <button
              type="button"
              id="superadmin-mobile-sidebar-close"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="إغلاق القائمة"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links with auto-close */}
          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
            <SidebarNav onClose={onClose} />
          </div>

          <SidebarFooter />
        </aside>
      </div>
    </>
  );
}

