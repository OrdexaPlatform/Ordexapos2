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
  Settings 
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

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 border-e border-slate-800 w-64 fixed inset-y-0 start-0 z-50">
      <div className="flex h-16 shrink-0 items-center px-6 bg-slate-950">
        <h1 className="text-xl font-bold text-white tracking-wide">Ordexa <span className="text-slate-400 font-normal text-sm">Control</span></h1>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white',
                  'group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors'
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
      </div>
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
            SA
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Super Admin</span>
            <span className="text-xs text-slate-400">admin@ordexa.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}
