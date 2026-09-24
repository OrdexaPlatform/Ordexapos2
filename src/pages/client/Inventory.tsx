import React, { useState, useEffect, useCallback } from 'react';
import { useClientStore } from '../../store/clientStore';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import { useCurrency } from '../../hooks/useCurrency';
import { PermissionGuard } from '../../components/client/PermissionGuard';
import { 
  fetchInventoryStock, 
  fetchInventoryLedger, 
  recordOpeningStock, 
  recordStockAdjustment, 
  executeTransfer,
  ProductStockRow 
} from '../../lib/inventoryService';
import { 
  fetchWarehouses, 
  createWarehouse, 
  ensureDefaultWarehouse 
} from '../../lib/warehouseService';
import { 
  fetchProducts, 
  fetchProductCategories 
} from '../../lib/productService';
import { 
  Warehouse as WarehouseType, 
  Product, 
  ProductCategory, 
  InventoryTransaction 
} from '../../types';
import { 
  Warehouse, 
  Boxes, 
  ArrowLeftRight, 
  SlidersHorizontal, 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  X, 
  Save, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2, 
  Clock, 
  Trash2,
  Calendar,
  Layers,
  Barcode,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { BarcodeLabelModal } from '../../components/client/products/BarcodeLabelModal';

export function InventoryPage() {
  const { client } = useClientStore();
  const { clientUser } = useAuthStore();
  const { hasPermission } = usePermissions();
  const { currencySymbol } = useCurrency();

  const [stockRows, setStockRows] = useState<ProductStockRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isOpeningStockOpen, setIsOpeningStockOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isWarehouseManagerOpen, setIsWarehouseManagerOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState<Product | null>(null);

  // Ledger state
  const [ledgerTransactions, setLedgerTransactions] = useState<InventoryTransaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerProductFilter, setLedgerProductFilter] = useState<string | undefined>(undefined);

  // Form states
  const [submitting, setSubmitting] = useState(false);

  // 1. Opening stock form
  const [openingForm, setOpeningForm] = useState({
    productId: '',
    warehouseId: '',
    quantity: 1,
    unitCost: 0,
    notes: '',
  });

  // 2. Adjustment form
  const [adjustmentForm, setAdjustmentForm] = useState<{
    productId: string;
    warehouseId: string;
    adjustmentType: 'adjustment_in' | 'adjustment_out';
    quantity: number;
    unitCost: number;
    reason: string;
    notes: string;
  }>({
    productId: '',
    warehouseId: '',
    adjustmentType: 'adjustment_in',
    quantity: 1,
    unitCost: 0,
    reason: 'جرد دوري',
    notes: '',
  });

  // 3. Transfer form
  const [transferForm, setTransferForm] = useState<{
    fromWarehouseId: string;
    toWarehouseId: string;
    items: Array<{ productId: string; quantity: number; unitCost: number }>;
    notes: string;
  }>({
    fromWarehouseId: '',
    toWarehouseId: '',
    items: [{ productId: '', quantity: 1, unitCost: 0 }],
    notes: '',
  });

  // 4. Warehouse creation form
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    code: '',
    address: '',
    is_default: false,
  });

  // Initial load
  const loadInitialData = useCallback(async () => {
    if (!client?.id) return;
    try {
      const [whs, cats, prods] = await Promise.all([
        ensureDefaultWarehouse(client.id).then(() => fetchWarehouses(client.id)),
        fetchProductCategories(client.id),
        fetchProducts(client.id, { isActive: true }).then(r => r.products),
      ]);
      setWarehouses(whs);
      setCategories(cats);
      setAllProducts(prods);

      if (whs.length > 0) {
        setOpeningForm(prev => ({ ...prev, warehouseId: whs[0].id }));
        setAdjustmentForm(prev => ({ ...prev, warehouseId: whs[0].id }));
        if (whs.length > 1) {
          setTransferForm(prev => ({
            ...prev,
            fromWarehouseId: whs[0].id,
            toWarehouseId: whs[1].id,
          }));
        }
      }
      if (prods.length > 0) {
        setOpeningForm(prev => ({ ...prev, productId: prods[0].id, unitCost: Number(prods[0].cost_price) || 0 }));
        setAdjustmentForm(prev => ({ ...prev, productId: prods[0].id }));
        setTransferForm(prev => ({
          ...prev,
          items: [{ productId: prods[0].id, quantity: 1, unitCost: Number(prods[0].cost_price) || 0 }],
        }));
      }
    } catch (err) {
      console.error('Failed to load initial inventory data:', err);
    }
  }, [client?.id]);

  const loadStock = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      const data = await fetchInventoryStock(client.id, {
        warehouseId: selectedWarehouseId,
        categoryId: selectedCategoryId,
        stockStatus: selectedStockStatus,
        search: searchQuery,
      });
      setStockRows(data);
    } catch (err: any) {
      toast.error(err.message || 'تعذر تحميل بيانات المخزون');
    } finally {
      setLoading(false);
    }
  }, [client?.id, selectedWarehouseId, selectedCategoryId, selectedStockStatus, searchQuery]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  // Statistics calculation
  const totalStockQuantity = stockRows.reduce((sum, r) => sum + r.currentQuantity, 0);
  const lowStockCount = stockRows.filter(r => r.status === 'low_stock').length;
  const outOfStockCount = stockRows.filter(r => r.status === 'out_of_stock').length;

  // Handlers for Opening Stock
  const handleOpeningStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    setSubmitting(true);
    try {
      await recordOpeningStock(client.id, {
        productId: openingForm.productId,
        warehouseId: openingForm.warehouseId,
        quantity: openingForm.quantity,
        unitCost: openingForm.unitCost,
        notes: openingForm.notes,
        createdBy: clientUser?.id,
      });
      toast.success('تم تسجيل الرصيد الافتتاحي بنجاح');
      setIsOpeningStockOpen(false);
      loadStock();
    } catch (err: any) {
      toast.error(err.message || 'فشل في إدخال الرصيد الافتتاحي');
    } finally {
      setSubmitting(false);
    }
  };

  // Handlers for Stock Adjustment
  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    setSubmitting(true);
    try {
      await recordStockAdjustment(client.id, {
        productId: adjustmentForm.productId,
        warehouseId: adjustmentForm.warehouseId,
        adjustmentType: adjustmentForm.adjustmentType,
        quantity: adjustmentForm.quantity,
        unitCost: adjustmentForm.unitCost,
        reason: adjustmentForm.reason,
        notes: adjustmentForm.notes,
        createdBy: clientUser?.id,
      });
      toast.success('تمت تسوية المخزون وتحديث الرصيد');
      setIsAdjustmentOpen(false);
      loadStock();
    } catch (err: any) {
      toast.error(err.message || 'فشل في تسوية المخزون');
    } finally {
      setSubmitting(false);
    }
  };

  // Handlers for Warehouse Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;

    if (transferForm.fromWarehouseId === transferForm.toWarehouseId) {
      toast.error('لا يمكن التحويل لنفس المستودع');
      return;
    }

    setSubmitting(true);
    try {
      const res = await executeTransfer(client.id, {
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        items: transferForm.items,
        notes: transferForm.notes,
        createdBy: clientUser?.id,
      });
      toast.success(`تم التحويل بنجاح برقم: ${res.transferNumber}`);
      setIsTransferOpen(false);
      loadStock();
    } catch (err: any) {
      toast.error(err.message || 'فشل في تنفيذ التحويل المخزني');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTransferItem = () => {
    if (allProducts.length === 0) return;
    setTransferForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: allProducts[0].id, quantity: 1, unitCost: Number(allProducts[0].cost_price) || 0 }],
    }));
  };

  const handleRemoveTransferItem = (index: number) => {
    setTransferForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Handlers for Warehouse Management
  const handleCreateWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !warehouseForm.name.trim()) return;

    setSubmitting(true);
    try {
      const newWh = await createWarehouse(client.id, warehouseForm);
      toast.success('تمت إضافة المستودع بنجاح');
      setWarehouses(prev => [...prev, newWh]);
      setWarehouseForm({ name: '', code: '', address: '', is_default: false });
      loadInitialData();
    } catch (err: any) {
      toast.error(err.message || 'تعذر إضافة المستودع');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Ledger History Modal
  const openLedgerModal = async (productId?: string) => {
    if (!client?.id) return;
    setLedgerProductFilter(productId);
    setIsLedgerOpen(true);
    setLedgerLoading(true);
    try {
      const txs = await fetchInventoryLedger(client.id, {
        productId,
        warehouseId: selectedWarehouseId,
        limit: 100,
      });
      setLedgerTransactions(txs);
    } catch (err: any) {
      toast.error(err.message || 'فشل في جلب سجل حركات المخزون');
    } finally {
      setLedgerLoading(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* 1. Header with Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">المخزون والمستودعات</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              مراقبة الأرصدة، تسجيل الرصيد الافتتاحي، التسويات الجردية، والتحويلات
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Warehouse Ledger Button */}
          <button
            onClick={() => openLedgerModal()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
          >
            <Clock className="h-4 w-4 text-slate-500" />
            <span>سجل الحركات</span>
          </button>

          {/* Warehouses Manager */}
          <PermissionGuard permission="inventory.manage">
            <button
              onClick={() => setIsWarehouseManagerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
            >
              <Building2 className="h-4 w-4 text-slate-500" />
              <span>المستودعات ({warehouses.length})</span>
            </button>
          </PermissionGuard>

          {/* Transfer Button */}
          <PermissionGuard permission="inventory.transfer">
            <button
              onClick={() => setIsTransferOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors"
            >
              <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
              <span>تحويل بين المستودعات</span>
            </button>
          </PermissionGuard>

          {/* Stock Adjustment Button */}
          <PermissionGuard permission="inventory.adjust">
            <button
              onClick={() => setIsAdjustmentOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4 text-amber-600" />
              <span>تسوية جردية</span>
            </button>
          </PermissionGuard>

          {/* Opening Stock Button */}
          <PermissionGuard permission="inventory.create">
            <button
              onClick={() => setIsOpeningStockOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>رصيد افتتاحي</span>
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* 2. Key Stock Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">إجمالي الكميات بالمخازن</span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 font-mono">{totalStockQuantity}</span>
            <span className="text-[11px] text-slate-400">وحدة مخزنية</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">المستودعات النشطة</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Warehouse className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-700 font-mono">{warehouses.length}</span>
            <span className="text-[11px] text-indigo-500">فروع ومستودعات</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">أصناف تحت حد الطلب</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700 font-mono">{lowStockCount}</span>
            <span className="text-[11px] text-amber-600">تحتاج توريد</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">أصناف نفدت تماماً</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-700 font-mono">{outOfStockCount}</span>
            <span className="text-[11px] text-rose-600">رصيد 0</span>
          </div>
        </div>
      </div>

      {/* 3. Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="امسح الباركود بالماسح الضوئي أو ابحث بالاسم أو SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-24 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
            />
            <div className="absolute left-2.5 top-2 text-[10px] text-slate-500 font-bold flex items-center gap-1 bg-slate-200/80 px-2 py-0.5 rounded pointer-events-none">
              <Barcode className="h-3 w-3 text-slate-600" />
              <span>ماسح الباركود</span>
            </div>
          </div>

          {/* Warehouse Selector */}
          <div>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">كافة المستودعات</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} {wh.is_default ? '(الرئيسي)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Category Selector */}
          <div>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">كافة التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Stock Status Selector */}
          <div>
            <select
              value={selectedStockStatus}
              onChange={(e) => setSelectedStockStatus(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">حالة المخزون (الكل)</option>
              <option value="in_stock">متوفر في المستودع</option>
              <option value="low_stock">منخفض (أقل من الحد)</option>
              <option value="out_of_stock">منتهي (رصيد صفر)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">اسم المنتج</th>
                <th className="py-3 px-4">رمز الصنف (SKU)</th>
                <th className="py-3 px-4">الباركود</th>
                <th className="py-3 px-4">المستودع</th>
                <th className="py-3 px-4">الرصيد الحالي</th>
                <th className="py-3 px-4">حد الطلب</th>
                <th className="py-3 px-4">سعر التكلفة</th>
                <th className="py-3 px-4">حالة المخزون</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    <p>جاري فحص وتحديث أرصدة المستودعات...</p>
                  </td>
                </tr>
              ) : stockRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Boxes className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">لا توجد أصناف تطابق الفلاتر المحددة</p>
                  </td>
                </tr>
              ) : (
                stockRows.map((row, index) => (
                  <tr key={`${row.productId}-${row.warehouseId}-${index}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div>{row.productName}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{row.categoryName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 font-medium">
                      {row.sku}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {row.barcode ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-800">
                          <Barcode className="h-3 w-3 text-slate-400" />
                          {row.barcode}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">بدون باركود</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-700">
                        <Warehouse className="h-3 w-3 text-slate-400" />
                        {row.warehouseName}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-black text-sm">
                      <span className={
                        row.status === 'out_of_stock'
                          ? 'text-rose-600'
                          : row.status === 'low_stock'
                          ? 'text-amber-600'
                          : 'text-slate-900'
                      }>
                        {row.currentQuantity}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {row.minStock}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {row.costPrice.toFixed(2)} {currencySymbol}
                    </td>
                    <td className="py-3 px-4">
                      {row.status === 'out_of_stock' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="h-3 w-3" />
                          نفد من المخزون
                        </span>
                      ) : row.status === 'low_stock' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="h-3 w-3" />
                          منخفض (تحت الحد)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          متوفر
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Barcode Print */}
                        <button
                          id={`btn-inventory-barcode-${row.productId}`}
                          onClick={() => {
                            const prod = allProducts.find(p => p.id === row.productId) || {
                              id: row.productId,
                              name: row.productName,
                              sku: row.sku,
                              barcode: row.barcode || '',
                              selling_price: row.sellingPrice,
                              cost_price: row.costPrice,
                              is_active: true,
                              track_stock: row.trackStock,
                            } as Product;
                            setSelectedProductForBarcode(prod);
                            setIsBarcodeModalOpen(true);
                          }}
                          title="طباعة ملصق الباركود (Barcode Label)"
                          className="inline-flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg transition-colors font-semibold shadow-2xs"
                        >
                          <Barcode className="h-3.5 w-3.5 text-indigo-600" />
                          <span>طباعة باركود</span>
                        </button>

                        {/* Ledger */}
                        <button
                          onClick={() => openLedgerModal(row.productId)}
                          title="عرض سجل حركات الصنف"
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors font-semibold"
                        >
                          <Clock className="h-3 w-3" />
                          <span>الحركات</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. Modal: Opening Stock */}
      {/* ========================================================================= */}
      {isOpeningStockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Boxes className="h-5 w-5 text-emerald-600" />
                <span>إدخال رصيد افتتاحي للمخزون (Opening Stock)</span>
              </div>
              <button onClick={() => setIsOpeningStockOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpeningStockSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اختر الصنف / المنتج <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={openingForm.productId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    const prod = allProducts.find(p => p.id === pid);
                    setOpeningForm(prev => ({
                      ...prev,
                      productId: pid,
                      unitCost: prod ? Number(prod.cost_price) || 0 : prev.unitCost,
                    }));
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                >
                  <option value="">-- اختر صنفاً --</option>
                  {allProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  المستودع المستهدف <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={openingForm.warehouseId}
                  onChange={(e) => setOpeningForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} {w.is_default ? '(الرئيسي)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الكمية الافتتاحية <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={openingForm.quantity}
                    onChange={(e) => setOpeningForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تكلفة الوحدة ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingForm.unitCost}
                    onChange={(e) => setOpeningForm(prev => ({ ...prev, unitCost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات الرصيد الافتتاحي</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات توثيقية إضافية..."
                  value={openingForm.notes}
                  onChange={(e) => setOpeningForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOpeningStockOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري الإدخال...' : 'تسجيل الرصيد الافتتاحي'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. Modal: Stock Adjustment */}
      {/* ========================================================================= */}
      {isAdjustmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <SlidersHorizontal className="h-5 w-5 text-amber-600" />
                <span>تسوية مخزنية جردية (Stock Adjustment)</span>
              </div>
              <button onClick={() => setIsAdjustmentOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  نوع التسوية المخزنية <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAdjustmentForm(prev => ({ ...prev, adjustmentType: 'adjustment_in' }))}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                      adjustmentForm.adjustmentType === 'adjustment_in'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                    <span>تسوية بالزيادة (+ إضافة)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustmentForm(prev => ({ ...prev, adjustmentType: 'adjustment_out' }))}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                      adjustmentForm.adjustmentType === 'adjustment_out'
                        ? 'bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4 text-rose-600" />
                    <span>تسوية بالنقص (- عجز / تلف)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اختر الصنف <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={adjustmentForm.productId}
                  onChange={(e) => setAdjustmentForm(prev => ({ ...prev, productId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                >
                  <option value="">-- اختر صنفاً --</option>
                  {allProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  المستودع <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={adjustmentForm.warehouseId}
                  onChange={(e) => setAdjustmentForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الكمية المراد تسويتها <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={adjustmentForm.quantity}
                    onChange={(e) => setAdjustmentForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">سبب التسوية</label>
                  <select
                    value={adjustmentForm.reason}
                    onChange={(e) => setAdjustmentForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  >
                    <option value="جرد دوري">جرد دوري</option>
                    <option value="بضاعة تالفة / منتهية الصلاحية">بضاعة تالفة / منتهية الصلاحية</option>
                    <option value="عجز وفروقات جردية">عجز وفروقات جردية</option>
                    <option value="فائض غير مسجل">فائض غير مسجل</option>
                    <option value="عينات ترويجية / استخدام داخلي">عينات ترويجية / استخدام داخلي</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات وتفاصيل التسوية</label>
                <textarea
                  rows={2}
                  placeholder="سبب وتوثيق إذن التسوية الجردية..."
                  value={adjustmentForm.notes}
                  onChange={(e) => setAdjustmentForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'جاري التسوية...' : 'تأكيد وحفظ التسوية'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. Modal: Inter-Warehouse Transfer */}
      {/* ========================================================================= */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
                <span>تحويل مخزني بين المستودعات (Warehouse Transfer)</span>
              </div>
              <button onClick={() => setIsTransferOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-6 space-y-4 text-xs">
              {warehouses.length < 2 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-center">
                  يتطلب التحويل وجود مستودعين نشطين على الأقل. يرجى إنشاء مستودع إضافي أولاً من زر إدارة المستودعات.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        المستودع المصدر (من) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={transferForm.fromWarehouseId}
                        onChange={(e) => setTransferForm(prev => ({ ...prev, fromWarehouseId: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        المستودع الهدف (إلى) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={transferForm.toWarehouseId}
                        onChange={(e) => setTransferForm(prev => ({ ...prev, toWarehouseId: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Items List */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">الأصناف المراد تحويلها</span>
                      <button
                        type="button"
                        onClick={handleAddTransferItem}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>إضافة صنف للتحويل</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {transferForm.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                          <div className="flex-1">
                            <select
                              required
                              value={item.productId}
                              onChange={(e) => {
                                const pid = e.target.value;
                                const prod = allProducts.find(p => p.id === pid);
                                setTransferForm(prev => {
                                  const updated = [...prev.items];
                                  updated[idx].productId = pid;
                                  if (prod) updated[idx].unitCost = Number(prod.cost_price) || 0;
                                  return { ...prev, items: updated };
                                });
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                            >
                              <option value="">-- اختر صنفاً --</option>
                              {allProducts.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                          </div>

                          <div className="w-24">
                            <input
                              type="number"
                              min="1"
                              required
                              placeholder="الكمية"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 1;
                                setTransferForm(prev => {
                                  const updated = [...prev.items];
                                  updated[idx].quantity = val;
                                  return { ...prev, items: updated };
                                });
                              }}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                            />
                          </div>

                          {transferForm.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTransferItem(idx)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">ملاحظات التحويل</label>
                    <textarea
                      rows={2}
                      placeholder="رقم إذن النقل أو سبب التحويل..."
                      value={transferForm.notes}
                      onChange={(e) => setTransferForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsTransferOpen(false)}
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
                      <span>{submitting ? 'جاري التنفيذ...' : 'ترحيل التحويل فوراً'}</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. Modal: Warehouses Management */}
      {/* ========================================================================= */}
      {isWarehouseManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Building2 className="h-5 w-5 text-indigo-600" />
                <span>إدارة المستودعات والفروع</span>
              </div>
              <button onClick={() => setIsWarehouseManagerOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Existing Warehouses List */}
              <div className="space-y-2">
                <span className="font-bold text-slate-800 block">المستودعات الحالية</span>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {warehouses.map(w => (
                    <div key={w.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>{w.name}</span>
                          {w.is_default && (
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              الرئيسي
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">{w.code || 'بدون رمز'} - {w.address || 'بدون عنوان'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Warehouse Form */}
              <form onSubmit={handleCreateWarehouseSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 block text-xs">إضافة مستودع جديد</span>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">اسم المستودع</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: مستودع جدة أو فرع الرياض"
                    value={warehouseForm.name}
                    onChange={(e) => setWarehouseForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">الرمز (Code)</label>
                    <input
                      type="text"
                      placeholder="WH-02"
                      value={warehouseForm.code}
                      onChange={(e) => setWarehouseForm(prev => ({ ...prev, code: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">العنوان</label>
                    <input
                      type="text"
                      placeholder="المدينة / الحي"
                      value={warehouseForm.address}
                      onChange={(e) => setWarehouseForm(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>حفظ المستودع</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. Modal: Stock Ledger Transactions */}
      {/* ========================================================================= */}
      {isLedgerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <Clock className="h-5 w-5 text-indigo-600" />
                <span>سجل حركات المخزون والتدقيق (Stock Ledger Audit)</span>
              </div>
              <button onClick={() => setIsLedgerOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {ledgerLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500 mb-2" />
                  <p>جاري تحميل سجل حركات المخزون...</p>
                </div>
              ) : ledgerTransactions.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Clock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600">لا توجد حركات مخزنية مسجلة حتى الآن</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-medium">
                        <th className="py-2.5 px-3">التاريخ والوقت</th>
                        <th className="py-2.5 px-3">نوع الحركة</th>
                        <th className="py-2.5 px-3">الصنف</th>
                        <th className="py-2.5 px-3">المستودع</th>
                        <th className="py-2.5 px-3">الكمية</th>
                        <th className="py-2.5 px-3">الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledgerTransactions.map(t => {
                        const isPositive = Number(t.quantity) > 0;
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                              {format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                t.transaction_type === 'sale'
                                  ? 'bg-amber-50 text-amber-700'
                                  : t.transaction_type === 'sale_return'
                                  ? 'bg-cyan-50 text-cyan-700'
                                  : t.transaction_type === 'opening'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : t.transaction_type === 'adjustment_in'
                                  ? 'bg-blue-50 text-blue-700'
                                  : t.transaction_type === 'adjustment_out'
                                  ? 'bg-rose-50 text-rose-700'
                                  : t.transaction_type.includes('transfer')
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {t.transaction_type === 'sale'
                                  ? 'مبيعات'
                                  : t.transaction_type === 'sale_return'
                                  ? 'إرجاع مبيعات'
                                  : t.transaction_type === 'opening'
                                  ? 'رصيد افتتاحي'
                                  : t.transaction_type === 'adjustment_in'
                                  ? 'تسوية إضافة'
                                  : t.transaction_type === 'adjustment_out'
                                  ? 'تسوية صرف'
                                  : t.transaction_type.includes('transfer')
                                  ? 'تحويل مخزني'
                                  : t.transaction_type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {t.product?.name || 'صنف'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {t.warehouse?.name || 'مستودع'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              <span className={isPositive ? 'text-emerald-700' : 'text-rose-600'}>
                                {isPositive ? `+${t.quantity}` : t.quantity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              {t.notes || t.reference_type || '---'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setIsLedgerOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Label Modal */}
      <BarcodeLabelModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        product={selectedProductForBarcode}
      />
    </div>
  );
}
