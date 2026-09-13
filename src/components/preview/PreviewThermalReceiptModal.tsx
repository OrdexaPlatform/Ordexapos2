import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Client, License } from '../../types';
import { formatCurrency } from '../../lib/salesService';
import { 
  Printer, 
  Store, 
  Calendar, 
  Receipt, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  ShieldCheck, 
  Download,
  Copy,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export interface PreviewReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PreviewThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  license?: License | null;
  items: PreviewReceiptItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  invoiceNumber?: string;
  paymentMethod?: string;
}

export const PreviewThermalReceiptModal: React.FC<PreviewThermalReceiptModalProps> = ({
  isOpen,
  onClose,
  client,
  license,
  items,
  subtotal,
  taxAmount,
  totalAmount,
  invoiceNumber = 'INV-PREV-1001',
  paymentMethod = 'نقدي (Cash)'
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const now = new Date();
  const formattedDate = format(now, 'yyyy-MM-dd HH:mm');

  const handlePrint = () => {
    toast.success('تم إرسال أمر الطباعة التجريبية (وضع المعاينة للقراءة فقط)');
    window.print();
  };

  const handleCopyText = () => {
    const text = `
========================================
${client.business_name}
${client.customer_name}
هاتف: ${client.phone}
${client.address ? `العنوان: ${client.address}` : ''}
========================================
فاتورة ضريبية مبسطة
رقم الفاتورة: ${invoiceNumber}
التاريخ: ${formattedDate}
طريقة الدفع: ${paymentMethod}
----------------------------------------
الأصناف:
${items.map(i => `${i.name} × ${i.quantity} = ${formatCurrency(i.total, client.currency)}`).join('\n')}
----------------------------------------
المجموع الفرعي: ${formatCurrency(subtotal, client.currency)}
ضريبة القيمة المضافة: ${formatCurrency(taxAmount, client.currency)}
الإجمالي النهائي: ${formatCurrency(totalAmount, client.currency)}
========================================
شكراً لتسوقكم من ${client.business_name}!
نظام Ordexa POS المعتمد
========================================
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('تم نسخ نص الفاتورة');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="معاينة الفاتورة الحرارية لنقاط البيع (Thermal Receipt Preview)" maxWidth="2xl">
      <div className="space-y-4 text-right" dir="rtl">
        {/* Paper size toggle & actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">عرض الورق الحراري:</span>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white shadow-xs">
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  paperWidth === '80mm'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80 مم (قياسي)
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  paperWidth === '58mm'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                58 مم (صغير)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white shadow-xs transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>تجربة الطباعة</span>
            </button>
          </div>
        </div>

        {/* Paper Receipt Simulation */}
        <div className="bg-slate-200/60 p-4 sm:p-6 rounded-2xl flex justify-center overflow-x-auto">
          <div
            className={`bg-white p-5 rounded shadow-md font-mono text-slate-900 transition-all border border-slate-200 text-xs leading-relaxed ${
              paperWidth === '80mm' ? 'w-[320px]' : 'w-[250px]'
            }`}
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {/* Header: Store Identity (White-Label) */}
            <div className="text-center space-y-1.5 pb-3 border-b border-dashed border-slate-300">
              {client.logo ? (
                <div className="h-14 w-14 mx-auto rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center p-1 bg-white">
                  <img
                    src={client.logo}
                    alt={client.business_name}
                    className="max-h-full max-w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="h-10 w-10 mx-auto rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-600 font-bold">
                  {client.business_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <h2 className="font-bold text-sm tracking-wide text-slate-900">{client.business_name}</h2>
              <p className="text-[11px] text-slate-600 font-sans">{client.customer_name}</p>
              {client.phone && (
                <p className="text-[10px] text-slate-500 font-mono" dir="ltr">
                  هاتف: {client.phone}
                </p>
              )}
              {client.address && (
                <p className="text-[10px] text-slate-500 font-sans">{client.address}</p>
              )}
              <div className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-sans font-semibold border border-slate-200">
                فاتورة ضريبية مبسطة
              </div>
            </div>

            {/* Invoice Meta */}
            <div className="py-2.5 border-b border-dashed border-slate-300 text-[11px] space-y-1 text-slate-700 font-sans">
              <div className="flex justify-between">
                <span className="text-slate-500">رقم الفاتورة:</span>
                <span className="font-mono font-bold text-slate-900">{invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">التاريخ والوقت:</span>
                <span className="font-mono text-slate-800">{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">طريقة السداد:</span>
                <span className="font-semibold text-slate-800">{paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">كود المنشأة:</span>
                <span className="font-mono text-slate-700">{client.client_code}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-2.5 border-b border-dashed border-slate-300">
              <table className="w-full text-right font-sans text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[10px]">
                    <th className="pb-1 text-right">الصنف</th>
                    <th className="pb-1 text-center">الكمية</th>
                    <th className="pb-1 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1 text-slate-900 font-medium">
                        <div>{item.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {formatCurrency(item.unitPrice, client.currency)}
                        </div>
                      </td>
                      <td className="py-1 text-center font-mono text-slate-700">×{item.quantity}</td>
                      <td className="py-1 text-left font-mono font-bold text-slate-900">
                        {formatCurrency(item.total, client.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Totals */}
            <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px] font-sans">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-mono">{formatCurrency(subtotal, client.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ضريبة القيمة المضافة:</span>
                <span className="font-mono">{formatCurrency(taxAmount, client.currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>الإجمالي النهائي:</span>
                <span className="font-mono text-indigo-700">{formatCurrency(totalAmount, client.currency)}</span>
              </div>
            </div>

            {/* Footer QR / Barcode & Notice */}
            <div className="pt-3 text-center space-y-2 font-sans">
              {/* Simulated QR Code Bar */}
              <div className="h-10 w-36 mx-auto bg-slate-900 rounded flex items-center justify-center text-white text-[9px] font-mono tracking-widest">
                ||| | |||| | |||| | |||
              </div>
              <p className="text-[10px] text-slate-600 font-medium">
                شكراً لتسوقكم من {client.business_name}
              </p>
              <p className="text-[9px] text-slate-400">
                نظام نقاط البيع المعتمد من Ordexa POS
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
          <span>* هذه المعاينة مطابقة تماماً للمخرجات الحرارية الصادرة من تطبيق Ordexa POS المثبت لدى العميل.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
};
