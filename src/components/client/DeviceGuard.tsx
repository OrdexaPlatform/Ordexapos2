import React from 'react';
import { useDeviceStore } from '../../store/deviceStore';
import { useClientStore } from '../../store/clientStore';
import { useAuthStore } from '../../store/authStore';
import { MonitorX, RefreshCw, Copy, Check, ShieldAlert, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface DeviceGuardProps {
  children: React.ReactNode;
}

export function DeviceGuard({ children }: DeviceGuardProps) {
  const { status, fingerprint, isActivated, errorMessage, initializeDevice, registerTerminal } = useDeviceStore();
  const { client, license, effectiveLicenseStatus } = useClientStore();
  const { signOut, isSuperAdmin } = useAuthStore();
  const [copied, setCopied] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [activating, setActivating] = React.useState(false);

  // Super Admin bypass: Super Admins are never blocked by Device Activation or Device Fingerprint
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    toast.success('تم نسخ البصمة الرقمية للجهاز');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = async () => {
    setRefreshing(true);
    await initializeDevice(client?.id, license?.id);
    setRefreshing(false);
  };

  const handleManualActivate = async () => {
    if (!client?.id || !license?.license_key) {
      toast.error('بيانات الترخيص أو المنشأة غير مكتملة');
      return;
    }
    setActivating(true);
    try {
      const res = await registerTerminal(client.id, license.license_key);
      if (res.success) {
        toast.success('تم تسجيل وتفعيل الجهاز بنجاح!');
      } else {
        toast.error(res.message || 'تعذر تفعيل الجهاز');
      }
    } finally {
      setActivating(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-9 w-9 border-4 border-slate-200 border-t-slate-800" />
          <p className="mt-4 text-sm font-medium text-slate-600">جارٍ فحص صلاحية الجهاز وتصريح نقطة البيع...</p>
        </div>
      </div>
    );
  }

  // If the device is active and verified, render the POS app children
  if (isActivated && status === 'active') {
    return <>{children}</>;
  }

  // Blocked device state (Unregistered or Deactivated)
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6" dir="rtl">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header visual */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 p-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20 mb-3">
            <MonitorX className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">هذا الجهاز غير مفعل</h1>
          <p className="mt-1 text-sm text-slate-600">
            {status === 'deactivated'
              ? 'تم تعطيل تفعيل هذا الجهاز لنقطة البيع من قبل مسؤول النظام.'
              : 'نقطة البيع الحالية غير مصرح لها بالعمل حتى يتم تسجيل بصمة الجهاز وتفعيله.'}
          </p>
        </div>

        {/* Details Card */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Hardware fingerprint display */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">البصمة الرقمية للجهاز (Device Fingerprint):</span>
              <button
                type="button"
                onClick={handleCopyFingerprint}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>
            <div className="font-mono text-sm font-bold text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-300 select-all tracking-wider text-center ltr">
              {fingerprint}
            </div>
          </div>

          {/* Business & License info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">كود المنشأة:</span>
              <span className="font-bold text-slate-800 mt-0.5 block font-mono">
                {client?.client_code || 'غير محدد'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-500 block">حالة الترخيص:</span>
              <span className="font-bold text-slate-800 mt-0.5 block">
                {effectiveLicenseStatus === 'active'
                  ? 'ساري ونشط'
                  : effectiveLicenseStatus === 'expired'
                  ? 'منتهي الصلاحية'
                  : effectiveLicenseStatus === 'suspended'
                  ? 'موقوف'
                  : 'غير مسجل'}
              </span>
            </div>
          </div>

          {/* Instructions message or Quota Full Message */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5 leading-relaxed">
            {errorMessage?.includes('الحد الأقصى') ? (
              <div className="space-y-1 text-rose-700 font-medium">
                <p className="font-bold text-rose-800">تنبيه مقاعد الترخيص:</p>
                <p>{errorMessage}</p>
              </div>
            ) : (
              <>
                <p className="font-semibold text-slate-800">لتفعيل هذا الجهاز:</p>
                <p>
                  يمكنك الضغط على زر التفعيل المباشر أدناه، أو تزويد مسؤول النظام بالبصمة الرقمية الموضحة أعلاه ليتم إضافة الجهاز ضمن قائمة الأجهزة المصرح لها في المنشأة.
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 pt-2">
            {status === 'unregistered' && !errorMessage?.includes('الحد الأقصى') && license?.license_key && (
              <button
                type="button"
                onClick={handleManualActivate}
                disabled={activating}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                {activating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جارٍ تفعيل وربط الجهاز...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>تفعيل هذا الجهاز لنقطة البيع الآن</span>
                  </>
                )}
              </button>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRetry}
                disabled={refreshing}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>إعادة فحص التفعيل</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
