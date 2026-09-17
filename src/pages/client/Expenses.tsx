import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  DollarSign, 
  FileText, 
  Trash2, 
  X, 
  Save, 
  RefreshCw, 
  CreditCard, 
  Banknote, 
  Building2, 
  AlertCircle 
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useCurrency } from '../../hooks/useCurrency';
import { useShiftStore } from '../../store/shiftStore';
import { erpService, Expense, EXPENSE_CATEGORIES } from '../../lib/erpService';
import toast from 'react-hot-toast';

export function ExpensesPage() {
  const { client } = useClientStore();
  const { activeShift: currentShift } = useShiftStore();
  const { formatPrice } = useCurrency();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    category: 'supplies' as Expense['category'],
    amount: '',
    payment_method: 'cash' as Expense['payment_method'],
    expense_date: new Date().toISOString().slice(0, 10),
    description: '',
    receipt_number: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (client?.id) {
      loadExpenses();
    }
  }, [client?.id]);

  const loadExpenses = async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const data = await erpService.getExpenses(client.id);
      setExpenses(data);
    } catch {
      toast.error('حدث خطأ أثناء تحميل سجل المصروفات');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;
    const numAmount = Number(formData.amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }
    if (!formData.description.trim()) {
      toast.error('يرجى كتابة بيان ووصف المصروف');
      return;
    }

    setSubmitting(true);
    try {
      await erpService.saveExpense(client.id, {
        category: formData.category,
        amount: numAmount,
        payment_method: formData.payment_method,
        expense_date: formData.expense_date,
        description: formData.description,
        receipt_number: formData.receipt_number,
        shift_id: currentShift?.id || undefined,
      });

      toast.success('تم تسجيل المصروف بنجاح' + (formData.payment_method === 'cash' && currentShift ? ' وخصمه من درج الكاشير' : ''));
      setIsModalOpen(false);
      setFormData({
        category: 'supplies',
        amount: '',
        payment_method: 'cash',
        expense_date: new Date().toISOString().slice(0, 10),
        description: '',
        receipt_number: '',
      });
      loadExpenses();
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل المصروف');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!client?.id) return;
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;

    try {
      await erpService.deleteExpense(client.id, id);
      toast.success('تم حذف المصروف بنجاح');
      loadExpenses();
    } catch {
      toast.error('فشل حذف المصروف');
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = 
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.receipt_number && e.receipt_number.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = categoryFilter === 'all' || e.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const totalExpensesAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const cashExpensesAmount = expenses
    .filter((e) => e.payment_method === 'cash')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 mb-2">
            <Wallet className="h-3.5 w-3.5" />
            <span>إدارة النفقات التشغيلية (Expenses Hub)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            سجل المصروفات التشغيلية والنثريات
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تسجيل مصروفات الإيجار، الرواتب، الفواتير، ومصروفات درج الكاشير مع تأثير مباشر على الأرباح.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadExpenses()}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-xs hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>تسجيل مصروف جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المصروفات المسجلة</span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatPrice(totalExpensesAmount)}
          </div>
          <div className="text-xs text-slate-400 mt-1">تشمل كافة الوسائل النقدية والبنكية</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">المصروفات النقدية (الكاش)</span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">
            {formatPrice(cashExpensesAmount)}
          </div>
          <div className="text-xs text-slate-400 mt-1">المسحوبة من درج النقدية والخزنة</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">حالة الوردية الحالية</span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="text-base font-bold text-slate-900">
            {currentShift ? `وردية مفتوحة (${currentShift.shift_number})` : 'لا توجد وردية مفتوحة'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {currentShift ? 'أي مصروف نقدي يخصم تلقائياً من الدرج' : 'المصروفات تسجل في الحساب العام'}
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالوصف، البيان، أو رقم السند..."
            className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none"
          >
            <option value="all">جميع التصنيفات</option>
            {Object.entries(EXPENSE_CATEGORIES).map(([key, cat]) => (
              <option key={key} value={key}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-rose-600" />
            <p className="text-sm font-bold">جاري تحميل سجل المصروفات...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Wallet className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">لا توجد مصروفات مسجلة</h3>
            <p className="text-xs text-slate-400 mt-1">
              سجل أول بند مصروفات لمتابعة التدفق النقدي وصافي أرباح المنشأة بدقة.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 font-bold">
                <tr>
                  <th className="py-3.5 px-4">التاريخ</th>
                  <th className="py-3.5 px-4">التصنيف</th>
                  <th className="py-3.5 px-4">البيان / الوصف</th>
                  <th className="py-3.5 px-4">طريقة الدفع</th>
                  <th className="py-3.5 px-4">المبلغ</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((exp) => {
                  const catInfo = EXPENSE_CATEGORIES[exp.category] || {
                    label: exp.category,
                    color: 'bg-slate-100 text-slate-700 border-slate-200',
                  };
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                        {new Date(exp.expense_date || exp.created_at).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div>{exp.description}</div>
                        {exp.receipt_number && (
                          <div className="text-xs text-slate-400 font-mono font-normal">
                            سند رقم: {exp.receipt_number}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-bold">
                          {exp.payment_method === 'cash' ? (
                            <>
                              <Banknote className="h-4 w-4 text-emerald-600" />
                              <span>نقدي (كاش)</span>
                            </>
                          ) : exp.payment_method === 'bank_transfer' ? (
                            <>
                              <Building2 className="h-4 w-4 text-blue-600" />
                              <span>تحويل بنكي</span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 text-purple-600" />
                              <span>بطاقة شبكة</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-black text-rose-600 font-mono">
                        -{formatPrice(exp.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="حذف المصروف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-rose-600" />
                <h2 className="text-lg font-black text-slate-900">تسجيل سند صرف جديد</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تصنيف المصروف <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none bg-slate-50 font-bold"
                  >
                    {Object.entries(EXPENSE_CATEGORIES).map(([key, cat]) => (
                      <option key={key} value={key}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المبلغ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none font-bold text-rose-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الدفع</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none bg-slate-50 font-bold"
                  >
                    <option value="cash">نقدي (كاش - درج الكاشير)</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="card">بطاقة مدى / شبكة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الصرف</label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البيان والوصف <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="مثال: شراء أحبار طابعة فواتير ومستلزمات نظافة"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفاتورة / السند المرجعي (اختياري)</label>
                <input
                  type="text"
                  value={formData.receipt_number}
                  onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                  placeholder="مثال: REC-9921"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              {formData.payment_method === 'cash' && currentShift && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    سيتم تسجيل هذا المصروف كحركة سحب نقدي (Cash Out) تخصم من رصيد درج الوردية المفتوحة حالياً ({currentShift.shift_number}).
                  </span>
                </div>
              )}

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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري التسجيل...' : 'حفظ سند الصرف'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
