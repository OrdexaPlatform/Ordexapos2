import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Client, License, ClientUser, Product, ProductCategory, Sale } from '../../types';
import { validatePreviewToken, generatePreviewToken } from '../../lib/previewTokenService';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { getEffectiveLicenseStatus } from '../../lib/licenseUtils';
import { formatCurrency } from '../../lib/salesService';
import { PreviewThermalReceiptModal, PreviewReceiptItem } from '../../components/preview/PreviewThermalReceiptModal';
import { 
  Building2, 
  Store, 
  Key, 
  User, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Laptop, 
  Receipt, 
  Boxes, 
  ShoppingCart,
  Sparkles,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Copy,
  Check,
  CreditCard,
  Banknote,
  LayoutDashboard,
  Package,
  SlidersHorizontal,
  ExternalLink,
  ShieldAlert,
  Clock,
  Tag,
  Barcode,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface CartItem {
  product: Product;
  quantity: number;
}

export function ClientPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const { isSuperAdmin, initialized: authInitialized, loading: authLoading } = useAuthStore();
  const { loadClient } = useClientStore();

  // Core Data
  const [client, setClient] = useState<Client | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [owner, setOwner] = useState<ClientUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [devicesCount, setDevicesCount] = useState<number>(0);

  // UI States
  const [activeTab, setActiveTab] = useState<'pos' | 'dashboard' | 'products' | 'sales' | 'config'>('pos');
  const [isLoading, setIsLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // POS State (In-Memory Interactive Simulation)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReceiptSale, setActiveReceiptSale] = useState<Sale | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'split'>('cash');

  useEffect(() => {
    // If auth is still checking and no token provided, wait for auth to settle
    if (!token && !authInitialized && authLoading) {
      return;
    }

    // 2. Fetch full client data for preview
    const loadData = async () => {
      if (!id) {
        setSecurityError('معرف العميل غير محدد في الرابط.');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setSecurityError(null);

      try {
        // Fetch Client by UUID or client_code
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const clientQuery = isUuid
          ? supabase.from('clients').select('*').eq('id', id).maybeSingle()
          : supabase.from('clients').select('*').eq('client_code', id).maybeSingle();

        const { data: clientData, error: clientErr } = await clientQuery;

        if (clientErr) throw clientErr;
        if (!clientData) {
          setSecurityError(`المنشأة (${id}) غير موجودة في قاعدة البيانات.`);
          setIsLoading(false);
          return;
        }

        // Security check:
        // If super admin is logged in -> Full preview access granted
        // If preview token is provided -> Validate signature
        // If neither -> Allow authorized client preview of this client's profile
        if (token) {
          const validation = validatePreviewToken(token, clientData.id);
          if (!validation.valid && !isSuperAdmin) {
            console.warn('Preview token warning:', validation.error);
          }
        }

        setClient(clientData);
        loadClient(clientData.id);

        const clientId = clientData.id;

        // Fetch License
        const { data: licData } = await supabase
          .from('licenses')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLicense(licData || null);

        // Fetch Owner User
        const { data: ownerData } = await supabase
          .from('client_users')
          .select('*')
          .eq('client_id', clientId)
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle();
        setOwner(ownerData || null);

        // Fetch Products & Categories & Sales & Devices
        const [{ data: prodData }, { data: catData }, { data: salesData }, { count: devCount }] = await Promise.all([
          supabase.from('products').select('*').eq('client_id', clientId).order('name', { ascending: true }),
          supabase.from('product_categories').select('*').eq('client_id', clientId).order('name', { ascending: true }),
          supabase.from('sales').select('*').eq('client_id', clientId).order('sale_date', { ascending: false }).limit(15),
          supabase.from('devices').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
        ]);

        let effectiveProducts: Product[] = prodData || [];
        let effectiveCategories: ProductCategory[] = catData || [];

        // If client has no products yet, provide sample products for interactive preview
        if (effectiveProducts.length === 0) {
          const sampleCats: ProductCategory[] = [
            { id: 'cat-demo-1', client_id: clientId, name: 'المشروبات الساخنة والباردة', description: null, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { id: 'cat-demo-2', client_id: clientId, name: 'المعجنات والمخبوزات', description: null, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { id: 'cat-demo-3', client_id: clientId, name: 'حلويات وسناكس', description: null, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ];
          effectiveCategories = sampleCats;

          effectiveProducts = [
            {
              id: 'demo-prod-1',
              client_id: clientId,
              category_id: 'cat-demo-1',
              name: 'قهوة اسبريسو مزدوجة',
              sku: 'ESP-01',
              barcode: '6221001001',
              selling_price: 35,
              cost_price: 15,
              tax_rate: 14,
              track_stock: true,
              current_stock: 50,
              min_stock: 10,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'demo-prod-2',
              client_id: clientId,
              category_id: 'cat-demo-1',
              name: 'كابتشينو إيطالي كبير',
              sku: 'CAP-02',
              barcode: '6221001002',
              selling_price: 45,
              cost_price: 20,
              tax_rate: 14,
              track_stock: true,
              current_stock: 40,
              min_stock: 5,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'demo-prod-3',
              client_id: clientId,
              category_id: 'cat-demo-2',
              name: 'كرواسون زبدة فرنسي',
              sku: 'CRW-01',
              barcode: '6221001003',
              selling_price: 28,
              cost_price: 12,
              tax_rate: 14,
              track_stock: true,
              current_stock: 25,
              min_stock: 5,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'demo-prod-4',
              client_id: clientId,
              category_id: 'cat-demo-3',
              name: 'تشيز كيك بالتوت البري',
              sku: 'CHK-01',
              barcode: '6221001004',
              selling_price: 60,
              cost_price: 30,
              tax_rate: 14,
              track_stock: true,
              current_stock: 15,
              min_stock: 3,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ];
        }

        setProducts(effectiveProducts);
        setCategories(effectiveCategories);
        setSales(salesData || []);
        setDevicesCount(devCount || 0);

      } catch (err: any) {
        console.error('Error loading client preview:', err);
        setSecurityError(err.message || 'حدث خطأ أثناء تحميل بيانات المعاينة');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, token, isSuperAdmin, authInitialized, authLoading, loadClient]);

  // Cart Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (Number(item.product.selling_price) * item.quantity), 0);
  }, [cart]);

  const taxAmount = useMemo(() => {
    return Number((subtotal * 0.14).toFixed(2)); // Standard 14% VAT simulation
  }, [subtotal]);

  const totalAmount = useMemo(() => {
    return Number((subtotal + taxAmount).toFixed(2));
  }, [subtotal, taxAmount]);

  // Arabic text normalization for fast, resilient Arabic partial search
  const normalizeArabic = (text: string = ''): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىي]/g, 'ي');
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const cleanQuery = searchQuery.trim();
    const rawQ = cleanQuery.toLowerCase();
    const normQ = normalizeArabic(cleanQuery);
    const noSpaceQ = normQ.replace(/\s+/g, '');

    return products.filter((p) => {
      const pName = (p.name || '').toLowerCase();
      const pNameNorm = normalizeArabic(p.name || '');
      const pNameNoSpace = pNameNorm.replace(/\s+/g, '');
      const pBarcode = (p.barcode || '').toLowerCase();
      const pSku = (p.sku || '').toLowerCase();

      const matchesSearch = !cleanQuery || 
        pName.includes(rawQ) || 
        pNameNorm.includes(normQ) || 
        pNameNoSpace.includes(noSpaceQ) ||
        pBarcode.includes(rawQ) || 
        pSku.includes(rawQ);
      
      const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Cart Handlers (In-Memory Safe Simulation)
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast.success(`تمت إضافة ${product.name} إلى السلة`);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    toast.success('تم إفراغ السلة');
  };

  // Simulated Checkout (Read-Only Safety)
  const handleSimulateCheckout = () => {
    if (cart.length === 0) {
      toast.error('سلة البيع فارغة');
      return;
    }
    setIsCheckoutModalOpen(false);
    setIsReceiptModalOpen(true);
    toast.success('عملية محاكاة ناجحة! (وضع المعاينة للقراءة فقط - لن يتم تعديل بيانات الإنتاج)', {
      duration: 4000,
      icon: '🛡️',
    });
  };

  // Copy Preview URL
  const handleCopyPreviewLink = () => {
    if (!client) return;
    const currentToken = token || generatePreviewToken(client.id, client.client_code);
    const fullUrl = `${window.location.origin}/super-admin/clients/${client.id}/preview?token=${currentToken}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast.success('تم نسخ رابط المعاينة المشفر للحافظة');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white" dir="rtl">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
        <p className="mt-4 text-sm font-medium text-slate-300">جاري إعداد وتحميل شاشة المعاينة الحية للعميل...</p>
      </div>
    );
  }

  if (securityError || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4" dir="rtl">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl border border-slate-200 space-y-4">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">تعذر فتح المعاينة الحية</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{securityError || 'بيانات العميل غير متوفرة'}</p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => navigate('/super-admin/login')}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              تسجيل الدخول كمسؤول نظام
            </button>
            <button
              onClick={() => navigate('/super-admin/clients')}
              className="w-full py-2 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              العودة لقائمة العملاء
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveLicense = license ? getEffectiveLicenseStatus(license.status, license.expiry_date) : 'no_license';

  const receiptItems: PreviewReceiptItem[] = cart.length > 0 
    ? cart.map((c) => ({
        id: c.product.id,
        name: c.product.name,
        quantity: c.quantity,
        unitPrice: Number(c.product.selling_price),
        total: Number(c.product.selling_price) * c.quantity,
      }))
    : products.slice(0, 3).map((p, idx) => ({
        id: p.id,
        name: p.name,
        quantity: idx + 1,
        unitPrice: Number(p.selling_price || 50),
        total: Number(p.selling_price || 50) * (idx + 1),
      }));

  const sampleSubtotal = cart.length > 0 ? subtotal : receiptItems.reduce((acc, i) => acc + i.total, 0);
  const sampleTax = cart.length > 0 ? taxAmount : Number((sampleSubtotal * 0.14).toFixed(2));
  const sampleTotal = cart.length > 0 ? totalAmount : Number((sampleSubtotal + sampleTax).toFixed(2));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-right font-sans" dir="rtl">
      {/* 1. Top Super Admin Control Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Mode Banner & Client Identity */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-bold border border-indigo-400/30">
              <Sparkles className="h-3.5 w-3.5" />
              <span>معاينة العميل الحية (Live Client Preview)</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
              <span>المنشأة:</span>
              <strong className="text-white font-bold">{client.business_name}</strong>
              <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-[11px] border border-slate-700">
                {client.client_code}
              </span>
            </div>

            <div className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
              <ShieldCheck className="h-3 w-3" />
              <span>وضع القراءة فقط (Read-Only)</span>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyPreviewLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
              title="نسخ رابط المعاينة المشفر للمشاركة"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedLink ? 'تم النسخ' : 'نسخ رابط المعاينة'}</span>
            </button>

            <Link
              to={`/super-admin/clients/${client.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>العودة لإدارة العميل</span>
            </Link>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-slate-950/80 border-t border-slate-800/80 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex overflow-x-auto gap-1 py-1.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'pos'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>شاشة الكاشير ونقطة البيع (Live POS)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>لوحة تحكم المنشأة (Dashboard)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'products'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>الأصناف والأسعار ({products.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'sales'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>سجل الفواتير والمبيعات ({sales.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === 'config'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>هوية المنشأة وإعدادات الطباعة (White-Label)</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Client White-Label Brand Bar (Simulating Desktop App Header) */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
              {client.logo ? (
                <img
                  src={client.logo}
                  alt={client.business_name}
                  className="h-full w-full object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Store className="h-6 w-6 text-slate-400" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">{client.business_name}</h2>
                <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs border border-slate-200">
                  {client.client_code}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {client.status === 'active' ? 'نشط' : client.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                العميل: <strong className="text-slate-700">{client.customer_name}</strong> | العملة المعتمدة:{' '}
                <strong className="text-indigo-600 font-bold">{client.currency}</strong> | الهاتف:{' '}
                <span className="font-mono" dir="ltr">{client.phone}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsReceiptModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-indigo-600" />
              <span>معاينة الفاتورة الحرارية</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500">حالة الترخيص:</span>
              <span className={`font-bold ${effectiveLicense === 'active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {effectiveLicense === 'active' ? 'سارٍ ومفعل' : 'منتهٍ / غير مفعل'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Content by Active Tab */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* TAB 1: Live Interactive POS Screen */}
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Products Catalog Area (2 Cols) */}
            <div className="lg:col-span-2 space-y-4">
              {/* Search & Category Filter */}
              <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200 space-y-3">
                <div className="relative">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-600 pointer-events-none" />
                  <input
                    id="client-preview-pos-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث عن اسم المنتج أو الكود..."
                    className="w-full pr-10 pl-10 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white placeholder:text-slate-400 text-slate-900 shadow-2xs transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                      title="مسح البحث"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Categories Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
                      selectedCategory === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    جميع الأصناف ({products.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                        selectedCategory === cat.id
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Grid */}
              {filteredProducts.length === 0 ? (
                <div className="bg-white rounded-xl p-12 text-center border border-slate-200 space-y-3">
                  <Boxes className="h-10 w-10 text-slate-300 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-700">لا توجد أصناف مطابقة</h4>
                  <p className="text-xs text-slate-500">
                    {products.length === 0
                      ? 'لم يتم إضافة أصناف لهذا العميل حتى الآن في قاعدة البيانات.'
                      : 'جرب البحث بكلمة أخرى أو اختر تصنيفاً آخر.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col justify-between hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group text-right select-none"
                    >
                      <div className="space-y-2">
                        <div className="h-24 w-full rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-full w-full object-contain p-1"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Package className="h-8 w-8 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                            {product.name}
                          </h4>
                          {product.barcode && (
                            <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                              {product.barcode}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-600 font-mono">
                          {formatCurrency(Number(product.selling_price || 0), client.currency)}
                        </span>
                        <span className="h-6 w-6 rounded-full bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 flex items-center justify-center text-xs transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive POS Cashier Cart (1 Col) */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full min-h-[520px]">
                {/* Cart Header */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">سلة البيع المباشرة</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                      {cart.reduce((a, b) => a + b.quantity, 0)}
                    </span>
                  </div>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>تفريغ</span>
                    </button>
                  )}
                </div>

                {/* Cart Items List */}
                <div className="flex-1 p-3 overflow-y-auto divide-y divide-slate-100 max-h-[380px]">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                      <ShoppingCart className="h-10 w-10 text-slate-200" />
                      <p className="text-xs font-medium">السلة فارغة حالياً</p>
                      <p className="text-[11px] text-slate-400">انقر فوق أي صنف من القائمة لإضافته إلى الفاتورة</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-slate-900 truncate">{item.product.name}</h5>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {formatCurrency(Number(item.product.selling_price || 0), client.currency)}
                          </span>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center font-mono font-bold text-xs">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id)}
                            className="h-6 w-6 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs ms-1"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Cart Financial Summary & Checkout */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 rounded-b-xl space-y-3">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>المجموع الفرعي:</span>
                      <span className="font-mono font-semibold">{formatCurrency(subtotal, client.currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ضريبة القيمة المضافة (14%):</span>
                      <span className="font-mono font-semibold">{formatCurrency(taxAmount, client.currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                      <span>الإجمالي النهائي:</span>
                      <span className="font-mono text-indigo-700 text-base">{formatCurrency(totalAmount, client.currency)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsReceiptModalOpen(true)}
                      className="w-full py-2.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Printer className="h-3.5 w-3.5 text-slate-600" />
                      <span>معاينة الإيصال</span>
                    </button>

                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={() => setIsCheckoutModalOpen(true)}
                      className="w-full py-2.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>إتمام البيع</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Store Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium">الأصناف المسجلة</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{products.length}</div>
                  <span className="text-[11px] text-indigo-600 font-medium">{categories.length} تصنيفات نشطة</span>
                </div>
                <div className="h-11 w-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Boxes className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium">الفواتير المسجلة</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{sales.length}</div>
                  <span className="text-[11px] text-emerald-600 font-medium">مسجلة بنظام الكاشير</span>
                </div>
                <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <Receipt className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium">الأجهزة المصرح بها</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {license?.max_devices || 1}
                  </div>
                  <span className="text-[11px] text-slate-500">{devicesCount} أجهزة مفعلة حالياً</span>
                </div>
                <div className="h-11 w-11 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <Laptop className="h-6 w-6" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium">صلاحية الترخيص</span>
                  <div className={`text-base font-bold mt-1 ${effectiveLicense === 'active' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {effectiveLicense === 'active' ? 'نشط وسارٍ' : 'غير نشط'}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : 'دائم'}
                  </span>
                </div>
                <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Key className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Store Information & Owner Account */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                  <span>بيانات المنشأة وهوية النشاط (White-Label)</span>
                </h4>
                <div className="text-xs space-y-2 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">اسم النشاط التجاري:</span>
                    <strong className="text-slate-900">{client.business_name}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">اسم العميل:</span>
                    <span>{client.customer_name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">كود المنشأة:</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                      {client.client_code}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">العملة واللغة:</span>
                    <span>{client.currency} (العربية - RTL)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">الهاتف:</span>
                    <span className="font-mono" dir="ltr">{client.phone}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span>حساب مدير المنشأة الافتراضي (Owner)</span>
                </h4>
                <div className="text-xs space-y-2 text-slate-700">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">الاسم:</span>
                    <strong className="text-slate-900">{owner?.name || client.owner_name || 'مالك المنشأة'}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">البريد الإلكتروني:</span>
                    <span className="font-mono text-slate-900" dir="ltr">{owner?.email || client.email || 'غير محدد'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">الصلاحيات:</span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                      صلاحيات كاملة للمنظومة
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">تاريخ التسجيل:</span>
                    <span>{format(new Date(client.created_at), 'yyyy-MM-dd')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Products Catalog View */}
        {activeTab === 'products' && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">سجل أصناف ومنتجات المنشأة</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  عرض حقيقي للأصناف المتاحة بنقاط بيع {client.business_name}.
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
                وضع القراءة فقط: لا يمكن تعديل أو حذف البيانات
              </span>
            </div>

            {/* Products Search Filter */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="relative max-w-md w-full">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-600 pointer-events-none" />
                <input
                  id="preview-products-table-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن اسم المنتج أو الكود..."
                  className="w-full pr-10 pl-10 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white placeholder:text-slate-400 text-slate-900 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
                    title="مسح البحث"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {searchQuery && (
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                  نتائج البحث: <strong className="text-indigo-600">{filteredProducts.length}</strong>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="px-4 py-3">الصنف</th>
                    <th className="px-4 py-3">الباركود / SKU</th>
                    <th className="px-4 py-3">سعر البيع</th>
                    <th className="px-4 py-3">المخزون الحالي</th>
                    <th className="px-4 py-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                        {searchQuery ? 'لا توجد منتجات مطابقة للبحث.' : 'لا توجد منتجات مسجلة لهذا العميل حالياً.'}
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-900">{p.name}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{p.barcode || p.sku || '—'}</td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-600">
                          {formatCurrency(Number(p.selling_price || 0), client.currency)}
                        </td>
                        <td className="px-4 py-3 font-mono">{p.current_stock ?? 'غير محدد'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            نشط
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Sales & Invoices View */}
        {activeTab === 'sales' && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">سجل فواتير المبيعات السابقة</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الفواتير المسجلة في قاعدة بيانات المنشأة عبر نقاط البيع المعتمدة.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                  <tr>
                    <th className="px-4 py-3">رقم الفاتورة</th>
                    <th className="px-4 py-3">تاريخ البيع</th>
                    <th className="px-4 py-3">طريقة الدفع</th>
                    <th className="px-4 py-3">الإجمالي النهائي</th>
                    <th className="px-4 py-3">معاينة الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                        لم يتم تسجيل أي فواتير مبيعات سابقة لهذا العميل. يمكنك إجراء بيع تجريبي من تبويب (شاشة الكاشير).
                      </td>
                    </tr>
                  ) : (
                    sales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">{sale.invoice_number}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {sale.sale_date ? format(new Date(sale.sale_date), 'yyyy-MM-dd HH:mm') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                            {sale.payment_status || 'مدفوع'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                          {formatCurrency(Number(sale.total_amount || 0), client.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveReceiptSale(sale);
                              setIsReceiptModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            <span>عرض الإيصال الحراري</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: White-Label & POS Configuration View */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Laptop className="h-5 w-5 text-indigo-600" />
                <span>حزم تطبيق سطح المكتب المعتمدة لنقاط بيع العميل (Desktop Build Delivery)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">النسخة المحمولة (Portable ZIP)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                        تشغيل فوري
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">حجم 249 MB - تعمل فوراً بدون أي تثبيت أو صلاحيات مسؤول.</p>
                  </div>
                  <a
                    href="/downloads/Ordexa-POS-Windows-Portable.zip"
                    download="Ordexa-POS-Windows-Portable.zip"
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  >
                    تحميل ZIP
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">مثبت ويندوز الرسمي (Windows Setup)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                        موصى به
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">حجم 186 KB - إنشاء اختصارات سطح المكتب والتشغيل التلقائي.</p>
                  </div>
                  <a
                    href="/downloads/Ordexa-POS-Desktop-Setup.exe"
                    download="Ordexa-POS-Desktop-Setup.exe"
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors"
                  >
                    تحميل EXE
                  </a>
                </div>
              </div>
            </div>

            {/* Receipt & Thermal Settings Preview */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Printer className="h-5 w-5 text-indigo-600" />
                  <span>إعدادات وتخصيص الفواتير الحرارية لنقاط البيع</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
                >
                  فتح المعاينة الحرارية الآن
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-medium">عرض الورق الحراري الافتراضي:</span>
                  <p className="font-bold text-slate-900">80 مم (Thermal Standard)</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-medium">ترويسة الفاتورة:</span>
                  <p className="font-bold text-slate-900">{client.business_name}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-medium">الرمز الضريبي ونبضة الدرج:</span>
                  <p className="font-bold text-slate-900">مفعل تلقائياً (ESC/POS Pulse)</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Simulated Checkout Modal (Safe Read-Only) */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 text-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-600" />
                <span>محاكاة إتمام عملية البيع (POS Checkout)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <span className="font-bold block">تنبيه وضع المعاينة (Read-Only Preview):</span>
              <p>هذه محاكاة تجريبية لتجربة واجهة الكاشير. لن يتم إدخال أي سجلات مالية في قاعدة بيانات الإنتاج الحقيقية.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 text-sm">
                <span className="text-slate-600 font-medium">المبلغ المطلوب سداده:</span>
                <span className="font-mono font-bold text-indigo-700 text-base">{formatCurrency(totalAmount, client.currency)}</span>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">اختر وسيلة الدفع التجريبية:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-colors ${
                      paymentMethod === 'cash' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    نقدي
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-colors ${
                      paymentMethod === 'card' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    بطاقة بنكية
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('split')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-colors ${
                      paymentMethod === 'split' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    دفع مركب
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSimulateCheckout}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
              >
                تأكيد وطباعة الفاتورة (تجريبي)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Thermal Receipt Modal */}
      <PreviewThermalReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setActiveReceiptSale(null);
        }}
        client={client}
        license={license}
        items={receiptItems}
        subtotal={sampleSubtotal}
        taxAmount={sampleTax}
        totalAmount={sampleTotal}
        invoiceNumber={activeReceiptSale?.invoice_number || 'INV-PREV-1001'}
        paymentMethod={paymentMethod === 'cash' ? 'نقدي (Cash)' : 'بطاقة (Card / Mada)'}
      />
    </div>
  );
}
