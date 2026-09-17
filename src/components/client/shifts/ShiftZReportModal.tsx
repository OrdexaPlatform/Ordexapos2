import React, { useState, useEffect } from 'react';
import { Printer, X, Receipt, CheckCircle2, AlertTriangle, ArrowDownRight, ArrowUpLeft } from 'lucide-react';
import { Shift, CashDrawerTransaction } from '../../../types';
import { useClientStore } from '../../../store/clientStore';
import { useCurrency } from '../../../hooks/useCurrency';
import { shiftService } from '../../../lib/shiftService';

interface ShiftZReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift;
}

export const ShiftZReportModal: React.FC<ShiftZReportModalProps> = ({
  isOpen,
  onClose,
  shift,
}) => {
  const { client } = useClientStore();
  const { currencySymbol } = useCurrency();
  const [transactions, setTransactions] = useState<CashDrawerTransaction[]>([]);
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal');

  useEffect(() => {
    if (isOpen && shift?.id) {
      shiftService.fetchShiftTransactions(shift.id)
        .then(setTransactions)
        .catch(() => setTransactions([]));
    }
  }, [isOpen, shift?.id]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const isClosed = shift.status === 'closed' || shift.status === 'audited';
  const reportTitle = isClosed ? 'تقرير إغلاق الوردية (Z-Report)' : 'تقرير الجلسة الحالية (X-Report)';
  const difference = shift.cash_difference ?? ((shift.closing_cash_actual || 0) - (shift.closing_cash_expected || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        id="shift-z-report-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col my-auto max-h-[94vh]"
        dir="rtl"
      >
        {/* Top Control Bar (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{reportTitle}</h3>
              <p className="text-xs text-slate-500">وردية رقم: {shift.shift_number}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Format Toggle */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-lg text-xs font-semibold text-slate-700">
              <button
                type="button"
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-md transition-all ${
                  printFormat === 'thermal' ? 'bg-white shadow text-slate-900' : 'hover:text-slate-900'
                }`}
              >
                حراري (80mm)
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-md transition-all ${
                  printFormat === 'a4' ? 'bg-white shadow text-slate-900' : 'hover:text-slate-900'
                }`}
              >
                تقرير A4
              </button>
            </div>

            {/* Print Button */}
            <button
              id="btn-print-z-report"
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Content */}
        <div className="p-6 overflow-y-auto bg-slate-50/50 print:p-0 print:bg-white">
          <div className={`mx-auto bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-slate-900 print:border-none print:shadow-none print:p-0 ${
            printFormat === 'thermal' ? 'max-w-[380px] font-mono text-xs' : 'max-w-xl text-sm'
          }`}>
            {/* Report Header */}
            <div className="text-center pb-4 border-b border-dashed border-slate-300 space-y-1">
              <h2 className="text-base font-black tracking-wide">{client?.business_name || 'منشأة تجارية'}</h2>
              <div className="text-[11px] text-slate-500 font-sans">
                {shift.warehouse_name || 'الفرع الرئيسي'} | {shift.register_name || 'نقطة البيع'}
              </div>
              <div className="inline-block mt-2 px-3 py-1 bg-slate-100 rounded-full font-bold text-xs">
                {reportTitle}
              </div>
              <div className="text-xs font-black tracking-wider text-slate-800 pt-1">
                رقم الوردية: {shift.shift_number}
              </div>
            </div>

            {/* Metadata info */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">الكاشير:</span>
                <span className="font-bold">{shift.cashier_name || 'الكاشير'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">وقت الفتح:</span>
                <span dir="ltr">{new Date(shift.opened_at).toLocaleString('ar-SA')}</span>
              </div>
              {shift.closed_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">وقت الإغلاق:</span>
                  <span dir="ltr">{new Date(shift.closed_at).toLocaleString('ar-SA')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">حالة الوردية:</span>
                <span className={`font-bold ${isClosed ? 'text-slate-900' : 'text-emerald-600'}`}>
                  {isClosed ? 'مغلقة ومطابقة' : 'مفتوحة حالياً'}
                </span>
              </div>
            </div>

            {/* Cash Drawer Reconciliation */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-xs">
              <div className="font-bold text-slate-800 pb-1 flex items-center justify-between">
                <span>مطابقة الدرج النقدي</span>
                <span className="text-[10px] text-slate-400">ريال سعودي</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">الرصيد الافتتاحي:</span>
                <span className="font-bold font-mono">{shift.opening_cash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>(+) مبيعات نقدية (كاش):</span>
                <span className="font-bold font-mono">{shift.total_cash_sales.toFixed(2)}</span>
              </div>
              {shift.total_cash_in > 0 && (
                <div className="flex justify-between text-blue-700">
                  <span>(+) إيداعات نثرية إضافية:</span>
                  <span className="font-bold font-mono">+{shift.total_cash_in.toFixed(2)}</span>
                </div>
              )}
              {shift.total_cash_out > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>(-) سحوبات ومصروفات:</span>
                  <span className="font-bold font-mono">-{shift.total_cash_out.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-slate-200 font-black text-slate-900">
                <span>النقد المتوقع بالدرج:</span>
                <span className="font-mono">{shift.closing_cash_expected.toFixed(2)} {currencySymbol}</span>
              </div>

              {isClosed && shift.closing_cash_actual !== null && shift.closing_cash_actual !== undefined && (
                <>
                  <div className="flex justify-between font-black text-slate-900 pt-1">
                    <span>النقد الفعلي المعدود:</span>
                    <span className="font-mono">{shift.closing_cash_actual.toFixed(2)} {currencySymbol}</span>
                  </div>
                  <div className={`flex justify-between font-black p-2 rounded-lg mt-1 ${
                    difference === 0 ? 'bg-emerald-50 text-emerald-800' : difference < 0 ? 'bg-rose-50 text-rose-800' : 'bg-blue-50 text-blue-800'
                  }`}>
                    <span>فارق الصندوق:</span>
                    <span className="font-mono">
                      {difference === 0 ? '0.00 (مطابق)' : difference > 0 ? `+${difference.toFixed(2)} (فائض)` : `${difference.toFixed(2)} (عجز)`}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Sales Breakdown by Payment Method */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-xs">
              <div className="font-bold text-slate-800 pb-1">إجمالي المبيعات ووسائل الدفع</div>
              <div className="flex justify-between">
                <span className="text-slate-600">نقدًا (Cash):</span>
                <span className="font-mono font-bold">{shift.total_cash_sales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">بطاقات وشبكة (Card/Mada):</span>
                <span className="font-mono font-bold">{shift.total_card_sales.toFixed(2)}</span>
              </div>
              {shift.total_other_sales > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">تحويل ومحافظ:</span>
                  <span className="font-mono font-bold">{shift.total_other_sales.toFixed(2)}</span>
                </div>
              )}
              {shift.total_refunds_amount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>فواتير ملغاة / مرتجعات:</span>
                  <span className="font-mono font-bold">-{shift.total_refunds_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-slate-200 font-black text-slate-900 text-sm">
                <span>صافي مبيعات الوردية:</span>
                <span className="font-mono">{shift.total_sales_amount.toFixed(2)} {currencySymbol}</span>
              </div>
              <div className="flex justify-between text-slate-500 pt-0.5">
                <span>إجمالي عدد الفواتير:</span>
                <span className="font-bold">{shift.orders_count} فاتورة</span>
              </div>
            </div>

            {/* Drawer Movements Breakdown (if any) */}
            {transactions.length > 0 && (
              <div className="py-3 border-b border-dashed border-slate-300 space-y-2 text-xs">
                <div className="font-bold text-slate-800">حركات النقدية النثرية ({transactions.length})</div>
                <div className="space-y-1">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex justify-between items-center text-[11px]">
                      <span className="truncate max-w-[200px] text-slate-600">
                        {tx.transaction_type === 'cash_in' ? '↑ إيداع: ' : '↓ سحب: '}
                        {tx.reason}
                      </span>
                      <span className={`font-mono font-bold ${tx.transaction_type === 'cash_in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {tx.transaction_type === 'cash_in' ? '+' : '-'}{tx.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {(shift.opening_notes || shift.closing_notes) && (
              <div className="py-2.5 border-b border-dashed border-slate-300 text-xs text-slate-600 space-y-1">
                {shift.opening_notes && <div><strong>ملاحظة الافتتاح:</strong> {shift.opening_notes}</div>}
                {shift.closing_notes && <div><strong>ملاحظة الإغلاق:</strong> {shift.closing_notes}</div>}
              </div>
            )}

            {/* Signatures */}
            <div className="pt-6 pb-2 grid grid-cols-2 gap-4 text-center text-xs">
              <div className="space-y-8">
                <span className="text-slate-500 block">توقيع الكاشير</span>
                <div className="border-b border-slate-300 w-3/4 mx-auto" />
              </div>
              <div className="space-y-8">
                <span className="text-slate-500 block">توقيع المشرف / الإدارة</span>
                <div className="border-b border-slate-300 w-3/4 mx-auto" />
              </div>
            </div>

            {/* Footer timestamp */}
            <div className="text-center text-[10px] text-slate-400 pt-4 font-sans">
              تم إصدار هذا التقرير عبر نظام Ordexa POS | {new Date().toLocaleString('ar-SA')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
