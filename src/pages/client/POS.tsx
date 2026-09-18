import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Barcode, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Building2, 
  Tag, 
  RefreshCw, 
  AlertCircle, 
  X, 
  Percent, 
  Layers, 
  User, 
  Check, 
  CornerDownLeft,
  PackageX,
  Keyboard,
  Edit2,
  Lock,
  Monitor,
  Settings
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { usePOSCartStore } from '../../store/posCartStore';
import { usePermissions } from '../../hooks/usePermissions';
import { Product, ProductCategory, Warehouse, Sale } from '../../types';
import { supabase } from '../../lib/supabase';
import { executeCompleteSale, formatCurrency, CompleteSalePayload } from '../../lib/salesService';
import { POSPaymentModal } from '../../components/client/POSPaymentModal';
import { InvoiceReceiptModal } from '../../components/client/InvoiceReceiptModal';
import { POSTerminalConfigModal } from '../../components/client/POSTerminalConfigModal';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useCurrency } from '../../hooks/useCurrency';
import { offlineStorage } from '../../lib/offline/offlineStorage';
import { useShiftStore } from '../../store/shiftStore';
import { useDeviceStore } from '../../store/deviceStore';
import { POSShiftBar } from '../../components/client/shifts/POSShiftBar';
import { OpenShiftModal } from '../../components/client/shifts/OpenShiftModal';
import { Store } from 'lucide-react';
import toast from 'react-hot-toast';

