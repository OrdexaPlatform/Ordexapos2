import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Building2, 
  Boxes, 
  Package, 
  DollarSign, 
  ArrowDownLeft, 
  Trash2, 
  Eye, 
  X, 
  Save, 
  RefreshCw 
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useCurrency } from '../../hooks/useCurrency';
import { erpService, Purchase, Supplier, PurchaseItem } from '../../lib/erpService';
import { fetchProducts } from '../../lib/productService';
import { Product } from '../../types';
import toast from 'react-hot-toast';

export function PurchasesPage() {
  const { client } = useClientStore();
  const { formatPrice, currencySymbol } = useCurrency();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'ordered' | 'received'>('all');

  // Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  // New Purchase Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemUnitCost, setItemUnitCost] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (client?.id) {
      loadData();
    }
  }, [client?.id]);

  const loadData = async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const [pData, sData, prData] = await Promise.all([
        erpService.getPurchases(client.id),
        erpService.getSuppliers(client.id),
        fetchProducts(client.id).catch(() => []),
      ]);
      setPurchases(pData);
      setSuppliers(sData);
      setProducts(prData);
    } catch (err: any) {
      console.error('Error loading purchases data:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات المشتريات');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (!selectedProductId) {
      toast.error('يرجى اختيار الصنف');
      return;
    }
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    if (itemQuantity <= 0) {
      toast.error('الكمية يجب أن تكون أكبر من 0');
      return;
    }
    if (itemUnitCost < 0) {
      toast.error('تكلفة الوحدة غير صحيحة');
      return;
    }

    const totalCost = itemQuantity * itemUnitCost;
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity: itemQuantity,
        unit_cost: itemUnitCost,
        total_cost: totalCost,
      },
    ]);

    setSelectedProductId('');
    setItemQuantity(1);
    setItemUnitCost(0);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      setItemUnitCost(Number(prod.cost_price || 0));
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;
    if (items.length === 0) {
      toast.error('يرجى إضافة صنف واحد على الأقل لأمر الشراء');
      return;
    }

    let finalSupplierName = supplierName;
    if (selectedSupplierId) {
      const supp = suppliers.find((s) => s.id === selectedSupplierId);
      if (supp) finalSupplierName = supp.company_name || supp.name;
    }
    if (!finalSupplierName) {
      finalSupplierName = 'مورد عام';
    }

    const totalAmount = items.reduce((sum, item) => sum + item.total_cost, 0);

    setSubmitting(true);
    try {
      const newPO = await erpService.savePurchase(client.id, {
        supplier_id: selectedSupplierId || undefined,
        supplier_name: finalSupplierName,
        warehouse_id: client.id,
        status: 'ordered',
        total_amount: totalAmount,
        paid_amount: 0,
        payment_status: 'unpaid',
        items,
        notes,
      });

      toast.success(`تم إنشاء أمر الشراء رقم ${newPO.invoice_number} بنجاح`);
      setIsNewModalOpen(false);
      // Reset form
      setItems([]);
      setSelectedSupplierId('');
      setSupplierName('');
      setNotes('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ أمر الشراء');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveOrder = async (purchase: Purchase) => {
    if (!client?.id) return;
    if (!confirm(`هل أنت متأكد من استلام أمر الشراء ${purchase.invoice_number} وإدخال كمياته إلى المخزون تلقائياً؟`)) {
      return;
    }

    try {
      toast.loading('جاري استلام الشحنة وإدخال الأصناف للمخزون...', { id: 'receive-po' });
      await erpService.receivePurchaseOrder(client.id, purchase.id, client.id);
      toast.success('تم استلام الشحنة وتحديث أرصدة المخزون بنجاح!', { id: 'receive-po' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'فشل استلام الشحنة', { id: 'receive-po' });
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch = 
      (p.invoice_number && p.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.supplier_name && p.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPurchasesCost = purchases
    .filter((p) => p.status === 'received')
    .reduce((sum, p) => sum + Number(p.total_amount || 0), 0);

  const pendingReceivingCount = purchases.filter((p) => p.status === 'ordered').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-2">
            <Truck className="h-3.5 w-3.5" />
            <span>سلسلة الإمداد والمشتريات (Supply Chain)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            إدارة المشتريات وأوامر التوريد
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إنشاء فواتير الشراء، متابعة التوريدات من الموردين، وإدخال الكميات للمستودعات تلقائياً.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-xs hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>فاتورة شراء جديدة</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المشتريات المستلمة</span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatPrice(totalPurchasesCost)}
          </div>
          <div className="text-xs text-slate-400 mt-1">بناءً على الشحنات التي تم إدخالها للمستودع</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">شحنات بانتظار الاستلام</span>
            <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">
            {pendingReceivingCount}
          </div>
          <div className="text-xs text-slate-400 mt-1">أوامر شراء مسجلة لم يتم فحصها واستلامها بعد</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">الموردون المعتمدون</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {suppliers.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">موردون مسجلون في قاعدة البيانات</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم أمر الشراء أو اسم المورد..."
            className="w-full pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setStatusFilter('ordered')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'ordered' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              بانتظار الاستلام
            </button>
            <button
              onClick={() => setStatusFilter('received')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'received' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              مستلمة
            </button>
          </div>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-600" />
            <p className="text-sm font-bold">جاري تحميل سجل المشتريات...</p>
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Truck className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">لا توجد أوامر شراء مطابقة</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              يمكنك البدء بإنشاء أول فاتورة توريد لتسجيل البضائع وإدخال كمياتها لمستودعك.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-500 font-bold">
                <tr>
                  <th className="py-3.5 px-4">رقم الفاتورة</th>
                  <th className="py-3.5 px-4">المورد</th>
                  <th className="py-3.5 px-4">التاريخ</th>
                  <th className="py-3.5 px-4">عدد الأصناف</th>
                  <th className="py-3.5 px-4">الإجمالي</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-600">
                      {po.invoice_number}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <span>{po.supplier_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(po.purchase_date || po.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-bold">
                      {po.items?.length || 0} صنف
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      {formatPrice(po.total_amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      {po.status === 'received' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>تم الاستلام والمخزن</span>
                        </span>
                      ) : po.status === 'ordered' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3" />
                          <span>بانتظار الاستلام</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                          <span>مسودة</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {po.status !== 'received' && (
                          <button
                            onClick={() => handleReceiveOrder(po)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                            title="إدخال الكميات للمستودع"
                          >
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                            <span>استلام للمخزن</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPurchase(po)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                          title="عرض التفاصيل"
                        >
                          <Eye className="h-4 w-4" />
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

      {/* New Purchase Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-black text-slate-900">إنشاء أمر شراء وتوريد جديد</h2>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePurchase} className="p-6 space-y-5">
              {/* Supplier Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المورد المسجل
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      setSelectedSupplierId(e.target.value);
                      if (e.target.value) {
                        const s = suppliers.find((sup) => sup.id === e.target.value);
                        if (s) setSupplierName(s.company_name || s.name);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
                  >
                    <option value="">-- اختر مورد أو أدخل الاسم يدوياً --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.company_name || s.name} ({s.phone || 'بدون هاتف'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المورد (حر)
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="مثال: شركة التوريدات المتحدة"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  الأصناف الموردة
                </h3>

                {/* Add Item Row */}
                <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100 flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">الصنف</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => handleProductSelect(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white"
                    >
                      <option value="">-- اختر الصنف من المخزن --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (تكلفة: {formatPrice(p.cost_price || 0)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">الكمية</label>
                    <input
                      type="number"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(Math.max(1, Number(e.target.value)))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-center font-bold"
                    />
                  </div>

                  <div className="w-28">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">تكلفة الوحدة</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={itemUnitCost}
                      onChange={(e) => setItemUnitCost(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-center font-bold"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shrink-0"
                  >
                    إضافة للقائمة
                  </button>
                </div>

                {/* Items List */}
                {items.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 font-bold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">الصنف</th>
                          <th className="py-2 px-3 text-center">الكمية</th>
                          <th className="py-2 px-3 text-center">التكلفة</th>
                          <th className="py-2 px-3 text-center">الإجمالي</th>
                          <th className="py-2 px-3 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-bold text-slate-800">{it.product_name}</td>
                            <td className="py-2 px-3 text-center font-mono">{it.quantity}</td>
                            <td className="py-2 px-3 text-center font-mono">{formatPrice(it.unit_cost)}</td>
                            <td className="py-2 px-3 text-center font-black text-blue-700">{formatPrice(it.total_cost)}</td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs font-black">
                      <span>إجمالي الفاتورة:</span>
                      <span className="text-base text-blue-700">
                        {formatPrice(items.reduce((s, it) => s + it.total_cost, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات الشحنة أو شروط الدفع..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري الحفظ...' : 'حفظ أمر الشراء'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-base font-black text-slate-900">
                  تفاصيل أمر الشراء {selectedPurchase.invoice_number}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">المورد: {selectedPurchase.supplier_name}</p>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">الصنف</th>
                      <th className="py-2.5 px-3 text-center">الكمية</th>
                      <th className="py-2.5 px-3 text-center">السعر</th>
                      <th className="py-2.5 px-3 text-center">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPurchase.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-bold">{it.product_name}</td>
                        <td className="py-2 px-3 text-center font-mono">{it.quantity}</td>
                        <td className="py-2 px-3 text-center font-mono">{formatPrice(it.unit_cost)}</td>
                        <td className="py-2 px-3 text-center font-black">{formatPrice(it.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl text-blue-900 font-black">
                <span>المبلغ الكلي:</span>
                <span className="text-base">{formatPrice(selectedPurchase.total_amount)}</span>
              </div>

              {selectedPurchase.notes && (
                <p className="text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="font-bold">ملاحظات:</span> {selectedPurchase.notes}
                </p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedPurchase(null)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
