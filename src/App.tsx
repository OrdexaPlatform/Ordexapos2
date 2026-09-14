import { ClientPreviewPage } from './pages/super-admin/ClientPreviewPage';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { SuperAdminLayout } from './components/layout/SuperAdminLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Login } from './pages/super-admin/Login';
import { Dashboard } from './pages/super-admin/Dashboard';
import { Clients } from './pages/super-admin/Clients';
import { ClientDetails } from './pages/super-admin/ClientDetails';
import { Licenses } from './pages/super-admin/Licenses';
import { LicenseDetails } from './pages/super-admin/LicenseDetails';
import { Devices } from './pages/super-admin/Devices';
import { Builds } from './pages/super-admin/Builds';
import { BuildDetails } from './pages/super-admin/BuildDetails';
import { Downloads } from './pages/super-admin/Downloads';
import { ActivityLogs } from './pages/super-admin/ActivityLogs';
import { Settings } from './pages/super-admin/Settings';

// Client POS Imports
import { ClientPOSLayout } from './components/client/ClientPOSLayout';
import { ClientProtectedRoute } from './components/client/ClientProtectedRoute';
import { ModuleRouteGuard } from './components/client/ModuleRouteGuard';
import { ClientLogin } from './pages/client/Login';
import { ClientDashboard } from './pages/client/Dashboard';
import { StaffPage } from './pages/client/Staff';
import { ProductsPage } from './pages/client/Products';
import { InventoryPage } from './pages/client/Inventory';
import { POSPage } from './pages/client/POS';
import { SalesPage } from './pages/client/Sales';
import { ShiftsPage } from './pages/client/Shifts';
import { ModulePlaceholder } from './pages/client/ModulePlaceholder';
import { 
  ShoppingCart, 
  Receipt, 
  Package, 
  Boxes, 
  Truck, 
  Users, 
  Building2, 
  Wallet, 
  Vault, 
  History, 
  BarChart3, 
  UserCheck, 
  Settings as SettingsIcon,
  Loader2
} from 'lucide-react';

function RootRedirect() {
  const { user, userType, isSuperAdmin, initialized, loading } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-slate-900 h-8 w-8" />
      </div>
    );
  }

  if (user) {
    if (isSuperAdmin) {
      return <Navigate to="/super-admin" replace />;
    }
    if (userType === 'client_user') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Toaster position="top-center" reverseOrder={false} />
      <Routes>
        {/* Dynamic Root Redirection */}
        <Route path="/" element={<RootRedirect />} />
        
        {/* Authentication Routes */}
        <Route path="/login" element={<ClientLogin />} />
        <Route path="/super-admin/login" element={<Login />} />
        
        {/* Super Admin Client Live Preview Route (Secure Token or Super Admin session, Full-Screen) */}
        <Route path="/super-admin/clients/:id/preview" element={<ClientPreviewPage />} />
        <Route path="/clients/:id/preview" element={<ClientPreviewPage />} />
        <Route path="/preview/:id" element={<ClientPreviewPage />} />
        <Route path="/client-preview/:id" element={<ClientPreviewPage />} />

        {/* Super Admin Control Center Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/super-admin" element={<SuperAdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<Clients />} />
            <Route path="clients/:id" element={<ClientDetails />} />
            <Route path="licenses" element={<Licenses />} />
            <Route path="licenses/:id" element={<LicenseDetails />} />
            <Route path="devices" element={<Devices />} />
            <Route path="builds" element={<Builds />} />
            <Route path="builds/:id" element={<BuildDetails />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="activity-logs" element={<ActivityLogs />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        {/* Client POS Application Routes */}
        <Route element={<ClientProtectedRoute />}>
          <Route element={<ClientPOSLayout />}>
            <Route 
              path="/dashboard" 
              element={
                <ModuleRouteGuard module="dashboard">
                  <ClientDashboard />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/pos" 
              element={
                <ModuleRouteGuard module="pos">
                  <POSPage />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/sales" 
              element={
                <ModuleRouteGuard module="sales">
                  <SalesPage />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/products" 
              element={
                <ModuleRouteGuard module="products">
                  <ProductsPage />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/inventory" 
              element={
                <ModuleRouteGuard module="inventory">
                  <InventoryPage />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/purchases" 
              element={
                <ModuleRouteGuard module="purchases">
                  <ModulePlaceholder 
                    title="إدارة المشتريات والتوريدات" 
                    description="أوامر الشراء، فواتير الموردين، وإدخال الشحنات للمستودعات."
                    icon={Truck}
                  />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/customers" 
              element={
                <ModuleRouteGuard module="customers">
                  <ModulePlaceholder 
                    title="سجل العملاء والحسابات" 
                    description="إدارة بيانات العملاء، ديون العملاء، نقاط الولاء، وكشوف الحساب."
                    icon={Users}
                  />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/suppliers" 
              element={
                <ModuleRouteGuard module="suppliers">
                  <ModulePlaceholder 
                    title="سجل الموردين" 
                    description="إدارة بيانات الموردين، الأرصدة المستحقة، والدفعات الآجلة."
                    icon={Building2}
                  />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/expenses" 
              element={
                <ModuleRouteGuard module="expenses">
                  <ModulePlaceholder 
                    title="إدارة المصروفات التشغيلية" 
                    description="تسجيل بنود المصروفات، النثريات، والمدفوعات التشغيلية للمنشأة."
                    icon={Wallet}
                  />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/treasury" 
              element={
                <ModuleRouteGuard module="treasury">
                  <ModulePlaceholder 
                    title="إدارة الخزنة والحسابات النقدية" 
                    description="متابعة أرصدة الخزينة، البنوك، التحويلات الداخلية، والمقبوضات."
                    icon={Vault}
                  />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/shifts" 
              element={
                <ModuleRouteGuard module="shifts">
                  <ShiftsPage />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/reports" 
              element={
                <ModuleRouteGuard module="reports">
                  <ModulePlaceholder 
                    title="التقارير المالية والتحليلات" 
                    description="تقارير الأرباح والمبيعات، حركة الأصناف، وتقارير الإقرارات الضريبية."
                    icon={BarChart3}
                  />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/staff" 
              element={
                <ModuleRouteGuard module="staff">
                  <StaffPage />
                </ModuleRouteGuard>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ModuleRouteGuard module="settings">
                  <ModulePlaceholder 
                    title="إعدادات المنشأة ونقطة البيع" 
                    description="تخصيص الفواتير، بيانات المنشأة، الطابعات، وإعدادات الشبكة."
                    icon={SettingsIcon}
                  />
                </ModuleRouteGuard>
              } 
            />
          </Route>
        </Route>

        {/* Fallback Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

