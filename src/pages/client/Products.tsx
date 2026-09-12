import React, { useState, useEffect, useCallback } from 'react';
import { useClientStore } from '../../store/clientStore';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import { PermissionGuard } from '../../components/client/PermissionGuard';
import { 
  fetchProducts, 
  createProduct, 
  updateProduct, 
  toggleProductActive,
  fetchProductCategories,
  createProductCategory,
  fetchProductBrands,
  createProductBrand,
  fetchProductUnits,
  createProductUnit,
  ensureDefaultUnits,
  fetchProductDetails,
  CreateProductInput,
} from '../../lib/productService';
import { 
  Product, 
  ProductCategory, 
  ProductBrand, 
  ProductUnit 
} from '../../types';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Edit, 
  Power, 
  Barcode, 
  Tag, 
  Layers, 
  RefreshCw, 
  X, 
  Save, 
  Warehouse,
  Boxes,
  Percent,
  Check,
  Building2,
  DollarSign
} from 'lucide-react';
import toast from 'react-hot-toast';

export function ProductsPage() {
  const { client } = useClientStore();
  const { clientUser } = useAuthStore();
  const { hasPermission } = usePermissions();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [loading, setLoading] = useState(true);

  // Statistics
  const [stats, setStats] = useState({
    totalProducts: 0,
    activeProducts: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
  });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Quick inline creation state in modal
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSymbol, setNewUnitSymbol] = useState('');

  // Form state for Create / Edit
  const [formState, setFormState] = useState<CreateProductInput>({
    name: '',
    sku: '',
    barcode: '',
    description: '',
    category_id: '',
    brand_id: '',
    unit_id: '',
    cost_price: 0,
    selling_price: 0,
    tax_rate: 15,
    min_stock: 5,
    track_stock: true,
    is_active: true,
    additional_barcodes: [],
  });

  const loadReferenceData = useCallback(async () => {
    if (!client?.id) return;
    try {
      const [cats, brs, uns] = await Promise.all([
        fetchProductCategories(client.id),
        fetchProductBrands(client.id),
        ensureDefaultUnits(client.id),
      ]);
      setCategories(cats);
      setBrands(brs);
      setUnits(uns);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  }, [client?.id]);

  const loadProducts = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const res = await fetchProducts(client.id, {
        search: searchQuery,
        categoryId: categoryFilter,
        brandId: brandFilter,
        stockStatus: stockStatusFilter,
        isActive: statusFilter === 'all' ? 'all' : statusFilter === 'true',
      });
      setProducts(res.products);
      setStats(res.stats);
    } catch (err: any) {
      toast.error(err.message || 'تعذر تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, [client?.id, searchQuery, categoryFilter, brandFilter, stockStatusFilter, statusFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Generate random SKU helper
  const handleGenerateRandomSku = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    setFormState(prev => ({ ...prev, sku: `SKU-${random}` }));
  };

  // Generate random Barcode helper (EAN-13 style random)
  const handleGenerateRandomBarcode = () => {
    const rand = Math.floor(100000000000 + Math.random() * 900000000000);
    setFormState(prev => ({ ...prev, barcode: `628${rand}`.slice(0, 13) }));
  };

  const openAddModal = () => {
    setFormState({
      name: '',
      sku: `SKU-${Math.floor(100000 + Math.random() * 900000)}`,
      barcode: '',
      description: '',
      category_id: categories[0]?.id || '',
      brand_id: brands[0]?.id || '',
      unit_id: units[0]?.id || '',
      cost_price: 0,
      selling_price: 0,
      tax_rate: 15,
      min_stock: 5,
      track_stock: true,
      is_active: true,
      additional_barcodes: [],
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setSelectedProduct(product);
    setFormState({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      description: product.description || '',
      category_id: product.category_id || '',
      brand_id: product.brand_id || '',
      unit_id: product.unit_id || '',
      cost_price: Number(product.cost_price) || 0,
      selling_price: Number(product.selling_price) || 0,
      tax_rate: Number(product.tax_rate) || 0,
      min_stock: Number(product.min_stock) || 0,
      track_stock: product.track_stock,
      is_active: product.is_active,
      additional_barcodes: [],
    });
    setIsEditModalOpen(true);
  };

  const openDetailsModal = async (product: Product) => {
    if (!client?.id) return;
    try {
      const details = await fetchProductDetails(product.id, client.id);
      setSelectedProduct(details || product);
      setIsDetailsModalOpen(true);
    } catch (err: any) {
      toast.error('فشل في جلب تفاصيل المنتج الكاملة');
      setSelectedProduct(product);
      setIsDetailsModalOpen(true);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    if (!formState.name.trim()) {
      toast.error('يرجى كتابة اسم المنتج');
      return;
    }
    if (!formState.sku.trim()) {
      toast.error('يرجى تحديد رمز الصنف (SKU)');
      return;
    }

    setSubmitting(true);
    try {
      await createProduct(client.id, formState);
      toast.success('تمت إضافة المنتج بنجاح');
      setIsAddModalOpen(false);
      loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'فشل في حفظ المنتج');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !selectedProduct) return;

    setSubmitting(true);
    try {
      await updateProduct(selectedProduct.id, client.id, formState);
      toast.success('تم تحديث بيانات المنتج بنجاح');
      setIsEditModalOpen(false);
      loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'فشل في تحديث المنتج');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    if (!client?.id) return;
    const nextStatus = !product.is_active;
    const confirmMsg = nextStatus 
      ? `هل تريد إعادة تفعيل المنتج "${product.name}"؟`
      : `هل تريد إيقاف/تعطيل المنتج "${product.name}"؟ لن يظهر في نقطة البيع`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await toggleProductActive(product.id, client.id, nextStatus);
      toast.success(nextStatus ? 'تم تفعيل المنتج بنجاح' : 'تم تعطيل المنتج بنجاح');
      loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'تعذر تغيير حالة المنتج');
    }
  };

  const handleQuickCreateCategory = async () => {
    if (!client?.id || !newCatName.trim()) return;
    try {
      const cat = await createProductCategory(client.id, newCatName.trim());
      setCategories(prev => [...prev, cat]);
      setFormState(prev => ({ ...prev, category_id: cat.id }));
      setNewCatName('');
      setIsAddingCategory(false);
      toast.success('تمت إضافة التصنيف الجديد');
    } catch (err: any) {
      toast.error(err.message || 'تعذر إضافة التصنيف');
    }
  };

  const handleQuickCreateBrand = async () => {
    if (!client?.id || !newBrandName.trim()) return;
    try {
      const br = await createProductBrand(client.id, newBrandName.trim());
      setBrands(prev => [...prev, br]);
      setFormState(prev => ({ ...prev, brand_id: br.id }));
      setNewBrandName('');
      setIsAddingBrand(false);
      toast.success('تمت إضافة العلامة التجارية');
    } catch (err: any) {
      toast.error(err.message || 'تعذر إضافة العلامة');
    }
  };

  const handleQuickCreateUnit = async () => {
    if (!client?.id || !newUnitName.trim()) return;
    try {
      const un = await createProductUnit(client.id, newUnitName.trim(), newUnitSymbol.trim() || newUnitName.trim());
      setUnits(prev => [...prev, un]);
      setFormState(prev => ({ ...prev, unit_id: un.id }));
      setNewUnitName('');
      setNewUnitSymbol('');
      setIsAddingUnit(false);
      toast.success('تمت إضافة وحدة القياس');
    } catch (err: any) {
      toast.error(err.message || 'تعذر إضافة الوحدة');
    }
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      toast.error('لا توجد منتجات للتصدير');
      return;
    }

    const headers = ['SKU', 'الباركود', 'اسم المنتج', 'التصنيف', 'العلامة التجارية', 'سعر التكلفة', 'سعر البيع', 'الضريبة %', 'المخزون الحالي', 'الحد الأدنى', 'الحالة'];
    const rows = products.map(p => [
      `"${p.sku}"`,
      `"${p.barcode || ''}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category?.name || 'غير مصنف'}"`,
      `"${p.brand?.name || 'بدون'}"`,
      p.cost_price,
      p.selling_price,
      p.tax_rate,
      p.current_stock,
      p.min_stock,
      p.is_active ? 'نشط' : 'معطل'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ordexa_products_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('تم تصدير ملف الأصناف بنجاح');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* 1. Header with Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">دليل المنتجات والأصناف</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              إدارة كتالوج الأصناف العامة، الباركود، الأسعار، وتتبع المخزون
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <PermissionGuard permission="products.export">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
            >
              <Download className="h-4 w-4 text-slate-500" />
              <span>تصدير CSV</span>
            </button>
          </PermissionGuard>

          <PermissionGuard permission="products.create">
            <button
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors flex-1 sm:flex-none"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة صنف جديد</span>
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* 2. Key Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">إجمالي الأصناف</span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-mono">{stats.totalProducts}</span>
            <span className="text-[11px] text-slate-400">صنف مسجل</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">الأصناف النشطة</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700 font-mono">{stats.activeProducts}</span>
            <span className="text-[11px] text-emerald-600">جاهزة للبيع</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">قاربت على النفاد</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700 font-mono">{stats.lowStockProducts}</span>
            <span className="text-[11px] text-amber-600">تحت حد الطلب</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">نفدت من المخزون</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-700 font-mono">{stats.outOfStockProducts}</span>
            <span className="text-[11px] text-rose-600">رصيد صفري</span>
          </div>
        </div>
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="البحث باسم الصنف، SKU، أو الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">كافة التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">كافة العلامات التجارية</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Stock Status Filter */}
          <div>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">حالة المخزون (الكل)</option>
              <option value="in_stock">متوفر في المخزون</option>
              <option value="low_stock">منخفض (تحت الحد)</option>
              <option value="out_of_stock">منتهي (رصيد 0)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Products Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">رمز الصنف (SKU)</th>
                <th className="py-3 px-4">الباركود</th>
                <th className="py-3 px-4">اسم المنتج</th>
                <th className="py-3 px-4">التصنيف</th>
                <th className="py-3 px-4">سعر التكلفة</th>
                <th className="py-3 px-4">سعر البيع</th>
                <th className="py-3 px-4">المخزون الحالي</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    <p>جاري تحميل قائمة المنتجات...</p>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Package className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">لا توجد منتجات تطابق البحث</p>
                    <p className="text-[11px] mt-0.5 text-slate-400">يمكنك إضافة صنف جديد باستخدام الزر أعلاه</p>
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isLow = p.track_stock && p.current_stock > 0 && p.current_stock <= p.min_stock;
                  const isOut = p.track_stock && p.current_stock <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                        {p.sku}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {p.barcode ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            <Barcode className="h-3 w-3 text-slate-400" />
                            {p.barcode}
                          </span>
                        ) : (
                          <span className="text-slate-300">بدون</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        {p.brand && (
                          <div className="text-[10px] text-slate-400">{p.brand.name}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {p.category ? (
                          <span className="inline-block bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-medium border border-indigo-100/60">
                            {p.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">غير مصنف</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {Number(p.cost_price).toFixed(2)} {client?.currency || 'ر.س'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {Number(p.selling_price).toFixed(2)} {client?.currency || 'ر.س'}
                      </td>
                      <td className="py-3 px-4">
                        {p.track_stock ? (
                          <div className="flex items-center gap-2 font-mono">
                            <span className={`font-black ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                              {p.current_stock}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {p.unit?.symbol || 'وحدة'}
                            </span>
                            {isOut && (
                              <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-sans font-bold">
                                نفد
                              </span>
                            )}
                            {isLow && (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-sans font-bold">
                                منخفض
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">خدمي / غير متتبع</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {p.is_active ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openDetailsModal(p)}
                            title="تفاصيل الصنف"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          <PermissionGuard permission="products.edit">
                            <button
                              onClick={() => openEditModal(p)}
                              title="تعديل الصنف"
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                          </PermissionGuard>

                          <PermissionGuard permission="products.delete">
                            <button
                              onClick={() => handleToggleActive(p)}
                              title={p.is_active ? 'تعطيل الصنف' : 'تفعيل الصنف'}
                              className={`p-1.5 rounded-lg transition-colors ${
                                p.is_active
                                  ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. Add / Edit Product Modal */}
      {/* ========================================================================= */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Package className="h-5 w-5 text-indigo-600" />
                <span>{isAddModalOpen ? 'إضافة صنف جديد للكتالوج' : `تعديل الصنف: ${selectedProduct?.name}`}</span>
              </div>
              <button
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={isAddModalOpen ? handleCreateSubmit : handleEditSubmit} className="p-6 space-y-4 text-xs">
              {/* Product Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اسم المنتج / الصنف <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شاشة سامسونج 27 بوصة أو قميص قطني فاخر"
                  value={formState.name}
                  onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs"
                />
              </div>

              {/* SKU & Barcode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      رمز الصنف (SKU) <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomSku}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      توليد تلقائي
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formState.sku}
                    onChange={(e) => setFormState(prev => ({ ...prev, sku: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">الباركود (Barcode)</label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomBarcode}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      توليد EAN
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="امسح بالماسح الضوئي أو اكتبه"
                    value={formState.barcode || ''}
                    onChange={(e) => setFormState(prev => ({ ...prev, barcode: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Category, Brand, Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">التصنيف</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingCategory(true)}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      + جديد
                    </button>
                  </div>
                  {isAddingCategory ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="اسم التصنيف"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleQuickCreateCategory}
                        className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs"
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingCategory(false)}
                        className="p-1 text-slate-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formState.category_id || ''}
                      onChange={(e) => setFormState(prev => ({ ...prev, category_id: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    >
                      <option value="">بدون تصنيف</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">العلامة التجارية</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingBrand(true)}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      + جديد
                    </button>
                  </div>
                  {isAddingBrand ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="العلامة"
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleQuickCreateBrand}
                        className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs"
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingBrand(false)}
                        className="p-1 text-slate-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formState.brand_id || ''}
                      onChange={(e) => setFormState(prev => ({ ...prev, brand_id: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    >
                      <option value="">بدون علامة</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">وحدة القياس</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingUnit(true)}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      + جديد
                    </button>
                  </div>
                  {isAddingUnit ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="الوحدة"
                        value={newUnitName}
                        onChange={(e) => setNewUnitName(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleQuickCreateUnit}
                        className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs"
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingUnit(false)}
                        className="p-1 text-slate-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formState.unit_id || ''}
                      onChange={(e) => setFormState(prev => ({ ...prev, unit_id: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    >
                      <option value="">بدون وحدة</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Pricing & Taxes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    سعر التكلفة ({client?.currency || 'ر.س'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formState.cost_price}
                    onChange={(e) => setFormState(prev => ({ ...prev, cost_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    سعر البيع ({client?.currency || 'ر.س'}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formState.selling_price}
                    onChange={(e) => setFormState(prev => ({ ...prev, selling_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    نسبة الضريبة (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formState.tax_rate}
                    onChange={(e) => setFormState(prev => ({ ...prev, tax_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Inventory Tracking & Min Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الحد الأدنى للمخزون (حد الطلب)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formState.min_stock}
                    onChange={(e) => setFormState(prev => ({ ...prev, min_stock: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.track_stock}
                      onChange={(e) => setFormState(prev => ({ ...prev, track_stock: e.target.checked }))}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span className="font-semibold text-slate-700">تتبع المخزون والكميات بالمستودعات</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.is_active}
                      onChange={(e) => setFormState(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    <span className="font-semibold text-slate-700">صنف نشط ومتاح في نقطة البيع</span>
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">وصف الصنف / ملاحظات</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات تفصيلية حول مواصفات الصنف..."
                  value={formState.description || ''}
                  onChange={(e) => setFormState(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري الحفظ...' : isAddModalOpen ? 'حفظ الصنف' : 'تحديث البيانات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. View Product Details Modal */}
      {/* ========================================================================= */}
      {isDetailsModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Package className="h-5 w-5 text-indigo-600" />
                <span>تفاصيل الصنف: {selectedProduct.name}</span>
              </div>
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">رمز الصنف (SKU)</span>
                  <span className="font-mono font-bold text-slate-900 mt-0.5 block">{selectedProduct.sku}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">الباركود</span>
                  <span className="font-mono font-bold text-slate-900 mt-0.5 block">{selectedProduct.barcode || 'بدون'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">الحالة</span>
                  <span className={`font-bold mt-0.5 block ${selectedProduct.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {selectedProduct.is_active ? 'نشط' : 'معطل'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">التصنيف</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{selectedProduct.category?.name || 'غير مصنف'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">العلامة التجارية</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{selectedProduct.brand?.name || 'بدون'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">وحدة القياس</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{selectedProduct.unit?.name || 'وحدة'}</span>
                </div>
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-slate-500 block text-[11px]">سعر التكلفة</span>
                  <span className="font-mono font-bold text-slate-800 text-sm mt-1 block">
                    {Number(selectedProduct.cost_price).toFixed(2)} {client?.currency || 'ر.س'}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                  <span className="text-indigo-700 block text-[11px] font-medium">سعر البيع</span>
                  <span className="font-mono font-black text-indigo-900 text-sm mt-1 block">
                    {Number(selectedProduct.selling_price).toFixed(2)} {client?.currency || 'ر.س'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-slate-500 block text-[11px]">نسبة الضريبة</span>
                  <span className="font-mono font-bold text-slate-800 text-sm mt-1 block">
                    %{selectedProduct.tax_rate}
                  </span>
                </div>
              </div>

              {/* Warehouses Breakdown */}
              <div>
                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs">
                  <Warehouse className="h-4 w-4 text-slate-600" />
                  <span>توزيع المخزون بالمستودعات</span>
                </h3>

                {selectedProduct.balances && selectedProduct.balances.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {selectedProduct.balances.map((b) => (
                      <div key={b.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                        <span className="font-semibold text-slate-800">
                          {b.warehouse?.name || 'مستودع'}
                          {b.warehouse?.is_default && (
                            <span className="mr-2 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">رئيسي</span>
                          )}
                        </span>
                        <span className="font-mono font-bold text-indigo-700">
                          {b.quantity} {selectedProduct.unit?.symbol || 'وحدة'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500">
                    لم يتم تسجيل أرصدة افتتاحية أو حركات مخزنية لهذا الصنف بعد.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
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
