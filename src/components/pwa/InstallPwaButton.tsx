import React, { useState, useEffect } from 'react';
import { 
  Download, 
  CheckCircle2, 
  Smartphone, 
  Laptop, 
  Share2, 
  PlusSquare, 
  X, 
  HelpCircle,
  Sparkles,
  WifiOff
} from 'lucide-react';
import { 
  promptPwaInstall, 
  subscribeToInstallPrompt, 
  isPwaStandalone 
} from '../../lib/pwa/pwaService';
import { isElectronApp } from '../../lib/electronBridge';
import toast from 'react-hot-toast';

interface InstallPwaButtonProps {
  clientName?: string;
  clientCode?: string;
  variant?: 'hero' | 'compact' | 'header';
  className?: string;
}

export const InstallPwaButton: React.FC<InstallPwaButtonProps> = ({
  clientName,
  clientCode,
  variant = 'hero',
  className = '',
}) => {
  const [canDirectInstall, setCanDirectInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem('ordexa_pwa_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'desktop' | 'android' | 'ios'>('desktop');

  useEffect(() => {
    const standaloneMode = isPwaStandalone() || isElectronApp();
    setIsStandalone(standaloneMode);
    const unsubscribe = subscribeToInstallPrompt((canInstall) => {
      setCanDirectInstall(canInstall);
    });
    return () => unsubscribe();
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('ordexa_pwa_dismissed', 'true');
    } catch {}
  };

  const handleInstallClick = async () => {
    if (isStandalone) {
      toast.success('تطبيق الكاشير مثبت بالفعل ويعمل كبرنامج مستقل');
      return;
    }

    if (canDirectInstall) {
      const outcome = await promptPwaInstall();
      if (outcome === 'accepted') {
        toast.success('جارٍ تثبيت تطبيق الكاشير على جهازك...');
        setIsStandalone(true);
      } else if (outcome === 'dismissed') {
        toast('تم إلغاء التثبيت مؤقتاً', { icon: 'ℹ️' });
      } else {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  // If already running as installed PWA, standalone, or native, completely hide PWA Install UI
  if (isStandalone || isDismissed) {
    return null;
  }

  // Header / Compact Variant
  if (variant === 'header' || variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all active:scale-95 ${className}`}
          title="تثبيت نظام الكاشير للعمل أوفلاين"
        >
          <Download className="h-3.5 w-3.5" />
          <span>تحميل الكاشير أوفلاين</span>
        </button>

        {showGuideModal && renderGuideModal()}
      </>
    );
  }

  // Primary Hero Variant (Used on /pos/:clientCode landing & login)
  return (
    <>
      <div className={`w-full bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 p-5 sm:p-6 rounded-2xl border border-indigo-500/30 shadow-xl text-white relative overflow-hidden ${className}`}>
        {/* Close / Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors z-20"
          title="إخفاء هذه الرسالة"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Subtle background glow */}
        <div className="absolute top-0 end-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-medium mb-3">
            <WifiOff className="h-3.5 w-3.5 text-indigo-300" />
            <span>يعمل بالكامل حتى عند انقطاع الإنترنت</span>
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-white mb-2">
            برنامج الكاشير المخصص لمنشأتك
          </h3>

          <p className="text-sm text-slate-300 max-w-md mb-5 leading-relaxed">
            يمكنك تثبيت الكاشير على هذا الجهاز وتشغيله كبرنامج مستقل وسريع حتى بدون اتصال بالإنترنت.
          </p>

          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Download className="h-5 w-5" />
            <span>اضغط هنا لتحميل برنامج الكاشير الخاص بك للعمل أوفلاين</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-300 transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>كيف أقوم بتثبيت الكاشير على هذا الجهاز؟</span>
          </button>
        </div>
      </div>

      {showGuideModal && renderGuideModal()}
    </>
  );

  function renderGuideModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" dir="rtl">
        <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-slate-900">
                  تثبيت برنامج الكاشير {clientName ? `(${clientName})` : ''}
                </h4>
                <p className="text-xs text-slate-500">طريقة تثبيت نظام نقطة البيع ليعمل بدون إنترنت</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50/50 p-2 gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
                activeTab === 'desktop'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Laptop className="h-4 w-4" />
              <span>الكمبيوتر / ويندوز</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('android')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
                activeTab === 'android'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>أندرويد / تابلت</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
                activeTab === 'ios'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Share2 className="h-4 w-4" />
              <span>آيفون / آيباد</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="p-6 space-y-4 text-sm text-slate-700">
            {activeTab === 'desktop' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">من متصفح Chrome أو Edge:</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      انظر إلى أقصى يسار شريط العنوان (URL bar) بالأعلى، ستجد أيقونة تثبيت <span className="font-bold">🖥️ (Install)</span> أو زر التثبيت.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">اضغط على "تثبيت" (Install):</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      سيتم تثبيت التطبيق وإضافة أيقونة الكاشير على سطح المكتب وشريط المهام.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">التشغيل أوفلاين:</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      يمكنك تشغيل الكاشير مباشرة بالنقر المزدوج على أيقونة سطح المكتب دون الحاجة لفتح المتصفح يدوياً.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'android' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">فتح القائمة:</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      اضغط على أيقونة الثلاث نقاط (⋮) في أعلى زاوية متصفح Chrome.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">تثبيت التطبيق:</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      اختر <span className="font-bold">"تثبيت التطبيق"</span> أو <span className="font-bold">"الإضافة إلى الشاشة الرئيسية"</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ios' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">زر المشاركة في Safari:</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      اضغط على زر المشاركة (Share icon <span className="font-bold">⎘</span>) أسفل شاشة Safari.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">إضافة إلى الشاشة الرئيسية:</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      مرر للأسفل واختر <span className="font-bold">"إضافة إلى الصفحة الرئيسية" (Add to Home Screen)</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                سيفتح التطبيق المثبت دائماً على نقطة البيع الخاصة بمنشأتك مباشرة ويحفظ البيانات محلياً.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success('تم نسخ رابط نقطة البيع');
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              نسخ رابط نقطة البيع
            </button>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
            >
              فهمت، إغلاق
            </button>
          </div>
        </div>
      </div>
    );
  }
};
