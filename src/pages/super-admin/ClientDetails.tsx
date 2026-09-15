import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import { Client, License, ClientUser } from '../../types';
import { CustomerPackageStatus, CustomerDeliverySummaryData } from '../../types/delivery';
import { Modal } from '../../components/ui/Modal';
import { ClientForm } from './ClientForm';
import { LicenseFormModal } from './LicenseFormModal';
import { AddClientUserModal } from '../../components/super-admin/AddClientUserModal';
import { ClientUsersCard } from '../../components/super-admin/ClientUsersCard';
import { DeliveryChecklistCard } from '../../components/super-admin/DeliveryChecklistCard';
import { CustomerDeliveryModal } from '../../components/super-admin/CustomerDeliveryModal';
import { generatePreviewToken } from '../../lib/previewTokenService';
import { 
  getLicenseStatusBadge, 
  getLicenseTypeLabel, 
  getEffectiveLicenseStatus 
} from '../../lib/licenseUtils';
import { toggleClientUserStatus } from '../../lib/userService';
import { 
  ArrowRight, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign, 
  Globe, 
  Edit3, 
  Plus, 
  Key, 
  Smartphone, 
  Layers, 
  DownloadCloud, 
  Loader2, 
  AlertCircle, 
  ExternalLink, 
  CheckCircle2, 
  Ban, 
  User,
  Sparkles,
  Eye,
  Laptop,
  Check,
  Copy,
  Store
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { ImageUploadPicker } from '../../components/common/ImageUploadPicker';
import { useClientStore } from '../../store/clientStore';

export function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [downloadCount, setDownloadCount] = useState<number>(0);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedWebPosLink, setCopiedWebPosLink] = useState(false);

  // Modals
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [isNewLicenseModalOpen, setIsNewLicenseModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);

  const fetchClientData = async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch client
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (clientErr) throw clientErr;
      if (!clientData) {
        setErrorMsg('العميل غير موجود أو قد تم حذفه.');
        setIsLoading(false);
        return;
      }
      setClient(clientData);

      // 2. Fetch licenses for this client
      const { data: licensesData, error: licErr } = await supabase
        .from('licenses')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false });

      if (licErr) throw licErr;
      setLicenses(licensesData || []);

      // 3. Fetch client users
      const { data: usersData, error: userErr } = await supabase
        .from('client_users')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false });

      if (!userErr && usersData) {
        setUsers(usersData);
      }

      // 4. Fetch device count
      const { count: devCount, error: devErr } = await supabase
        .from('devices')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id);

      if (!devErr && devCount !== null) {
        setDeviceCount(devCount);
      }

      // Get latest app version from devices if any
      const { data: latestDevice } = await supabase
        .from('devices')
        .select('app_version')
        .eq('client_id', id)
        .not('app_version', 'is', null)
        .order('activated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestDevice?.app_version) {
        setCurrentVersion(latestDevice.app_version);
      }

      // 5. Fetch downloads count
      const { count: dlCount, error: dlErr } = await supabase
        .from('client_downloads')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id);

      if (!dlErr && dlCount !== null) {
        setDownloadCount(dlCount);
      }

    } catch (err: any) {
      console.error('Error fetching client details:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تحميل بيانات العميل');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [id]);

  // Status badge for client
  const getClientStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            نشط
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center rounded-md bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
            غير نشط
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/10">
            موقوف
          </span>
        );
      default:
        return null;
    }
  };

  // Toggle user status
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    if (!client) return;
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await toggleClientUserStatus(userId, client.id, nextStatus as any);
      toast.success('تم تحديث حالة المستخدم بنجاح');
      fetchClientData();
    } catch (err: any) {
      toast.error('فشل في تحديث حالة المستخدم');
    }
  };

  // Quick License status update (Suspend / Activate)
  const handleLicenseStatusChange = async (licenseId: string, newStatus: string) => {
    const statusLabels: Record<string, string> = {
      active: 'تفعيل',
      suspended: 'إيقاف',
      revoked: 'إلغاء نهائي',
    };
    if (!window.confirm(`هل أنت متأكد من ${statusLabels[newStatus] || newStatus} هذا الترخيص؟`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('licenses')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', licenseId);

      if (error) throw error;

      await logActivity({
        action: `${newStatus}_license`,
        entityType: 'license',
        entityId: licenseId,
        metadata: { client_id: id, newStatus },
      });

      toast.success('تم تحديث حالة الترخيص بنجاح');
      fetchClientData();
    } catch (err: any) {
      console.error('Error changing license status:', err);
      toast.error(err.message || 'فشل في تحديث حالة الترخيص');
    }
  };

  // Client Branding / Logo Handlers
  const [isUpdatingLogo, setIsUpdatingLogo] = useState<boolean>(false);

  const handleLogoUpdate = async (dataUrl: string) => {
    if (!id || !client) return;
    setIsUpdatingLogo(true);
    const toastId = toast.loading('جاري حفظ وتحديث شعار العميل...');
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          logo: dataUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setClient({ ...client, logo: dataUrl });

      // Sync active client store if matching
      const currentActiveClient = useClientStore.getState().client;
      if (currentActiveClient && currentActiveClient.id === id) {
        useClientStore.setState({
          client: { ...currentActiveClient, logo: dataUrl },
        });
      }

      await logActivity({
        action: 'update_client_logo',
        entityType: 'client',
        entityId: id,
        metadata: { client_id: id, client_code: client.client_code },
      });

      toast.success('تم تحديث شعار العميل وربطه بنجاح', { id: toastId });
    } catch (err: any) {
      console.error('Error updating client logo:', err);
      toast.error(err.message || 'فشل في تحديث شعار العميل', { id: toastId });
    } finally {
      setIsUpdatingLogo(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!id || !client) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف شعار العميل والعودة للشعار الافتراضي؟')) {
      return;
    }

    setIsUpdatingLogo(true);
    const toastId = toast.loading('جاري حذف شعار العميل...');
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          logo: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setClient({ ...client, logo: null });

      // Sync active client store if matching
      const currentActiveClient = useClientStore.getState().client;
      if (currentActiveClient && currentActiveClient.id === id) {
        useClientStore.setState({
          client: { ...currentActiveClient, logo: null },
        });
      }

      await logActivity({
        action: 'remove_client_logo',
        entityType: 'client',
        entityId: id,
        metadata: { client_id: id, client_code: client.client_code },
      });

      toast.success('تم حذف شعار العميل والعودة للافتراضي', { id: toastId });
    } catch (err: any) {
      console.error('Error removing client logo:', err);
      toast.error(err.message || 'فشل في حذف شعار العميل', { id: toastId });
    } finally {
      setIsUpdatingLogo(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[450px] flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-slate-200">
        <Loader2 className="h-9 w-9 animate-spin text-slate-900" />
        <p className="mt-3 text-sm font-medium text-slate-600">جاري تحميل ملف العميل...</p>
      </div>
    );
  }

  if (errorMsg || !client) {
    return (
      <div className="bg-white rounded-xl p-8 shadow-sm border border-slate-200 text-center space-y-4 max-w-lg mx-auto mt-12">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
        <h3 className="text-lg font-bold text-slate-900">تعذر عرض ملف العميل</h3>
        <p className="text-sm text-slate-500">{errorMsg || 'العميل غير موجود'}</p>
        <button
          onClick={() => navigate('/super-admin/clients')}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة لقائمة العملاء</span>
        </button>
      </div>
    );
  }

  // Calculate active license and owner
  const activeLicense = licenses.find(
    (l) => getEffectiveLicenseStatus(l.status, l.expiry_date) === 'active'
  ) || licenses[0] || null;

  const ownerUser = users.find((u) => u.role === 'owner') || users[0] || null;

  // Delivery Checklist State
  const deliveryStatus: CustomerPackageStatus = {
    clientCreated: true,
    licenseConfigured: !!activeLicense,
    whiteLabelConfigured: !!(client.business_name && client.phone),
    ownerCreated: !!ownerUser,
    previewReady: true,
    previewReviewed: true,
    downloadReady: true,
    readyForDelivery: !!(activeLicense && ownerUser),
  };

  const previewToken = generatePreviewToken(client.id, client.client_code);
  const previewUrl = `/preview/${client.id}?token=${previewToken}`;

  const deliverySummary: CustomerDeliverySummaryData = {
    client,
    license: activeLicense,
    owner: ownerUser,
    downloads: {
      portableZip: {
        name: 'Ordexa-POS-Windows-Portable.zip',
        size: '249 MB',
        url: '/downloads/Ordexa-POS-Windows-Portable.zip',
      },
      installerExe: {
        name: 'Ordexa-POS-Desktop-Setup.exe',
        size: '186 KB',
        url: '/downloads/Ordexa-POS-Desktop-Setup.exe',
      },
    },
    previewUrl,
    activationInstructions: 'فعل الترخيص بعد تنزيل التطبيق وفتحه.',
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Back button & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/super-admin/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة إلى العملاء</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {client.logo ? (
                <img
                  src={client.logo}
                  alt={client.business_name}
                  className="h-full w-full object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Building2 className="h-7 w-7 text-slate-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{client.business_name}</h1>
                <span className="font-mono bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded text-xs border border-slate-200">
                  {client.client_code}
                </span>
                {getClientStatusBadge(client.status)}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                العميل: <span className="font-medium text-slate-700">{client.customer_name}</span> | تاريخ الانضمام:{' '}
                {format(new Date(client.created_at), 'yyyy-MM-dd')}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/pos/${client.client_code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors"
              title="فتح نظام الكاشير السحابي والـ PWA المخصص للعميل"
            >
              <Store className="h-4 w-4" />
              <span>نقطة بيع العميل (Web POS)</span>
            </a>

            <Link
              to={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 border border-indigo-200 hover:bg-indigo-100 shadow-sm transition-colors"
              title="فتح شاشة المعاينة الحية للعميل في نافذة جديدة"
            >
              <Eye className="h-4 w-4" />
              <span>معاينة واجهة العميل (Live Preview)</span>
            </Link>

            <button
              type="button"
              onClick={() => setIsDeliveryModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>ملف تسليم العميل</span>
            </button>

            <button
              onClick={() => setIsEditClientModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm transition-colors"
            >
              <Edit3 className="h-4 w-4" />
              <span>تعديل البيانات</span>
            </button>

            <button
              onClick={() => setIsNewLicenseModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>إصدار ترخيص</span>
            </button>
          </div>
        </div>
      </div>

      {/* Web POS + PWA Dedicated Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-5 border border-indigo-500/30 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold">
              <Store className="h-3.5 w-3.5" />
              <span>المسار الأساسي المعتمد للعميل: Web POS + Installable PWA</span>
            </div>
            <h3 className="text-base font-bold text-white">
              رابط كاشير منشأة {client.business_name}
            </h3>
            <p className="text-xs text-slate-300 font-mono select-all">
              {window.location.origin}/pos/{client.client_code}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/pos/${client.client_code}`);
                setCopiedWebPosLink(true);
                setTimeout(() => setCopiedWebPosLink(false), 2000);
                toast.success('تم نسخ رابط كاشير المنشأة إلى الحافظة');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/20 transition-all"
            >
              {copiedWebPosLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              <span>{copiedWebPosLink ? 'تم النسخ' : 'نسخ الرابط'}</span>
            </button>

            <a
              href={`/pos/${client.client_code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
            >
              <ExternalLink className="h-4 w-4" />
              <span>فتح نقطة البيع</span>
            </a>
          </div>
        </div>
      </div>

      {/* Delivery Checklist Progress Card */}
      <DeliveryChecklistCard
        status={deliveryStatus}
        onOpenNewLicenseModal={() => setIsNewLicenseModalOpen(true)}
        onOpenOwnerUserModal={() => setIsAddUserModalOpen(true)}
        onOpenPreview={() => window.open(previewUrl, '_blank')}
        onOpenDeliverySummary={() => setIsDeliveryModalOpen(true)}
      />

      {/* SECTION: Client Branding (هوية العميل) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                هوية العميل (Client Branding)
              </h2>
              <p className="text-xs text-slate-500">
                إدارة شعار المنشأة الخاص بالعميل {client.business_name} (مرتبط بـ Client ID: {client.id}).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <span>كود المنشأة:</span>
              <span className="font-mono text-indigo-600 font-bold">{client.client_code}</span>
            </span>
          </div>
        </div>

        <ImageUploadPicker
          label="شعار العميل"
          description="ارفع شعار المنشأة مباشرة من جهازك دون إدخال أي روابط URL."
          value={client.logo}
          isCustom={!!client.logo}
          onChange={handleLogoUpdate}
          onRemove={client.logo ? handleLogoRemove : undefined}
          disabled={isUpdatingLogo}
          aspectRatio="square"
          maxWidth={512}
          maxHeight={512}
          badgeText="خاص بهذا العميل"
          helperNote="الصيغ المدعومة: PNG, JPG, WEBP, SVG (حتى 5MB). يظهر هذا الشعار ديناميكياً داخل شاشات نقطة البيع (POS)، الفواتير الحرارية، ولوحة تحكم المنشأة."
        />
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. License Status Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">حالة الترخيص</span>
            <Key className="h-5 w-5 text-slate-400" />
          </div>
          {activeLicense ? (
            <div>
              <div className="text-lg font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-5 w-5" />
                <span>مرخص (نشط)</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ينتهي في: {format(new Date(activeLicense.expiry_date), 'yyyy-MM-dd')}
              </p>
            </div>
          ) : licenses.length > 0 ? (
            <div>
              <div className="text-lg font-bold text-rose-600 flex items-center gap-1.5">
                <AlertCircle className="h-5 w-5" />
                <span>منتهي / موقوف</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                إجمالي التراخيص التاريخية: {licenses.length}
              </p>
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold text-slate-400">لا يوجد ترخيص</div>
              <p className="text-xs text-slate-400 mt-1">لم يتم إصدار أي ترخيص بعد</p>
            </div>
          )}
        </div>

        {/* 2. Devices Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">الأجهزة المرتبطة</span>
            <Smartphone className="h-5 w-5 text-slate-400" />
          </div>
          {deviceCount > 0 ? (
            <div>
              <div className="text-2xl font-bold text-slate-900">{deviceCount}</div>
              <p className="text-xs text-slate-500 mt-1">أجهزة تم تفعيلها</p>
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold text-slate-400">لا توجد أجهزة</div>
              <p className="text-xs text-slate-400 mt-1">لم يتم ربط أي جهاز بنقاط البيع</p>
            </div>
          )}
        </div>

        {/* 3. Current Version Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">النسخة المشغلة</span>
            <Layers className="h-5 w-5 text-slate-400" />
          </div>
          {currentVersion ? (
            <div>
              <div className="text-lg font-bold text-slate-900 font-mono" dir="ltr">{currentVersion}</div>
              <p className="text-xs text-slate-500 mt-1">النسخة المسجلة على أحدث جهاز</p>
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold text-slate-400">غير متوفرة</div>
              <p className="text-xs text-slate-400 mt-1">بانتظار تشغيل أول تطبيق</p>
            </div>
          )}
        </div>

        {/* 4. Downloads Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">التحميلات</span>
            <DownloadCloud className="h-5 w-5 text-slate-400" />
          </div>
          {downloadCount > 0 ? (
            <div>
              <div className="text-2xl font-bold text-slate-900">{downloadCount}</div>
              <p className="text-xs text-slate-500 mt-1">روابط تنزيل تم توليدها</p>
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold text-slate-400">حزم التنزيل جاهزة</div>
              <p className="text-xs text-slate-400 mt-1">Windows Setup & Portable Zip</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Client Info + Client Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Info Column */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">بيانات العميل التفصيلية</h3>
            <button
              onClick={() => setIsEditClientModalOpen(true)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>تعديل</span>
            </button>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-0.5">
                <User className="h-3.5 w-3.5" />
                <span>اسم العميل</span>
              </div>
              <div className="font-medium text-slate-900">{client.customer_name}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-0.5">
                <Building2 className="h-3.5 w-3.5" />
                <span>الاسم التجاري</span>
              </div>
              <div className="font-medium text-slate-900">{client.business_name}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 mb-0.5">نوع النشاط</div>
              <div className="text-slate-800">{client.business_type || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 mb-0.5">اسم المالك / المسؤول</div>
              <div className="text-slate-800">{client.owner_name || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-0.5">
                <Phone className="h-3.5 w-3.5" />
                <span>رقم الهاتف</span>
              </div>
              <div className="text-slate-900 font-mono text-right" dir="ltr">{client.phone}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-0.5">
                <Mail className="h-3.5 w-3.5" />
                <span>البريد الإلكتروني</span>
              </div>
              <div className="text-slate-800 font-mono text-right" dir="ltr">{client.email || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-0.5">
                <MapPin className="h-3.5 w-3.5" />
                <span>العنوان</span>
              </div>
              <div className="text-slate-800">{client.address || '—'}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <div className="text-xs font-medium text-slate-400 flex items-center gap-1 mb-0.5">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>العملة</span>
                </div>
                <div className="font-semibold text-slate-800 font-mono">{client.currency}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 flex items-center gap-1 mb-0.5">
                  <Globe className="h-3.5 w-3.5" />
                  <span>اللغة</span>
                </div>
                <div className="font-semibold text-slate-800">{client.language === 'ar' ? 'العربية' : client.language}</div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-400">
              <div>تاريخ الإنشاء: {format(new Date(client.created_at), 'yyyy-MM-dd HH:mm')}</div>
              <div>آخر تحديث: {format(new Date(client.updated_at), 'yyyy-MM-dd HH:mm')}</div>
            </div>
          </div>
        </div>

        {/* Column 2 & 3: Users & Licenses */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Users Section */}
          <ClientUsersCard
            users={users}
            onAddUser={() => setIsAddUserModalOpen(true)}
            onToggleStatus={handleToggleUserStatus}
          />

          {/* Licenses List Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">سجل التراخيص (Licenses)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  جميع التراخيص الصادرة لهذا العميل عبر النظام ({licenses.length})
                </p>
              </div>
              <button
                onClick={() => setIsNewLicenseModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إصدار ترخيص</span>
              </button>
            </div>

            {licenses.length === 0 ? (
              <div className="p-8 text-center">
                <Key className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-slate-900">لا توجد تراخيص مسجلة</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  لم يتم إصدار أي ترخيص لهذا العميل حتى الآن. يمكنك إصدار ترخيص تجريبي أو دائم الآن.
                </p>
                <button
                  onClick={() => setIsNewLicenseModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>إصدار أول ترخيص</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-right">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">مفتاح الترخيص</th>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">النوع</th>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الأجهزة</th>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">تاريخ البداية</th>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">تاريخ الانتهاء</th>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900">الحالة</th>
                      <th scope="col" className="px-5 py-3 text-xs font-semibold text-slate-900 text-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {licenses.map((lic) => {
                      const effectiveStatus = getEffectiveLicenseStatus(lic.status, lic.expiry_date);
                      const badge = getLicenseStatusBadge(lic.status, lic.expiry_date);
                      return (
                        <tr key={lic.id} className="hover:bg-slate-50 transition-colors">
                          <td className="whitespace-nowrap px-5 py-3 text-sm font-mono text-slate-900" dir="ltr">
                            <Link
                              to={`/super-admin/licenses/${lic.id}`}
                              className="text-slate-900 font-semibold hover:underline flex items-center gap-1.5"
                            >
                              <span>{lic.license_key}</span>
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-700">
                            {getLicenseTypeLabel(lic.license_type)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-700">
                            <span className="font-bold text-slate-900">{lic.activated_devices}</span> / {lic.max_devices}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">
                            {format(new Date(lic.start_date), 'yyyy-MM-dd')}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">
                            {format(new Date(lic.expiry_date), 'yyyy-MM-dd')}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                to={`/super-admin/licenses/${lic.id}`}
                                className="text-slate-700 hover:text-slate-900 underline"
                              >
                                عرض
                              </Link>
                              {effectiveStatus === 'active' ? (
                                <button
                                  onClick={() => handleLicenseStatusChange(lic.id, 'suspended')}
                                  className="text-amber-600 hover:text-amber-800"
                                  title="إيقاف مؤقت"
                                >
                                  إيقاف
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleLicenseStatusChange(lic.id, 'active')}
                                  className="text-emerald-600 hover:text-emerald-800"
                                  title="تفعيل"
                                >
                                  تفعيل
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
        </div>
      </div>

      {/* Edit Client Modal */}
      <Modal
        isOpen={isEditClientModalOpen}
        onClose={() => setIsEditClientModalOpen(false)}
        title="تعديل بيانات العميل"
        maxWidth="2xl"
      >
        <ClientForm
          initialData={client}
          onSuccess={() => {
            setIsEditClientModalOpen(false);
            fetchClientData();
          }}
          onCancel={() => setIsEditClientModalOpen(false)}
        />
      </Modal>

      {/* New License Modal */}
      <LicenseFormModal
        isOpen={isNewLicenseModalOpen}
        onClose={() => setIsNewLicenseModalOpen(false)}
        onSuccess={() => {
          setIsNewLicenseModalOpen(false);
          fetchClientData();
        }}
        defaultClientId={client.id}
      />

      {/* Add Client User Modal */}
      <AddClientUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        clientId={client.id}
        defaultRole="owner"
        onSuccess={() => {
          fetchClientData();
        }}
      />

      {/* Delivery Summary Dossier Modal */}
      <CustomerDeliveryModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        summary={deliverySummary}
      />
    </div>
  );
}
