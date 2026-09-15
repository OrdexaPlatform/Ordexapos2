import React, { useState } from 'react';
import { 
  Building2, 
  Store, 
  Receipt, 
  ShieldCheck, 
  Key, 
  Smartphone, 
  Phone, 
  Mail, 
  MapPin, 
  Globe, 
  Coins, 
  CheckCircle2, 
  Layers, 
  Info,
  Monitor
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { format } from 'date-fns';

export function ClientSettings() {
  const { client, license, effectiveLicenseStatus } = useClientStore();
  const { fingerprint, deviceName, operatingSystem, isDesktopNative } = useDeviceStore();
  const [receiptWidth, setReceiptWidth] = useState<'80mm' | '58mm'>('80mm');

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
            <Store className="h-3.5 w-3.5" />
            <span>إدارة المنشأة ونقطة البيع (Client Administration)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            إعدادات وهوية منشأة {client?.business_name || 'العميل'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            استعراض هوية المنشأة، الشعار المرتبط بالفواتير ونقاط البيع، وحالة الترخيص والأجهزة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>نقطة البيع متصلة</span>
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Business Identity & Receipt Preview */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECTION 1: Client Identity & Logo */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    هوية المنشأة وشعار المتجر
                  </h2>
                  <p className="text-xs text-slate-500">
                    الشعار المخصص لمنشأتك الذي يظهر في شاشات الكاشير والفواتير المطبوعة.
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <span>كود المنشأة:</span>
                <span className="font-mono">{client?.client_code || '---'}</span>
              </span>
            </div>

            {/* Logo Display Card */}
            <div className="p-5 bg-slate-50/70 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center gap-6">
              <div className="h-28 w-28 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {client?.logo ? (
                  <img
                    src={client.logo}
                    alt={client.business_name || 'شعار المنشأة'}
                    className="h-full w-full object-contain p-2"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-center p-2 text-slate-400">
                    <Store className="h-8 w-8 mx-auto mb-1 text-slate-300" />
                    <span className="text-[10px]">لا يوجد شعار</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-center sm:text-right flex-1">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <h3 className="text-lg font-bold text-slate-900">
                    {client?.business_name || 'منشأة العميل'}
                  </h3>
                  {client?.logo ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      شعار مخصص نشط
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      افتراضي
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600">
                  الاسم التجاري المسجل: <span className="font-semibold text-slate-800">{client?.customer_name || '---'}</span>
                </p>

                <p className="text-xs text-slate-500 leading-relaxed">
                  يتم تطبيق هذا الشعار تلقائياً على واجهات الكاشير (POS Top Bar)، ترويسة الفواتير الحرارية، وكشوف الحسابات.
                </p>
              </div>
            </div>

            {/* Architecture Separation Guidance */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-950 flex items-start gap-3 leading-relaxed">
              <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-900 block mb-0.5">
                  فصل الهوية التقنية (Ordexa Platform vs. Client Brand):
                </span>
                <span className="text-slate-600">
                  شعار منشأتك مستقل تماماً عن أيقونة تطبيق Windows الأساسية لـ Ordexa POS. يتميز هذا الفصل بضمان سرعة تثبيت التحديثات الدورية دون الحاجة لإعادة بناء ملفات التثبيت لكل عميل على حدة.
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Live Receipt Branding Preview */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Receipt className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    معاينة ظهور الشعار على الفاتورة الحرارية
                  </h3>
                  <p className="text-xs text-slate-500">
                    محاكاة مطابقة لشكل الشعار وبيانات المنشأة عند الطباعة المباشرة.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setReceiptWidth('80mm')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    receiptWidth === '80mm'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  مقاس 80mm
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptWidth('58mm')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    receiptWidth === '58mm'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  مقاس 58mm
                </button>
              </div>
            </div>

            {/* Receipt Preview Paper */}
            <div className="bg-slate-100/70 p-6 rounded-2xl flex justify-center">
              <div
                className={`bg-white rounded-xl border border-slate-300 p-5 shadow-xs font-mono text-center space-y-2 transition-all ${
                  receiptWidth === '80mm' ? 'w-[320px] text-xs' : 'w-[250px] text-[11px]'
                }`}
              >
                {client?.logo ? (
                  <div className="flex justify-center mb-1">
                    <img
                      src={client.logo}
                      alt={client.business_name}
                      className="h-12 w-auto max-w-[140px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="py-2 border-b border-dashed border-slate-200 text-slate-400 text-[10px]">
                    [شعار المنشأة]
                  </div>
                )}
                <h4 className="font-extrabold text-slate-900 text-sm">{client?.business_name || 'اسم المتجر'}</h4>
                {client?.phone && <p className="text-slate-500 text-[11px]" dir="ltr">{client.phone}</p>}
                {client?.address && <p className="text-slate-500 text-[10px]">{client.address}</p>}

                <div className="border-t border-b border-dashed border-slate-300 py-1.5 my-2">
                  <span className="font-bold text-slate-800 text-[11px]">فاتورة ضريبية مبسطة</span>
                </div>

                <div className="text-[10px] text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>رقم الفاتورة:</span>
                    <span>INV-2026-0001</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ:</span>
                    <span>{format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 text-[10px] text-slate-400">
                  شكراً لزيارتكم • مدعوم بنظام Ordexa POS
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 span): License & Terminal Info */}
        <div className="space-y-6">
          {/* License Status Card */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">حالة الترخيص</h3>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                effectiveLicenseStatus === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {effectiveLicenseStatus === 'active' ? 'نشط ومرخص' : effectiveLicenseStatus}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">مفتاح الترخيص (License Key)</span>
                <span className="font-mono font-bold text-slate-800 text-[11px] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 block ltr text-left truncate">
                  {license?.license_key || 'LIC-ORD-UNREGISTERED'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">نوع الباقة / الترخيص</span>
                <span className="font-bold text-slate-800 capitalize">
                  {license?.license_type || 'Ultimate POS'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">تاريخ الانتهاء</span>
                <span className="font-medium text-slate-700">
                  {license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : 'دائم / سنوي'}
                </span>
              </div>
            </div>
          </div>

          {/* Terminal / Device Info */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">جهاز الكاشير الحالي</h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-mono">
                Terminal 01
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">بصمة الجهاز (Device Fingerprint)</span>
                <span className="font-mono text-[10px] text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200 block ltr text-left truncate" title={fingerprint || 'FP-ORDEXA-DEFAULT-MACHINE'}>
                  {fingerprint || 'FP-ORDEXA-DEFAULT-MACHINE'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">اسم الجهاز بالنظام</span>
                <span className="font-bold text-slate-800">
                  {deviceName || 'Ordexa POS Station'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">نظام التشغيل والبيئة</span>
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Monitor className="h-4 w-4 text-indigo-600" />
                  <span>{operatingSystem || 'Windows 10/11'} • {isDesktopNative ? 'تطبيق Windows مكتبي' : 'بيئة الويب المستعرضة'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2">
              بيانات التواصل المسجلة
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="h-4 w-4 text-slate-400" />
                <span className="font-mono ltr">{client?.phone || '---'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="h-4 w-4 text-slate-400" />
                <span className="font-mono ltr truncate">{client?.email || '---'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>{client?.address || '---'}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Coins className="h-4 w-4 text-slate-400" />
                <span>العملة: {client?.currency || 'USD'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
