import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Filter, 
  Calendar, 
  Printer, 
  Eye, 
  Ban, 
  Download, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  X,
  CreditCard,
  Banknote,
  DollarSign
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { 
  fetchSales, 
  fetchSaleDetails, 
  voidSale, 
  formatCurrency, 
  FetchSalesFilter 
} from '../../lib/salesService';
import { Sale, SaleStatus, PaymentStatus } from '../../types';
import { PermissionGuard } from '../../components/client/PermissionGuard';
import { InvoiceReceiptModal } from '../../components/client/InvoiceReceiptModal';
import toast from 'react-hot-toast';

export const SalesPage: React.FC = () => {
  const { clientUser } = useAuthStore();
  const { client } = useClientStore();
  const clientId = clientUser?.client_id;

  const [sales, setSales] = useState<Sale[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [stats, setStats] = useState({
    totalSalesAmount: 0,
    todaySalesAmount: 0,
    completedCount: 0,
    voidedCount: 0
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [saleStatus, setSaleStatus] = useState<SaleStatus | 'all'>('all');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Selected Sale for Details Modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);

  // Print Receipt Modal
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Void Sale Modal
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoidModalOpen, setIsVoidModalOpen] = useState<boolean>(false);
  const [isVoiding, setIsVoiding] = useState<boolean>(false);

  const loadSales = async () => {
    if (!clientId) return;
    setIsLoading(true);
    setErrorMessage(null);

    let resolvedStartDate = startDate;
    let resolvedEndDate = endDate;

    if (dateFilter === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10);
      resolvedStartDate = todayStr;
      resolvedEndDate = todayStr;
    } else if (dateFilter === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      resolvedStartDate = d.toISOString().slice(0, 10);
      resolvedEndDate = new Date().toISOString().slice(0, 10);
    } else if (dateFilter === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      resolvedStartDate = d.toISOString().slice(0, 10);
      resolvedEndDate = new Date().toISOString().slice(0, 10);
    }

    try {
      const filters: FetchSalesFilter = {
        search,
        saleStatus,
        paymentStatus,
        startDate: resolvedStartDate || undefined,
        endDate: resolvedEndDate || undefined,
        page,
        pageSize
      };

      const result = await fetchSales(clientId, filters);
      setSales(result.sales);
      setTotalCount(result.totalCount);
      setStats(result.stats);
    } catch (err: any) {
      console.error('Error fetching sales:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء تحميل سجل المبيعات');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, [clientId, page, saleStatus, paymentStatus, dateFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadSales();
  };

  const handleOpenDetails = async (sale: Sale) => {
    if (!clientId) return;
    // Fetch full details with joined items
    const fullSale = await fetchSaleDetails(sale.id, clientId);
    setSelectedSale(fullSale || sale);
    setIsDetailsOpen(true);
  };

  const handleOpenPrint = async (sale: Sale) => {
    if (!clientId) return;
    const fullSale = await fetchSaleDetails(sale.id, clientId);
    setPrintSale(fullSale || sale);
    setIsPrintModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!clientId || !voidingSale) return;

    try {
      setIsVoiding(true);
      await voidSale(clientId, voidingSale.id, voidReason, clientUser?.id);
      toast.success('تم إلغاء الفاتورة بنجاح وإرجاع الأصناف للمخزون');
      setIsVoidModalOpen(false);
      setVoidingSale(null);
      setVoidReason('');
      if (isDetailsOpen) setIsDetailsOpen(false);
      loadSales();
    } catch (err: any) {
      toast.error('خطأ أثناء إلغاء الفاتورة: ' + (err.message || 'حدث خطأ'));
    } finally {
      setIsVoiding(false);
    }
  };

  const handleExportCSV = () => {
    if (sales.length === 0) return;

    const headers = ['رقم الفاتورة', 'التاريخ', 'الكاشير', 'المستودع', 'المجموع', 'الخصم', 'الضريبة', 'الإجمالي', 'المدفوع', 'حالة الدفع', 'حالة الفاتورة'];
    const rows = sales.map(s => [
      s.invoice_number,
      new Date(s.sale_date).toLocaleString('ar-SA'),
      s.cashier?.full_name || '',
      s.warehouse?.name || '',
      s.subtotal,
      s.discount_amount,
      s.tax_amount,
      s.total_amount,
      s.paid_amount,
      s.payment_status === 'paid' ? 'مدفوعة' : 'دفعة جزئية',
      s.sale_status === 'completed' ? 'مكتملة' : s.sale_status === 'voided' ? 'ملغاة' : s.sale_status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">سجل المبيعات والفواتير</h1>
          <p className="text-xs text-slate-500 mt-1">
            إدارة كافة فواتير المبيعات الصادرة، مراجعة العمليات، إعادة الطباعة، وإلغاء الفواتير.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PermissionGuard permission="sales.export">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>تصدير CSV</span>
            </button>
          </PermissionGuard>

          <button
            onClick={loadSales}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي المبيعات</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-lg font-extrabold text-slate-900 font-mono">
            {formatCurrency(stats.totalSalesAmount)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.completedCount} فاتورة مكتملة
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">مبيعات اليوم</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-lg font-extrabold text-emerald-700 font-mono">
            {formatCurrency(stats.todaySalesAmount)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            خلال اليوم الحالي
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">الفواتير المكتملة</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-lg font-extrabold text-slate-900 font-mono">
            {stats.completedCount}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">
            فواتير ناجحة وسارية
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">الفواتير الملغاة</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Ban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-lg font-extrabold text-rose-700 font-mono">
            {stats.voidedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            تم إلغاؤها واسترجاع المخزون
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم الفاتورة (INV-...)..."
              className="w-full pr-10 pl-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900"
            />
          </form>

          {/* Quick Date Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded-lg transition-colors font-semibold ${dateFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 rounded-lg transition-colors font-semibold ${dateFilter === 'today' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              اليوم
            </button>
            <button
              onClick={() => setDateFilter('week')}
              className={`px-3 py-1 rounded-lg transition-colors font-semibold ${dateFilter === 'week' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-3 py-1 rounded-lg transition-colors font-semibold ${dateFilter === 'month' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              آخر شهر
            </button>
          </div>

          {/* Status Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={saleStatus}
              onChange={(e) => {
                setSaleStatus(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden text-slate-700"
            >
              <option value="all">كل الحالات</option>
              <option value="completed">مكتملة</option>
              <option value="voided">ملغاة (Voided)</option>
            </select>

            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden text-slate-700"
            >
              <option value="all">كل حالات الدفع</option>
              <option value="paid">مدفوعة بالكامل</option>
              <option value="partial">دفعة جزئية</option>
            </select>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold">
                <th className="py-3 px-4">رقم الفاتورة</th>
                <th className="py-3 px-4">التاريخ والوقت</th>
                <th className="py-3 px-4">الكاشير</th>
                <th className="py-3 px-4">المستودع / الفرع</th>
                <th className="py-3 px-4 text-center">الأصناف</th>
                <th className="py-3 px-4 text-left">المبلغ الإجمالي</th>
                <th className="py-3 px-4 text-center">حالة السداد</th>
                <th className="py-3 px-4 text-center">حالة الفاتورة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>جاري تحميل سجل الفواتير...</span>
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 stroke-1 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">لا توجد فواتير مبيعات مسجلة</p>
                    <p className="text-[11px] mt-1">ابدأ بإجراء عمليات بيع من شاشة نقطة البيع POS</p>
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Invoice Number */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {s.invoice_number}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {new Date(s.sale_date).toLocaleString('ar-SA')}
                    </td>

                    {/* Cashier */}
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {s.cashier?.name || (s.cashier as any)?.full_name || 'كاشير عام'}
                    </td>

                    {/* Warehouse */}
                    <td className="py-3 px-4 text-slate-600">
                      {s.warehouse?.name || '-'}
                    </td>

                    {/* Items Count */}
                    <td className="py-3 px-4 text-center font-mono font-semibold">
                      {s.items?.length || '-'}
                    </td>

                    {/* Total Amount */}
                    <td className="py-3 px-4 text-left font-mono font-extrabold text-slate-900">
                      {formatCurrency(s.total_amount)}
                    </td>

                    {/* Payment Status */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        s.payment_status === 'paid' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {s.payment_status === 'paid' ? 'مدفوعة' : 'جزئية'}
                      </span>
                    </td>

                    {/* Sale Status */}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        s.sale_status === 'completed' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : s.sale_status === 'voided'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {s.sale_status === 'completed' ? 'مكتملة' : s.sale_status === 'voided' ? 'ملغاة' : s.sale_status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        
                        {/* View Details */}
                        <button
                          onClick={() => handleOpenDetails(s)}
                          title="عرض التفاصيل"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Print Receipt */}
                        <PermissionGuard permission="sales.print">
                          <button
                            onClick={() => handleOpenPrint(s)}
                            title="طباعة الفاتورة"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </PermissionGuard>

                        {/* Void Sale */}
                        {s.sale_status === 'completed' && (
                          <PermissionGuard permission="sales.void">
                            <button
                              onClick={() => {
                                setVoidingSale(s);
                                setVoidReason('');
                                setIsVoidModalOpen(true);
                              }}
                              title="إلغاء الفاتورة وإرجاع المخزون"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </PermissionGuard>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs">
            <span className="text-slate-500">
              عرض {(page - 1) * pageSize + 1} إلى {Math.min(page * pageSize, totalCount)} من أصل {totalCount} فاتورة
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 text-slate-600 disabled:opacity-30 hover:bg-white rounded border border-slate-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="px-3 font-mono font-semibold text-slate-800">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 text-slate-600 disabled:opacity-30 hover:bg-white rounded border border-slate-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sale Details Modal */}
      {isDetailsOpen && selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold">تفاصيل الفاتورة: {selectedSale.invoice_number}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {new Date(selectedSale.sale_date).toLocaleString('ar-SA')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5 text-xs">
              
              {/* Top Meta Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">الكاشير المسؤول</span>
                  <span className="font-bold text-slate-900">{selectedSale.cashier?.name || (selectedSale.cashier as any)?.full_name || 'عام'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">المستودع / الفرع</span>
                  <span className="font-bold text-slate-900">{selectedSale.warehouse?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">حالة الفاتورة</span>
                  <span className={`inline-block font-bold ${selectedSale.sale_status === 'voided' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {selectedSale.sale_status === 'completed' ? 'مكتملة' : selectedSale.sale_status === 'voided' ? 'ملغاة' : selectedSale.sale_status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">طريقة الدفع</span>
                  <span className="font-bold text-slate-900">
                    {selectedSale.payments?.map(p => p.payment_method).join(', ') || 'نقداً'}
                  </span>
                </div>
              </div>

              {/* Items Snapshot Table */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">أصناف الفاتورة (لقطة وقت البيع)</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold">
                        <th className="py-2.5 px-3">الصنف</th>
                        <th className="py-2.5 px-3 text-center">الكمية</th>
                        <th className="py-2.5 px-3 text-center">سعر الوحدة</th>
                        <th className="py-2.5 px-3 text-center">الخصم</th>
                        <th className="py-2.5 px-3 text-center">الضريبة</th>
                        <th className="py-2.5 px-3 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 text-[11px]">
                      {selectedSale.items?.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">{item.product_name_snapshot}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.sku_snapshot}</div>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold">{item.quantity}</td>
                          <td className="py-2 px-3 text-center font-mono">{formatCurrency(item.unit_price, '')}</td>
                          <td className="py-2 px-3 text-center font-mono text-rose-600">
                            {item.discount_amount > 0 ? `-${formatCurrency(item.discount_amount, '')}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-center font-mono">{formatCurrency(item.tax_amount, '')}</td>
                          <td className="py-2 px-3 text-left font-mono font-extrabold text-slate-900">
                            {formatCurrency(item.line_total, '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 max-w-sm mr-auto">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono">{formatCurrency(selectedSale.subtotal)}</span>
                </div>
                {selectedSale.discount_amount > 0 && (
                  <div className="flex justify-between text-rose-600 font-medium">
                    <span>إجمالي الخصم:</span>
                    <span className="font-mono">- {formatCurrency(selectedSale.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة:</span>
                  <span className="font-mono">{formatCurrency(selectedSale.tax_amount)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold text-sm text-slate-900">
                  <span>المجموع الكلي:</span>
                  <span className="font-mono text-indigo-700">{formatCurrency(selectedSale.total_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-700 pt-1 text-[11px]">
                  <span>المبلغ المدفوع:</span>
                  <span className="font-mono font-bold text-emerald-700">{formatCurrency(selectedSale.paid_amount)}</span>
                </div>
                {selectedSale.change_amount > 0 && (
                  <div className="flex justify-between text-slate-700 text-[11px]">
                    <span>المتبقي للعميل (فكة):</span>
                    <span className="font-mono font-bold text-amber-700">{formatCurrency(selectedSale.change_amount)}</span>
                  </div>
                )}
              </div>

              {selectedSale.notes && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900">
                  <span className="font-bold block mb-1">ملاحظات الفاتورة:</span>
                  <p className="whitespace-pre-wrap">{selectedSale.notes}</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <PermissionGuard permission="sales.print">
                  <button
                    onClick={() => {
                      setIsDetailsOpen(false);
                      handleOpenPrint(selectedSale);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-2xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الفاتورة</span>
                  </button>
                </PermissionGuard>

                {selectedSale.sale_status === 'completed' && (
                  <PermissionGuard permission="sales.void">
                    <button
                      onClick={() => {
                        setVoidingSale(selectedSale);
                        setVoidReason('');
                        setIsVoidModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors"
                    >
                      <Ban className="w-4 h-4" />
                      <span>إلغاء الفاتورة</span>
                    </button>
                  </PermissionGuard>
                )}
              </div>

              <button
                onClick={() => setIsDetailsOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {isVoidModalOpen && voidingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">إلغاء فاتورة مبيعات</h3>
                <p className="text-xs text-slate-500">فاتورة رقم: {voidingSale.invoice_number}</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-bold">⚠️ تنبيه هام:</p>
              <p>إلغاء الفاتورة سيقوم بإرجاع كافة الأصناف المباعة إلى المخزون تلقائياً وتسجيل حركة عكسية في دفتر الأستاذ، ولا يمكن التراجع عن هذا الإجراء.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                سبب الإلغاء (إلزامي للتوثيق)
              </label>
              <textarea
                rows={2}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="مثال: خطأ في إدخال الأصناف، إلغاء بناء على طلب العميل..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsVoidModalOpen(false)}
                disabled={isVoiding}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={isVoiding || !voidReason.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition-all shadow-xs"
              >
                {isVoiding ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الإلغاء وإرجاع المخزون...</span>
                  </>
                ) : (
                  <span>تأكيد الإلغاء</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Receipt Modal for Printing */}
      <InvoiceReceiptModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        sale={printSale}
        client={client}
      />

    </div>
  );
};
