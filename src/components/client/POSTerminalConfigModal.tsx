import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Printer, 
  Cpu, 
  KeyRound, 
  Wifi, 
  WifiOff, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  Copy, 
  Monitor, 
  RefreshCw,
  HardDrive,
  Clock,
  ShieldCheck,
  Send
} from 'lucide-react';
import { useDeviceStore } from '../../store/deviceStore';
import { useSyncStore } from '../../lib/offline/syncEngine';
import { offlineStorage, OfflineSaleRecord } from '../../lib/offline/offlineStorage';
import { 
  getAvailablePrinters, 
  printThermalReceiptNative, 
  openCashDrawerPulse, 
  isElectronApp,
  PrinterDeviceInfo
} from '../../lib/electronBridge';
import { formatCurrency } from '../../lib/salesService';
import toast from 'react-hot-toast';

interface POSTerminalConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

export const POSTerminalConfigModal: React.FC<POSTerminalConfigModalProps> = ({
  isOpen,
  onClose,
  clientId
}) => {
  const [activeTab, setActiveTab] = useState<'printers' | 'hardware' | 'sync' | 'license'>('printers');
  const [printers, setPrinters] = useState<PrinterDeviceInfo[]>([]);
  const [selectedReceiptPrinter, setSelectedReceiptPrinter] = useState<string>(
    localStorage.getItem('ordexa_receipt_printer') || ''
  );
  const [selectedA4Printer, setSelectedA4Printer] = useState<string>(
    localStorage.getItem('ordexa_a4_printer') || ''
  );
  const [defaultPaperWidth, setDefaultPaperWidth] = useState<'80mm' | '58mm'>(
    (localStorage.getItem('ordexa_paper_width') as '80mm' | '58mm') || '80mm'
  );
  const [isTestingPrint, setIsTestingPrint] = useState<boolean>(false);
  const [isTestingDrawer, setIsTestingDrawer] = useState<boolean>(false);
  const [pendingList, setPendingList] = useState<OfflineSaleRecord[]>([]);

  const {
    fingerprint,
    deviceName,
    operatingSystem,
    appVersion,
    isDesktopNative,
    status: deviceStatus,
    licenseValidation,
    isOfflineGraceActive,
    remainingGraceHours
  } = useDeviceStore();

  const {
    isOnline,
    syncStatus,
    pendingCount,
    lastSyncedAt,
    syncNow,
    updatePendingCount
  } = useSyncStore();

  useEffect(() => {
    if (isOpen) {
      // Load system printers
      getAvailablePrinters().then(list => {
        setPrinters(list);
        if (!selectedReceiptPrinter && list.length > 0) {
          const defaultP = list.find(p => p.isDefault) || list[0];
          setSelectedReceiptPrinter(defaultP.name);
        }
      });

      // Load pending queue
      offlineStorage.getPendingSales().then(sales => {
        setPendingList(sales);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSavePrinterSettings = () => {
    localStorage.setItem('ordexa_receipt_printer', selectedReceiptPrinter);
    localStorage.setItem('ordexa_a4_printer', selectedA4Printer);
    localStorage.setItem('ordexa_paper_width', defaultPaperWidth);
    toast.success('تم حفظ إعدادات الطابعات بنجاح');
  };

  const handleTestPrint = async () => {
    setIsTestingPrint(true);
    try {
      const testHtml = `
        <div style="direction: rtl; text-align: center; font-family: monospace; padding: 10px;">
          <h2 style="margin: 0; font-size: 16px;">Ordexa Windows POS</h2>
          <div style="font-size: 12px; margin: 4px 0;">اختبار طباعة الإيصال الحراري</div>
          <hr style="border-top: 1px dashed #000; margin: 8px 0;" />
          <div style="text-align: right; font-size: 10px;">
            <div>الجهاز: <b>${deviceName}</b></div>
            <div>البصمة: <b>${fingerprint}</b></div>
            <div>الطابعة: <b>${selectedReceiptPrinter || 'الافتراضية'}</b></div>
            <div>الوقت: <b>${new Date().toLocaleTimeString('ar-SA')}</b></div>
          </div>
          <hr style="border-top: 1px dashed #000; margin: 8px 0;" />
          <div style="font-size: 11px; font-weight: bold;">الطابعة تعمل بشكل مثالي وجاهزة للتشغيل!</div>
        </div>
      `;

      const res = await printThermalReceiptNative({
        html: testHtml,
        printerName: selectedReceiptPrinter,
        silent: true,
        width: defaultPaperWidth
      });

      if (res.success) {
        toast.success('تم إرسال أمر اختبار الطباعة بنجاح');
      } else {
        toast.error(res.error || 'فشل إرسال أمر الطباعة');
      }
    } catch {
      toast.error('حدث خطأ أثناء اختبار الطباعة');
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleTestCashDrawer = async () => {
    setIsTestingDrawer(true);
    try {
      const res = await openCashDrawerPulse(selectedReceiptPrinter);
      if (res.success) {
        toast.success('تم إرسال نبضة فتح درج النقد (Pulse Triggered)');
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('تعذر إرسال نبضة فتح درج النقد');
    } finally {
      setIsTestingDrawer(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs" dir="rtl">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">إعدادات جهاز نقطة البيع (Desktop Hardware POS)</h3>
              <p className="text-xs text-slate-400">{deviceName} • {operatingSystem}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 text-xs font-semibold text-slate-600 gap-1">
          <button
            onClick={() => setActiveTab('printers')}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-xl transition-colors border-b-2 ${
              activeTab === 'printers'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>الطابعات والملحقات</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-xl transition-colors border-b-2 relative ${
              activeTab === 'sync'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>المزامنة والـ Offline</span>
            {pendingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('hardware')}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-xl transition-colors border-b-2 ${
              activeTab === 'hardware'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>هوية الجهاز والعتاد</span>
          </button>

          <button
            onClick={() => setActiveTab('license')}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-xl transition-colors border-b-2 ${
              activeTab === 'license'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>الترخيص والاشتراك</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800 text-xs">
          
          {/* 1. PRINTERS TAB */}
          {activeTab === 'printers' && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-start gap-2.5">
                <Monitor className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-indigo-900 leading-relaxed">
                  يدعم تطبيق Windows Desktop الاتصال المباشر بطابعات الإيصالات الحرارية (ESC/POS) وطابعات A4 دون الحاجة لفتح نافذة المتصفح.
                </div>
              </div>

              {/* Receipt Printer Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  طابعة الفواتير الحرارية الافتراضية (Thermal Receipt Printer)
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedReceiptPrinter}
                    onChange={(e) => setSelectedReceiptPrinter(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="">-- الطابعة الافتراضية للنظام --</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? '(الافتراضية في Windows)' : ''}
                      </option>
                    ))}
                  </select>

                  <select
                    value={defaultPaperWidth}
                    onChange={(e) => setDefaultPaperWidth(e.target.value as any)}
                    className="rounded-xl border border-slate-300 p-2.5 text-xs font-medium text-slate-800 bg-white"
                  >
                    <option value="80mm">مقاس 80mm</option>
                    <option value="58mm">مقاس 58mm</option>
                  </select>
                </div>
              </div>

              {/* A4 Printer Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  طابعة التقارير والفواتير الكبيرة (A4 Invoice Printer)
                </label>
                <select
                  value={selectedA4Printer}
                  onChange={(e) => setSelectedA4Printer(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="">-- الطابعة الافتراضية للنظام --</option>
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? '(الافتراضية في Windows)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Test Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTestPrint}
                    disabled={isTestingPrint}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isTestingPrint ? 'جارٍ الطباعة...' : 'طباعة إيصال تجريبي'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestCashDrawer}
                    disabled={isTestingDrawer}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-xs transition-colors disabled:opacity-50"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>{isTestingDrawer ? 'جارٍ الإرسال...' : 'اختبار فتح درج النقد'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSavePrinterSettings}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs transition-colors"
                >
                  حفظ الإعدادات
                </button>
              </div>
            </div>
          )}

          {/* 2. SYNC & OFFLINE TAB */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              {/* Status Header */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] text-slate-500 mb-1">حالة الاتصال بالخادم</div>
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    {isOnline ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-700">متصل بالإنترنت</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-amber-700">وضع عدم الاتصال</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] text-slate-500 mb-1">العمليات المعلقة للمزامنة</div>
                  <div className="font-bold text-sm text-indigo-700">
                    {pendingCount} عملية
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] text-slate-500 mb-1">آخر مزامنة ناجحة</div>
                  <div className="font-mono text-[11px] text-slate-700 truncate">
                    {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('ar-SA') : 'لم تتم بعد'}
                  </div>
                </div>
              </div>

              {/* Sync Controls */}
              <div className="flex items-center justify-between p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                <div>
                  <div className="font-bold text-indigo-950">المزامنة الفورية للبيانات</div>
                  <p className="text-[10px] text-indigo-800">
                    يقوم النظام بالمزامنة التلقائية فور عودة الإنترنت، ويمكنك فرض المزامنة يدوياً هنا.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => syncNow()}
                  disabled={syncStatus === 'syncing' || !isOnline}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>{syncStatus === 'syncing' ? 'جارٍ المزامنة...' : 'مزامنة الآن'}</span>
                </button>
              </div>

              {/* Pending Queue List */}
              <div>
                <div className="font-bold text-slate-800 mb-2">قائمة الفواتير المحلية في طابور الانتظار:</div>
                {pendingList.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400">
                    لا توجد فواتير معلقة. جميع العمليات متزامنة بالكامل مع السحابة.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {pendingList.map((sale) => (
                      <div 
                        key={sale.local_transaction_id}
                        className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg text-[11px]"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-800">{sale.local_transaction_id}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(sale.created_at).toLocaleString('ar-SA')} • {sale.items.length} أصناف
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold font-mono text-emerald-700">{formatCurrency(sale.total_amount)}</div>
                          <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px]">
                            {sale.status === 'failed' ? 'فشل المؤقت' : 'في الانتظار'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. HARDWARE TAB */}
          {activeTab === 'hardware' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">اسم الجهاز (Device Name):</span>
                  <span className="font-bold text-slate-800">{deviceName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">نظام التشغيل (OS):</span>
                  <span className="font-mono text-slate-800">{operatingSystem}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">إصدار التطبيق (App Version):</span>
                  <span className="font-mono text-slate-800">{appVersion}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">نوع البيئة:</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                    {isDesktopNative ? 'Windows Native Desktop App (Electron)' : 'Web Client Mode'}
                  </span>
                </div>
              </div>

              {/* Fingerprint Card */}
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800">بصمة العتاد المشفرة (Hardware Fingerprint):</span>
                  <button
                    onClick={() => copyToClipboard(fingerprint, 'بصمة الجهاز')}
                    className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    <Copy className="w-3 h-3" />
                    <span>نسخ</span>
                  </button>
                </div>
                <div className="p-2.5 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg break-all select-all">
                  {fingerprint}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  هذه البصمة مستخرجة من مكونات العتاد الصلب (اللوحة الأم، المعالج، بطاقة الشبكة، ومفتاح GUID الآمن) لضمان حماية المنشأة ومنع تشغيل النسخ المقرصنة.
                </p>
              </div>
            </div>
          )}

          {/* 4. LICENSE TAB */}
          {activeTab === 'license' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">حالة الترخيص:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    licenseValidation?.is_valid
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {licenseValidation?.is_valid ? 'ترخيص ساري وموثق' : 'غير مرخص أو معلق'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">حالة الجهاز على المنشأة:</span>
                  <span className="font-bold text-slate-800">
                    {deviceStatus === 'active' ? 'جهاز نشط ومسجل' : 'غير مسجل'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">باقة الاشتراك:</span>
                  <span className="font-bold text-indigo-700 capitalize">
                    {licenseValidation?.license?.license_type || 'Enterprise POS'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">الحد الأقصى للأجهزة:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {licenseValidation?.license?.activated_devices ?? 0} من أصل {licenseValidation?.license?.max_devices ?? 1}
                  </span>
                </div>

                {isOfflineGraceActive && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                    <div className="font-bold flex items-center gap-1 mb-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>فترة السماح للعمل بدون إنترنت نشطة</span>
                    </div>
                    <div>
                      متبقي <b>{remainingGraceHours} ساعة</b> قبل إلزامية الاتصال بالإنترنت لإعادة التحقق من الترخيص.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl text-xs transition-colors"
          >
            إغلاق النافذة
          </button>
        </div>

      </div>
    </div>
  );
};
