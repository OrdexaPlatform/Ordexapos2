import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign, 
  Truck, 
  Trash2, 
  Edit, 
  X, 
  Save, 
  RefreshCw 
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useCurrency } from '../../hooks/useCurrency';
import { erpService, Supplier } from '../../lib/erpService';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export function SuppliersPage() {
  const { client } = useClientStore();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
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
      loadSuppliers();
    }
  }, [client?.id]);

  const loadSuppliers = async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const data = await erpService.getSuppliers(client.id);
      setSuppliers(data);
    } catch {
      toast.error('حدث خطأ أثناء تحميل سجل الموردين');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (sup?: Supplier) => {
    if (sup) {
      setEditingSupplier(sup);
      setFormData({
        name: sup.name,
        company_name: sup.company_name || '',
        phone: sup.phone || '',
        email: sup.email || '',
        address: sup.address || '',
        tax_number: sup.tax_number || '',
        balance: sup.balance || 0,
        notes: sup.notes || '',
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '',
        company_name: '',
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

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;
    if (!formData.name.trim() && !formData.company_name.trim()) {
      toast.error('اسم المورد أو الشركة مطلوب');
      return;
    }

    setSubmitting(true);
    try {
      await erpService.saveSupplier(client.id, {
        ...(editingSupplier ? { id: editingSupplier.id } : {}),
        ...formData,
        name: formData.name || formData.company_name,
      });

      toast.success(editingSupplier ? 'تم تحديث بيانات المورد بنجاح' : 'تمت إضافة المورد بنجاح');
      setIsModalOpen(false);
      loadSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ بيانات المورد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!client?.id) return;
    if (!confirm(`هل أنت متأكد من حذف المورد "${name}"؟`)) return;

    try {
      await erpService.deleteSupplier(client.id, id);
      toast.success('تم حذف المورد بنجاح');
      loadSuppliers();
    } catch {
      toast.error('فشل حذف المورد');
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.company_name && s.company_name.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.tax_number && s.tax_number.includes(q))
    );
  });

  const totalPayables = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
            <Building2 className="h-3.5 w-3.5" />
            <span>سجل الموردين والتوريدات (Suppliers Hub)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            إدارة الموردين والشركات الموردة
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تسجيل الشركات الموردة، بيانات التواصل، الأرصدة المستحقة، وإصدار أوامر التوريد المباشرة.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadSuppliers()}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-xs hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي الموردين</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {suppliers.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">شركات وموزعون مسجلون بالنظام</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المستحقات للموردين</span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">
            {formatPrice(totalPayables)}
          </div>
          <div className="text-xs text-slate-400 mt-1">أرصدة آجلة مستحقة الدفع للموردين</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">المشتريات والتوريد</span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="text-base font-bold text-slate-900">
            أوامر الشراء المباشرة
          </div>
          <button
            onClick={() => navigate('/purchases')}
            className="text-xs text-blue-600 font-bold hover:underline mt-1 block text-right"
          >
            الانتقال لإدارة أوامر الشراء ←
          </button>
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
            placeholder="بحث باسم الشركة، المورد، رقم الهاتف، أو الرقم الضريبي..."
            className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-emerald-600" />
            <p className="text-sm font-bold">جاري تحميل سجل الموردين...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">لا يوجد موردون مطابقون للبحث</h3>
            <p className="text-xs text-slate-400 mt-1">
              أضف أول شركة موردة لتتمكن من إصدار أوامر شراء وتوريد بضائع المخزن.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 font-bold">
                <tr>
                  <th className="py-3.5 px-4">اسم المورد / الشركة</th>
                  <th className="py-3.5 px-4">الهاتف / البريد</th>
                  <th className="py-3.5 px-4">الرقم الضريبي</th>
                  <th className="py-3.5 px-4">الرصيد المستحق</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 font-black flex items-center justify-center text-xs shrink-0">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <div>{sup.company_name || sup.name}</div>
                          {sup.company_name && sup.name && sup.company_name !== sup.name && (
                            <div className="text-xs text-slate-400 font-normal">المسؤول: {sup.name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 font-mono">
                      <div>{sup.phone || '---'}</div>
                      {sup.email && <div className="text-slate-400">{sup.email}</div>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {sup.tax_number || '---'}
                    </td>
                    <td className="py-3.5 px-4 font-black">
                      {sup.balance ? (
                        <span className="text-amber-600 font-mono text-xs">
                          {formatPrice(sup.balance)}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs">0.00</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenModal(sup)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="تعديل"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(sup.id, sup.company_name || sup.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-black text-slate-900">
                  {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة شركة موردة جديدة'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الشركة الموردة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="مثال: شركة الأهرام للمشروبات"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم مندوب المبيعات / المسؤول
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: محمد عبد الله"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف / المندوب</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="sales@supplier.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي للمورد</label>
                  <input
                    type="text"
                    value={formData.tax_number}
                    onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                    placeholder="300xxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرصيد المستحق (الآجل)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان المقر أو المستودع</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="المدينة، المنطقة الصناعية..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وشروط التوريد</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="فترة السداد الآجل، الخصومات المتفق عليها..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري الحفظ...' : 'حفظ بيانات المورد'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
