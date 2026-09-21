import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Vault, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Banknote, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  DollarSign, 
  Plus, 
  RefreshCw, 
  Filter, 
  X, 
  Save, 
  Clock 
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useShiftStore } from '../../store/shiftStore';
import { useCurrency } from '../../hooks/useCurrency';
import { supabase } from '../../lib/supabase';
import { offlineStorage } from '../../lib/offline/offlineStorage';
import toast from 'react-hot-toast';

interface DrawerTransaction {
  id: string;
  client_id: string;
  shift_id?: string;
  transaction_type: 'cash_in' | 'cash_out' | 'opening_balance' | 'closing_balance' | 'drop_to_safe';
  amount: number;
  reason?: string;
  performed_by?: string;
  created_at: string;
}

export function TreasuryPage() {
  const { client } = useClientStore();
  const { activeShift: currentShift, loadActiveShift, recordCashMovement } = useShiftStore();
  const { formatPrice } = useCurrency();

  const [transactions, setTransactions] = useState<DrawerTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick Action Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (client?.id) {
      loadActiveShift(client.id);
      loadTransactions();
    }
  }, [client?.id, currentShift?.id]);

  const loadTransactions = async () => {
    if (!client?.id) return;
    setLoading(true);
    let list: DrawerTransaction[] = [];
    try {
      const { data, error } = await supabase
        .from('cash_drawer_transactions')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        list = data as DrawerTransaction[];
      }
    } catch (e) {
      console.warn('Error loading cash drawer transactions from server:', e);
    }

    // Merge offline pending cash movements
    try {
      const pending = await offlineStorage.getPendingCashMovements(client.id);
      if (pending && pending.length > 0) {
        const pendingMapped: DrawerTransaction[] = pending.map((p) => ({
          id: p.local_transaction_id,
          client_id: p.client_id,
          shift_id: p.local_shift_id,
          transaction_type: p.transaction_type,
          amount: p.amount,
          reason: `${p.reason} (معلق دون اتصال)`,
          created_at: p.created_at,
        }));
        const existingIds = new Set(list.map((t) => t.id));
        const toAdd = pendingMapped.filter((p) => !existingIds.has(p.id));
        list = [...toAdd, ...list];
      }
    } catch (e) {
      console.warn('Error loading local cash movements:', e);
    } finally {
      setTransactions(list);
      setLoading(false);
    }
  };

  const handleOpenMovementModal = (type: 'cash_in' | 'cash_out') => {
    if (!currentShift || currentShift.status !== 'open' || !currentShift.id) {
      toast.error('يجب فتح وردية أولاً لإجراء حركة على الخزينة.');
      return;
    }
    setTxType(type);
    setIsModalOpen(true);
  };

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    if (!currentShift || currentShift.status !== 'open' || !currentShift.id) {
      toast.error('يجب فتح وردية أولاً لإجراء حركة على الخزينة.');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (!reason.trim()) {
      toast.error('يرجى كتابة سبب الإيداع أو السحب');
      return;
    }

    setSubmitting(true);
    try {
      await recordCashMovement({
        client_id: client.id,
        shift_id: currentShift.id,
        transaction_type: txType,
        amount: numAmount,
        reason: reason.trim(),
      });

      toast.success(txType === 'cash_in' ? 'تم إيداع المبلغ بالدرج بنجاح' : 'تم تسجيل سحب المبلغ من الدرج بنجاح');
      setIsModalOpen(false);
      setAmount('');
      setReason('');
      await loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل حركة النقدية');
    } finally {
      setSubmitting(false);
    }
  };

  // Compute shift cash metrics
  const openingCash = Number(currentShift?.opening_cash || 0);
  const shiftTransactions = transactions.filter((t) => t.shift_id === currentShift?.id);
  const shiftCashIn = shiftTransactions
    .filter((t) => t.transaction_type === 'cash_in')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const shiftCashOut = shiftTransactions
    .filter((t) => t.transaction_type === 'cash_out')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expectedCashInDrawer = openingCash + shiftCashIn - shiftCashOut;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 mb-2">
            <Vault className="h-3.5 w-3.5" />
            <span>إدارة الخزينة والسيولة النقدية (Treasury & Cash Drawer)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            الخزينة النقدية ومتابعة حركة درج الكاشير
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            متابعة رصيد النقدية اللحظي، عمليات الإيداع والسحب اليدوي، ومطابقة الدرج مع المبيعات.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadTransactions()}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenMovementModal('cash_in')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <ArrowDownLeft className="h-4 w-4" />
            <span>إيداع نقدية بالدرج</span>
          </button>

          <button
            onClick={() => handleOpenMovementModal('cash_out')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>سحب نقدية من الدرج</span>
          </button>
        </div>
      </div>

      {/* No active shift warning banner */}
      {(!currentShift || currentShift.status !== 'open' || !currentShift.id) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-900 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-950">لا توجد وردية مفتوحة حالياً للكاشير</h3>
              <p className="text-xs text-amber-700 mt-0.5 font-medium">
                يجب فتح وردية أولاً لتتمكن من تسجيل إيداعات أو سحوبات نقدية ومطابقة رصيد الدرج.
              </p>
            </div>
          </div>
          <Link
            to="/shifts"
            className="inline-flex items-center justify-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
          >
            فتح وردية الآن
          </Link>
        </div>
      )}

      {/* Real-time Drawer Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">الرصيد الافتتاحي للوردية</span>
            <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800">
            {formatPrice(openingCash)}
          </div>
          <div className="text-xs text-slate-400 mt-1">بداية فتح الوردية الحالية</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المقبوضات النقدية</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            +{formatPrice(shiftCashIn)}
          </div>
          <div className="text-xs text-slate-400 mt-1">مبيعات نقدية + إيداعات إضافية</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المسحوبات النقدية</span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600">
            -{formatPrice(shiftCashOut)}
          </div>
          <div className="text-xs text-slate-400 mt-1">مصروفات نقدية وسحوبات الدرج</div>
        </div>

        <div className="bg-amber-500/10 p-5 rounded-2xl border-2 border-amber-500/30 shadow-xs">
          <div className="flex items-center justify-between text-amber-800 mb-2">
            <span className="text-xs font-black">الرصيد الفعلي المتوقع بالدرج</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black">
              <Vault className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-900">
            {formatPrice(expectedCashInDrawer)}
          </div>
          <div className="text-xs text-amber-700 mt-1 font-bold">الرصيد المفترض وجوده بالدرج الآن</div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">سجل حركات النقدية والدرج (Cash Drawer Log)</h2>
          <span className="text-xs font-bold text-slate-400">آخر 50 حركة مسجلة</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-amber-600" />
            <p className="text-sm font-bold">جاري تحميل سجل حركات النقدية...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Vault className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">لا توجد حركات نقدية مسجلة بعد</h3>
            <p className="text-xs text-slate-400 mt-1">
              يتم تسجيل حركات النقدية آلياً عند إتمام المبيعات النقدية أو تسجيل المصروفات.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 font-bold">
                <tr>
                  <th className="py-3.5 px-4">التاريخ والوقت</th>
                  <th className="py-3.5 px-4">نوع الحركة</th>
                  <th className="py-3.5 px-4">البيان والسبب</th>
                  <th className="py-3.5 px-4">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t) => {
                  const isPositive = t.transaction_type === 'cash_in' || t.transaction_type === 'opening_balance';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                        {new Date(t.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3.5 px-4">
                        {t.transaction_type === 'cash_in' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ArrowDownLeft className="h-3 w-3" />
                            <span>إيداع / مبيعات</span>
                          </span>
                        ) : t.transaction_type === 'cash_out' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <ArrowUpRight className="h-3 w-3" />
                            <span>سحب / مصروف</span>
                          </span>
                        ) : t.transaction_type === 'opening_balance' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="h-3 w-3" />
                            <span>افتتاح وردية</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                            <span>إغلاق وردية</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {t.reason || 'حركة نقدية بالدرج'}
                      </td>
                      <td className={`py-3.5 px-4 font-black font-mono ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '+' : '-'}{formatPrice(t.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Movement Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Vault className="h-5 w-5 text-amber-600" />
                <h2 className="text-lg font-black text-slate-900">
                  {txType === 'cash_in' ? 'إيداع نقدية بالدرج (Cash In)' : 'سحب نقدية من الدرج (Cash Out)'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMovement} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المبلغ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-base font-black focus:ring-2 focus:ring-amber-500 focus:outline-none text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  السبب والبيان <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={txType === 'cash_in' ? 'مثال: فكة إضافية للكاشير' : 'مثال: سحب نقدي للمالك أو توريد بنكي'}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 ${
                    txType === 'cash_in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري التسجيل...' : 'تأكيد الحركة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
