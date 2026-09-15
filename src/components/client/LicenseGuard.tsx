import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useClientStore } from '../../store/clientStore';
import { useAuthStore } from '../../store/authStore';
import { ShieldAlert, AlertTriangle, XCircle, Clock, LogOut, RefreshCw, Layers } from 'lucide-react';
import { format } from 'date-fns';

interface LicenseGuardProps {
  children: React.ReactNode;
}

export function LicenseGuard({ children }: LicenseGuardProps) {
  const location = useLocation();
  const { client, license, effectiveLicenseStatus, loading, loadClient } = useClientStore();
  const { signOut, isSuperAdmin } = useAuthStore();
  const [reloading, setReloading] = React.useState(false);

  // Super Admin bypass: Super Admins are never blocked by Client License checks
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  const handleRefresh = async () => {
    if (client?.id) {
      setReloading(true);
      await loadClient(client.id);
      setReloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-9 w-9 border-4 border-slate-200 border-t-slate-800" />
          <p className="mt-4 text-sm font-medium text-slate-600">جارٍ التحقق من صلاحية الترخيص والاشتراك...</p>
        </div>
      </div>
    );
  }

  // Active license - allow through
  if (effectiveLicenseStatus === 'active') {
    return <>{children}</>;
  }

  // License Exception: Users can always navigate to /shifts to close their current shift if one was open
  if (location.pathname.startsWith('/shifts')) {
    return <>{children}</>;
  }

  // Determine license state styling and messaging
  let title = 'الترخيص غير صالح';
  let description = 'لا يمكن تشغيل نقطة البيع لعدم توفر ترخيص نشط صالح للاستخدام.';
  let Icon = AlertTriangle;
  let bannerBg = 'bg-amber-50 border-amber-200 text-amber-900';
  let iconBg = 'bg-amber-500 text-white';

  if (effectiveLicenseStatus === 'expired') {
    title = 'انتهت صلاحية ترخيص المنشأة';
    description = `انتهت صلاحية اشتراك المنشأة في ${
      license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : 'تاريخ سابق'
    }. يرجى تجديد الاشتراك لمواصلة عمليات البيع.`;
    Icon = Clock;
    bannerBg = 'bg-rose-50 border-rose-200 text-rose-900';
    iconBg = 'bg-rose-500 text-white';
  } else if (effectiveLicenseStatus === 'suspended') {
    title = 'تم إيقاف الترخيص مؤقتاً';
    description = 'تم إيقاف هذا الترخيص مؤقتاً من قبل الإدارة. يرجى مراجعة إدارة الدعم الفني أو المحاسبة.';
    Icon = ShieldAlert;
    bannerBg = 'bg-amber-50 border-amber-200 text-amber-900';
    iconBg = 'bg-amber-500 text-white';
  } else if (effectiveLicenseStatus === 'revoked') {
    title = 'تم إلغاء الترخيص نهائياً';
    description = 'تم إلغاء رخصة هذه المنشأة بصورة نهائية. يرجى التواصل مع مزود الخدمة لتسوية الحساب.';
    Icon = XCircle;
    bannerBg = 'bg-red-50 border-red-200 text-red-900';
    iconBg = 'bg-red-600 text-white';
  } else if (effectiveLicenseStatus === 'no_license') {
    title = 'لم يتم إصدار ترخيص للمنشأة بعد';
    description = 'لا يوجد أي ترخيص مسجل لهذه المنشأة في الوقت الحالي. يرجى إنشاء وترقية ترخيص العميل أولاً.';
    Icon = AlertTriangle;
    bannerBg = 'bg-slate-50 border-slate-200 text-slate-800';
    iconBg = 'bg-slate-600 text-white';
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6" dir="rtl">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Banner */}
        <div className={`p-6 text-center border-b ${bannerBg}`}>
          <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${iconBg} shadow-md mb-3`}>
            <Icon className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>

        {/* Info card */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">اسم المنشأة:</span>
              <span className="font-bold text-slate-900">{client?.business_name || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60">
              <span className="text-slate-500">كود المنشأة:</span>
              <span className="font-mono font-bold text-slate-800">{client?.client_code || 'غير محدد'}</span>
            </div>
            {license?.license_key && (
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500">مفتاح الترخيص:</span>
                <span className="font-mono text-slate-700">{license.license_key}</span>
              </div>
            )}
            {license?.expiry_date && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">تاريخ الانتهاء:</span>
                <span className="font-bold text-slate-900">{format(new Date(license.expiry_date), 'yyyy-MM-dd')}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={reloading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
                <span>إعادة التحقق من الترخيص</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>خروج</span>
              </button>
            </div>

            <Link
              to="/shifts"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 font-medium text-xs hover:bg-amber-100 transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>الانتقال لشاشة الورديات لإغلاق الوردية الحالية (Close Active Shift)</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
