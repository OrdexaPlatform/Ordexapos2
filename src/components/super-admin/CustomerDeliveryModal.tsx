import React, { useState } from 'react';
import { CustomerDeliverySummaryData } from '../../types/delivery';
import { Modal } from '../ui/Modal';
import { 
  Building2, 
  Key, 
  User, 
  DownloadCloud, 
  ExternalLink, 
  Copy, 
  Check, 
  CheckCircle2, 
  ShieldCheck, 
  Laptop, 
  Monitor, 
  HelpCircle,
  FileCheck,
  Smartphone
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface CustomerDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: CustomerDeliverySummaryData;
}

export function CustomerDeliveryModal({
  isOpen,
  onClose,
  summary,
}: CustomerDeliveryModalProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const { client, license, owner, downloads, previewUrl } = summary;

  const handleCopy = (text: string, type: 'key' | 'link' | 'all') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
    toast.success('تم النسخ إلى الحافظة');
  };

  const deliveryDossierText = `
=========================================
بيانات تسليم نظام Ordexa POS للعميل
=========================================
المنشأة: ${client.business_name} (${client.customer_name})
كود العميل: ${client.client_code}
الهاتف: ${client.phone}
العملة: ${client.currency}

[بيانات الترخيص والأجهزة]
نوع الترخيص: ${license?.license_type || 'غير محدد'}
مفتاح الترخيص: ${license?.license_key || 'لم يتم الإصدار'}
أقصى عدد أجهزة: ${license?.max_devices || 1}
تاريخ الانتهاء: ${license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : '---'}

[حساب المالك الافتراضي]
الاسم: ${owner?.name || client.owner_name || 'مالك المنشأة'}
البريد الإلكتروني: ${owner?.email || client.email || '---'}
الدور: مالك المنشأة (Owner)

[رابط المعاينة الحية للواجهة (Web Preview)]
${window.location.origin}${previewUrl}

[روابط التثبيت والتشغيل المباشر للكمبيوتر]
رابط النسخة المحمولة (Portable ZIP):
${window.location.origin}${downloads.portableZip.url}

رابط مثبت ويندوز (Windows Setup):
${window.location.origin}${downloads.installerExe.url}

[تعليمات التفعيل السريع]
1. يمكنك إرسال رابط المعاينة الحية أعلاه للعميل لمعاينة الكاشير والأصناف مباشرة من أي متصفح.
2. قم بفك ضغط ملف النسخة المحمولة أو تثبيت ملف Setup على جهاز الكاشير.
3. افتح تطبيق Ordexa POS Desktop وسجل الدخول بحساب المالك.
4. أدخل مفتاح الترخيص أعلاه عند المطالبة لتسجيل الجهاز وبدء البيع.
=========================================
`.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ملخص تسليم العميل (Customer Delivery Dossier)" maxWidth="3xl">
      <div className="space-y-6 text-right" dir="rtl">
        {/* Top Highlight Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-900">العميل جاهز للتسليم والتشغيل (Ready For Delivery)</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                تم التحقق من بيانات الهوية، الرخص، وحزم التنزيل المكتبي المعتمدة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(deliveryDossierText, 'all')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            {copiedAll ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copiedAll ? 'تم نسخ التقرير الشامل' : 'نسخ ملف التسليم بالكامل'}</span>
          </button>
        </div>

        {/* 4-Box Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Box 1: Client & White-Label */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-200 pb-2">
              <Building2 className="h-4 w-4 text-indigo-600" />
              <span>هوية المنشأة (White-Label)</span>
            </div>
            <div className="text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">اسم النشاط التجاري:</span>
                <span className="font-bold text-slate-900">{client.business_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">اسم العميل:</span>
                <span>{client.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">كود المنشأة:</span>
                <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-900">
                  {client.client_code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">العملة واللغة:</span>
                <span>{client.currency} ({client.language === 'ar' ? 'العربية' : client.language})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الهاتف:</span>
                <span className="font-mono text-left" dir="ltr">{client.phone}</span>
              </div>
            </div>
          </div>

          {/* Box 2: License & Devices */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-200 pb-2">
              <Key className="h-4 w-4 text-emerald-600" />
              <span>بيانات الترخيص (License)</span>
            </div>
            <div className="text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">مفتاح الترخيص:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 select-all" dir="ltr">
                    {license?.license_key || 'لا يوجد'}
                  </span>
                  {license?.license_key && (
                    <button
                      type="button"
                      onClick={() => handleCopy(license.license_key, 'key')}
                      className="p-1 hover:bg-slate-200 rounded text-slate-600"
                      title="نسخ المفتاح"
                    >
                      {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">نوع الترخيص:</span>
                <span className="font-semibold">{license?.license_type || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الحد الأقصى للأجهزة:</span>
                <span className="font-bold text-slate-900">{license?.max_devices || 1} نقطة بيع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">صلاحية الترخيص:</span>
                <span className="font-mono">
                  {license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : '---'}
                </span>
              </div>
            </div>
          </div>

          {/* Box 3: Owner Credentials */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-200 pb-2">
              <User className="h-4 w-4 text-blue-600" />
              <span>بيانات حساب المالك (Owner Account)</span>
            </div>
            <div className="text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">الاسم:</span>
                <span className="font-semibold text-slate-900">{owner?.name || client.owner_name || 'مالك المنشأة'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">البريد الإلكتروني:</span>
                <span className="font-mono text-left text-slate-900" dir="ltr">{owner?.email || client.email || 'غير مسجل'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الدور والصلاحيات:</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px]">
                  مالك المنشأة (صلاحيات كاملة)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                * ملاحظة أمنية: لا يتم حفظ كلمات المرور بنص صريح. يسجل المالك الدخول بكلمة المرور التي تم إنشاؤها له عند التعيين.
              </p>
            </div>
          </div>

          {/* Box 4: Desktop Downloads */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-200 pb-2">
              <Laptop className="h-4 w-4 text-purple-600" />
              <span>حزم التنزيل المكتبي المعتمدة</span>
            </div>
            <div className="text-xs space-y-2 text-slate-700">
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                <div>
                  <div className="font-semibold text-slate-900">{downloads.portableZip.name}</div>
                  <div className="text-[10px] text-slate-400">حجم: {downloads.portableZip.size} (تشغيل فوري)</div>
                </div>
                <a
                  href={downloads.portableZip.url}
                  download={downloads.portableZip.name}
                  className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-medium hover:bg-slate-800"
                >
                  تحميل
                </a>
              </div>
              <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                <div>
                  <div className="font-semibold text-slate-900">{downloads.installerExe.name}</div>
                  <div className="text-[10px] text-slate-400">حجم: {downloads.installerExe.size} (مثبت ويندوز)</div>
                </div>
                <a
                  href={downloads.installerExe.url}
                  download={downloads.installerExe.name}
                  className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[11px] font-medium hover:bg-indigo-700"
                >
                  تحميل
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="flex items-center gap-3">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <ExternalLink className="h-4 w-4" />
              <span>فتح شاشة المعاينة الحية للعميل</span>
            </a>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => handleCopy(`${window.location.origin}${previewUrl}`, 'link')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'تم نسخ الرابط' : 'نسخ رابط المعاينة'}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}
