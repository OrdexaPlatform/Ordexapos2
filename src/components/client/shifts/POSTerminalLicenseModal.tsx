import React, { useState, useEffect } from 'react';
import { 
  Laptop, 
  Key, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  Lock, 
  X,
  Cpu,
  Calendar,
  Layers
} from 'lucide-react';
import { useDeviceStore } from '../../../store/deviceStore';
import { useClientStore } from '../../../store/clientStore';
import toast from 'react-hot-toast';

interface POSTerminalLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

export const POSTerminalLicenseModal: React.FC<POSTerminalLicenseModalProps> = ({
  isOpen,
  onClose,
  clientId,
}) => {
  const { 
    fingerprint, 
    deviceName, 
    operatingSystem, 
    appVersion, 
    device, 
    status, 
    isActivated, 
    licenseValidation,
    registerTerminal,
    deactivateTerminal,
    validateLicense,
    initializeDevice
  } = useDeviceStore();

  const { license: clientLicense } = useClientStore();

  const [inputDeviceName, setInputDeviceName] = useState<string>(deviceName);
  const [inputLicenseKey, setInputLicenseKey] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setInputDeviceName(device?.device_name || deviceName || 'نقطة البيع الرئيسية');
      setInputLicenseKey(clientLicense?.license_key || licenseValidation?.license?.license_key || '');
      setConfirmDeactivate(false);
      if (clientId) {
        validateLicense(clientId);
      }
    }
  }, [isOpen, clientId, device, deviceName, clientLicense, licenseValidation]);

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(fingerprint);
    setIsCopied(true);
    toast.success('تم نسخ البصمة الرقمية للجهاز');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      toast.error('لم يتم تحديد المنشأة');
      return;
    }

    const keyToUse = inputLicenseKey.trim() || clientLicense?.license_key;
    if (!keyToUse) {
      toast.error('يرجى إدخال مفتاح ترخيص صالح');
      return;
    }

    if (!inputDeviceName.trim()) {
      toast.error('يرجى إدخال اسم مميز لهذا الجهاز');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await registerTerminal(clientId, keyToUse, inputDeviceName.trim());
      if (res.success) {
        toast.success(res.message);
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل الجهاز');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!clientId) return;
    setIsSubmitting(true);
    try {
      const res = await deactivateTerminal(clientId, 'تم إلغاء التفعيل من واجهة الكاشير');
      if (res.success) {
        toast.success('تم إلغاء تفعيل هذا الجهاز وتحرير المقعد');
        setConfirmDeactivate(false);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل إلغاء التفعيل');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    if (clientId) {
      setIsSubmitting(true);
      await initializeDevice(clientId);
      setIsSubmitting(false);
      toast.success('تم تحديث حالة الجهاز والترخيص');
    }
  };

  if (!isOpen) return null;

  const effectiveLicense = licenseValidation?.license || clientLicense;
  const computedDaysLeft = effectiveLicense?.days_left ?? (
    effectiveLicense?.expiry_date 
      ? Math.ceil((new Date(effectiveLicense.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0
  );
  const isExpired = effectiveLicense 
    ? computedDaysLeft <= 0 || effectiveLicense.status === 'expired' 
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        id="pos-terminal-license-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
              isActivated 
                ? 'bg-emerald-50 text-emerald-600' 
                : 'bg-amber-50 text-amber-600'
            }`}>
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                حالة ترخيص نقطة البيع والجهاز (POS Terminal)
              </h3>
              <p className="text-xs text-slate-500">
                إدارة ترخيص الجهاز وبصمة العتاد والربط بنقطة البيع
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isSubmitting}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Status Alert Banner */}
          {isActivated ? (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold block text-sm">هذا الجهاز مفعل ومسجل كجهاز كاشير معتمد</span>
                <span className="text-emerald-700">
                  يمكنك إجراء عمليات البيع وفتح الورديات ومزامنة حركة الصندوق بشكل طبيعي.
                </span>
              </div>
            </div>
          ) : isExpired ? (
            <div className="flex items-start gap-3 p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold block text-sm">ترخيص المنشأة منتهي الصلاحية</span>
                <span className="text-rose-700">
                  انتهت فترة الاشتراك لهذا الترخيص. يرجى التواصل مع الإدارة لتجديد الاشتراك لاستئناف البيع.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold block text-sm">هذا الجهاز غير مسجل حالياً كنقطة بيع نشطة</span>
                <span className="text-amber-700">
                  قم بتسجيل هذا المتصفح/الجهاز ضمن الحصة المتاحة لترخيص منشأتك لتفعيل عمليات الكاشير.
                </span>
              </div>
            </div>
          )}

          {/* Section: License Overview */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-indigo-600" />
                بيانات ترخيص المنشأة
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                effectiveLicense?.status === 'active' && !isExpired
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {effectiveLicense?.status === 'active' && !isExpired
                  ? 'نشط وصالح'
                  : isExpired
                  ? 'منتهي'
                  : effectiveLicense?.status || 'غير معروف'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">مفتاح الترخيص</span>
                <span className="font-mono font-bold text-slate-800 break-all select-all">
                  {effectiveLicense?.license_key || 'لا يوجد'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">نوع الباقة</span>
                <span className="font-semibold text-slate-700 capitalize">
                  {effectiveLicense?.license_type || 'قياسي'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">المقاعد والأجهزة</span>
                <span className="font-mono font-bold text-indigo-700">
                  {effectiveLicense?.activated_devices || 0} / {effectiveLicense?.max_devices || 1} أجهزة
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">تاريخ الانتهاء</span>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {effectiveLicense?.expiry_date 
                    ? new Date(effectiveLicense.expiry_date).toLocaleDateString('ar-SA')
                    : 'غير محدد'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">الأيام المتبقية</span>
                <span className={`font-black font-mono ${
                  computedDaysLeft <= 7 
                    ? 'text-rose-600' 
                    : 'text-emerald-700'
                }`}>
                  {computedDaysLeft} يوم
                </span>
              </div>
            </div>
          </div>

          {/* Section: Terminal Hardware Details */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-slate-600" />
                بيانات هذا الجهاز (Current Terminal)
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                isActivated
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {isActivated ? 'معتمد ومقترن' : 'غير مقترن'}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="overflow-hidden mr-2">
                  <span className="text-slate-400 block text-[10px]">البصمة الرقمية للعتاد (Device Fingerprint)</span>
                  <span className="font-mono font-bold text-slate-800 text-xs truncate block">
                    {fingerprint}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyFingerprint}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors flex items-center gap-1 text-[11px] shrink-0"
                  title="نسخ البصمة"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">نظام التشغيل والبيئة</span>
                  <span className="font-semibold text-slate-700 truncate block">{operatingSystem}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">إصدار تطبيق الكاشير</span>
                  <span className="font-mono font-semibold text-slate-700 block">v{appVersion}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Registration or Deactivation Actions */}
          {!isActivated ? (
            /* Register Device Form */
            <form onSubmit={handleRegister} className="bg-white border border-indigo-100 p-4 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>تسجيل هذا الجهاز كنقطة بيع معتمدة</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الجهاز / شاشة نقطة البيع <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={inputDeviceName}
                    onChange={(e) => setInputDeviceName(e.target.value)}
                    placeholder="مثال: كاشير الاستقبال 1 أو كاشير الدور الأرضي"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    مفتاح الترخيص <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={inputLicenseKey}
                    onChange={(e) => setInputLicenseKey(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>تأكيد وتسجيل الجهاز الآن</span>
              </button>
            </form>
          ) : (
            /* Deactivate Device Section */
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">إلغاء تفعيل هذا الجهاز</span>
                <span className="text-[11px] text-slate-500">
                  يؤدي ذلك إلى فك ارتباط هذا المتصفح وتركه متاحاً لجهاز آخر.
                </span>
              </div>

              {confirmDeactivate ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    نعم، ألغِ التفعيل
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeactivate(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                  >
                    تراجع
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(true)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition-colors"
                >
                  إلغاء التفعيل
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
