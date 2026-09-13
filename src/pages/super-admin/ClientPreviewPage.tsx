import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Client, License, ClientUser } from '../../types';
import { validatePreviewToken } from '../../lib/previewTokenService';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { getEffectiveLicenseStatus } from '../../lib/licenseUtils';
import { 
  Building2, 
  Store, 
  Key, 
  User, 
  ShieldCheck, 
  ExternalLink, 
  ArrowRight, 
  MonitorCheck, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Laptop, 
  Receipt, 
  Boxes, 
  ShoppingCart,
  Clock,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';

export function ClientPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const { isSuperAdmin } = useAuthStore();
  const [client, setClient] = useState<Client | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [owner, setOwner] = useState<ClientUser | null>(null);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [productCount, setProductCount] = useState<number>(0);
  const [salesCount, setSalesCount] = useState<number>(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Verify token or super admin session
    if (!token && !isSuperAdmin) {
      setTokenError('رمز المعاينة غير متوفر أو غير صالح');
      setIsLoading(false);
      return;
    }

    if (token) {
      const validation = validatePreviewToken(token, id);
      if (!validation.valid) {
        setTokenError(validation.error || 'رمز المعاينة منتهي أو غير صالح');
        setIsLoading(false);
        return;
      }
    }

    // 2. Fetch full client data for preview
    const loadPreviewData = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        // Fetch Client
        const { data: clientData, error: clientErr } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (clientErr) throw clientErr;
        if (!clientData) {
          setTokenError('المنشأة غير موجودة');
          setIsLoading(false);
          return;
        }
        setClient(clientData);

        // Fetch License
        const { data: licData } = await supabase
          .from('licenses')
          .select('*')
          .eq('client_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLicense(licData || null);

        // Fetch Owner User
        const { data: ownerData } = await supabase
          .from('client_users')
          .select('*')
          .eq('client_id', id)
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle();
        setOwner(ownerData || null);

        // Fetch Counts
        const { count: dCount } = await supabase
          .from('devices')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', id);
        setDeviceCount(dCount || 0);

        const { count: pCount } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', id);
        setProductCount(pCount || 0);

        const { count: sCount } = await supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', id);
        setSalesCount(sCount || 0);

      } catch (err: any) {
        console.error('Error loading client preview:', err);
        setTokenError(err.message || 'حدث خطأ أثناء تحميل بيانات المعاينة');
      } finally {
        setIsLoading(false);
      }
    };

    loadPreviewData();
  }, [id, token, isSuperAdmin]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
        <p className="mt-4 text-sm font-medium text-slate-300">جاري إعداد شاشة معاينة العميل...</p>
      </div>
    );
  }

  if (tokenError || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg border border-slate-200 space-y-4">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">تعذر فتح المعاينة</h3>
          <p className="text-sm text-slate-600">{tokenError || 'بيانات العميل غير متوفرة'}</p>
          <button
            onClick={() => navigate('/super-admin/clients')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            <span>العودة لإدارة العملاء</span>
          </button>
        </div>
      </div>
    );
  }

  const effectiveStatus = license ? getEffectiveLicenseStatus(license.status, license.expiry_date) : 'no_license';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100" dir="rtl">
      {/* Top Banner Notice */}
      <div className="bg-indigo-600 text-white px-4 py-2.5 text-xs font-medium flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="font-bold">وضع معاينة العميل (Live Client Preview Mode):</span>
          <span className="text-indigo-100">
            أنت تشاهد واجهة وهوية المنشأة {client.business_name} كما تظهر للعميل النهائي ونقاط البيع.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/super-admin/clients/${client.id}`}
            className="inline-flex items-center gap-1.5 bg-indigo-700 hover:bg-indigo-800 px-3 py-1 rounded text-white text-xs font-semibold transition-colors"
          >
            <span>العودة للوحة الإدارة</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Mock Client POS Header & Brand */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="h-20 w-20 rounded-2xl bg-slate-700 border border-slate-600 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                {client.logo ? (
                  <img
                    src={client.logo}
                    alt={client.business_name}
                    className="h-full w-full object-contain p-1"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Store className="h-10 w-10 text-slate-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{client.business_name}</h1>
                  <span className="font-mono bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded text-xs border border-indigo-500/30">
                    {client.client_code}
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded text-xs border border-emerald-500/30 font-medium">
                    {client.status === 'active' ? 'منشأة نشطة' : client.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  العميل: <span className="text-slate-200 font-medium">{client.customer_name}</span> | الهاتف: <span className="font-mono text-slate-200">{client.phone}</span> | العملة: <span className="font-bold text-indigo-400">{client.currency}</span>
                </p>
              </div>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-slate-700/60 border border-slate-600 text-xs">
                <span className="text-slate-400">حالة الرخصة: </span>
                <span className={effectiveStatus === 'active' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {effectiveStatus === 'active' ? 'مرخص ونشط' : 'غير مرخص'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-700/60 border border-slate-600 text-xs">
                <span className="text-slate-400">الأجهزة المصرح بها: </span>
                <span className="font-mono font-bold text-white">{license?.max_devices || 1}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-700/60 border border-slate-600 text-xs">
                <span className="text-slate-400">الأجهزة المفعلة: </span>
                <span className="font-mono font-bold text-white">{deviceCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Metric Preview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">المنتجات المسجلة</span>
              <div className="text-2xl font-bold text-white mt-1">{productCount}</div>
              <span className="text-[11px] text-slate-500">في قائمة أصناف المنشأة</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Boxes className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">عمليات البيع والفواتير</span>
              <div className="text-2xl font-bold text-white mt-1">{salesCount}</div>
              <span className="text-[11px] text-slate-500">تم تسجيلها عبر نقاط البيع</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Receipt className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium">حساب المالك المسجل</span>
              <div className="text-sm font-bold text-white mt-1 truncate max-w-[180px]">
                {owner?.name || client.owner_name || 'غير محدد'}
              </div>
              <span className="text-[11px] text-slate-500 font-mono" dir="ltr">
                {owner?.email || client.email || '—'}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <User className="h-6 w-6" />
            </div>
          </div>
        </div>

        {/* Desktop Application Delivery & Instructions Preview */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-md space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
            <Laptop className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">حزم تطبيق سطح المكتب المتاحة لنقاط البيع</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">النسخة المحمولة (Windows Portable Zip)</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    تشغيل فوري
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">جاهزة للتشغيل المباشر دون الحاجة لأي صلاحيات مسؤول.</p>
              </div>
              <a
                href="/downloads/Ordexa-POS-Windows-Portable.zip"
                download="Ordexa-POS-Windows-Portable.zip"
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
              >
                تحميل ZIP
              </a>
            </div>

            <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">مثبت ويندوز الرسمي (Windows Setup)</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    موصى به
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">تثبيت قياسي مع إنشاء اختصارات سطح المكتب وقائمة ابدأ.</p>
              </div>
              <a
                href="/downloads/Ordexa-POS-Desktop-Setup.exe"
                download="Ordexa-POS-Desktop-Setup.exe"
                className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
              >
                تحميل EXE
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
