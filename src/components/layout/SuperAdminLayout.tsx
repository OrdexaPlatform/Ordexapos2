import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function SuperAdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50 text-slate-900">
      <Sidebar />
      <div className="lg:ms-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
