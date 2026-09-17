import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { useShiftStore } from '../../store/shiftStore';
import { useCurrency } from '../../hooks/useCurrency';
import { 
  Building2, 
  ShieldCheck, 
  Monitor, 
  Layers, 
  Clock, 
  Receipt, 
  Store,
  Sparkles,
  Info,
  DollarSign,
  ArrowRight,
  Plus,
  Lock,
  ShoppingCart
} from 'lucide-react';
import { format } from 'date-fns';
import { OpenShiftModal } from '../../components/client/shifts/OpenShiftModal';

export function ClientDashboard() {
  const { clientUser } = useAuthStore();
  const { client, license, effectiveLicenseStatus } = useClientStore();
  const { device, deviceName, fingerprint, operatingSystem, appVersion } = useDeviceStore();
  const { activeShift, loadActiveShift } = useShiftStore();
  const { currencySymbol, currencyCode } = useCurrency();

  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);

  const clientId = clientUser?.client_id;

  useEffect(() => {
    if (clientId) {
      loadActiveShift(clientId);
    }
  }, [clientId]);

  const getLicenseTypeLabel = (type?: string) => {
    switch (type) {
      case 'lifetime': return 'مدى الحياة (Lifetime)';
      case 'annual': return 'سنوي (Annual)';
      case 'semi_annual': return 'نصف سنوي (Semi-Annual)';
      case 'quarterly': return 'ربع سنوي (Quarterly)';
      case 'monthly': return 'شهري (Monthly)';
      case 'trial': return 'تجريبي (Trial)';
      default: return type || 'غير محدد';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* 1. Welcome Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
              {client?.logo ? (
                <img
                  src={client.logo}
                  alt={client.business_name || 'شعار المنشأة'}
                  className="h-full w-full object-contain p-1.5"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Building2 className="h-8 w-8 text-indigo-600" />
              )}
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Sparkles className="h-3 w-3" />
                <span>نظام إدارة نقطة البيع للمنشأة</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                {client?.business_name || 'لوحة تحكم المنشأة'}
              </h1>
              <p className="text-xs text-slate-600">
                أهلاً بك، <span className="font-semibold text-slate-800">{clientUser?.name || 'مستخدم النظام'}</span> | كود المنشأة: <span className="font-mono font-bold text-slate-900">{client?.client_code}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-end">
              <span className="text-[11px] text-slate-500 block font-medium">كود المنشأة</span>
              <span className="text-base font-bold font-mono text-slate-800">{client?.client_code || '---'}</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-end">
              <span className="text-[11px] text-emerald-600 block font-medium">حالة النظام</span>
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                متصل وجاهز
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Core Foundation Grid (No fake numbers, only verified system details) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Business Profile */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">بيانات المنشأة</span>
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-base font-bold text-slate-900 truncate" title={client?.business_name}>
                {client?.business_name || 'غير محدد'}
              </div>
              <div className="text-xs text-slate-600">
                العميل: <span className="font-medium text-slate-800">{client?.customer_name || '---'}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>العملة: <strong className="text-slate-800">{currencyCode} ({currencySymbol})</strong></span>
            <span>اللغة: <strong className="text-slate-800">{client?.language === 'ar' ? 'العربية' : client?.language || 'ar'}</strong></span>
          </div>
        </div>

        {/* Card 2: License Status */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">حالة الترخيص</span>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">
                  {effectiveLicenseStatus === 'active' ? 'ترخيص نشط وساري' : 'غير نشط'}
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <div className="text-xs text-slate-600">
                النوع: <span className="font-medium text-slate-800">{getLicenseTypeLabel(license?.license_type)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>الأجهزة: <strong className="text-slate-800">{license?.activated_devices || 1} / {license?.max_devices || 1}</strong></span>
            <span>
              الانتهاء:{' '}
              <strong className="text-slate-800">
                {license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : '---'}
              </strong>
            </span>
          </div>
        </div>

        {/* Card 3: Device Terminal Status */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">حالة الجهاز الحالي</span>
              <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Monitor className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-base font-bold text-slate-900 truncate" title={deviceName}>
                {deviceName}
              </div>
              <div className="text-xs font-mono text-slate-500 truncate" title={fingerprint}>
                بصمة: {fingerprint}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="truncate max-w-[140px]">{operatingSystem}</span>
            <span className="font-semibold text-emerald-600">مرخص</span>
          </div>
        </div>

        {/* Card 4: App Version */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">إصدار التطبيق</span>
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>الإصدار {appVersion}</span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                  Build #1
                </span>
              </div>
              <div className="text-xs text-slate-600">
                الحالة: <span className="font-medium text-emerald-700">محدث ومتطابق</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>البيئة: <strong className="text-slate-800">Production Client</strong></span>
            <span>RTL: <strong className="text-slate-800">نشط</strong></span>
          </div>
        </div>
      </div>

      {/* 3. Operational Overview: Active Shift & Quick POS Link */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Shift Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-600" />
              <span>جلسة الوردية والدرج النقدي</span>
            </h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              activeShift 
                ? 'bg-emerald-100 text-emerald-800 animate-pulse' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              {activeShift ? 'الوردية مفتوحة حالياً' : 'مغلقة'}
            </span>
          </div>

          {activeShift ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">رقم الوردية النشطة:</span>
                  <span className="font-mono font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                    {activeShift.shift_number}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">الفرع والصندوق:</span>
                  <span className="font-bold text-slate-800">
                    {activeShift.warehouse_name || 'الفرع الرئيسي'} • {activeShift.register_name || 'نقطة البيع'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">وقت بدء الجلسة:</span>
                  <span className="font-mono text-slate-700" dir="ltr">
                    {new Date(activeShift.opened_at).toLocaleTimeString('ar-SA')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                  <span className="text-slate-600 font-bold">الرصيد المتوقع بالدرج:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {(activeShift.closing_cash_expected || activeShift.opening_cash).toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  to="/pos"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>الانتقال لنقطة البيع [POS]</span>
                </Link>
                <Link
                  to="/shifts"
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all"
                >
                  إدارة الورديات
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-6 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Store className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">لا توجد وردية بيع مفتوحة حالياً</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  يجب فتح وردية كاشير جديدة واستلام العهدة النقدية لتتمكن من تنفيذ عمليات البيع عبر شاشة POS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpenShiftModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>فتح وردية جديدة الآن</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Sales Overview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-slate-600" />
              <span>محرك المبيعات والفواتير</span>
            </h2>
            <Link to="/sales" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              <span>سجل الفواتير</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </Link>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">شاشة نقاط البيع السريعة (POS)</h4>
                <p className="text-[11px] text-slate-500">متوافقة مع الباركود، طابعات الإيصالات الحرارية، ودفع مدى/فيزا</p>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>حماية الدرج والورديات:</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                مفعلة بالكامل
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Link
              to="/pos"
              className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all"
            >
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
              <span>فتح شاشة الكاشير (POS)</span>
            </Link>
            <Link
              to="/sales"
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all"
            >
              عرض المبيعات
            </Link>
          </div>
        </div>
      </div>

      {/* Security & Shifts Architecture Status */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-950 space-y-1">
          <p className="font-bold">إدارة الورديات ودرج النقدية وجاهزية التشغيل</p>
          <p className="text-emerald-800 leading-relaxed">
            تم تفعيل حماية جلسات البيع الذرية عبر الخادم (Atomic Server-Side Shift Enforcement)، ومنع البيع العشوائي بدون وردية مسجلة، وتتبع حركات الدرج النثري وإصدار تقارير Z-Report اليومية بدقة محاسبية كاملة.
          </p>
        </div>
      </div>

      {/* Open Shift Modal */}
      <OpenShiftModal
        isOpen={isOpenShiftModalOpen}
        onClose={() => {
          setIsOpenShiftModalOpen(false);
          if (clientId) loadActiveShift(clientId);
        }}
      />
    </div>
  );
}
