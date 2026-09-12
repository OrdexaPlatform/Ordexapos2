import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, 
  Store, 
  Lock, 
  DollarSign, 
  Clock, 
  Calendar, 
  Filter, 
  Search, 
  ArrowUpDown, 
  Receipt, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  FileText, 
  Building2, 
  CreditCard,
  Plus
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useShiftStore } from '../../store/shiftStore';
import { shiftService } from '../../lib/shiftService';
import { warehouseService } from '../../lib/warehouseService';
import { Shift, Warehouse } from '../../types';
import { OpenShiftModal } from '../../components/client/shifts/OpenShiftModal';
import { CloseShiftModal } from '../../components/client/shifts/CloseShiftModal';
import { CashMovementModal } from '../../components/client/shifts/CashMovementModal';
import { ShiftZReportModal } from '../../components/client/shifts/ShiftZReportModal';
import toast from 'react-hot-toast';

export const ShiftsPage: React.FC = () => {
  const { clientUser } = useAuthStore();
  const { activeShift, loadActiveShift } = useShiftStore();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isOpenModalOpen, setIsOpenModalOpen] = useState<boolean>(false);
  const [selectedShiftForClose, setSelectedShiftForClose] = useState<Shift | null>(null);
  const [selectedShiftForMovement, setSelectedShiftForMovement] = useState<Shift | null>(null);
  const [selectedShiftForReport, setSelectedShiftForReport] = useState<Shift | null>(null);

  const clientId = clientUser?.client_id;

  const loadData = async () => {
    if (!clientId) return;
    setIsLoading(true);
    try {
      const [shiftsData, whData] = await Promise.all([
        shiftService.fetchShifts(clientId, {
          status: statusFilter,
          warehouseId: warehouseFilter !== 'all' ? warehouseFilter : undefined,
          limit: 100,
        }),
        warehouseService.fetchWarehouses(clientId),
      ]);

      setShifts(shiftsData);
      setWarehouses(whData);
      await loadActiveShift(clientId);
    } catch (err: any) {
      console.error('Error fetching shifts data:', err);
      toast.error('حدث خطأ أثناء تحميل سجل الورديات');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clientId, statusFilter, warehouseFilter]);

  // Filtered shifts in table
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      const matchesSearch = 
        !searchQuery.trim() ||
        s.shift_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.cashier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.warehouse_name?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [shifts, searchQuery]);

  // High-level statistics
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayShifts = shifts.filter((s) => s.opened_at?.startsWith(today));
    
    const todaySales = todayShifts.reduce((acc, s) => acc + (s.total_sales_amount || 0), 0);
    const todayCashSales = todayShifts.reduce((acc, s) => acc + (s.total_cash_sales || 0), 0);
    const openShiftsCount = shifts.filter((s) => s.status === 'open').length;
    const totalDifferences = shifts.reduce((acc, s) => acc + (s.cash_difference || 0), 0);

    return {
      todaySales,
      todayCashSales,
      openShiftsCount,
      totalDifferences,
    };
  }, [shifts]);

  return (
    <div id="shifts-management-page" className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-slate-900 text-white shadow-sm">
              <History className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                إدارة الورديات وجلسات الصندوق
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                متابعة حركة الدرج النقدي، استلام وتسليم العهد، وتوثيق تقارير Z-Report اليومية
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            title="تحديث البيانات"
            className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {activeShift ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedShiftForMovement(activeShift)}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <ArrowUpDown className="w-4 h-4 text-slate-600" />
                <span>سحب / إيداع نقدي</span>
              </button>

              <button
                id="btn-close-active-shift-header"
                type="button"
                onClick={() => setSelectedShiftForClose(activeShift)}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <Lock className="w-4 h-4" />
                <span>إغلاق الوردية الحالية</span>
              </button>
            </div>
          ) : (
            <button
              id="btn-open-new-shift-page"
              type="button"
              onClick={() => setIsOpenModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>فتح وردية جديدة (Open Shift)</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Shift Card */}
        <div className={`p-5 rounded-2xl border transition-all ${
          activeShift 
            ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white border-emerald-200 shadow-sm' 
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">الوردية الحالية النشطة</span>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
              activeShift 
                ? 'bg-emerald-100 text-emerald-800 animate-pulse' 
                : 'bg-slate-100 text-slate-500'
            }`}>
              {activeShift ? 'مفتوحة الآن' : 'لا توجد'}
            </span>
          </div>
          {activeShift ? (
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-mono font-black text-emerald-900">{activeShift.shift_number}</span>
                <span className="text-xs text-slate-500 font-sans">• {activeShift.cashier_name}</span>
              </div>
              <div className="mt-2 text-xs text-slate-600 flex items-center justify-between">
                <span>المتوقع بالدرج:</span>
                <span className="font-mono font-bold text-slate-900">
                  {(activeShift.closing_cash_expected || activeShift.opening_cash).toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-1">
              لا توجد وردية بيع مفتوحة للكاشير الحالي.
            </div>
          )}
        </div>

        {/* Today's Total Sales */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">مبيعات ورديات اليوم</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-black text-slate-900">
            {stats.todaySales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            <span className="text-xs font-bold text-slate-400 mr-1.5 font-sans">ر.س</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            منها نقدي: {stats.todayCashSales.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س
          </p>
        </div>

        {/* Open Shifts Count */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">الصناديق المفتوحة حالياً</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-black text-slate-900">
            {stats.openShiftsCount}
            <span className="text-xs font-bold text-slate-400 mr-1.5 font-sans">صندوق / وردية</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">تستقبل عمليات البيع الآن</p>
        </div>

        {/* Cash Discrepancies */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">صافي فروقات الصناديق</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              stats.totalDifferences === 0 
                ? 'bg-emerald-50 text-emerald-600' 
                : stats.totalDifferences < 0 
                ? 'bg-rose-50 text-rose-600' 
                : 'bg-blue-50 text-blue-600'
            }`}>
              {stats.totalDifferences === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
          </div>
          <div className={`text-xl font-mono font-black ${
            stats.totalDifferences === 0 
              ? 'text-emerald-600' 
              : stats.totalDifferences < 0 
              ? 'text-rose-600' 
              : 'text-blue-600'
          }`}>
            {stats.totalDifferences > 0 ? `+${stats.totalDifferences.toFixed(2)}` : stats.totalDifferences.toFixed(2)}
            <span className="text-xs font-bold text-slate-400 mr-1.5 font-sans">ر.س</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats.totalDifferences === 0 ? 'مطابقة تامة لكافة الورديات' : stats.totalDifferences < 0 ? 'إجمالي عجز مسجل' : 'إجمالي فائض مسجل'}
          </p>
        </div>
      </div>

      {/* Shifts History Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Filter Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الوردية، اسم الكاشير، الفرع..."
                className="w-full h-10 pr-9 pl-3 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-slate-800"
              />
            </div>

            {/* Warehouse Filter */}
            <div className="relative">
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-800"
              >
                <option value="all">جميع الفروع</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-800"
              >
                <option value="all">جميع الحالات</option>
                <option value="open">ورديات مفتوحة</option>
                <option value="closed">ورديات مغلقة ومطابقة</option>
              </select>
            </div>
          </div>

          <span className="text-xs text-slate-500 font-semibold">
            إجمالي السجلات: {filteredShifts.length}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/70 text-slate-600 font-bold">
              <tr>
                <th className="py-3 px-4">رقم الوردية</th>
                <th className="py-3 px-4">الفرع والصندوق</th>
                <th className="py-3 px-4">الكاشير</th>
                <th className="py-3 px-4">وقت الفتح</th>
                <th className="py-3 px-4">وقت الإغلاق</th>
                <th className="py-3 px-4 font-mono">العهدة الافتتاحية</th>
                <th className="py-3 px-4 font-mono">مبيعات الوردية</th>
                <th className="py-3 px-4 font-mono">المتوقع بالدرج</th>
                <th className="py-3 px-4 font-mono">الفعلي بالدرج</th>
                <th className="py-3 px-4 font-mono">الفارق</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto mb-2" />
                    <span>جاري تحميل سجل الورديات...</span>
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <Store className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <span>لا توجد ورديات مسجلة مطابقة لمعايير البحث.</span>
                  </td>
                </tr>
              ) : (
                filteredShifts.map((s) => {
                  const isClosed = s.status === 'closed' || s.status === 'audited';
                  const diff = s.cash_difference ?? ((s.closing_cash_actual || 0) - (s.closing_cash_expected || 0));

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Shift Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {s.shift_number}
                      </td>

                      {/* Warehouse & Register */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{s.warehouse_name || 'الفرع'}</div>
                        <div className="text-[11px] text-slate-400">{s.register_name || 'الصندوق'}</div>
                      </td>

                      {/* Cashier */}
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {s.cashier_name || 'الكاشير'}
                      </td>

                      {/* Opened At */}
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]" dir="ltr">
                        {new Date(s.opened_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>

                      {/* Closed At */}
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]" dir="ltr">
                        {s.closed_at 
                          ? new Date(s.closed_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
                          : <span className="text-emerald-600 font-bold font-sans">قيد العمل</span>}
                      </td>

                      {/* Opening Cash */}
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {s.opening_cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Total Sales */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {s.total_sales_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Expected Cash */}
                      <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold">
                        {(s.closing_cash_expected || s.opening_cash).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Actual Cash */}
                      <td className="py-3.5 px-4 font-mono font-semibold">
                        {s.closing_cash_actual !== null && s.closing_cash_actual !== undefined
                          ? s.closing_cash_actual.toLocaleString('en-US', { minimumFractionDigits: 2 })
                          : <span className="text-slate-400 font-sans text-[11px]">—</span>}
                      </td>

                      {/* Difference */}
                      <td className="py-3.5 px-4 font-mono">
                        {isClosed ? (
                          <span className={`font-bold px-2 py-0.5 rounded ${
                            diff === 0 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : diff < 0 
                              ? 'bg-rose-50 text-rose-700' 
                              : 'bg-blue-50 text-blue-700'
                          }`}>
                            {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-sans text-[11px]">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          s.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Z-Report / Details */}
                          <button
                            type="button"
                            onClick={() => setSelectedShiftForReport(s)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="عرض وطباعة التقرير"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Quick movement if open */}
                          {s.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => setSelectedShiftForMovement(s)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                              title="سحب أو إيداع نقدية"
                            >
                              <ArrowUpDown className="w-4 h-4" />
                            </button>
                          )}

                          {/* Close shift button if open */}
                          {s.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => setSelectedShiftForClose(s)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                              title="إغلاق الوردية وتسوية الصندوق"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          )}
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

      {/* Modals */}
      <OpenShiftModal
        isOpen={isOpenModalOpen}
        onClose={() => {
          setIsOpenModalOpen(false);
          loadData();
        }}
      />

      {selectedShiftForClose && (
        <CloseShiftModal
          isOpen={Boolean(selectedShiftForClose)}
          onClose={() => {
            setSelectedShiftForClose(null);
            loadData();
          }}
          shift={selectedShiftForClose}
          onShiftClosed={(res) => {
            loadData();
            setSelectedShiftForReport(selectedShiftForClose);
          }}
        />
      )}

      {selectedShiftForMovement && (
        <CashMovementModal
          isOpen={Boolean(selectedShiftForMovement)}
          onClose={() => {
            setSelectedShiftForMovement(null);
            loadData();
          }}
          shift={selectedShiftForMovement}
        />
      )}

      {selectedShiftForReport && (
        <ShiftZReportModal
          isOpen={Boolean(selectedShiftForReport)}
          onClose={() => setSelectedShiftForReport(null)}
          shift={selectedShiftForReport}
        />
      )}
    </div>
  );
};
