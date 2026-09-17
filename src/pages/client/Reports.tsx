import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  CreditCard, 
  Banknote, 
  Calendar, 
  Download, 
  Printer, 
  Package, 
  Wallet, 
  RefreshCw, 
  PieChart, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock 
} from 'lucide-react';
import { useClientStore } from '../../store/clientStore';
import { useCurrency } from '../../hooks/useCurrency';
import { supabase } from '../../lib/supabase';
import { erpService, EXPENSE_CATEGORIES } from '../../lib/erpService';
import toast from 'react-hot-toast';

export function ReportsPage() {
  const { client } = useClientStore();
  const { formatPrice } = useCurrency();

  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [loading, setLoading] = useState(true);

  // Aggregated stats
  const [totalSales, setTotalSales] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [cashSales, setCashSales] = useState(0);
  const [cardSales, setCardSales] = useState(0);
  const [bankSales, setBankSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [topProducts, setTopProducts] = useState<{ name: string; quantity: number; total: number }[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<Record<string, number>>({});

  useEffect(() => {
    if (client?.id) {
      loadReportData();
    }
  }, [client?.id, period]);

  const loadReportData = async () => {
    if (!client?.id) return;
    setLoading(true);
    try {
      // 1. Calculate Date filter
      let fromDate: string | null = null;
      const now = new Date();
      if (period === 'today') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        fromDate = weekAgo.toISOString();
      } else if (period === 'month') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }

      // 2. Fetch Sales
      let salesQuery = supabase
        .from('sales')
        .select('id, total_amount, payment_method, status, created_at, sale_items(product_name, quantity, total_price)')
        .eq('client_id', client.id)
        .eq('status', 'completed');

      if (fromDate) {
        salesQuery = salesQuery.gte('created_at', fromDate);
      }

      const { data: salesData, error: salesErr } = await salesQuery;

      if (!salesErr && salesData) {
        let tot = 0;
        let csh = 0;
        let crd = 0;
        let bnk = 0;
        const prodMap: Record<string, { quantity: number; total: number }> = {};

        salesData.forEach((s: any) => {
          const amt = Number(s.total_amount || 0);
          tot += amt;
          if (s.payment_method === 'cash') csh += amt;
          else if (s.payment_method === 'card') crd += amt;
          else if (s.payment_method === 'bank_transfer') bnk += amt;

          if (s.sale_items && Array.isArray(s.sale_items)) {
            s.sale_items.forEach((item: any) => {
              const name = item.product_name || 'صنف';
              const qty = Number(item.quantity || 0);
              const pr = Number(item.total_price || 0);
              if (!prodMap[name]) {
                prodMap[name] = { quantity: 0, total: 0 };
              }
              prodMap[name].quantity += qty;
              prodMap[name].total += pr;
            });
          }
        });

        setTotalSales(tot);
        setSalesCount(salesData.length);
        setCashSales(csh);
        setCardSales(crd);
        setBankSales(bnk);

        const sortedProds = Object.entries(prodMap)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5);
        setTopProducts(sortedProds);
      }

      // 3. Fetch Expenses
      const expList = await erpService.getExpenses(client.id);
      let expFiltered = expList;
      if (fromDate) {
        const fromTime = new Date(fromDate).getTime();
        expFiltered = expList.filter(
          (e) => new Date(e.expense_date || e.created_at).getTime() >= fromTime
        );
      }

      const expTot = expFiltered.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      setTotalExpenses(expTot);

      const catMap: Record<string, number> = {};
      expFiltered.forEach((e) => {
        catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount || 0);
      });
      setExpensesByCategory(catMap);
    } catch (err: any) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  };

  const estimatedCOGS = totalSales * 0.65; // Estimated 35% gross profit margin if cost not logged
  const grossProfit = totalSales - estimatedCOGS;
  const netEstimatedProfit = grossProfit - totalExpenses;
  const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 mb-2">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>التقارير التحليلية والمالية (Financial Intelligence)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            لوحة مؤشرات الأداء والتقارير المالية
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تحليل حركة المبيعات، توزيع طرق الدفع، النفقات التشغيلية، وصافي الأرباح التقديرية.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'today' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              هذا الشهر
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              الكل
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            title="طباعة التقرير"
          >
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">إجمالي المبيعات</span>
            <div className="h-8 w-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatPrice(totalSales)}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-mono">
            <span>{salesCount} فاتورة مكتملة</span>
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">المصروفات التشغيلية</span>
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600">
            {formatPrice(totalExpenses)}
          </div>
          <div className="text-xs text-slate-400 mt-1">رواتب، إيجار، ونثريات</div>
        </div>

        {/* Average Ticket */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold">متوسط قيمة الفاتورة</span>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-700">
            {formatPrice(avgTicket)}
          </div>
          <div className="text-xs text-slate-400 mt-1">معدل إنفاق العميل للعملية</div>
        </div>

        {/* Net Profit */}
        <div className="bg-emerald-500/10 p-5 rounded-2xl border-2 border-emerald-500/30 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-xs font-black">صافي الربح التقديري</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {formatPrice(netEstimatedProfit)}
          </div>
          <div className="text-xs text-emerald-800 mt-1 font-bold">بعد خصم التكلفة والمصروفات</div>
        </div>
      </div>

      {/* Grid: Payment Breakdown & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-900">طرق الدفع والتحصيل</h2>
            <span className="text-xs text-slate-400 font-bold">توزيع الإيراد</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Banknote className="h-4 w-4 text-emerald-600" />
                  <span>نقدي (كاش)</span>
                </div>
                <span className="font-mono">{formatPrice(cashSales)} ({totalSales > 0 ? Math.round((cashSales / totalSales) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{ width: `${totalSales > 0 ? (cashSales / totalSales) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <CreditCard className="h-4 w-4 text-purple-600" />
                  <span>بطاقة مدى / شبكة</span>
                </div>
                <span className="font-mono">{formatPrice(cardSales)} ({totalSales > 0 ? Math.round((cardSales / totalSales) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-500 h-2 rounded-full"
                  style={{ width: `${totalSales > 0 ? (cardSales / totalSales) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span>تحويل بنكي</span>
                </div>
                <span className="font-mono">{formatPrice(bankSales)} ({totalSales > 0 ? Math.round((bankSales / totalSales) * 100) : 0}%)</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${totalSales > 0 ? (bankSales / totalSales) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-900">الأصناف الأكثر مبيعاً</h2>
            <span className="text-xs text-slate-400 font-bold">حسب الإيراد المحقق</span>
          </div>

          {topProducts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">لا توجد مبيعات تفصيلية مسجلة لهذه الفترة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-violet-100 text-violet-700 font-black text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{p.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">الكمية المباعة: {p.quantity}</div>
                    </div>
                  </div>
                  <div className="text-xs font-black text-slate-800 font-mono">
                    {formatPrice(p.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expenses Breakdown */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-black text-slate-900">توزيع المصروفات التشغيلية حسب التصنيف</h2>
          <span className="text-xs text-slate-400 font-bold">تحليل التكاليف</span>
        </div>

        {Object.keys(expensesByCategory).length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            لا توجد مصروفات مسجلة في هذه الفترة
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(expensesByCategory).map(([catKey, rawAmount]) => {
              const amount = Number(rawAmount);
              const catInfo = EXPENSE_CATEGORIES[catKey] || { label: catKey, color: 'bg-slate-100 text-slate-700' };
              return (
                <div key={catKey} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="text-xs font-bold text-slate-600 mb-1">{catInfo.label}</div>
                  <div className="text-base font-black text-rose-600 font-mono">
                    {formatPrice(amount)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                    {totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0}% من المصروفات
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