export const POSPage: React.FC = () => {
  const { clientUser } = useAuthStore();
  const { client } = useClientStore();
  const { hasPermission } = usePermissions();
  const { currencySymbol } = useCurrency();
  const canEditPrice = hasPermission('pos.edit_price');
  const clientId = clientUser?.client_id;

  // POS Terminal & Device Licensing Store
  const { 
    fingerprint, 
    isActivated: isDeviceActivated, 
    initializeDevice,
    device: currentDevice 
  } = useDeviceStore();

  // POS Active Shift & Cash Drawer Store
  const { activeShift, loadActiveShift } = useShiftStore();
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);

  // Cart Store
  const {
    items: cartItems,
    selectedWarehouseId,
    customerName,
    notes: cartNotes,
    invoiceDiscount,
    invoiceDiscountType,
    setWarehouseId,
    setCustomerName,
    setNotes: setCartNotes,
    setInvoiceDiscount,
    addItem,
    updateItemQuantity,
    updateItemPrice,
    updateItemDiscount,
    removeItem,
    clearCart,
    getSubtotal,
    getLineDiscountsTotal,
    getInvoiceDiscountAmount,
    getTotalDiscounts,
    getTotalTax,
    getGrandTotal,
    getItemsCount
  } = usePOSCartStore();

  // Local State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [activeDiscountItemId, setActiveDiscountItemId] = useState<string | null>(null);
  const [itemDiscountInputValue, setItemDiscountInputValue] = useState<number>(0);
  const [activePriceEditItemId, setActivePriceEditItemId] = useState<string | null>(null);
  const [itemPriceInputValue, setItemPriceInputValue] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial catalog data with offline resilience
  const loadPOSData = async () => {
    if (!clientId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let loadedWarehouses: Warehouse[] = [];
      let loadedCategories: ProductCategory[] = [];
      let loadedProducts: Product[] = [];

      // 1. If online, fetch fresh data from database
      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          const { data: whData } = await supabase
            .from('warehouses')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('is_default', { ascending: false });

          if (whData && whData.length > 0) {
            loadedWarehouses = whData;
            offlineStorage.saveWarehouses(whData).catch(err => console.warn('Offline cache warehouses warning:', err));
            try { localStorage.setItem(`ordexa_cached_warehouses_${clientId}`, JSON.stringify(whData)); } catch {}
          }

          const { data: catData } = await supabase
            .from('product_categories')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('name');

          if (catData && catData.length > 0) {
            loadedCategories = catData;
            offlineStorage.saveCategories(catData).catch(err => console.warn('Offline cache categories warning:', err));
            try { localStorage.setItem(`ordexa_cached_categories_${clientId}`, JSON.stringify(catData)); } catch {}
          }

          const { data: prodData, error: prodErr } = await supabase
            .from('products')
            .select(`
              *,
              category:product_categories(name),
              unit:product_units(name, symbol),
              barcodes:product_barcodes(barcode, is_primary)
            `)
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('name');

          if (!prodErr && prodData) {
            loadedProducts = prodData;
            offlineStorage.saveProducts(prodData).catch(err => console.warn('Offline cache products warning:', err));
            try { localStorage.setItem(`ordexa_cached_products_${clientId}`, JSON.stringify(prodData)); } catch {}
          }
        } catch (netErr) {
          console.warn('Online POS data fetch encountered network error, falling back to offline storage:', netErr);
        }
      }

      // 2. Offline fallback if empty or offline
      if (loadedWarehouses.length === 0) {
        const cachedWh = await offlineStorage.getWarehouses();
        if (cachedWh && cachedWh.length > 0) {
          loadedWarehouses = cachedWh.filter(w => !w.client_id || w.client_id === clientId);
        } else {
          try {
            const raw = localStorage.getItem(`ordexa_cached_warehouses_${clientId}`);
            if (raw) loadedWarehouses = JSON.parse(raw);
          } catch {}
        }
      }

      if (loadedCategories.length === 0) {
        const cachedCats = await offlineStorage.getCategories();
        if (cachedCats && cachedCats.length > 0) {
          loadedCategories = cachedCats.filter(c => !c.client_id || c.client_id === clientId);
        } else {
          try {
            const raw = localStorage.getItem(`ordexa_cached_categories_${clientId}`);
            if (raw) loadedCategories = JSON.parse(raw);
          } catch {}
        }
      }

      if (loadedProducts.length === 0) {
        const cachedProds = await offlineStorage.getProducts();
        if (cachedProds && cachedProds.length > 0) {
          loadedProducts = cachedProds.filter(p => !p.client_id || p.client_id === clientId);
        } else {
          try {
            const raw = localStorage.getItem(`ordexa_cached_products_${clientId}`);
            if (raw) loadedProducts = JSON.parse(raw);
          } catch {}
        }
      }

      if (loadedWarehouses.length > 0) {
        setWarehouses(loadedWarehouses);
        if (!selectedWarehouseId) {
          const defaultWh = loadedWarehouses.find(w => w.is_default) || loadedWarehouses[0];
          setWarehouseId(defaultWh.id);
        }
      }

      if (loadedCategories.length > 0) {
        setCategories(loadedCategories);
      }

      if (loadedProducts.length > 0) {
        setProducts(loadedProducts);
        setErrorMessage(null);
      } else if (!navigator.onLine) {
        setErrorMessage('لا توجد أصناف مخزنة محلياً للعمل بدون إنترنت. يرجى الاتصال بالإنترنت مرة واحدة لتحميل الأصناف.');
      }
    } catch (err: any) {
      console.error('Error loading POS data:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء تحميل بيانات نقطة البيع');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPOSData();
    if (clientId) {
      loadActiveShift(clientId);
    }
  }, [clientId]);

  // Keyboard Shortcuts (F2: Search, F4: Pay, Esc: Clear/Close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Focus Search
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }

      // F4: Open Payment Modal if cart not empty
      if (e.key === 'F4') {
        e.preventDefault();
        if (cartItems.length > 0 && !isPaymentModalOpen && !isReceiptModalOpen) {
          if (!activeShift) {
            setIsOpenShiftModalOpen(true);
            toast.error('لا يمكن البيع بدون وردية مفتوحة. يرجى فتح وردية كاشير أولاً');
          } else {
            setIsPaymentModalOpen(true);
          }
        }
      }

      // Escape: Close modals
      if (e.key === 'Escape') {
        if (isPaymentModalOpen) setIsPaymentModalOpen(false);
        if (isReceiptModalOpen) setIsReceiptModalOpen(false);
        if (isOpenShiftModalOpen) setIsOpenShiftModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems.length, isPaymentModalOpen, isReceiptModalOpen, isOpenShiftModalOpen, activeShift]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category_id === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p => {
        const nameMatch = p.name.toLowerCase().includes(q);
        const skuMatch = p.sku.toLowerCase().includes(q);
        const barcodeMatch = p.barcode?.toLowerCase().includes(q);
        const altBarcodeMatch = p.barcodes?.some(b => b.barcode.toLowerCase().includes(q));
        return nameMatch || skuMatch || barcodeMatch || altBarcodeMatch;
      });
    }

    return result;
  }, [products, selectedCategory, searchQuery]);

  // Handle Barcode Scanner Direct Input
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;

    // Find product matching primary barcode or barcode list or SKU
    const foundProduct = products.find(p => 
      p.barcode === barcode || 
      p.sku === barcode ||
      p.barcodes?.some(b => b.barcode === barcode)
    );

    if (foundProduct) {
      const res = addItem(foundProduct, 1);
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      } else {
        setErrorMessage(null);
      }
      setBarcodeInput('');
    } else {
      setErrorMessage(`الباركود (${barcode}) غير مسجل في النظام`);
      setBarcodeInput('');
    }
  };

  // Hardware USB/HID Barcode Scanner Listener
  useBarcodeScanner({
    onScan: (scannedBarcode) => {
      const foundProduct = products.find(p => 
        p.barcode === scannedBarcode || 
        p.sku === scannedBarcode ||
        p.barcodes?.some(b => b.barcode === scannedBarcode)
      );

      if (foundProduct) {
        const res = addItem(foundProduct, 1);
        if (!res.success && res.message) {
          setErrorMessage(res.message);
        } else {
          setErrorMessage(null);
          toast.success(`تمت إضافة: ${foundProduct.name}`, { duration: 1500 });
        }
      } else {
        setErrorMessage(`الباركود (${scannedBarcode}) غير مسجل في النظام`);
        toast.error(`الباركود (${scannedBarcode}) غير مسجل`);
      }
    },
    enabled: !isPaymentModalOpen && !isReceiptModalOpen && !isConfigModalOpen && !isOpenShiftModalOpen
  });

  // Add Product to Cart
  const handleAddProduct = (product: Product) => {
    const res = addItem(product, 1);
    if (!res.success && res.message) {
      setErrorMessage(res.message);
    } else {
      setErrorMessage(null);
    }
  };

  // Handle Checkout Confirmation
  const handleConfirmPayment = async (paymentData: {
    paymentMethod: any;
    amountPaid: number;
    reference?: string;
    notes?: string;
  }) => {
    if (!clientId || !selectedWarehouseId) {
      throw new Error('يرجى تحديد المنشأة والمستودع');
    }

    if (!activeShift) {
      setIsOpenShiftModalOpen(true);
      throw new Error('لا توجد وردية كاشير مفتوحة حالياً. يرجى فتح الوردية أولاً');
    }

    const payload: CompleteSalePayload = {
      clientId,
      warehouseId: selectedWarehouseId,
      shiftId: activeShift.id,
      deviceFingerprint: fingerprint,
      items: cartItems.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount
      })),
      payments: [
        {
          payment_method: paymentData.paymentMethod,
          amount: paymentData.amountPaid,
          reference: paymentData.reference
        }
      ],
      discountAmount: getInvoiceDiscountAmount(),
      notes: paymentData.notes || cartNotes || null,
      createdBy: clientUser?.id || null
    };

    const result = await executeCompleteSale(payload);

    // Build Sale object for receipt modal
    const completedSaleObj: Sale = {
      id: result.sale_id,
      client_id: clientId,
      shift_id: result.shift_id || activeShift?.id || null,
      invoice_number: result.invoice_number,
      sale_date: result.sale_date,
      warehouse_id: selectedWarehouseId,
      subtotal: result.subtotal,
      discount_amount: result.discount_amount,
      tax_amount: result.tax_amount,
      total_amount: result.total_amount,
      paid_amount: result.paid_amount,
      change_amount: result.change_amount,
      payment_status: result.payment_status,
      sale_status: 'completed',
      notes: payload.notes,
      created_by: clientUser?.id,
      warehouse: warehouses.find(w => w.id === selectedWarehouseId),
      cashier: clientUser,
      items: cartItems.map(item => ({
        id: Math.random().toString(),
        sale_id: result.sale_id,
        client_id: clientId,
        product_id: item.product.id,
        product_name_snapshot: item.product.name,
        sku_snapshot: item.product.sku,
        barcode_snapshot: item.product.barcode,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount,
        tax_rate: item.tax_rate,
        tax_amount: item.tax_amount,
        line_total: item.line_total,
        created_at: result.sale_date
      })),
      payments: [
        {
          id: Math.random().toString(),
          sale_id: result.sale_id,
          client_id: clientId,
          payment_method: paymentData.paymentMethod,
          amount: paymentData.amountPaid,
          reference: paymentData.reference,
          created_at: result.sale_date
        }
      ],
      created_at: result.sale_date,
      updated_at: result.sale_date
    };

    setCompletedSale(completedSaleObj);
    setIsPaymentModalOpen(false);
    clearCart();
    setIsReceiptModalOpen(true);

    // Refresh stock in local catalog and update active shift running figures
    loadPOSData();
    loadActiveShift(clientId);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-100 text-slate-800">
      
      {/* Top POS Control Bar */}
      <header className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-900 text-white border-b border-slate-800 shrink-0 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {client?.logo ? (
              <img
                src={client.logo}
                alt={client.business_name}
                className="h-8 w-8 rounded-lg object-contain bg-white p-0.5 border border-slate-700 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <ShoppingCart className="w-5 h-5 text-indigo-400" />
            )}
            <div className="flex flex-col">
              <h1 className="text-sm font-extrabold tracking-tight text-white leading-tight">
                {client?.business_name || 'نقطة البيع'}
              </h1>
              <span className="text-[10px] text-slate-400 font-medium">
                {client?.customer_name ? `${client.customer_name} • Ordexa POS` : 'Ordexa POS Engine'}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          {/* Warehouse Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>المستودع:</span>
            <select
              value={selectedWarehouseId || ''}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} {w.is_default ? '(الافتراضي)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Shortcuts Tips & User info */}
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-700">
              <Keyboard className="w-3 h-3 text-slate-400" />
              <span>[F2] بحث</span>
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-700">
              <span>[F4] الدفع</span>
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-700">
              <span>[ESC] إغلاق</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span>الكاشير: <strong className="text-white">{clientUser?.name}</strong></span>
          </div>

          <button
            onClick={() => setIsConfigModalOpen(true)}
            title="إعدادات نقطة البيع وترخيص الجهاز"
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 rounded-lg border border-slate-700 transition-colors"
          >
            <Monitor className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">إعدادات الجهاز</span>
          </button>

          <button
            onClick={loadPOSData}
            title="تحديث البيانات"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* POS Active Shift Status & Cash Drawer Bar */}
      <POSShiftBar 
        activeShift={activeShift} 
        warehouseId={selectedWarehouseId || undefined} 
        clientId={clientId}
        onRefresh={() => {
          if (clientId) {
            loadActiveShift(clientId);
            initializeDevice(clientId);
          }
        }} 
      />

      {/* Error alert if any */}
      {errorMessage && (
        <div className="flex items-center justify-between px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Dual Pane Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left / Center: Catalog & Product Search (Width: ~65%) */}
        <div className="flex-1 flex flex-col border-l border-slate-200 bg-white overflow-hidden">
          
          {/* Search & Barcode Bar */}
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2 items-center shrink-0">
            
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم، SKU، أو الباركود [F2]..."
                className="w-full pr-9 pl-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Barcode Scanner Direct Input */}
            <form onSubmit={handleBarcodeSubmit} className="relative w-48 sm:w-56">
              <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-600" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="مسح الباركود مباشرة..."
                className="w-full pr-9 pl-8 py-2 text-xs font-mono bg-white border border-indigo-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
              <button
                type="submit"
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Categories Horizontal Scroller */}
          <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              جميع التصنيفات ({products.length})
            </button>
            {categories.map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mb-2 text-indigo-500" />
                <p className="text-xs">جاري تحميل المنتجات والأسعار...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <PackageX className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                <p className="text-xs font-medium">لم يتم العثور على منتجات مطابقة</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs text-indigo-600 hover:underline"
                  >
                    إلغاء البحث وعرض كل الأصناف
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {filteredProducts.map(product => {
                  const isOutOfStock = product.track_stock && Number(product.current_stock || 0) <= 0;
                  const isLowStock = product.track_stock && Number(product.current_stock || 0) <= Number(product.min_stock || 0) && !isOutOfStock;

                  return (
                    <button
                      key={product.id}
                      onClick={() => !isOutOfStock && handleAddProduct(product)}
                      disabled={isOutOfStock}
                      className={`group relative flex flex-col justify-between p-3 rounded-xl border text-right transition-all select-none ${
                        isOutOfStock
                          ? 'opacity-60 bg-slate-50 border-slate-200 cursor-not-allowed'
                          : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-sm active:scale-[0.98]'
                      }`}
                    >
                      {/* Top Info */}
                      <div>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="text-[10px] font-mono text-slate-400 uppercase truncate">
                            {product.sku}
                          </span>
                          {product.track_stock ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              isOutOfStock 
                                ? 'bg-rose-100 text-rose-700' 
                                : isLowStock 
                                  ? 'bg-amber-100 text-amber-700' 
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {isOutOfStock ? 'نفد' : `${product.current_stock}`}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">خدمة</span>
                          )}
                        </div>

                        <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                          {product.name}
                        </h3>

                        {product.category && (
                          <span className="text-[10px] text-slate-500 mt-0.5 block truncate">
                            {product.category.name}
                          </span>
                        )}
                      </div>

                      {/* Bottom Pricing */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-extrabold text-indigo-700 font-mono">
                          {formatCurrency(product.selling_price)}
                        </span>
                        {product.tax_rate > 0 && (
                          <span className="text-[9px] text-slate-400">
                            ضريبة {product.tax_rate}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Cart, Totals & Checkout Actions (Width: ~35%) */}
        <div className="w-full lg:w-96 xl:w-[420px] flex flex-col bg-slate-50 border-r border-slate-200 shrink-0">
          
          {/* Cart Header */}
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                {getItemsCount()}
              </div>
              <span className="text-xs font-bold text-slate-900">سلة المشتريات</span>
            </div>

            {cartItems.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إفراغ السلة</span>
              </button>
            )}
          </div>

          {/* Customer Input */}
          <div className="px-4 py-2 bg-white/70 border-b border-slate-200 flex items-center gap-2 shrink-0">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="اسم العميل (عميل نقدي عام)"
              className="w-full text-xs bg-transparent border-none focus:outline-hidden text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                <ShoppingCart className="w-12 h-12 stroke-1 text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-600">السلة فارغة</p>
                <p className="text-[11px] text-slate-400 mt-1">اختر الأصناف أو امسح الباركود لإضافتها</p>
              </div>
            ) : (
              cartItems.map((item) => (
                <div 
                  key={item.product.id}
                  className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2"
                >
                  {/* Item top row: Name, price, delete */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {item.product.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span className="font-mono">{item.product.sku}</span>
                        <span>•</span>
                        {canEditPrice ? (
                          activePriceEditItemId === item.product.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                autoFocus
                                value={itemPriceInputValue}
                                onChange={(e) => setItemPriceInputValue(parseFloat(e.target.value) || 0)}
                                className="w-16 px-1 py-0.5 text-[11px] font-mono text-slate-900 border border-indigo-400 rounded bg-indigo-50/50 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  updateItemPrice(item.product.id, itemPriceInputValue);
                                  setActivePriceEditItemId(null);
                                }}
                                className="p-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                title="حفظ السعر"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setActivePriceEditItemId(null)}
                                className="p-0.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                                title="إلغاء"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActivePriceEditItemId(item.product.id);
                                setItemPriceInputValue(item.unit_price);
                              }}
                              className="inline-flex items-center gap-1 font-mono font-medium text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 px-1 py-0.5 rounded transition-colors"
                              title="انقر لتعديل السعر (صلاحية مصرحة)"
                            >
                              <span>{formatCurrency(item.unit_price)}</span>
                              <Edit2 className="w-2.5 h-2.5 text-slate-400" />
                            </button>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-600" title="سعر رسمي محمي">
                            <span>{formatCurrency(item.unit_price)}</span>
                            <Lock className="w-2.5 h-2.5 text-slate-300" />
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-slate-300 hover:text-rose-500 p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Item quantity controls and line total */}
                  <div className="flex items-center justify-between pt-1">
                    {/* Quantity controls */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                      <button
                        onClick={() => updateItemQuantity(item.product.id, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-white rounded transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updateItemQuantity(item.product.id, val);
                        }}
                        className="w-10 text-center text-xs font-bold font-mono bg-transparent border-none focus:outline-hidden text-slate-900"
                      />
                      <button
                        onClick={() => updateItemQuantity(item.product.id, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-white rounded transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Line discount button/input */}
                    {activeDiscountItemId === item.product.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={itemDiscountInputValue}
                          onChange={(e) => setItemDiscountInputValue(parseFloat(e.target.value) || 0)}
                          placeholder="خصم"
                          className="w-14 px-1 py-0.5 text-xs text-center border border-rose-300 rounded font-mono"
                        />
                        <button
                          onClick={() => {
                            updateItemDiscount(item.product.id, itemDiscountInputValue);
                            setActiveDiscountItemId(null);
                          }}
                          className="p-1 bg-emerald-600 text-white rounded text-[10px]"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setActiveDiscountItemId(item.product.id);
                          setItemDiscountInputValue(item.discount_amount);
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          item.discount_amount > 0 
                            ? 'bg-rose-50 text-rose-600 border-rose-200 font-bold' 
                            : 'text-slate-400 border-dashed border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {item.discount_amount > 0 ? `خصم: -${formatCurrency(item.discount_amount, '')}` : '+ خصم'}
                      </button>
                    )}

                    {/* Line Total */}
                    <div className="text-left font-mono font-extrabold text-xs text-slate-900">
                      {formatCurrency(item.line_total)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Financial Summary & Payment Action */}
          <div className="p-4 bg-white border-t border-slate-200 shadow-sm shrink-0 space-y-2.5">
            
            {/* Invoice Discount Row */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-600">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>خصم على الفاتورة:</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={invoiceDiscount || ''}
                  onChange={(e) => setInvoiceDiscount(parseFloat(e.target.value) || 0, invoiceDiscountType)}
                  placeholder="0.00"
                  className="w-20 px-2 py-0.5 text-xs text-left font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setInvoiceDiscount(invoiceDiscount, invoiceDiscountType === 'fixed' ? 'percentage' : 'fixed')}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200"
                >
                  {invoiceDiscountType === 'fixed' ? currencySymbol : '%'}
                </button>
              </div>
            </div>

            {/* Calculations breakdown */}
            <div className="space-y-1 text-xs text-slate-500 pt-1 border-t border-slate-100">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span className="font-mono text-slate-800">{formatCurrency(getSubtotal())}</span>
              </div>

              {getTotalDiscounts() > 0 && (
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>إجمالي الخصومات:</span>
                  <span className="font-mono">- {formatCurrency(getTotalDiscounts())}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>ضريبة القيمة المضافة (VAT):</span>
                <span className="font-mono text-slate-800">{formatCurrency(getTotalTax())}</span>
              </div>

              <div className="flex justify-between pt-1.5 border-t border-slate-200 text-sm font-extrabold text-slate-900">
                <span>المجموع الكلي:</span>
                <span className="text-lg text-indigo-700 font-mono">
                  {formatCurrency(getGrandTotal())}
                </span>
              </div>
            </div>

            {/* Pay Button / Shift Guard */}
            {activeShift ? (
              <button
                id="btn-pos-checkout"
                onClick={() => setIsPaymentModalOpen(true)}
                disabled={cartItems.length === 0}
                className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-sm flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  <span>إتمام البيع والدفع [F4]</span>
                </div>
                <span className="font-mono text-base font-black">
                  {formatCurrency(getGrandTotal())}
                </span>
              </button>
            ) : (
              <button
                id="btn-pos-open-shift-required"
                type="button"
                onClick={() => setIsOpenShiftModalOpen(true)}
                className="w-full mt-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-900 font-extrabold text-sm rounded-xl shadow-sm flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-slate-900" />
                  <span>يجب فتح الوردية أولاً لإتمام البيع</span>
                </div>
                <span className="text-xs bg-slate-900 text-white font-bold px-2.5 py-1 rounded-lg">
                  فتح الوردية
                </span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Modals */}
      <OpenShiftModal
        isOpen={isOpenShiftModalOpen}
        onClose={() => {
          setIsOpenShiftModalOpen(false);
          if (clientId) loadActiveShift(clientId);
        }}
        defaultWarehouseId={selectedWarehouseId || undefined}
      />

      <POSPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        subtotal={getSubtotal()}
        discount={getTotalDiscounts()}
        tax={getTotalTax()}
        total={getGrandTotal()}
        itemsCount={getItemsCount()}
        onConfirmPayment={handleConfirmPayment}
      />

      <InvoiceReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        sale={completedSale}
        client={client}
        onNewSale={() => {
          clearCart();
          setIsReceiptModalOpen(false);
        }}
      />

      <POSTerminalConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        clientId={clientId}
      />

    </div>
  );
};
