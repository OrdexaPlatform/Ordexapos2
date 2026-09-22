import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Store, 
  Receipt, 
  Key, 
  Smartphone, 
  Phone, 
  Mail, 
  MapPin, 
  Globe, 
  Coins, 
  CheckCircle2, 
  Layers, 
  Info,
  Monitor,
  Save,
  Percent,
  Warehouse as WarehouseIcon,
  FileText,
  Loader2,
  Upload,
  RefreshCw
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { useCurrency } from '../../hooks/useCurrency';
import { warehouseService } from '../../lib/warehouseService';
import { supabase } from '../../lib/supabase';
import { Warehouse, Client } from '../../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { 
  getClientPOSSettings, 
  fetchClientPOSSettings, 
  saveClientPOSSettings 
} from '../../lib/clientSettingsService';

export function ClientSettings() {
  const { client, license, effectiveLicenseStatus, loadClient } = useClientStore();
  const { fingerprint, deviceName, operatingSystem, isDesktopNative } = useDeviceStore();
  const { supportedCurrencies } = useCurrency();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'financial' | 'receipt' | 'terminal'>('general');
  const [saving, setSaving] = useState(false);

  // Form State initialized from client
  const [businessName, setBusinessName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [logo, setLogo] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [language, setLanguage] = useState('ar');
  const [enableTax, setEnableTax] = useState<boolean>(true);
  const [taxNumber, setTaxNumber] = useState('');
  const [taxRate, setTaxRate] = useState<number>(14);
  const [showOwnerName, setShowOwnerName] = useState<boolean>(true);
  const [showPhone, setShowPhone] = useState<boolean>(true);
  const [showAddress, setShowAddress] = useState<boolean>(true);
  const [showTaxNumber, setShowTaxNumber] = useState<boolean>(true);
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [defaultWarehouseId, setDefaultWarehouseId] = useState('');

  // Sync state when client changes
  useEffect(() => {
    if (client) {
      setBusinessName(client.business_name || '');
      setCustomerName(client.customer_name || '');
      setOwnerName(client.owner_name || '');
      setPhone(client.phone || '');
      setEmail(client.email || '');
      setAddress(client.address || '');
      setLogo(client.logo || '');
      setCurrency(client.currency || 'EGP');
      setLanguage(client.language || 'ar');

      // Load client-specific POS and receipt preferences safely
      const cached = getClientPOSSettings(client.id);
      setEnableTax(cached.enable_tax !== undefined ? cached.enable_tax : true);
      setTaxRate(cached.tax_rate !== undefined ? cached.tax_rate : 14);
      setTaxNumber(cached.tax_number || '');
      setShowOwnerName(cached.show_owner_name !== undefined ? cached.show_owner_name : true);
      setShowPhone(cached.show_phone !== undefined ? cached.show_phone : true);
      setShowAddress(cached.show_address !== undefined ? cached.show_address : true);
      setShowTaxNumber(cached.show_tax_number !== undefined ? cached.show_tax_number : true);
      if (cached.receipt_header !== undefined) setReceiptHeader(cached.receipt_header);
      if (cached.receipt_footer !== undefined) setReceiptFooter(cached.receipt_footer);
      if (cached.paper_size !== undefined) setPaperSize(cached.paper_size);
      if (cached.default_warehouse_id) setDefaultWarehouseId(cached.default_warehouse_id);

      // Also fetch fresh from server
      fetchClientPOSSettings(client.id).then((fresh) => {
        if (fresh) {
          setEnableTax(fresh.enable_tax !== undefined ? fresh.enable_tax : true);
          setTaxRate(fresh.tax_rate !== undefined ? fresh.tax_rate : 14);
          if (fresh.tax_number !== undefined) setTaxNumber(fresh.tax_number);
          setShowOwnerName(fresh.show_owner_name !== undefined ? fresh.show_owner_name : true);
          setShowPhone(fresh.show_phone !== undefined ? fresh.show_phone : true);
          setShowAddress(fresh.show_address !== undefined ? fresh.show_address : true);
          setShowTaxNumber(fresh.show_tax_number !== undefined ? fresh.show_tax_number : true);
          if (fresh.receipt_header !== undefined) setReceiptHeader(fresh.receipt_header);
          if (fresh.receipt_footer !== undefined) setReceiptFooter(fresh.receipt_footer);
          if (fresh.paper_size !== undefined) setPaperSize(fresh.paper_size);
          if (fresh.default_warehouse_id) setDefaultWarehouseId(fresh.default_warehouse_id);
        }
      }).catch(() => {});
    }
  }, [client]);

  // Load warehouses
  useEffect(() => {
    if (client?.id) {
      warehouseService.fetchWarehouses(client.id)
        .then((whs) => {
          setWarehouses(whs);
          const defWh = whs.find(w => w.is_default);
          if (defWh) {
            setDefaultWarehouseId(defWh.id);
          } else if (whs.length > 0) {
            setDefaultWarehouseId(whs[0].id);
          }
        })
        .catch((err) => console.warn('Failed to load warehouses:', err));
    }
  }, [client?.id]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!client?.id) {
      toast.error('لم يتم تحديد المنشأة');
      return;
    }

    if (!businessName.trim()) {
      toast.error('اسم المنشأة مطلوب');
      return;
    }

    setSaving(true);
    // Only send legitimate columns of public.clients table
    const clientDbPayload: Partial<Client> = {
      business_name: businessName.trim(),
      customer_name: customerName.trim() || businessName.trim(),
      owner_name: ownerName.trim() || null,
      phone: phone.trim(),
      email: email.trim() || null,
      address: address.trim() || null,
      logo: logo.trim() || null,
      currency: currency || 'EGP',
      language: language || 'ar',
      updated_at: new Date().toISOString(),
    };

    // Save POS-specific configuration locally, on server and dispatch event
    const posPreferences = {
      enable_tax: Boolean(enableTax),
      tax_number: taxNumber.trim(),
      tax_rate: Number(taxRate) || 0,
      show_owner_name: Boolean(showOwnerName),
      show_phone: Boolean(showPhone),
      show_address: Boolean(showAddress),
      show_tax_number: Boolean(showTaxNumber),
      receipt_header: receiptHeader.trim(),
      receipt_footer: receiptFooter.trim(),
      paper_size: paperSize,
      default_warehouse_id: defaultWarehouseId || null,
    };

    try {
      await saveClientPOSSettings(client.id, posPreferences);
    } catch (posErr) {
      console.warn('Could not save POS settings:', posErr);
    }

    try {
      // 1. If default warehouse was selected, set is_default in warehouses table
      if (defaultWarehouseId && client.id) {
        try {
          await supabase
            .from('warehouses')
            .update({ is_default: false })
            .eq('client_id', client.id);
          await supabase
            .from('warehouses')
            .update({ is_default: true })
            .eq('id', defaultWarehouseId)
            .eq('client_id', client.id);
        } catch (whErr) {
          console.warn('Could not update default warehouse flag in warehouses table:', whErr);
        }
      }

      // 2. Try server API with clean client payload
      let updatedClient: Client | null = null;
      try {
        const res = await fetch('/api/client/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            clientId: client.id, 
            updates: clientDbPayload,
            default_warehouse_id: defaultWarehouseId || null
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.client) {
            updatedClient = json.client;
          }
        }
      } catch (apiErr) {
        console.warn('API update failed, falling back to direct DB update:', apiErr);
      }

      // 3. Direct Supabase update fallback (for static hosting or direct client connection)
      if (!updatedClient) {
        const { data: dbUpdated, error: dbErr } = await supabase
          .from('clients')
          .update(clientDbPayload)
          .eq('id', client.id)
          .select()
          .maybeSingle();

        if (dbErr) throw dbErr;
        updatedClient = dbUpdated as Client;
      }

      // 4. Update offline storage & zustand store
      const finalClient = { ...client, ...clientDbPayload, ...(updatedClient || {}) };
      try {
        localStorage.setItem(`ordexa_cached_client_${client.id}`, JSON.stringify(finalClient));
        if (finalClient.client_code) {
          localStorage.setItem(`ordexa_cached_client_by_code_${finalClient.client_code.toUpperCase()}`, JSON.stringify(finalClient));
        }
      } catch {}

      await loadClient(client.id);
      toast.success('تم حفظ وتحديث إعدادات المنشأة بنجاح');
    } catch (err: any) {
      console.error('Error saving settings:', err);
      toast.error(err.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
            <Store className="h-3.5 w-3.5" />
            <span>إدارة المنشأة ونقطة البيع (Client Administration)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            إعدادات وهوية منشأة {client?.business_name || 'العميل'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            إدارة الهوية التجارية، العملة والضريبة، المستودع الافتراضي، وإعدادات طباعة الفواتير.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>حفظ التغييرات</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition-all shrink-0 ${
            activeTab === 'general'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>البيانات الأساسية والهوية</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('financial')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition-all shrink-0 ${
            activeTab === 'financial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Coins className="h-4 w-4" />
          <span>العملة والضريبة والمستودع</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('receipt')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition-all shrink-0 ${
            activeTab === 'receipt'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>الفواتير والطباعة الحرارية</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-sm border-b-2 transition-all shrink-0 ${
            activeTab === 'terminal'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Smartphone className="h-4 w-4" />
          <span>الجهاز والترخيص</span>
        </button>
      </div>

      {/* Grid: Form on the right (2 spans), Live Preview on the left (1 span) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Container */}
        <div className="lg:col-span-2 space-y-6">
          {/* TAB 1: General Info & Branding */}
          {activeTab === 'general' && (
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">هوية وبيانات المنشأة</h3>
                <span className="text-xs text-slate-500">كود المنشأة: <strong className="font-mono text-slate-800">{client?.client_code}</strong></span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    اسم المنشأة التجاري (يظهر على شاشات الكاشير والفواتير) *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="مثال: البركة ستور"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الاسم القانوني / المسجل
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: مؤسسة البركة للتجارة"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    اسم المالك أو المسؤول
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="مثال: أحمد محمد"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    رقم الهاتف الرئيسي
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+20 100 000 0000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 ltr text-left focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    البريد الإلكتروني الرسمي
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="info@business.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 ltr text-left focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    العنوان / الموقع الجغرافي
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="مثال: القاهرة - المعادي - شارع 9"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    رابط الشعار المخصص (Logo URL)
                  </label>
                  <input
                    type="url"
                    value={logo}
                    onChange={(e) => setLogo(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 ltr text-left focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    يمكنك إدخال رابط مباشر لشعار المنشأة ليظهر أعلى الفاتورة الحرارية وشريط الكاشير.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Financial, Tax & Warehouse */}
          {activeTab === 'financial' && (
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">إعدادات العملة، الضريبة، والمستودع</h3>
                <span className="text-xs text-slate-500">ضبط العملة المعتمدة للنظام</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tax Enable Toggle Card */}
                <div className="sm:col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <label className="text-sm font-bold text-slate-900 cursor-pointer" htmlFor="enable-tax-toggle">
                        تفعيل حساب وتطبيق ضريبة القيمة المضافة (VAT)
                      </label>
                      <p className="text-xs text-slate-500">
                        عند إلغاء هذا الخيار، يتم إيقاف احتساب أي ضريبة فوراً على كافة المبيعات وشاشات الكاشير وتكون قيمة الضريبة 0.00.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        id="enable-tax-toggle"
                        checked={enableTax}
                        onChange={(e) => setEnableTax(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    العملة الأساسية للنظام *
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    {supportedCurrencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.symbol}) - {c.code}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    العملة المحددة ستطبق على كافة الفواتير، أسعار البيع، والتقارير المالية.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    لغة النظام الافتراضية
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="ar">العربية (Arabic)</option>
                    <option value="en">English (الإنجليزية)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    الرقم الضريبي للمنشأة (Tax / VAT Number)
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    placeholder="مثال: 300123456700003"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 ltr text-left focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    نسبة الضريبة الافتراضية (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      placeholder="14"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono font-bold focus:outline-none focus:border-indigo-500 focus:bg-white"
                    />
                    <span className="absolute inset-y-0 end-0 pe-3.5 flex items-center text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    المستودع / الفرع الافتراضي لنقاط البيع
                  </label>
                  <select
                    value={defaultWarehouseId}
                    onChange={(e) => setDefaultWarehouseId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="">-- اختر المستودع الافتراضي --</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.is_primary ? '(الرئيسي)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Receipt & Printing Settings */}
          {activeTab === 'receipt' && (
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">إعدادات الفواتير الحرارية والطباعة</h3>
                <span className="text-xs text-slate-500">تخصيص ترويسة وتذييل الفاتورة</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    عرض ورقة الطباعة الافتراضي
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPaperSize('80mm')}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        paperSize === '80mm'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Receipt className="h-4 w-4" />
                      <span>مقاس 80 مم (Thermal Standard)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaperSize('58mm')}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        paperSize === '58mm'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Receipt className="h-4 w-4" />
                      <span>مقاس 58 مم (Compact Thermal)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    ترويسة الفاتورة المخصصة (Receipt Header Text)
                  </label>
                  <input
                    type="text"
                    value={receiptHeader}
                    onChange={(e) => setReceiptHeader(e.target.value)}
                    placeholder="مثال: أهلاً بكم في متجرنا • سجل تجاري 123456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    تذييل الفاتورة (Receipt Footer Note)
                  </label>
                  <textarea
                    rows={2}
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    placeholder="مثال: البضاعة المباعة ترد وتستبدل خلال 14 يوماً بموجب الفاتورة."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                {/* Toggles for info visibility on printed receipts */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">بيانات الترويسة المطبوعة على الفاتورة:</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Owner Name Toggle */}
                    <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={showOwnerName}
                        onChange={(e) => setShowOwnerName(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">ظهور اسم المالك / المسؤول</span>
                        <span className="text-slate-500 text-[11px] block">{ownerName || customerName ? `(${ownerName || customerName})` : 'اسم مالك الحساب'}</span>
                      </div>
                    </label>

                    {/* Phone Number Toggle */}
                    <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={showPhone}
                        onChange={(e) => setShowPhone(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">ظهور رقم الهاتف</span>
                        <span className="text-slate-500 text-[11px] block" dir="ltr">{phone ? phone : 'رقم التواصل'}</span>
                      </div>
                    </label>

                    {/* Tax Number Toggle */}
                    <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={showTaxNumber}
                        onChange={(e) => setShowTaxNumber(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">ظهور الرقم الضريبي</span>
                        <span className="text-slate-500 text-[11px] block">{taxNumber ? `(${taxNumber})` : 'الرقم الضريبي'}</span>
                      </div>
                    </label>

                    {/* Address Toggle */}
                    <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={showAddress}
                        onChange={(e) => setShowAddress(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">ظهور عنوان المنشأة</span>
                        <span className="text-slate-500 text-[11px] block">{address ? address : 'عنوان الفرع'}</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Terminal & License Info */}
          {activeTab === 'terminal' && (
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-base text-slate-900">بيانات الترخيص والجهاز</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  effectiveLicenseStatus === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {effectiveLicenseStatus === 'active' ? 'مرخص ونشط' : effectiveLicenseStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 block">مفتاح الترخيص</span>
                  <span className="font-mono font-bold text-slate-900 text-sm ltr text-left block">
                    {license?.license_key || 'LIC-ORD-UNREGISTERED'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 block">نوع الباقة</span>
                  <span className="font-bold text-slate-900 text-sm capitalize">
                    {license?.license_type || 'Enterprise / Ultimate'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 block">تاريخ انتهاء الاشتراك</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {license?.expiry_date ? format(new Date(license.expiry_date), 'yyyy-MM-dd') : 'دائم / غير محدد'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 block">الأجهزة المفعلة</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {license?.activated_devices ?? 0} من {license?.max_devices ?? 1} أجهزة
                  </span>
                </div>

                <div className="sm:col-span-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-400 block">بصمة الجهاز الرقمية (Device Fingerprint)</span>
                  <span className="font-mono text-xs text-indigo-700 ltr text-left block select-all">
                    {fingerprint}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {operatingSystem} • {isDesktopNative ? 'تطبيق Windows مكتبي' : 'بيئة الويب / PWA'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Save Action */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>جارٍ حفظ التغييرات...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>حفظ وتطبيق الإعدادات</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Thermal Receipt Preview */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Receipt className="h-4 w-4 text-indigo-600" />
                <span>معاينة حية للفاتورة المطبوعة</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{paperSize}</span>
            </div>

            {/* Paper rendering */}
            <div className="bg-slate-100 p-4 rounded-xl flex justify-center">
              <div
                className={`bg-white rounded-lg border border-slate-300 p-4 font-mono text-center space-y-2 shadow-xs transition-all ${
                  paperSize === '80mm' ? 'w-[280px] text-xs' : 'w-[220px] text-[11px]'
                }`}
              >
                {logo ? (
                  <div className="flex justify-center mb-1">
                    <img
                      src={logo}
                      alt={businessName}
                      className="h-10 w-auto max-w-[120px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="py-1.5 border-b border-dashed border-slate-200 text-slate-400 text-[10px]">
                    [شعار المنشأة]
                  </div>
                )}

                <h4 className="font-extrabold text-slate-900 text-sm">{businessName || 'اسم المنشأة'}</h4>
                {showOwnerName && (ownerName || customerName) && (
                  <p className="text-slate-600 text-[10px] font-bold">{ownerName || customerName}</p>
                )}
                {receiptHeader && <p className="text-slate-600 text-[10px]">{receiptHeader}</p>}
                {showPhone && phone && <p className="text-slate-500 text-[10px]" dir="ltr">{phone}</p>}
                {showAddress && address && <p className="text-slate-500 text-[10px]">{address}</p>}
                {enableTax && showTaxNumber && taxNumber && (
                  <p className="text-slate-500 text-[10px]">الرقم الضريبي: {taxNumber}</p>
                )}

                <div className="border-t border-b border-dashed border-slate-300 py-1 my-1">
                  <span className="font-bold text-slate-800 text-[11px]">
                    {enableTax ? 'فاتورة ضريبية مبسطة' : 'فاتورة مبيعات'}
                  </span>
                </div>

                <div className="text-[10px] text-slate-500 space-y-0.5 text-right">
                  <div className="flex justify-between">
                    <span>رقم الفاتورة:</span>
                    <span>INV-000123</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ:</span>
                    <span>{format(new Date(), 'yyyy-MM-dd HH:mm')}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-1 text-[10px]">
                  <div className="flex justify-between font-bold">
                    <span>الإجمالي:</span>
                    <span>150.00 {currency}</span>
                  </div>
                  {enableTax ? (
                    <div className="flex justify-between text-slate-500 text-[9px]">
                      <span>شامل الضريبة ({taxRate}%):</span>
                      <span>{((150 * taxRate) / (100 + taxRate)).toFixed(2)} {currency}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-slate-500 text-[9px]">
                      <span>الضريبة:</span>
                      <span>غير خاضع للضريبة (0.00)</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 text-[9px] text-slate-500">
                  {receiptFooter || 'شكراً لزيارتكم • نسعد بخدمتكم دائماً'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
