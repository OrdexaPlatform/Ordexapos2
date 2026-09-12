import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpLeft, DollarSign, X } from 'lucide-react';
import { useShiftStore } from '../../../store/shiftStore';
import { useAuthStore } from '../../../store/authStore';
import { Shift, CashDrawerMovementType } from '../../../types';
import toast from 'react-hot-toast';

interface CashMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift: Shift;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
  isOpen,
  onClose,
  shift,
}) => {
  const { clientUser } = useAuthStore();
  const clientId = clientUser?.client_id;
  const { recordCashMovement, isLoading } = useShiftStore();

  const [type, setType] = useState<CashDrawerMovementType>('cash_out');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>('');

  const quickReasons = {
    cash_out: ['مصروفات نثرية / ضيافة', 'شراء مستلزمات نظافة', 'توريد للخزينة الرئيسية (Safe Drop)', 'سحب أمان'],
    cash_in: ['إيداع عهدة إضافية للدرج', 'تغذية فئات نقدية (فكة)', 'إيداع نقدي طارئ'],
    drop_to_safe: ['توريد للخزينة الرئيسية (Safe Drop)'],
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !shift?.id) return;

    if (amount <= 0) {
      toast.error('مبلغ الحركة النقدية يجب أن يكون أكبر من الصفر');
      return;
    }

    if (!reason.trim()) {
      toast.error('يرجى كتابة سبب أو بيان الحركة النقدية');
      return;
    }

    try {
      await recordCashMovement({
        client_id: clientId,
        shift_id: shift.id,
        transaction_type: type,
        amount,
        reason: reason.trim(),
      });

      toast.success(
        type === 'cash_in'
          ? 'تم تسجيل إيداع النقدية بنجاح وتحديث رصيد الوردية'
          : 'تم تسجيل سحب النقدية بنجاح وتحديث رصيد الوردية'
      );
      setAmount(0);
      setReason('');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل الحركة النقدية');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        id="cash-movement-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
              type === 'cash_in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}>
              {type === 'cash_in' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpLeft className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">حركة نقدية بالدرج (Cash Movement)</h3>
              <p className="text-xs text-slate-500">وردية رقم: {shift.shift_number}</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Movement Type Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setType('cash_out')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                type === 'cash_out'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpLeft className="w-4 h-4 text-rose-500" />
              <span>سحب / مصروفات (Cash Out)</span>
            </button>
            <button
              type="button"
              onClick={() => setType('cash_in')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                type === 'cash_in'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDownRight className="w-4 h-4 text-emerald-500" />
              <span>إيداع / عهدة (Cash In)</span>
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              مبلغ الحركة النقدية <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <input
                id="cash-movement-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount === 0 ? '' : amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full h-12 pr-11 pl-4 text-left font-mono text-xl font-bold text-slate-900 bg-white border border-slate-200 rounded-xl focus:border-slate-800 focus:outline-none"
                dir="ltr"
                required
              />
            </div>
          </div>

          {/* Quick Reasons Chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              أسباب شائعة:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickReasons[type]?.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="px-2.5 py-1 text-[11px] font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              البيان / سبب الحركة <span className="text-rose-500">*</span>
            </label>
            <input
              id="cash-movement-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب سبب السحب أو الإيداع بالتفصيل..."
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-slate-800"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              disabled={isLoading}
            >
              إلغاء
            </button>
            <button
              id="btn-confirm-cash-movement"
              type="submit"
              disabled={isLoading}
              className={`px-6 py-2.5 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-2 ${
                type === 'cash_in'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isLoading ? (
                <span>جاري الحفظ...</span>
              ) : (
                <span>{type === 'cash_in' ? 'تأكيد الإيداع' : 'تأكيد السحب'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
