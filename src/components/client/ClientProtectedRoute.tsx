import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { LicenseGuard } from './LicenseGuard';
import { DeviceGuard } from './DeviceGuard';
import { Loader2 } from 'lucide-react';

export function ClientProtectedRoute() {
  const { user, userType, isSuperAdmin, clientUser, initialized, loading } = useAuthStore();
  const { client, loadClient, loading: clientLoading } = useClientStore();
  const { initializeDevice, status: deviceStatus } = useDeviceStore();
  const location = useLocation();

  // Load client data & device data once clientUser is detected
  useEffect(() => {
    if (!isSuperAdmin && clientUser?.client_id) {
      if (!client || client.id !== clientUser.client_id) {
        loadClient(clientUser.client_id);
      }
      if (deviceStatus === 'loading' || !client) {
        initializeDevice(clientUser.client_id);
      }
    }
  }, [isSuperAdmin, clientUser?.client_id, client?.id, deviceStatus, initializeDevice, loadClient]);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-900 h-8 w-8" />
      </div>
    );
  }

  // Not logged in -> redirect to Client login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If Super Admin accesses client POS routes directly, redirect them to /super-admin
  if (isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  // If not a recognized client user
  if (userType !== 'client_user' || !clientUser) {
    return <Navigate to="/login" replace />;
  }

  if (clientLoading && !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-900 h-8 w-8" />
      </div>
    );
  }

  // Wrap in LicenseGuard and DeviceGuard to enforce real security rules
  return (
    <LicenseGuard>
      <DeviceGuard>
        <Outlet />
      </DeviceGuard>
    </LicenseGuard>
  );
}
