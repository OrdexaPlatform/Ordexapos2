import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute() {
  const { isSuperAdmin, user, userType, initialized, loading } = useAuthStore();
  const location = useLocation();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-slate-900 h-8 w-8" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    // If logged in as client user, redirect to /dashboard
    if (user && userType === 'client_user') {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/super-admin/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
