import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Smartphone,
  Search,
  Filter,
  RefreshCw,
  Building2,
  Key,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Device, Client } from '../../types';
import { deactivateDevice, activateDevice, DeviceActivationParams } from '../../lib/deviceService';
import { DeviceDetailsModal } from '../../components/super-admin/DeviceDetailsModal';
import { RegisterDeviceModal } from '../../components/super-admin/RegisterDeviceModal';

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  // Modals state
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch devices with related client and license
      const { data: devicesData, error: devicesErr } = await supabase
        .from('devices')
        .select(`
          *,
          client:clients (id, client_code, customer_name, business_name),
          license:licenses (id, license_key, max_devices, activated_devices, license_type, status, expiry_date)
        `)
        .order('activated_at', { ascending: false });

      if (devicesErr) throw devicesErr;

      // 2. Fetch clients for filter dropdown
      const { data: clientsData, error: clientsErr } = await supabase
        .from('clients')
        .select('*')
        .order('business_name', { ascending: true });

      if (clientsErr) throw clientsErr;

      setDevices(devicesData as Device[] || []);
      setClients(clientsData as Client[] || []);
    } catch (err: any) {
      console.error('Error loading devices:', err);
      setError(err.message || 'حدث خطأ أثناء تحميل قائمة الأجهزة.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && device.status !== statusFilter) {
        return false;
      }

      // 2. Client Filter
      if (clientFilter !== 'all' && device.client_id !== clientFilter) {
        return false;
      }

      // 3. Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const devName = device.device_name?.toLowerCase() || '';
        const fingerprint = device.device_fingerprint?.toLowerCase() || '';
        const clientName = device.client?.business_name?.toLowerCase() || '';
        const customerName = device.client?.customer_name?.toLowerCase() || '';
        const clientCode = device.client?.client_code?.toLowerCase() || '';
        const licenseKey = device.license?.license_key?.toLowerCase() || '';
        const os = device.operating_system?.toLowerCase() || '';
        const version = device.app_version?.toLowerCase() || '';

        const matches =
          devName.includes(query) ||
          fingerprint.includes(query) ||
          clientName.includes(query) ||
          customerName.includes(query) ||
          clientCode.includes(query) ||
          licenseKey.includes(query) ||
          os.includes(query) ||
          version.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [devices, statusFilter, clientFilter, searchQuery]);

  // Deactivate device handler
  const handleDeactivateDevice = async (device: Device) => {
    try {
      const result = await deactivateDevice(device.id, 'إلغاء التفعيل اليدوي من قائمة الأجهزة');
      if (result.success) {
        setNotification({ type: 'success', message: result.message });
        await fetchData();
      } else {
        setNotification({ type: 'error', message: result.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'حدث خطأ أثناء محاولة إلغاء تفعيل الجهاز' });
    }
  };

  // Register device handler
  const handleRegisterDevice = async (formData: any) => {
    try {
      const params: DeviceActivationParams = {
        licenseKey: formData.licenseKey,
        deviceName: formData.deviceName,
        deviceFingerprint: formData.deviceFingerprint,
        operatingSystem: formData.operatingSystem,
        appVersion: formData.appVersion,
      };

      const result = await activateDevice(params);
      if (result.success) {
        setNotification({ type: 'success', message: result.message });
        setIsRegisterOpen(false);
        await fetchData();
      } else {
        setNotification({ type: 'error', message: result.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'حدث خطأ غير متوقع' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">الأجهزة المفعلة (Device Management)</h2>
          <p className="text-sm text-slate-500 mt-1">
            إدارة أجهزة نقاط البيع المربوطة بتراخيص العملاء ومراقبة الحصص المسموحة
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
          <button
            onClick={() => setIsRegisterOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>تسجيل وتفعيل جهاز</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي الأجهزة المسجلة</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Smartphone className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{devices.length}</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">الأجهزة النشطة حالياً</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {devices.filter((d) => d.status === 'active').length}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">الأجهزة المعطلة / المحررة</span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600">
            {devices.filter((d) => d.status === 'deactivated').length}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم الجهاز، البصمة الرقمية، العميل، أو مفتاح الترخيص..."
              className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[130px]"
            >
              <option value="all">كافة الحالات</option>
              <option value="active">نشط فقط</option>
              <option value="deactivated">معطل فقط</option>
            </select>
          </div>

          {/* Client Filter */}
          <div>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full md:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[170px]"
            >
              <option value="all">كافة العملاء</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name} ({c.client_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table or States */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">جاري تحميل بيانات الأجهزة...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-600">
            <AlertTriangle className="h-10 w-10 mx-auto mb-2 text-rose-500" />
            <h4 className="text-base font-semibold">خطأ أثناء التحميل</h4>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-16 text-center">
            <Smartphone className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-900">لا توجد أجهزة مطابقة</h4>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              {devices.length === 0
                ? 'لم يتم تسجيل أي أجهزة بنقاط البيع حتى الآن. يمكنك تفعيل جهاز جديد يدوياً أو ربطه عبر الترخيص.'
                : 'لم يتم العثور على أجهزة تطابق معايير البحث والفلترة المحددة.'}
            </p>
            {devices.length === 0 && (
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>تسجيل أول جهاز</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-right">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">الجهاز</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">العميل</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">الترخيص</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">البصمة الرقمية</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">النظام / الإصدار</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">الحالة</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">تاريخ التفعيل</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">آخر ظهور</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-900 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredDevices.map((dev) => {
                  const isActive = dev.status === 'active';
                  return (
                    <tr key={dev.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Device Name */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-slate-400 shrink-0" />
                          <span>{dev.device_name}</span>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-5 py-4">
                        {dev.client ? (
                          <div>
                            <Link
                              to={`/super-admin/clients/${dev.client_id}`}
                              className="text-xs font-bold text-slate-900 hover:underline flex items-center gap-1"
                            >
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              <span>{dev.client.business_name}</span>
                            </Link>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {dev.client.client_code}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">{dev.client_id.slice(0, 8)}...</span>
                        )}
                      </td>

                      {/* License */}
                      <td className="px-5 py-4">
                        {dev.license ? (
                          <div>
                            <Link
                              to={`/super-admin/licenses/${dev.license_id}`}
                              className="text-xs font-mono font-bold text-blue-600 hover:underline flex items-center gap-1"
                              dir="ltr"
                            >
                              <Key className="h-3 w-3 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[130px]">{dev.license.license_key}</span>
                            </Link>
                            <span className="text-[11px] text-slate-500">
                              {dev.license.activated_devices}/{dev.license.max_devices} أجهزة
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">{dev.license_id.slice(0, 8)}...</span>
                        )}
                      </td>

                      {/* Fingerprint */}
                      <td className="px-5 py-4">
                        <span
                          className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded select-all block max-w-[140px] truncate"
                          dir="ltr"
                          title={dev.device_fingerprint}
                        >
                          {dev.device_fingerprint}
                        </span>
                      </td>

                      {/* OS & Version */}
                      <td className="px-5 py-4">
                        <div className="text-xs text-slate-800">{dev.operating_system || '—'}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          v{dev.app_version || '1.0.0'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span>{isActive ? 'نشط' : 'معطل'}</span>
                        </span>
                      </td>

                      {/* Created / Activated At */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-600">
                        {dev.activated_at ? format(new Date(dev.activated_at), 'yyyy-MM-dd') : '—'}
                      </td>

                      {/* Last Seen */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-500">
                        {dev.last_seen_at ? (
                          <span title={format(new Date(dev.last_seen_at), 'yyyy-MM-dd HH:mm:ss')}>
                            {format(new Date(dev.last_seen_at), 'yyyy-MM-dd HH:mm')}
                          </span>
                        ) : (
                          <span className="text-slate-400">لم يسجل</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedDevice(dev);
                              setIsDetailsOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="عرض تفاصيل الجهاز"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {isActive && (
                            <button
                              onClick={() => handleDeactivateDevice(dev)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="إلغاء تفعيل وتحرير المقعد"
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <DeviceDetailsModal
        device={selectedDevice}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedDevice(null);
        }}
        onDeactivate={handleDeactivateDevice}
      />

      <RegisterDeviceModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegister={handleRegisterDevice}
      />
    </div>
  );
}
