import { Menu, LogOut, Bell } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export function Header() {
  const { signOut, user } = useAuthStore();

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      <button type="button" className="-m-2.5 p-2.5 text-gray-700 lg:hidden">
        <span className="sr-only">فتح القائمة الجانبية</span>
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 justify-end items-center">
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <button type="button" className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 relative">
            <span className="sr-only">الإشعارات</span>
            <Bell className="h-6 w-6" aria-hidden="true" />
            <span className="absolute top-2.5 right-2.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />
          
          <div className="flex items-center gap-x-4">
            <span className="hidden lg:flex lg:items-center">
              <span className="text-sm font-semibold leading-6 text-gray-900" aria-hidden="true">
                {user?.email}
              </span>
            </span>
            <button 
              onClick={signOut}
              className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
