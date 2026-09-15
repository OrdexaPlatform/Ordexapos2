import React, { useEffect, useState } from 'react';
import { 
  Monitor, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Info,
  Server,
  FileCode,
  HardDrive
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ImageUploadPicker } from '../../components/common/ImageUploadPicker';
import { 
  getPlatformWindowsIconInfo, 
  savePlatformWindowsIcon, 
  resetPlatformWindowsIcon,
  PlatformIconInfo,
  DEFAULT_PLATFORM_ICON_URL
} from '../../lib/platformBrandingService';

export function Settings() {
  const [platformIcon, setPlatformIcon] = useState<PlatformIconInfo>({
    iconUrl: DEFAULT_PLATFORM_ICON_URL,
    isCustom: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    loadIconInfo();
  }, []);

  const loadIconInfo = async () => {
    setLoading(true);
    try {
      const info = await getPlatformWindowsIconInfo();
      setPlatformIcon(info);
    } catch (err) {
      console.error('Failed to load platform icon info:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleIconChange = async (dataUrl: string, file: File) => {
    setSaving(true);
    const toastId = toast.loading('جاري حفظ أيقونة منصة Ordexa للـ Windows...');
    try {
      const res = await savePlatformWindowsIcon(file);
      if (res.success && res.iconInfo) {
        setPlatformIcon(res.iconInfo);
        toast.success(res.message || 'تم تحديث أيقونة المنصة بنجاح', { id: toastId });
      } else {
        toast.error(res.message || 'فشل في حفظ الأيقونة', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء حفظ الأيقونة', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleResetIcon = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف الشعار المخصص واستعادة أيقونة Ordexa الافتراضية؟')) {
      return;
    }

    setSaving(true);
    const toastId = toast.loading('جاري استعادة الأيقونة الافتراضية...');
    try {
      const res = await resetPlatformWindowsIcon();
      if (res.success) {
        setPlatformIcon({
          iconUrl: DEFAULT_PLATFORM_ICON_URL,
          isCustom: false,
        });
        toast.success(res.message, { id: toastId });
      } else {
        toast.error(res.message, { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء استعادة الأيقونة', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>لوحة تحكم مسؤول النظام (Super Admin)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            إعدادات المنصة وهوية النظام
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إدارة الهوية الموحدة لبرنامج كاشير Windows والإعدادات العامة للمنصة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>نظام Ordexa POS متصل ونشط</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: Platform Windows Branding (هوية برنامج Windows) */}
      <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Monitor className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                هوية برنامج Windows
              </h2>
              <p className="text-xs text-slate-500">
                إدارة شعار الأيقونة الثابتة لتطبيق Windows الموحد لجميع العملاء.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
              <span>Platform Branding (Unified Build)</span>
            </span>
          </div>
        </div>

        {/* Informational Guidance Box */}
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-950 flex items-start gap-3 leading-relaxed">
          <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-indigo-900">
              قاعدة الفصل بين هوية المنصة وهوية العميل:
            </p>
            <p className="text-slate-700">
              شعار Ordexa هنا يمثل <strong>Platform Windows Icon</strong>، وهو الأيقونة الثابتة لملف التثبيت (Installer) وشريط المهام (Taskbar) لبرنامج Windows لجميع العملاء. 
              أما <strong>شعار العميل (Client Logo)</strong> فيتم تعيينه من صفحة المنشأة ويظهر ديناميكياً داخل البرنامج بعد تسجيل الدخول (في الشاشات، الفواتير، ونقطة البيع).
            </p>
          </div>
        </div>

        {/* Windows Icon Uploader */}
        <div className="space-y-4">
          <ImageUploadPicker
            label="شعار أيقونة البرنامج (Platform Windows Icon)"
            description="ارفع الأيقونة الرسمية لمنصة Ordexa POS التي ستظهر في شريط مهام Windows ونافذة التطبيق."
            value={platformIcon.iconUrl}
            defaultValueUrl={DEFAULT_PLATFORM_ICON_URL}
            isCustom={platformIcon.isCustom}
            onChange={handleIconChange}
            onRemove={platformIcon.isCustom ? handleResetIcon : undefined}
            disabled={saving || loading}
            aspectRatio="square"
            maxWidth={512}
            maxHeight={512}
            badgeText="أيقونة Windows الموحدة"
            helperNote="ارفع ملف صورة (PNG, JPG, WEBP, ICO) من جهازك مباشرة. الحجم الموصى به: 256×256 أو 512×512 بكسل بخلفية شفافة."
          />
        </div>

        {/* Technical Specification details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 block mb-0.5">نوع الحزمة (Target)</span>
            <span className="font-bold text-slate-800">Unified Windows POS (NSIS & Portable)</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 block mb-0.5">مسار الأيقونة بالنظام</span>
            <span className="font-mono text-slate-700 text-[11px] ltr block text-left">public/assets/ordexa-icon.png</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 block mb-0.5">حالة التخصيص الحالية</span>
            <span className={`font-bold ${platformIcon.isCustom ? 'text-emerald-700' : 'text-slate-600'}`}>
              {platformIcon.isCustom ? 'أيقونة مخصصة محفوطة بنجاح' : 'أيقونة Ordexa الرسمية الافتراضية'}
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 2: Platform System Overview */}
      <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-slate-200 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Server className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              معلومات البنية التحتية للمنصة
            </h3>
            <p className="text-xs text-slate-500">
              تكامل قاعدة البيانات والتخزين وتراخيص الأجهزة الموحدة.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <HardDrive className="h-4 w-4 text-indigo-600" />
              <span>تخزين شعارات المنشآت</span>
            </div>
            <p className="text-sm font-bold text-slate-900">Database Optimized DataURL</p>
            <p className="text-[11px] text-slate-500">عزل تام لكل منشأة حسب Client ID</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <FileCode className="h-4 w-4 text-indigo-600" />
              <span>محرك Windows POS</span>
            </div>
            <p className="text-sm font-bold text-slate-900">Electron 44 + Node Native</p>
            <p className="text-[11px] text-slate-500">ميزة التشغيل دون إنترنت (Offline-First)</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <span>بصمة الجهاز والترخيص</span>
            </div>
            <p className="text-sm font-bold text-slate-900">Hardware Fingerprint SHA256</p>
            <p className="text-[11px] text-slate-500">محمية ولا تتأثر بتحديثات الهوية</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <Layers className="h-4 w-4 text-indigo-600" />
              <span>بناء الإصدارات</span>
            </div>
            <p className="text-sm font-bold text-slate-900">Single Universal Package</p>
            <p className="text-[11px] text-slate-500">لا حاجة لإعادة البناء لكل عميل</p>
          </div>
        </div>
      </section>
    </div>
  );
}
