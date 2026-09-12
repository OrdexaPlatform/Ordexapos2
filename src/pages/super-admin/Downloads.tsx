import { useState } from 'react';
import { Download, Monitor, Laptop, CheckCircle2, ShieldCheck, HardDrive, RefreshCw, Copy, Check } from 'lucide-react';

export function Downloads() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloads = [
    {
      id: 'installer',
      title: 'مثبّت نظام سطح المكتب (Windows Setup)',
      filename: 'Ordexa-POS-Desktop-Setup.exe',
      path: '/downloads/Ordexa-POS-Desktop-Setup.exe',
      description: 'حزمة التثبيت الرسمية التلقائية لنظام Windows 10/11 مع اختصارات سطح المكتب وتحديثات مدمجة.',
      badge: 'موصى به',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      type: 'EXE Installer',
      size: '186 KB',
      compatibility: 'Windows 10 / 11 (64-bit)',
      icon: Monitor,
    },
    {
      id: 'portable-zip',
      title: 'النسخة المحمولة الشاملة (Windows Portable Zip)',
      filename: 'Ordexa-POS-Windows-Portable.zip',
      path: '/downloads/Ordexa-POS-Windows-Portable.zip',
      description: 'نسخة مدمجة كاملة تعمل مباشرة دون الحاجة لأي تثبيت أو صلاحيات مدير، جاهزة للتشغيل الفوري من فلاش ميموري.',
      badge: 'نسخة محمولة',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      type: 'ZIP Archive',
      size: '49 MB',
      compatibility: 'جميع أنظمة Windows 64-bit',
      icon: Laptop,
    },
    {
      id: 'portable-tar',
      title: 'حزمة مستقلة مضغوطة (Standalone Tarball)',
      filename: 'Ordexa-POS-Windows-x64.tar.gz',
      path: '/downloads/Ordexa-POS-Windows-x64.tar.gz',
      description: 'حزمة إلكترون المستقلة الكاملة (win-unpacked) للنشر والتشغيل المباشر.',
      badge: 'أرشيف مضغوط',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
      type: 'TAR.GZ',
      size: '49 MB',
      compatibility: 'Windows x64 Binaries',
      icon: HardDrive,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">مركز تحميل تطبيق سطح المكتب (Desktop Apps)</h2>
          <p className="text-sm text-slate-500 mt-1">
            حمّل أحدث إصدارات تطبيق Ordexa POS المخصص لنقاط البيع مع دعم الطابعات الحرارية والعمل بدون إنترنت وربط الأجهزة.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {downloads.map((item) => {
          const Icon = item.icon;
          const fullUrl = `${window.location.origin}${item.path}`;

          return (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">{item.description}</p>

                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-xs text-slate-600 mb-4 border border-slate-100 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">نوع الحزمة:</span>
                    <span className="font-semibold text-slate-700">{item.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">الحجم التقريبي:</span>
                    <span className="font-semibold text-slate-700">{item.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">التوافق:</span>
                    <span className="font-semibold text-slate-700">{item.compatibility}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <a
                  href={item.path}
                  download={item.filename}
                  className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 active:scale-[0.99] transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل الملف المباشر</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleCopy(fullUrl, item.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-100 transition-colors"
                >
                  {copied === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">تم نسخ الرابط!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>نسخ رابط التنزيل للعميل</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Instructions & Features */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800">
        <h4 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>مزايا النسخة المخصصة لسطح المكتب (Desktop Native App)</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60">
            <h5 className="font-bold text-white mb-1">طباعة حرارية صامتة وفورية</h5>
            <p className="text-slate-400">طباعة إيصالات الكاشير وباركود الفواتير مباشرة على طابعات ESC/POS عبر USB والشبكة دون ظهور نافذة المتصفح.</p>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60">
            <h5 className="font-bold text-white mb-1">بصمة جهاز ثابتة وعالية الأمان</h5>
            <p className="text-slate-400">توليد معرّف الجهاز Hardware Fingerprint المستخرج من اللوحة الأم وBIOS لمنع تكرار أو سرقة التراخيص.</p>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60">
            <h5 className="font-bold text-white mb-1">استقرار تام وعمل أوفلاين</h5>
            <p className="text-slate-400">حفظ تلقائي للفواتير والورديات محلياً في حالة انقطاع شبكة الإنترنت والمزامنة التلقائية فور عودة الاتصال.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
