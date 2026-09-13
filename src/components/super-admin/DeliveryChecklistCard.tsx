import React from 'react';
import { CustomerPackageStatus } from '../../types/delivery';
import { 
  CheckCircle2, 
  Circle, 
  Building2, 
  Key, 
  UserCheck, 
  Eye, 
  DownloadCloud, 
  Sparkles, 
  ArrowLeft,
  ChevronLeft
} from 'lucide-react';

interface DeliveryChecklistCardProps {
  status: CustomerPackageStatus;
  onOpenNewLicenseModal: () => void;
  onOpenOwnerUserModal: () => void;
  onOpenPreview: () => void;
  onOpenDeliverySummary: () => void;
}

export function DeliveryChecklistCard({
  status,
  onOpenNewLicenseModal,
  onOpenOwnerUserModal,
  onOpenPreview,
  onOpenDeliverySummary,
}: DeliveryChecklistCardProps) {
  const steps = [
    {
      id: 'client_created',
      title: 'إنشاء ملف المنشأة والنشاط التجاري',
      description: 'تم تسجيل المنشأة والكود التعريفي وقاعدة البيانات.',
      isDone: status.clientCreated,
      actionText: null,
      action: null,
    },
    {
      id: 'license_configured',
      title: 'إصدار ترخيص فعال للأجهزة (License Key)',
      description: 'تخصيص رخصة سارية بعدد نقاط البيع المصرح بها.',
      isDone: status.licenseConfigured,
      actionText: 'إصدار ترخيص',
      action: onOpenNewLicenseModal,
    },
    {
      id: 'owner_created',
      title: 'تعيين حساب مدير المنشأة (Owner Account)',
      description: 'إنشاء حساب المالك الأول للدخول لنقاط البيع وإدارة الصلاحيات.',
      isDone: status.ownerCreated,
      actionText: 'إضافة مالك',
      action: onOpenOwnerUserModal,
    },
    {
      id: 'preview_ready',
      title: 'معاينة شاشة العميل ونقاط البيع (Client Preview)',
      description: 'فحص مظهر وهوية نقاط البيع والبيانات كما يراها العميل.',
      isDone: status.previewReviewed || status.previewReady,
      actionText: 'معاينة تجريبية',
      action: onOpenPreview,
    },
    {
      id: 'download_ready',
      title: 'جاهزية حزمة التنزيل المكتبي (Desktop Build)',
      description: 'النسخة المحمولة (Portable ZIP) ومثبت ويندوز (.EXE) جاهزة للتحميل.',
      isDone: status.downloadReady,
      actionText: null,
      action: null,
    },
  ];

  const completedSteps = steps.filter((s) => s.isDone).length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-right" dir="rtl">
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              قائمة جاهزية وتسليم حزمة العميل (Delivery Checklist)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            متابعة خطوات التجهيز لضمان تسليم نظام كاشير متكامل وخالٍ من الأخطاء.
          </p>
        </div>

        {/* Deliver Button */}
        <div>
          <button
            type="button"
            onClick={onOpenDeliverySummary}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>عرض ملف التسليم المكتمل للعميل</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-5 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <span>حالة الإنجاز:</span>
          <span className="text-indigo-600 font-bold">{progressPercent}%</span>
          <span className="text-slate-400 font-normal">({completedSteps} من {steps.length} مكتملة)</span>
        </div>
        <div className="w-48 bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div 
            className="bg-indigo-600 h-full transition-all duration-300 rounded-full" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="divide-y divide-slate-100">
        {steps.map((step, idx) => (
          <div 
            key={step.id} 
            className={`p-4 flex items-center justify-between transition-colors ${
              step.isDone ? 'bg-white' : 'bg-amber-50/20'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {step.isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Circle className="h-5 w-5 text-slate-300" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${step.isDone ? 'text-slate-900' : 'text-slate-800'}`}>
                    {step.title}
                  </span>
                  {step.isDone ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      مكتمل
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      مطلوب
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
              </div>
            </div>

            {/* Quick Action Button if pending */}
            {step.action && !step.isDone && (
              <button
                type="button"
                onClick={step.action}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shrink-0 transition-colors"
              >
                <span>{step.actionText}</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {step.action && step.isDone && step.id === 'preview_ready' && (
              <button
                type="button"
                onClick={step.action}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium shrink-0 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>فتح المعاينة</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
