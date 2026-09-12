import { Outlet } from 'react-router-dom';
import { ClientSidebar } from './ClientSidebar';
import { ClientHeader } from './ClientHeader';

export function ClientPOSLayout() {
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900" dir="rtl">
      <ClientSidebar />
      <div className="lg:ms-64 flex flex-col min-h-screen">
        <ClientHeader />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
