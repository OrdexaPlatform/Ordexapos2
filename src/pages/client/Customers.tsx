import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  DollarSign, 
  ShoppingBag, 
  Trash2, 
  Edit, 
  X, 
  Save, 
  RefreshCw, 
  ArrowUpRight, 
  Coins 
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useCurrency } from '../../hooks/useCurrency';
import { erpService, Customer } from '../../lib/erpService';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export function CustomersPage() {
  const { client } = useClientStore();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    tax_number: '',
    balance: 0,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (client?.id) {
      loadCustomers();
    }
  }, [client?.id]);

  const loadCustomers = async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const data = await erpService.getCustomers(client.id);
      setCustomers(data);
    } catch (err: any) {
      toast.error('حدث خطأ أثناء تحميل سجل العملاء');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (cust?: Customer) => {
    if (cust) {
      setEditingCustomer(cust);
      setFormData({
        name: cust.name,
        phone: cust.phone || '',
        email: cust.email || '',
        address: cust.address || '',
        tax_number: cust.tax_number || '',
        balance: cust.balance || 0,
        notes: cust.notes || '',
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        tax_number: '',
        balance: 0,
        notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;
    if (!formData.name.trim()) {
      toast.error('اسم العميل مطلوب');
      return;
    }

    setSubmitting(true);
    try {
      await erpService.saveCustomer(client.id, {
        ...(editingCustomer ? { id: editingCustomer.id } : {}),
        ...formData,
      });

      toast.success(editingCustomer ? 'تم تحديث بيانات العميل بنجاح' : 'تمت إضافة العميل بنجاح');
      setIsModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ بيانات العميل');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!client?.id) return;
    if (id === 'cust-general') {
      toast.error('لا يمكن حذف حساب العميل العام الافتراضي');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف العميل "${name}"؟`)) return;

    try {
      await erpService.deleteCustomer(client.id, id);
      toast.success('تم حذف العميل بنجاح');
      loadCustomers();
    } catch {
      toast.error('فشل حذف العميل');
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.tax_number && c.tax_number.includes(q))
    );
  });

  const totalReceivables = customers
    .filter((c) => c.balance < 0)
    .reduce((sum, c) => sum + Math.abs(c.balance), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
            <Users className="h-3.5 w-3.5" />
            <span>علاقات العملاء والحسابات (CRM)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            سجل العملاء والحسابات المدينة
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إدارة بيانات العملاء، الأرصدة والديون، أرقام التواصل، والربط المباشر مع نقاط البيع.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadCustomers()}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-xs hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة عميل جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي العملاء المسجلين</span>
            <div className="h-8 w-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {customers.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">عملاء متاحين للربط بالفواتير</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المستحقات (ديون العملاء)</span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600">
            {formatPrice(totalReceivables)}
          </div>
          <div className="text-xs text-slate-400 mt-1">مبالغ مؤجلة على حسابات العملاء</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">العميل الافتراضي السريع</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="text-base font-bold text-slate-900 truncate">
            عميل نقدي عام
          </div>
          <div className="text-xs text-emerald-600 mt-1 font-bold">مفعل افتراضياً للكاشير</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم العميل، رقم الهاتف، أو الرقم الضريبي..."
            className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-indigo-600" />
            <p className="text-sm font-bold">جاري تحميل سجل العملاء...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">لا يوجد عملاء مطابقين للبحث</h3>
            <p className="text-xs text-slate-400 mt-1">أضف عملاء جدد لحفظ حساباتهم وربطهم بنقاط البيع.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 font-bold">
                <tr>
                  <th className="py-3.5 px-4">اسم العميل</th>
                  <th className="py-3.5 px-4">الهاتف / البريد</th>
                  <th className="py-3.5 px-4">الرقم الضريبي</th>
                  <th className="py-3.5 px-4">الرصيد الحالي</th>
                  <th className="py-3.5 px-4">إجمالي المشتريات</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 font-black flex items-center justify-center text-xs shrink-0">
                          {cust.name.slice(0, 1)}
                        </div>
                        <div>
                          <div>{cust.name}</div>
                          {cust.address && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-normal">
                              <MapPin className="h-3 w-3" />
                              <span>{cust.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 font-mono">
                      <div>{cust.phone || '---'}</div>
                      {cust.email && <div className="text-slate-400">{cust.email}</div>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {cust.tax_number || '---'}
                    </td>
                    <td className="py-3.5 px-4 font-black">
                      {cust.balance === 0 ? (
                        <span className="text-slate-500 font-mono text-xs">0.00</span>
                      ) : cust.balance > 0 ? (
                        <span className="text-emerald-600 font-mono text-xs">
                          +{formatPrice(cust.balance)} (دائن)
                        </span>
                      ) : (
                        <span className="text-rose-600 font-mono text-xs">
                          {formatPrice(Math.abs(cust.balance))} (مدين)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {formatPrice(cust.total_spent || 0)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenModal(cust)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="تعديل البيانات"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {cust.id !== 'cust-general' && (
                          <button
                            onClick={() => handleDelete(cust.id, cust.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-black text-slate-900">
                  {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم العميل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: أحمد محمد علي"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي (إن وجد)</label>
                  <input
                    type="text"
                    value={formData.tax_number}
                    onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                    placeholder="300xxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
                  />
                  <span className="text-[10px] text-slate-400">موجب = له رصيد، سالب = عليه دين</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="المدينة، الشارع، الحي..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="ملاحظات العميل أو شروط البيع الآجل..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري الحفظ...' : 'حفظ بيانات العميل'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
