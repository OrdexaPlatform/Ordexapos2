import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { LogOut, MonitorCheck, Shield, User, Building, Download, Monitor } from 'lucide-react';
import { ClientUserRole } from '../../types';

export function ClientHeader() {
  const { clientUser, signOut } = useAuthStore();
  const { client } = useClientStore();
  const { isActivated, deviceName, fingerprint } = useDeviceStore();
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const getRoleLabel = (role?: ClientUserRole | string) => {
    switch (role) {
      case 'owner':
        return { label: 'مالك المنشأة', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'admin':
        return { label: 'مدير النظام', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'manager':
        return { label: 'مدير فرع', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'cashier':
        return { label: 'كاشير', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'inventory':
        return { label: 'مسؤول مخزون', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'accountant':
        return { label: 'محاسب', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
      default:
        return { label: role || 'مستخدم', color: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  const roleInfo = getRoleLabel(clientUser?.role);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6 lg:px-8">
        {/* Business Name & Breadcrumb */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            <Building className="h-5 w-5 text-indigo-600" />
            <span>{client?.business_name || 'نظام إدارة نقاط البيع'}</span>
          </div>
        </div>

        {/* Center/Right Status Badges & User Profile */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Desktop App Download Button */}
          <button
            type="button"
            onClick={() => setShowDownloadModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-sm"
            title="تحميل برنامج سطح المكتب للكمبيوتر"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">تحميل نسخة الكمبيوتر</span>
          </button>

          {/* Device Status Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <MonitorCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>جهاز نشط:</span>
            <span className="font-semibold">{deviceName}</span>
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100/80 px-1 rounded">
              {fingerprint.slice(0, 10)}...
            </span>
          </div>

          {/* Vertical divider */}
          <div className="hidden sm:block h-5 w-px bg-slate-200" />

          {/* User Info & Role */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-xs">
              <User className="h-4 w-4" />
            </div>
            <div className="flex flex-col text-start">
              <span className="text-xs font-bold text-slate-900 leading-tight">
                {clientUser?.name || 'مستخدم نقطة البيع'}
              </span>
              <span
                className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold border ${roleInfo.color} w-fit`}
              >
                {roleInfo.label}
              </span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-red-700 hover:border-red-200 shadow-sm transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">برنامج Ordexa POS المكتبي</h3>
                  <p className="text-xs text-slate-500">اختر النسخة المناسبة لنظام التشغيل الخاص بك</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Installer */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">مثبت ويندوز (Windows Setup)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">موصى به</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">تثبيت تلقائي وإنشاء أيقونة سطح المكتب</p>
                </div>
                <a
                  href="/downloads/Ordexa-POS-Desktop-Setup.exe"
                  download="Ordexa-POS-Desktop-Setup.exe"
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تثبيت .EXE</span>
                </a>
              </div>

              {/* Portable ZIP */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">النسخة المحمولة (Portable Zip)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">تشغيل فوري</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">بدون تثبيت - فك الضغط وافتح التطبيق فوراً</p>
                </div>
                <a
                  href="/downloads/Ordexa-POS-Windows-Portable.zip"
                  download="Ordexa-POS-Windows-Portable.zip"
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل .ZIP (49 MB)</span>
                </a>
              </div>
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center gap-2">
              <span>💡</span>
              <span>يدعم التطبيق الطباعة الحرارية الصامتة لجميع طابعات الكاشير وحفظ الفواتير أوفلاين.</span>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
