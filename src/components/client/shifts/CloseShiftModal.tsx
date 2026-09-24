import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Receipt, 
  ArrowDownRight, 
  ArrowUpLeft, 
  CreditCard 
} from 'lucide-react';
import { useShiftStore } from '../../../store/shiftStore';
import { useAuthStore } from '../../../store/authStore';
import { useCurrency } from '../../../hooks/useCurrency';
import { shiftService } from '../../../lib/shiftService';
import { Shift, ShiftSummary } from '../../../types';
import { POSPrintManager } from '../../../lib/printing/printManager';
import { Printer } from 'lucide-react';
import toast from 'react-hot-toast';

interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift;
  onShiftClosed?: (result: any) => void;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  onClose,
  shift,
  onShiftClosed,
}) => {
  const { currencySymbol, currencyName } = useCurrency();
  const { clientUser } = useAuthStore();
  const clientId = clientUser?.client_id;
  const { closeShift, isLoading } = useShiftStore();

  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [actualCashStr, setActualCashStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isFetchingSummary, setIsFetchingSummary] = useState<boolean>(false);
  const [autoPrintZReport, setAutoPrintZReport] = useState<boolean>(true);
  const [isPrintingZReport, setIsPrintingZReport] = useState<boolean>(false);
  const [hasAcknowledgedDiff, setHasAcknowledgedDiff] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && shift?.id) {
      loadSummary();
      setActualCashStr('');
      setHasAcknowledgedDiff(false);
    }
  }, [isOpen, shift?.id]);

  const loadSummary = async () => {
    setIsFetchingSummary(true);
    try {
      const sum = await shiftService.getShiftSummary(shift.id, clientId);
      setSummary(sum);
    } catch (err: any) {
      console.warn('Could not fetch shift live summary, using fallback:', err);
      setSummary({
        shift_id: shift.id,
        shift_number: shift.shift_number,
        status: shift.status,
        opened_at: shift.opened_at,
        opening_cash: shift.opening_cash,
        total_sales_amount: shift.total_sales_amount,
        total_cash_sales: shift.total_cash_sales,
        total_card_sales: shift.total_card_sales,
        total_other_sales: shift.total_other_sales,
        total_refunds_amount: shift.total_refunds_amount,
        total_cash_in: shift.total_cash_in,
        total_cash_out: shift.total_cash_out,
        orders_count: shift.orders_count,
        expected_cash: shift.closing_cash_expected || shift.opening_cash,
        cash_difference: 0,
      });
    } finally {
      setIsFetchingSummary(false);
    }
  };

  const expectedCash = summary?.expected_cash ?? (shift.closing_cash_expected || shift.opening_cash || 0);
  const isActualEntered = actualCashStr.trim() !== '' && !isNaN(Number(actualCashStr)) && Number(actualCashStr) >= 0;
  const numActualCash = isActualEntered ? Number(actualCashStr) : null;
  const difference = numActualCash !== null ? Number((numActualCash - expectedCash).toFixed(2)) : 0;
  const varianceStatus = numActualCash === null 
    ? 'في انتظار إدخال النقدية الفعلية' 
    : difference === 0 
      ? 'مطابق' 
      : difference < 0 
        ? `عجز ${Math.abs(difference)} ${currencySymbol}` 
        : `فائض ${difference} ${currencySymbol}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !shift?.id) return;

    if (!isActualEntered || numActualCash === null) {
      toast.error('يرجى إدخال المبلغ النقدي الفعلي في الدرج قبل إغلاق الوردية');
      return;
    }

    if (numActualCash < 0) {
      toast.error('المبلغ الفعلي لا يمكن أن يكون سالباً');
      return;
    }

    if (difference !== 0 && !hasAcknowledgedDiff) {
      toast.error(`يرجى تأكيد الإقرار بوجود فارق بالدرج (${Math.abs(difference)} ${currencySymbol}) قبل إغلاق الوردية.`);
      return;
    }

    try {
      const result = await closeShift({
        client_id: clientId,
        shift_id: shift.id,
        closing_cash_actual: numActualCash,
        closing_cash_expected: expectedCash,
        cash_difference: difference,
        closed_by: clientUser?.id,
        user_id: clientUser?.id,
        closing_notes: notes.trim() || undefined,
      });

      const finalReportSummary: any = {
        ...(summary || {}),
        shift_id: shift.id,
        shift_number: shift.shift_number,
        closing_cash_actual: numActualCash,
        actual_cash: numActualCash,
        closing_cash_expected: expectedCash,
        expected_cash: expectedCash,
        cash_difference: difference,
        status: 'closed',
        closed_at: new Date().toISOString()
      };

      if (autoPrintZReport) {
        try {
          await POSPrintManager.printZReport(finalReportSummary, {
            businessName: 'Ordexa POS',
            cashierName: clientUser?.name || 'الكاشير',
            closedAt: new Date().toISOString()
          });
        } catch (printErr) {
          console.warn('Could not trigger thermal print for Z-report:', printErr);
        }
      }

      toast.success('تم إغلاق الوردية وتوثيق تسوية الصندوق بنجاح!');
      onClose();
      if (onShiftClosed) {
        onShiftClosed({
          ...shift,
          ...result,
          status: 'closed',
          closing_cash_actual: numActualCash,
          closing_cash_expected: expectedCash,
          cash_difference: difference,
          closed_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل إغلاق الوردية');
    }
  };

  const handleManualPrintZReport = async () => {
    if (!shift) return;
    setIsPrintingZReport(true);
    try {
      const finalReportSummary: any = {
        ...(summary || {}),
        shift_id: shift.id,
        shift_number: shift.shift_number,
        closing_cash_actual: numActualCash ?? expectedCash,
        actual_cash: numActualCash ?? expectedCash,
        closing_cash_expected: expectedCash,
        expected_cash: expectedCash,
        cash_difference: difference,
        status: 'closed',
        closed_at: new Date().toISOString()
      };

      const res = await POSPrintManager.printZReport(finalReportSummary, {
        businessName: 'Ordexa POS',
        cashierName: clientUser?.name || 'الكاشير',
        closedAt: new Date().toISOString()
      });
      if (res.success) {
        toast.success('تم إرسال تقرير Z-Report إلى الطابعة');
      } else {
        toast.error(res.error || 'تعذر الطباعة');
      }
    } catch {
      toast.error('حدث خطأ أثناء الطباعة');
    } finally {
      setIsPrintingZReport(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        id="close-shift-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">إغلاق الوردية وتسوية النقدية</h3>
                <span className="text-xs font-mono font-bold bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded">
                  {shift.shift_number}
                </span>
              </div>
              <p className="text-xs text-slate-500">جرد النقدية الفعلية ومطابقتها مع الحسابات النظامية (Z-Report)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Shift Financial Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1">الرصيد الافتتاحي</span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {(summary?.opening_cash || shift.opening_cash).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400 mr-1">{currencySymbol}</span>
            </div>

            <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl">
              <span className="text-[11px] font-semibold text-emerald-700 block mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                مبيعات نقدية (كاش)
              </span>
              <span className="font-mono text-sm font-bold text-emerald-900">
                {(summary?.total_cash_sales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600 mr-1">{currencySymbol}</span>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
              <span className="text-[11px] font-semibold text-blue-700 block mb-1 flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                مبيعات شبكة وبطاقات
              </span>
              <span className="font-mono text-sm font-bold text-blue-900">
                {(summary?.total_card_sales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-blue-600 mr-1">{currencySymbol}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-500 block mb-1 flex items-center gap-1">
                <Receipt className="w-3 h-3" />
                عدد الفواتير
              </span>
              <span className="font-mono text-sm font-bold text-slate-900">
                {summary?.orders_count || 0}
              </span>
              <span className="text-[10px] text-slate-400 mr-1">فاتورة</span>
            </div>
          </div>

          {/* Additional Cash In / Out movements if any */}
          {((summary?.total_cash_in || 0) > 0 || (summary?.total_cash_out || 0) > 0) && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 bg-amber-50/50 border border-amber-100 rounded-xl flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                  <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                  إيداعات نثرية إضافية:
                </span>
                <span className="font-mono text-xs font-bold text-amber-900">
                  +{(summary?.total_cash_in || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
              </div>
              <div className="p-2.5 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-800 flex items-center gap-1">
                  <ArrowUpLeft className="w-3.5 h-3.5 text-rose-600" />
                  سحوبات ومصروفات نقدية:
                </span>
                <span className="font-mono text-xs font-bold text-rose-900">
                  -{(summary?.total_cash_out || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
              </div>
            </div>
          )}

          {/* Actual Cash Input */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                المبلغ النقدي الفعلي في الدرج (Actual Cash) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-500">قم بعد النقدية الفعلية بالدرج وإدخالها هنا</span>
            </div>
            <div className="relative">
              <input
                id="shift-closing-actual-cash"
                type="number"
                step="any"
                min="0"
                value={actualCashStr}
                onChange={(e) => setActualCashStr(e.target.value)}
                placeholder="أدخل النقدية الفعلية (مثال: 1500.00)"
                className="w-full h-12 px-4 text-left font-mono text-xl font-black text-slate-900 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-600 focus:outline-none"
                dir="ltr"
                required
              />
            </div>
            {!isActualEntered && (
              <p className="text-[11px] text-amber-600 font-medium mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                يرجى إدخال المبلغ الفعلي المعدود لاحتساب الفارق ومطابقة الوردية (القيمة 0 مقبولة إن وجدت).
              </p>
            )}
          </div>

          {/* Explicit Variance Reconciliation Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. الرصيد المتوقع */}
            <div className="p-3.5 bg-slate-900 text-white rounded-xl shadow-xs">
              <span className="text-xs font-medium text-slate-300 block">الرصيد المتوقع:</span>
              <div className="font-mono text-lg font-black text-amber-400 mt-1">
                {expectedCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySymbol}
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                (افتتاح {summary?.opening_cash || shift.opening_cash} + كاش {summary?.total_cash_sales || 0} + إيداع {summary?.total_cash_in || 0} - سحب {summary?.total_cash_out || 0})
              </span>
            </div>

            {/* 2. النقدية الفعلية */}
            <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-xl">
              <span className="text-xs font-bold text-slate-600 block">النقدية الفعلية:</span>
              <div className="font-mono text-lg font-black text-slate-900 mt-1">
                {numActualCash !== null 
                  ? `${numActualCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`
                  : '---'}
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                المبلغ المعدود بالصندوق
              </span>
            </div>

            {/* 3. الفرق */}
            <div className={`p-3.5 border rounded-xl ${
              numActualCash === null 
                ? 'bg-slate-50 border-slate-200 text-slate-500' 
                : difference === 0 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : difference < 0 
                    ? 'bg-rose-50 border-rose-200 text-rose-900' 
                    : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}>
              <span className="text-xs font-bold block">الفرق:</span>
              <div className="font-mono text-lg font-black mt-1" dir="ltr">
                {numActualCash !== null 
                  ? `${difference > 0 ? `+${difference.toFixed(2)}` : difference.toFixed(2)} ${currencySymbol}`
                  : '---'}
              </div>
              <span className="text-[10px] opacity-80 block mt-0.5">
                (الفعلي - المتوقع)
              </span>
            </div>
          </div>

          {/* 4. الحالة الكلية البارزة */}
          <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
            numActualCash === null
              ? 'bg-slate-50 border-slate-200 text-slate-600'
              : difference === 0
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : difference < 0
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-blue-50 border-blue-300 text-blue-900'
          }`}>
            <div className="flex items-center gap-2.5">
              {numActualCash === null ? (
                <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0" />
              ) : difference === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className={`w-5 h-5 shrink-0 ${difference < 0 ? 'text-rose-600' : 'text-blue-600'}`} />
              )}
              <div>
                <span className="text-xs font-bold block">الحالة: {varianceStatus}</span>
                <span className="text-[11px] opacity-80">
                  {numActualCash === null
                    ? 'في انتظار كتابة النقد الفعلي لتحديد حالة التطابق أو العجز أو الفائض'
                    : difference === 0
                    ? 'النقدية الفعلية مطابقة تماماً للحركات والمبيعات'
                    : difference < 0
                    ? 'المبلغ الفعلي أقل من المتوقع نظامياً، سيتم توثيق العجز في تقرير الوردية'
                    : 'المبلغ الفعلي أكبر من المتوقع نظامياً، سيتم توثيق الفائض في تقرير الوردية'}
                </span>
              </div>
            </div>
            {numActualCash !== null && (
              <div className="font-mono text-base font-black shrink-0 px-3 py-1 bg-white/80 rounded-lg shadow-2xs">
                {difference === 0 ? 'مطابق' : difference < 0 ? `عجز ${Math.abs(difference)}` : `فائض ${difference}`}
              </div>
            )}
          </div>

          {/* Cash Difference Acknowledgment Checkbox when discrepancy exists */}
          {numActualCash !== null && difference !== 0 && (
            <label className="flex items-start gap-3 p-3.5 bg-amber-50/80 border-2 border-amber-300 rounded-xl text-xs font-bold text-amber-950 cursor-pointer shadow-xs select-none">
              <input
                id="shift-discrepancy-acknowledgment-checkbox"
                type="checkbox"
                checked={hasAcknowledgedDiff}
                onChange={(e) => setHasAcknowledgedDiff(e.target.checked)}
                className="w-5 h-5 text-amber-600 rounded border-amber-400 focus:ring-amber-500 mt-0.5 shrink-0"
              />
              <span className="leading-relaxed">
                أقر وأؤكد صحة النقدية الفعلية المدخلة ({numActualCash.toFixed(2)} {currencySymbol})، ووجود فارق قدره{' '}
                <span className="underline font-black">{Math.abs(difference).toFixed(2)} {currencySymbol}</span>{' '}
                ({difference < 0 ? 'عجز في الدرج' : 'فائض في الدرج'})، والموافقة على توثيقه رسمياً في تقرير Z-Report وسجل المحاسبة.
              </span>
            </label>
          )}

          {/* Closing Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              ملاحظات الإغلاق (بيان أسباب العجز أو الزيادة إن وجدت)
            </label>
            <textarea
              id="shift-closing-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`مثال: تسليم الوردية للمشرف، وفارق ${currencySymbol} تم إيداعه...`}
              className="w-full p-3 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
            />
          </div>

          {/* Auto Print Z-Report Option */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={autoPrintZReport}
                onChange={(e) => setAutoPrintZReport(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <span>طباعة إيصال التقرير Z-Report تلقائياً على الطابعة الحرارية</span>
            </label>

            <button
              type="button"
              onClick={handleManualPrintZReport}
              disabled={isPrintingZReport || !summary}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isPrintingZReport ? 'جارٍ الطباعة...' : 'معاينة / طباعة الآن'}</span>
            </button>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              disabled={isLoading}
            >
              تراجع
            </button>
            <button
              id="btn-confirm-close-shift"
              type="submit"
              disabled={isLoading || isFetchingSummary}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>جاري الإغلاق...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>إغلاق الوردية واعتماد Z-Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
