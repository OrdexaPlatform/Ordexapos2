import React, { useState, useEffect } from 'react';
import { 
  X, 
  Banknote, 
  CreditCard, 
  Building, 
  Smartphone, 
  Check, 
  AlertCircle, 
  Loader2,
  ReceiptText
} from 'lucide-react';
import { PaymentMethod } from '../../types';
import { formatCurrency } from '../../lib/salesService';
import { useCurrency } from '../../hooks/useCurrency';

interface POSPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemsCount: number;
  onConfirmPayment: (paymentData: {
    paymentMethod: PaymentMethod;
    amountPaid: number;
    reference?: string;
    notes?: string;
  }) => Promise<void>;
}

export const POSPaymentModal: React.FC<POSPaymentModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  discount,
  tax,
  total,
  itemsCount,
  onConfirmPayment
}) => {
  const { currencySymbol } = useCurrency();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [receivedAmount, setReceivedAmount] = useState<number>(total);
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('cash');
      setReceivedAmount(total);
      setReference('');
      setNotes('');
      setErrorMessage(null);
      setIsProcessing(false);
    }
  }, [isOpen, total]);

  if (!isOpen) return null;

  const changeAmount = Math.max(0, receivedAmount - total);
  const isCash = paymentMethod === 'cash';
  const isInsufficient = isCash && receivedAmount < total;

  const handleSelectMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method !== 'cash') {
      setReceivedAmount(total);
    }
  };

  const handleQuickCash = (amount: number) => {
    setReceivedAmount(amount);
  };

  const handleAddCash = (amount: number) => {
    setReceivedAmount(prev => (prev || 0) + amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInsufficient) {
      setErrorMessage('المبلغ المدفوع أقل من إجمالي الفاتورة المطلوبة');
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      await onConfirmPayment({
        paymentMethod,
        amountPaid: isCash ? receivedAmount : total,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined
      });
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء معالجة الدفع');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">تأكيد عملية البيع والدفع</h3>
              <p className="text-xs text-slate-400">إجمالي الأصناف: {itemsCount} عنصر</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex justify-between items-center text-xs text-slate-600 mb-1">
              <span>المجموع الفرعي:</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between items-center text-xs text-rose-600 mb-1">
                <span>الخصم المطبق:</span>
                <span className="font-mono">- {formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-slate-600 mb-2">
              <span>ضريبة القيمة المضافة:</span>
              <span className="font-mono">{formatCurrency(tax)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="text-sm font-bold text-slate-900">المبلغ الإجمالي المستحق:</span>
              <span className="text-xl font-extrabold text-indigo-700 font-mono">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              طريقة الدفع
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectMethod('cash')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 shadow-xs ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1.5 text-emerald-600" />
                <span>نقداً (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMethod('card')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                  paymentMethod === 'card'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 shadow-xs ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1.5 text-indigo-600" />
                <span>بطاقة بنكية</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMethod('bank_transfer')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                  paymentMethod === 'bank_transfer'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 shadow-xs ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Building className="w-5 h-5 mb-1.5 text-amber-600" />
                <span>تحويل بنكي</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMethod('wallet')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition-all ${
                  paymentMethod === 'wallet'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 shadow-xs ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1.5 text-sky-600" />
                <span>محفظة / أبل باي</span>
              </button>
            </div>
          </div>

          {/* Cash Received Details */}
          {isCash && (
            <div className="space-y-3 p-4 bg-emerald-50/40 border border-emerald-200 rounded-xl">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    المبلغ المستلم من العميل
                  </label>
                  <span className="text-[11px] text-slate-500">أدخل المبلغ المستلم لحساب الباقي</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={receivedAmount || ''}
                    onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
                    autoFocus
                    className="w-full px-4 py-2.5 text-lg font-bold font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-left dir-ltr"
                    placeholder="0.00"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {currencySymbol}
                  </div>
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleQuickCash(total)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-emerald-300 text-emerald-800 rounded-lg hover:bg-emerald-50 transition-colors shadow-2xs"
                >
                  المبلغ بالضبط ({Math.ceil(total)})
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCash(10)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  +10
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCash(20)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  +20
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCash(50)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  +50
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCash(100)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  +100
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCash(500)}
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  500 {currencySymbol}
                </button>
              </div>

              {/* Change Box */}
              <div className="pt-2 border-t border-emerald-200 flex justify-between items-center text-xs font-bold">
                <span className="text-slate-700">المتبقي للعميل (الفكة / Change):</span>
                <span className={`text-base font-extrabold font-mono ${changeAmount > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                  {formatCurrency(changeAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Reference / Auth Code for non-cash */}
          {!isCash && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم العملية / المرجع البنكي (اختياري)
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="رقم الإيصال أو كود التفويض البنكي"
                className="w-full px-3.5 py-2 text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Error notice */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isProcessing || isInsufficient}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري تسجيل الفاتورة وتحديث المخزون...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>تأكيد البيع وإصدار الفاتورة ({formatCurrency(total)})</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
