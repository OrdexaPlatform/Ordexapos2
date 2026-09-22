import React, { useState } from 'react';
import { 
  Printer, 
  CheckCircle2, 
  X, 
  Receipt, 
  Calendar, 
  User, 
  Building2, 
  CreditCard, 
  PlusCircle,
  FileText,
  DollarSign,
  Loader2
} from 'lucide-react';
import { Sale, Client, ClientPOSSettings } from '../../types';
import { formatCurrency } from '../../lib/salesService';
import { POSPrintManager, PaperSize } from '../../lib/printing/printManager';
import { getClientPOSSettings } from '../../lib/clientSettingsService';
import { openCashDrawerPulse, isElectronApp } from '../../lib/electronBridge';
import toast from 'react-hot-toast';

interface InvoiceReceiptModalProps {
  sale: Sale | null;
  client?: Client | null;
  posSettings?: ClientPOSSettings | null;
  isOpen: boolean;
  onClose: () => void;
  onNewSale?: () => void;
}

export const InvoiceReceiptModal: React.FC<InvoiceReceiptModalProps> = ({
  sale,
  client,
  posSettings: propSettings,
  isOpen,
  onClose,
  onNewSale
}) => {
  const [paperSize, setPaperSize] = useState<PaperSize>('80mm');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isKickingDrawer, setIsKickingDrawer] = useState<boolean>(false);

  const posSettings = propSettings || getClientPOSSettings(client?.id);

  if (!isOpen || !sale) return null;

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      if (isElectronApp()) {
        const res = await POSPrintManager.printSale(sale, client, {
          paperSize: paperSize,
          silent: true,
          posSettings: posSettings
        });
        if (res.success) {
          toast.success('تم إرسال الفاتورة إلى الطابعة');
        } else {
          toast.error(res.error || 'تعذر الطباعة المباشرة، جاري فتح حوار الطباعة');
          window.print();
        }
      } else {
        window.print();
      }
    } catch {
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenCashDrawer = async () => {
    setIsKickingDrawer(true);
    try {
      const res = await openCashDrawerPulse();
      if (res.success) {
        toast.success('تم إرسال نبضة فتح درج النقد');
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('تعذر إرسال أمر فتح الدرج');
    } finally {
      setIsKickingDrawer(false);
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'نقداً (Cash)';
      case 'card': return 'بطاقة بنكية (Card)';
      case 'bank_transfer': return 'تحويل بنكي';
      case 'wallet': return 'محفظة إلكترونية';
      default: return method;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      {/* Print styles injected directly */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible;
          }
          #printable-receipt {
            position: fixed;
            left: 0;
            top: 0;
            width: ${paperSize === '58mm' ? '58mm' : paperSize === '80mm' ? '80mm' : '100%'};
            margin: 0;
            padding: ${paperSize === 'a4' ? '24px' : '10px'};
            background: white !important;
            color: black !important;
            font-size: ${paperSize === '58mm' ? '10px' : paperSize === '80mm' ? '11px' : '14px'};
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header - No print */}
        <div className="no-print flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">تم إتمام البيع بنجاح</h3>
              <p className="text-xs text-slate-400">فاتورة رقم: {sale.invoice_number}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setPaperSize('80mm')}
                className={`px-2 py-1 rounded-md transition-colors ${paperSize === '80mm' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                حراري 80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('58mm')}
                className={`px-2 py-1 rounded-md transition-colors ${paperSize === '58mm' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                حراري 58mm
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('a4')}
                className={`px-2 py-1 rounded-md transition-colors ${paperSize === 'a4' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                قياس A4
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Receipt Container */}
        <div className="max-h-[75vh] overflow-y-auto p-6 bg-slate-50">
          <div 
            id="printable-receipt" 
            className={`mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-xs ${
              paperSize === '58mm' ? 'max-w-[280px] text-[10px]' : paperSize === '80mm' ? 'max-w-[360px] text-xs' : 'max-w-full text-sm'
            }`}
          >
            {/* Store Header */}
            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              {client?.logo && (
                <div className="flex justify-center mb-2">
                  <img
                    src={client.logo}
                    alt={client.business_name || 'شعار المنشأة'}
                    className="h-12 w-auto max-w-[140px] object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                {client?.business_name || 'Ordexa POS Store'}
              </h2>
              {posSettings.show_owner_name !== false && (client?.owner_name || client?.customer_name) && (
                <p className="text-slate-600 mt-0.5 text-xs">
                  {client.owner_name || client.customer_name}
                </p>
              )}
              {posSettings.receipt_header && (
                <p className="text-slate-600 text-xs mt-1">{posSettings.receipt_header}</p>
              )}
              {posSettings.enable_tax && posSettings.show_tax_number !== false && (posSettings.tax_number || (client as any)?.tax_number) && (
                <p className="text-slate-500 text-[11px] mt-0.5 font-mono">
                  الرقم الضريبي: {posSettings.tax_number || (client as any)?.tax_number}
                </p>
              )}
              {posSettings.show_phone !== false && client?.phone && (
                <p className="text-slate-500 text-[11px] mt-0.5 dir-ltr">{client.phone}</p>
              )}
              {posSettings.show_address !== false && client?.address && (
                <p className="text-slate-500 text-[11px] mt-0.5">{client.address}</p>
              )}
              <div className="inline-block mt-2 px-2.5 py-0.5 bg-slate-100 rounded-full text-[10px] font-semibold text-slate-700">
                {posSettings.enable_tax && sale.tax_amount > 0 ? 'فاتورة ضريبية مبسطة' : 'فاتورة مبيعات'}
              </div>
            </div>

            {/* Meta Info */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-slate-600 text-[11px]">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-800">رقم الفاتورة:</span>
                <span className="font-mono font-bold text-slate-900">{sale.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span className="font-mono">{new Date(sale.sale_date).toLocaleString('ar-SA')}</span>
              </div>
              {sale.warehouse && (
                <div className="flex justify-between">
                  <span>الفرع / المستودع:</span>
                  <span>{sale.warehouse.name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>الكاشير:</span>
                <span className="font-semibold text-slate-800">
                  {sale.cashier?.name || (sale.cashier as any)?.full_name || (sale as any)?.cashier_name || 'الكاشير'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>العميل:</span>
                <span>عميل نقدي عام</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-3 border-b border-dashed border-slate-300">
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[10px] font-semibold">
                    <th className="pb-1">الصنف</th>
                    <th className="pb-1 text-center">الكمية</th>
                    <th className="pb-1 text-center">السعر</th>
                    <th className="pb-1 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {sale.items && sale.items.length > 0 ? (
                    sale.items.map((item, idx) => (
                      <tr key={idx} className="text-[11px]">
                        <td className="py-1.5 pr-0">
                          <div className="font-medium text-slate-900">{item.product_name_snapshot}</div>
                          {item.sku_snapshot && (
                            <div className="text-[9px] text-slate-400 font-mono">{item.sku_snapshot}</div>
                          )}
                          {item.discount_amount > 0 && (
                            <div className="text-[9px] text-rose-500">خصم: {formatCurrency(item.discount_amount, '')}</div>
                          )}
                        </td>
                        <td className="py-1.5 text-center font-mono">{item.quantity}</td>
                        <td className="py-1.5 text-center font-mono">{formatCurrency(item.unit_price, '')}</td>
                        <td className="py-1.5 text-left font-mono font-semibold">{formatCurrency(item.line_total, '')}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-slate-400">لا توجد أصناف</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي (قبل الضريبة والخصم):</span>
                <span className="font-mono">{formatCurrency(sale.subtotal)}</span>
              </div>
              {sale.discount_amount > 0 && (
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>إجمالي الخصومات:</span>
                  <span className="font-mono">- {formatCurrency(sale.discount_amount)}</span>
                </div>
              )}
              {posSettings.enable_tax && sale.tax_amount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة (VAT):</span>
                  <span className="font-mono">{formatCurrency(sale.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-300 text-sm font-extrabold text-slate-900">
                <span>المجموع الكلي:</span>
                <span className="font-mono text-indigo-700">{formatCurrency(sale.total_amount)}</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-700">
                <span className="font-semibold">طريقة الدفع:</span>
                <span>
                  {sale.payments && sale.payments.length > 0 
                    ? sale.payments.map(p => getPaymentMethodLabel(p.payment_method)).join(', ')
                    : 'نقداً'}
                </span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>المدفوع:</span>
                <span className="font-mono font-semibold text-emerald-700">{formatCurrency(sale.paid_amount)}</span>
              </div>
              {sale.change_amount > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>المتبقي (الفكة):</span>
                  <span className="font-mono font-semibold text-amber-700">{formatCurrency(sale.change_amount)}</span>
                </div>
              )}
              {sale.sale_status === 'voided' && (
                <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-center text-rose-700 font-bold text-xs">
                  ⚠️ هذه الفاتورة تم إلغاؤها (Voided)
                </div>
              )}
            </div>

            {/* Footer QR / Barcode Simulation */}
            <div className="pt-4 text-center space-y-2">
              <div className="font-mono text-[10px] tracking-widest text-slate-400">
                *{sale.invoice_number}*
              </div>
              <p className="text-[10px] text-slate-500 font-medium whitespace-pre-line">
                {posSettings.receipt_footer || 'شكراً لزيارتكم! يرجى الاحتفاظ بالفاتورة في حال الاستبدال أو الاسترجاع.'}
              </p>
              <div className="text-[9px] text-slate-300">
                Powered by Ordexa POS System
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions - No print */}
        <div className="no-print flex items-center justify-between px-6 py-4 bg-white border-t border-slate-200">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              <span>{isPrinting ? 'جارٍ الطباعة...' : 'طباعة الفاتورة'}</span>
            </button>

            <button
              onClick={handleOpenCashDrawer}
              disabled={isKickingDrawer}
              title="إرسال نبضة فتح درج النقد (Cash Drawer Kick)"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors disabled:opacity-50"
            >
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>فتح الدرج</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onNewSale && (
              <button
                onClick={() => {
                  onNewSale();
                  onClose();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>عملية بيع جديدة</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
