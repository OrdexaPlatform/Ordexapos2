import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Layers, AlertCircle, Building2, Calendar, FileText } from 'lucide-react';
import { Client, BuildStatus } from '../../types';

const semverRegex = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/;

const buildFormSchema = z.object({
  clientId: z.string().optional(),
  version: z
    .string()
    .min(1, 'رقم الإصدار مطلوب')
    .regex(semverRegex, 'صيغة الإصدار يجب أن تكون مثل 1.0.0 أو 1.2.3'),
  releaseDate: z.string().min(1, 'تاريخ الإصدار مطلوب'),
  minimumSupportedVersion: z
    .string()
    .optional()
    .refine((val) => !val || semverRegex.test(val), {
      message: 'الحد الأدنى للإصدار يجب أن يكون بصيغة مثل 1.0.0',
    }),
  releaseNotes: z.string().optional(),
  status: z.enum(['draft', 'building', 'ready']),
});

type BuildFormData = z.infer<typeof buildFormSchema>;

interface CreateBuildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BuildFormData) => Promise<void>;
  clients: Client[];
  initialClientId?: string;
}

export function CreateBuildModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  initialClientId,
}: CreateBuildModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BuildFormData>({
    resolver: zodResolver(buildFormSchema),
    defaultValues: {
      clientId: initialClientId || '',
      version: '1.0.0',
      releaseDate: new Date().toISOString().split('T')[0],
      minimumSupportedVersion: '1.0.0',
      releaseNotes: '',
      status: 'draft',
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      reset({
        clientId: initialClientId || '',
        version: '1.0.0',
        releaseDate: new Date().toISOString().split('T')[0],
        minimumSupportedVersion: '1.0.0',
        releaseNotes: '',
        status: 'draft',
      });
    }
  }, [isOpen, initialClientId, reset]);

  if (!isOpen) return null;

  const handleFormSubmit = async (data: BuildFormData) => {
    await onSubmit(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">إنشاء إصدار جديد (New Build)</h3>
              <p className="text-xs text-slate-500">تسجيل وتجهيز نسخة جديدة من Ordexa POS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
          {/* Client Selection (Optional for client-specific build or general) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              العميل المخصص (Client)
            </label>
            <div className="relative">
              <Building2 className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                {...register('clientId')}
                className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
              >
                <option value="">نسخة عامة (General Release / All Clients)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name} ({c.client_code}) - {c.customer_name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              اختر عميلاً إذا كان هذا الإصدار مخصصاً بهويته وإعداداته التجارية.
            </p>
          </div>

          {/* Version and Minimum Supported Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الإصدار (Version) *
              </label>
              <input
                {...register('version')}
                placeholder="1.0.0"
                dir="ltr"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              {errors.version && (
                <p className="mt-1 text-xs text-rose-500">{errors.version.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الحد الأدنى المدعوم (Min Version)
              </label>
              <input
                {...register('minimumSupportedVersion')}
                placeholder="1.0.0"
                dir="ltr"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              {errors.minimumSupportedVersion && (
                <p className="mt-1 text-xs text-rose-500">
                  {errors.minimumSupportedVersion.message}
                </p>
              )}
            </div>
          </div>

          {/* Release Date & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تاريخ الإصدار (Release Date) *
              </label>
              <div className="relative">
                <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  {...register('releaseDate')}
                  className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              {errors.releaseDate && (
                <p className="mt-1 text-xs text-rose-500">{errors.releaseDate.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الحالة المبدئية (Initial Status)
              </label>
              <select
                {...register('status')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="draft">مسودة (Draft)</option>
                <option value="building">قيد التجهيز (Building)</option>
                <option value="ready">جاهز (Ready)</option>
              </select>
            </div>
          </div>

          {/* Release Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات الإصدار (Release Notes)
            </label>
            <div className="relative">
              <textarea
                {...register('releaseNotes')}
                rows={3}
                placeholder="أبرز التحسينات أو التحديثات في هذا الإصدار..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
          </div>

          {/* Guidance Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
            <p>
              سيتم تسجيل الإصدار في قاعدة البيانات لتجهيز ملف الإعدادات الخاص بالعميل. لن يتم إنشاء ملفات تثبيت تنفيذية في هذه المرحلة.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
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
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'إنشاء الإصدار'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
