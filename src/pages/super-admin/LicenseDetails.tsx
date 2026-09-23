import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import { License, Device, ActivityLogItem } from '../../types';
import { RenewLicenseModal } from './RenewLicenseModal';
import { 
  getLicenseStatusBadge, 
  getLicenseTypeLabel, 
  getEffectiveLicenseStatus 
} from '../../lib/licenseUtils';
import { 
  ArrowRight, 
  Key, 
  Copy, 
  Check, 
  CheckCircle2, 
  Ban, 
  ShieldAlert, 
  RotateCw, 
  Smartphone, 
  History, 
  Loader2, 
  AlertCircle, 
  Building2, 
  Calendar, 
  ExternalLink,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { deactivateDevice, activateDevice, DeviceActivationParams } from '../../lib/deviceService';
import { DeviceDetailsModal } from '../../components/super-admin/DeviceDetailsModal';
import { RegisterDeviceModal } from '../../components/super-admin/RegisterDeviceModal';
import { Eye, Plus, ShieldCheck, AlertTriangle } from 'lucide-react';

export function LicenseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [license, setLicense] = useState<License | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDeviceDetailsOpen, setIsDeviceDetailsOpen] = useState(false);
  const [isRegisterDeviceOpen, setIsRegisterDeviceOpen] = useState(false);
  const [isEditingMaxDevices, setIsEditingMaxDevices] = useState(false);
  const [newMaxDevices, setNewMaxDevices] = useState<number>(1);

  const handleSaveMaxDevices = async () => {
    if (!license) return;
    if (newMaxDevices < 1) {
      toast.error('الحد الأدنى للأجهزة يجب ألا يقل عن 1');
      return;
    }
    try {
      const { error } = await supabase
        .from('licenses')
        .update({ max_devices: newMaxDevices, updated_at: new Date().toISOString() })
        .eq('id', license.id);
      if (error) throw error;

      await logActivity({
        action: 'update_max_devices',
        entityType: 'license',
        entityId: license.id,
        metadata: {
          license_key: license.license_key,
          previous_max: license.max_devices,
          new_max: newMaxDevices,
        },
      });

      toast.success(`تم تحديث الحد الأقصى للأجهزة إلى ${newMaxDevices} بنجاح`);
      setIsEditingMaxDevices(false);
      await fetchLicenseData();
    } catch (err: any) {
      toast.error(err.message || 'فشل تحديث الحد الأقصى للأجهزة');
    }
  };

  const handleDeactivateDevice = async (device: Device) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في إلغاء تفعيل الجهاز "${device.device_name}"؟ سيتم تحرير المقعد في هذا الترخيص فوراً دون حذف سجل الجهاز.`)) {
      return;
    }

    try {
      const result = await deactivateDevice(device.id, 'إلغاء التفعيل اليدوي من تفاصيل الترخيص');
      if (result.success) {
        toast.success(result.message);
        await fetchLicenseData();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء إلغاء التفعيل');
    }
  };

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
        toast.success(result.message);
        setIsRegisterDeviceOpen(false);
        await fetchLicenseData();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل في تسجيل وتفعيل الجهاز');
    }
  };

  const fetchLicenseData = async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch license with client details
      const { data: licData, error: licErr } = await supabase
        .from('licenses')
        .select(`
          *,
          client:clients (
            id,
            client_code,
            customer_name,
            business_name,
            status
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (licErr) throw licErr;
      if (!licData) {
        setErrorMsg('الترخيص غير موجود أو تم حذفه.');
        setIsLoading(false);
        return;
      }
      setLicense(licData);

      // 2. Fetch associated devices
      const { data: devData, error: devErr } = await supabase
        .from('devices')
        .select('*')
        .eq('license_id', id)
        .order('activated_at', { ascending: false });

      if (devErr) throw devErr;
      setDevices(devData || []);

      // 3. Fetch activity logs
      const { data: actData, error: actErr } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('entity_id', id)
        .order('created_at', { ascending: false });

      if (!actErr && actData) {
        setActivities(actData as ActivityLogItem[]);
      }

    } catch (err: any) {
      console.error('Error loading license details:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تحميل بيانات الترخيص');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenseData();
  }, [id]);

  const handleCopyKey = () => {
    if (!license) return;
    navigator.clipboard.writeText(license.license_key);
    setCopied(true);
    toast.success('تم نسخ مفتاح الترخيص');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStatusChange = async (newStatus: 'active' | 'suspended' | 'revoked') => {
    if (!license) return;

    const messages = {
      active: 'هل أنت متأكد من إعادة تفعيل هذا الترخيص؟',
      suspended: 'هل أنت متأكد من إيقاف هذا الترخيص مؤقتاً؟ لن تتمكن الأجهزة من العمل أثناء الإيقاف.',
      revoked: 'تحذير: هل أنت متأكد من الإلغاء النهائي لهذا الترخيص؟ هذا الإجراء سيوقف الأجهزة نهائياً.',
    };

    if (!window.confirm(messages[newStatus])) return;

    try {
      const { error } = await supabase
        .from('licenses')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', license.id);

      if (error) throw error;

      await logActivity({
        action: `${newStatus}_license`,
        entityType: 'license',
        entityId: license.id,
        metadata: {
          license_key: license.license_key,
          previous_status: license.status,
          new_status: newStatus,
        },
      });

      toast.success('تم تحديث حالة الترخيص بنجاح');
      fetchLicenseData();
    } catch (err: any) {
      console.error('Error updating license status:', err);
      toast.error(err.message || 'فشل في تحديث حالة الترخيص');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[450px] flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200">
        <Loader2 className="h-9 w-9 animate-spin text-slate-900" />
        <p className="mt-3 text-sm font-medium text-slate-600">جاري تحميل تفاصيل الترخيص...</p>
      </div>
    );
  }

  if (errorMsg || !license) {
    return (
      <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200 text-center space-y-4 max-w-lg mx-auto mt-12">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900">تعذر عرض تفاصيل الترخيص</h3>
        <p className="text-sm text-slate-500">{errorMsg || 'الترخيص غير موجود'}</p>
        <button
          onClick={() => navigate('/super-admin/licenses')}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة لقائمة التراخيص</span>
        </button>
      </div>
    );
  }

  const effectiveStatus = getEffectiveLicenseStatus(license.status, license.expiry_date);
  const statusBadge = getLicenseStatusBadge(license.status, license.expiry_date);

  return (
    <div className="space-y-6 text-right">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          to="/super-admin/licenses"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة إلى التراخيص</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-bold text-slate-900 tracking-wider" dir="ltr">
                {license.license_key}
              </span>
              <button
                onClick={handleCopyKey}
                className="text-slate-400 hover:text-slate-900 transition-colors p-1"
                title="نسخ مفتاح الترخيص"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
              <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-600 flex items-center gap-2">
              <span>العميل:</span>
              {license.client ? (
                <Link
                  to={`/super-admin/clients/${license.client_id}`}
                  className="font-medium text-slate-900 hover:underline flex items-center gap-1"
                >
                  <Building2 className="h-4 w-4 text-slate-500" />
                  <span>{license.client.business_name} ({license.client.customer_name})</span>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </Link>
              ) : (
                <span className="text-slate-400">عميل غير معروف</span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsRenewModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm transition-colors"
            >
              <RotateCw className="h-4 w-4" />
              <span>تجديد الصلاحية</span>
            </button>

            {effectiveStatus !== 'active' && effectiveStatus !== 'revoked' && (
              <button
                onClick={() => handleStatusChange('active')}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>تفعيل الترخيص</span>
              </button>
            )}

            {effectiveStatus === 'active' && (
              <button
                onClick={() => handleStatusChange('suspended')}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-600 shadow-sm transition-colors"
              >
                <Ban className="h-4 w-4" />
                <span>إيقاف مؤقت</span>
              </button>
            )}

            {effectiveStatus !== 'revoked' && (
              <button
                onClick={() => handleStatusChange('revoked')}
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow-sm transition-colors"
              >
                <ShieldAlert className="h-4 w-4" />
                <span>إلغاء نهائي</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid: License Info & Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: License Details */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
            بيانات الترخيص
          </h3>

          <div className="space-y-3.5 text-sm">
            <div>
              <div className="text-xs font-medium text-slate-400 mb-0.5">نوع الترخيص</div>
              <div className="font-semibold text-slate-900">
                {getLicenseTypeLabel(license.license_type)}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-1">
                <span>حصة الأجهزة (Max Devices)</span>
                {!isEditingMaxDevices && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewMaxDevices(license.max_devices || 1);
                      setIsEditingMaxDevices(true);
                    }}
                    className="text-blue-600 hover:text-blue-700 text-xs font-bold underline cursor-pointer"
                  >
                    تعديل الحد
                  </button>
                )}
              </div>
              {isEditingMaxDevices ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="1"
                    value={newMaxDevices}
                    onChange={(e) => setNewMaxDevices(parseInt(e.target.value) || 1)}
                    className="w-20 px-2.5 py-1 text-sm font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={handleSaveMaxDevices}
                    className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-xs cursor-pointer"
                  >
                    حفظ
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingMaxDevices(false)}
                    className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <div className="text-slate-900">
                  <span className="font-bold text-base">{license.activated_devices}</span> جهاز مفعل من أصل{' '}
                  <span className="font-bold text-base text-blue-700">{license.max_devices}</span> جهاز مسموح
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <div className="text-xs font-medium text-slate-400 mb-0.5">تاريخ البداية</div>
                <div className="text-slate-800 font-mono text-xs">
                  {format(new Date(license.start_date), 'yyyy-MM-dd')}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400 mb-0.5">تاريخ الانتهاء</div>
                <div className="text-slate-800 font-mono text-xs">
                  {format(new Date(license.expiry_date), 'yyyy-MM-dd')}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="text-xs font-medium text-slate-400 mb-1">الوضع الزمني</div>
              <div className="text-xs">
                {new Date(license.expiry_date) < new Date() ? (
                  <span className="text-rose-600 font-medium">منتهي الصلاحية</span>
                ) : (
                  <span className="text-emerald-600 font-medium">ساري الصلاحية</span>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-400">
              <div>تاريخ الإنشاء: {format(new Date(license.created_at), 'yyyy-MM-dd HH:mm')}</div>
              <div>آخر تحديث: {format(new Date(license.updated_at), 'yyyy-MM-dd HH:mm')}</div>
            </div>
          </div>
        </div>

        {/* Right: Devices & Activity History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Devices Box */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">الأجهزة المرتبطة بهذا الترخيص</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  عرض وإدارة الأجهزة المسجلة بنقاط البيع مع إمكانية تحرير المقاعد
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
                  {devices.filter((d) => d.status === 'active').length} / {license.max_devices} أجهزة نشطة
                </span>
                <button
                  type="button"
                  onClick={() => setIsRegisterDeviceOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>تفعيل جهاز</span>
                </button>
              </div>
            </div>

            {devices.length === 0 ? (
              <div className="p-8 text-center">
                <Smartphone className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-900">لا توجد أجهزة مربوطة حالياً</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  يمكنك تفعيل جهاز لهذا الترخيص مباشرة عبر الزر أعلاه، أو سيظهر الجهاز تلقائياً بمجرد تفعيله داخل تطبيق Ordexa POS.
                </p>
                <button
                  type="button"
                  onClick={() => setIsRegisterDeviceOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>تفعيل أول جهاز لهذا الترخيص</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-right">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-900">اسم الجهاز</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-900">البصمة الرقمية</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-900">الإصدار</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-900">تاريخ التفعيل</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-900">الحالة</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-900 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {devices.map((dev) => {
                      const isActive = dev.status === 'active';
                      return (
                        <tr key={dev.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-xs font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                              <span>{dev.device_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-600">
                            <span
                              className="bg-slate-100 px-2 py-0.5 rounded select-all block max-w-[120px] truncate"
                              dir="ltr"
                              title={dev.device_fingerprint}
                            >
                              {dev.device_fingerprint}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-600">
                            v{dev.app_version || '1.0.0'}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">
                            {dev.activated_at ? format(new Date(dev.activated_at), 'yyyy-MM-dd') : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {isActive ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200">
                                نشط
                              </span>
                            ) : (
                              <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-medium border border-slate-200">
                                معطل
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDevice({
                                    ...dev,
                                    client: license.client,
                                    license: license,
                                  });
                                  setIsDeviceDetailsOpen(true);
                                }}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="عرض تفاصيل الجهاز"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              {isActive && (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivateDevice(dev)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                  title="تحرير المقعد (Deactivate)"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
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

          {/* Activity Logs Timeline */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
              <History className="h-4 w-4 text-slate-600" />
              <h3 className="text-base font-bold text-slate-900">سجل حركات الترخيص (Activity History)</h3>
            </div>

            {activities.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">لا توجد حركات مسجلة لهذا الترخيص حتى الآن.</p>
            ) : (
              <div className="space-y-3">
                {activities.map((act) => (
                  <div key={act.id} className="flex items-start gap-3 text-xs border-r-2 border-slate-200 pr-3 pb-2">
                    <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{act.action}</span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          {format(new Date(act.created_at), 'yyyy-MM-dd HH:mm:ss')}
                        </span>
                      </div>
                      {act.metadata && (
                        <div className="mt-1 font-mono text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100" dir="ltr">
                          {JSON.stringify(act.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Renew Modal */}
      <RenewLicenseModal
        isOpen={isRenewModalOpen}
        onClose={() => setIsRenewModalOpen(false)}
        onSuccess={() => {
          setIsRenewModalOpen(false);
          fetchLicenseData();
        }}
        license={license}
      />

      {/* Device Details Modal */}
      <DeviceDetailsModal
        device={selectedDevice}
        isOpen={isDeviceDetailsOpen}
        onClose={() => {
          setIsDeviceDetailsOpen(false);
          setSelectedDevice(null);
        }}
        onDeactivate={handleDeactivateDevice}
      />

      {/* Register Device Modal */}
      <RegisterDeviceModal
        isOpen={isRegisterDeviceOpen}
        onClose={() => setIsRegisterDeviceOpen(false)}
        onRegister={handleRegisterDevice}
        prefilledLicenseKey={license?.license_key}
      />
    </div>
  );
}
