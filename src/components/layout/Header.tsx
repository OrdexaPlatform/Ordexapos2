import { Menu, LogOut, Bell } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface HeaderProps {
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const { signOut, user } = useAuthStore();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button 
          type="button" 
          id="superadmin-mobile-menu-btn"
          onClick={onOpenSidebar}
          className="p-2 -m-2 text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors lg:hidden flex items-center justify-center"
          aria-label="فتح القائمة الجانبية"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <span className="font-bold text-slate-900 text-base">Ordexa</span>
          <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-medium">Control</span>
        </div>
      </div>

      <div className="flex items-center gap-x-3 sm:gap-x-4 lg:gap-x-6">
        <button 
          type="button" 
          id="superadmin-notifications-btn"
          className="p-2 text-gray-400 hover:text-gray-500 rounded-lg hover:bg-gray-100 relative transition-colors"
          title="الإشعارات"
        >
          <span className="sr-only">الإشعارات</span>
          <Bell className="h-5 w-5" aria-hidden="true" />
          <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        
        <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />
        
        <div className="flex items-center gap-x-3 sm:gap-x-4">
          <span className="hidden sm:flex sm:items-center">
            <span className="text-xs sm:text-sm font-semibold text-gray-900 truncate max-w-[180px]" aria-hidden="true">
              {user?.email}
            </span>
          </span>
          <button 
            id="superadmin-logout-btn"
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>
    </header>
  );
}

