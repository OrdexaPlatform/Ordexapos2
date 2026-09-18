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

  const initDeviceRef = React.useRef<string | null>(null);

  // Load client data & device data once clientUser is detected
  useEffect(() => {
    if (!isSuperAdmin && clientUser?.client_id) {
      if (!client || client.id !== clientUser.client_id) {
        loadClient(clientUser.client_id);
      }
    }
  }, [isSuperAdmin, clientUser?.client_id, client?.id, loadClient]);

  useEffect(() => {
    if (!isSuperAdmin && clientUser?.client_id && client?.id === clientUser.client_id) {
      if (initDeviceRef.current !== clientUser.client_id) {
        initDeviceRef.current = clientUser.client_id;
        initializeDevice(clientUser.client_id);
      }
    }
  }, [isSuperAdmin, clientUser?.client_id, client?.id, initializeDevice]);

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-900 h-8 w-8" />
      </div>
    );
  }

  // Not logged in -> redirect to Client POS if last client is remembered, or generic login
  if (!user) {
    const lastCode = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_last_client_code') : null;
    if (lastCode) {
      return <Navigate to={`/pos/${lastCode}`} state={{ from: location }} replace />;
    }
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
