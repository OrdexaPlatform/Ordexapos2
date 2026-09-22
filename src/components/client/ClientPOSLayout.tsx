import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ClientSidebar } from './ClientSidebar';
import { ClientHeader } from './ClientHeader';
import { cn } from '../../lib/utils';

interface ClientPOSLayoutProps {
  children?: React.ReactNode;
}

export function ClientPOSLayout({ children }: ClientPOSLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isPos = location.pathname.startsWith('/pos');

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('ordexa_client_sidebar_collapsed');
      if (stored !== null) return stored === 'true';
      return isPos;
    } catch {
      return false;
    }
  });

  // Auto-collapse sidebar on POS screen when screen is < 1440px to ensure full visibility
  React.useEffect(() => {
    if (isPos && typeof window !== 'undefined' && window.innerWidth < 1440) {
      const explicit = localStorage.getItem('ordexa_client_sidebar_collapsed');
      if (explicit === null) {
        setIsSidebarCollapsed(true);
      }
    }
  }, [isPos]);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ordexa_client_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100/70 text-slate-900" dir="rtl">
      {/* Responsive Client Sidebar (Desktop fixed/collapsible + Mobile slide-over drawer) */}
      <ClientSidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />
      
      {/* Main Content Area: NO w-full to prevent horizontal overflow with margin-start */}
      <div 
        className={cn(
          "flex flex-col min-h-screen min-w-0 transition-[margin] duration-300 ease-in-out",
          isSidebarCollapsed ? "lg:ms-0" : "lg:ms-64"
        )}
      >
        <ClientHeader 
          onOpenSidebar={() => setSidebarOpen(true)} 
          onToggleSidebar={toggleSidebarCollapse}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <main className={`flex-1 min-w-0 w-full ${isPos ? 'p-0 overflow-hidden flex flex-col h-[calc(100vh-4rem)]' : 'p-4 sm:p-6 lg:p-8 overflow-x-hidden'}`}>
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}

