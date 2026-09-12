import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Smartphone, Key, Monitor, Sparkles } from 'lucide-react';

const activationSchema = z.object({
  licenseKey: z.string().min(5, 'مفتاح الترخيص مطلوب'),
  deviceName: z.string().min(2, 'اسم الجهاز يجب ألا يقل عن حرفين'),
  deviceFingerprint: z.string().min(8, 'البصمة الرقمية للجهاز مطلوبة (8 أحرف على الأقل)'),
  operatingSystem: z.string().optional(),
  appVersion: z.string().optional(),
});

type ActivationFormData = z.infer<typeof activationSchema>;

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (data: ActivationFormData) => Promise<void>;
  prefilledLicenseKey?: string;
}

export function RegisterDeviceModal({
  isOpen,
  onClose,
  onRegister,
  prefilledLicenseKey,
}: RegisterDeviceModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ActivationFormData>({
    resolver: zodResolver(activationSchema),
    defaultValues: {
      licenseKey: prefilledLicenseKey || '',
      deviceName: 'POS Terminal 01',
      deviceFingerprint: '',
      operatingSystem: 'Windows 11 Pro 64-bit',
      appVersion: '1.0.0',
    },
  });

  React.useEffect(() => {
    if (prefilledLicenseKey) {
      setValue('licenseKey', prefilledLicenseKey);
    }
  }, [prefilledLicenseKey, setValue]);

  if (!isOpen) return null;

  // Helper to generate a realistic hardware fingerprint for simulation/testing
  const handleGenerateRandomFingerprint = () => {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    const hex = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    setValue('deviceFingerprint', `HWID-${hex.toUpperCase().slice(0, 24)}`);
  };

  const onSubmit = async (data: ActivationFormData) => {
    await onRegister(data);
    reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">تسجيل وتفعيل جهاز جديد</h3>
              <p className="text-xs text-slate-500">تطبيق قواعد الترخيص وفحص الحصة المسموحة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              مفتاح الترخيص (License Key) *
            </label>
            <div className="relative">
              <Key className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                {...register('licenseKey')}
                placeholder="ORD-XXXX-XXXX-XXXX-XXXX"
                dir="ltr"
                className="w-full pl-3 pr-9 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
              />
            </div>
            {errors.licenseKey && (
              <p className="mt-1 text-xs text-rose-500">{errors.licenseKey.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اسم الجهاز / نقطة البيع (Device Name) *
            </label>
            <input
              {...register('deviceName')}
              placeholder="مثال: كاشير 1 - الصالة الرئيسية"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {errors.deviceName && (
              <p className="mt-1 text-xs text-rose-500">{errors.deviceName.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                البصمة الرقمية للجهاز (Hardware Fingerprint) *
              </label>
              <button
                type="button"
                onClick={handleGenerateRandomFingerprint}
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                <span>توليد بصمة عشوائية</span>
              </button>
            </div>
            <input
              {...register('deviceFingerprint')}
              placeholder="مثال: HWID-9F8C2A11E4B..."
              dir="ltr"
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {errors.deviceFingerprint && (
              <p className="mt-1 text-xs text-rose-500">{errors.deviceFingerprint.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                نظام التشغيل
              </label>
              <input
                {...register('operatingSystem')}
                placeholder="Windows 11 / Ubuntu"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                نسخة التطبيق (App Version)
              </label>
              <input
                {...register('appVersion')}
                placeholder="1.0.0"
                dir="ltr"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700 mb-0.5">ضوابط التفعيل:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              <li>سيتم فحص حالة الترخيص وصلاحيته وتاريخ الانتهاء.</li>
              <li>سيتم التأكد من عدم تجاوز الحد الأقصى للأجهزة (max_devices).</li>
              <li>إذا كانت البصمة مسجلة مسبقاً، سيتم استرجاع الجهاز دون حجز مقعد مكرر.</li>
            </ul>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? 'جاري التحقق والتفعيل...' : 'تفعيل الجهاز'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
