import { useState, useEffect } from 'react';
import { Users, Key, Monitor, Box, Download, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { format } from 'date-fns';

export function Dashboard() {
  const [statsData, setStatsData] = useState({
    clientsCount: 0,
    activeLicensesCount: 0,
    devicesCount: 0,
    buildsCount: 0,
    downloadsCount: 0,
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [expiringLicenses, setExpiringLicenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    async function loadDashboardData() {
      try {
        setIsLoading(true);
        const [
          clientsRes,
          licensesRes,
          devicesRes,
          buildsRes,
          activitiesRes,
          expiringRes
        ] = await Promise.all([
          supabase.from('clients').select('id', { count: 'exact', head: true }),
          supabase.from('licenses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('client_devices').select('id', { count: 'exact', head: true }),
          supabase.from('releases').select('id, download_count'),
          supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(6),
          supabase.from('licenses').select('*, clients(business_name, customer_name)').eq('status', 'active').order('expires_at', { ascending: true }).limit(5),
        ]);

        const totalDownloads = buildsRes.data?.reduce((acc: number, curr: any) => acc + (curr.download_count || 0), 0) || 0;

        setStatsData({
          clientsCount: clientsRes.count || 0,
          activeLicensesCount: licensesRes.count || 0,
          devicesCount: devicesRes.count || 0,
          buildsCount: buildsRes.data?.length || 0,
          downloadsCount: totalDownloads,
        });

        if (activitiesRes.data) {
          setRecentActivities(activitiesRes.data);
        }
        if (expiringRes.data) {
          setExpiringLicenses(expiringRes.data);
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const stats = [
    { name: 'إجمالي العملاء', value: isLoading ? '...' : statsData.clientsCount, icon: Users, description: 'عملاء مسجلين' },
    { name: 'التراخيص النشطة', value: isLoading ? '...' : statsData.activeLicensesCount, icon: Key, description: 'تراخيص مفعلة' },
    { name: 'الأجهزة المسجلة', value: isLoading ? '...' : statsData.devicesCount, icon: Monitor, description: 'أجهزة نقاط البيع' },
    { name: 'الإصدارات المتاحة', value: isLoading ? '...' : statsData.buildsCount, icon: Box, description: 'نسخ جاهزة للتحميل' },
    { name: 'إجمالي التحميلات', value: isLoading ? '...' : statsData.downloadsCount, icon: Download, description: 'لجميع الإصدارات' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">لوحة التحكم الرئيسية</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">نظرة عامة على حالة المنظومة، التراخيص، والعملاء</p>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <div className="bg-amber-50 border-s-4 border-amber-500 p-4 rounded-lg shadow-xs">
          <div className="flex items-start">
            <div className="shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="ms-3">
              <h3 className="text-sm font-medium text-amber-800">تنبيه: قاعدة البيانات غير متصلة</h3>
              <div className="mt-1 text-xs text-amber-700">
                <p>
                  يرجى إعداد متغيرات البيئة <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> للاتصال بقاعدة البيانات وعرض البيانات الحقيقية.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Stats Grid: 1 col on xs, 2 on sm, 3 on md, 5 on xl */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="relative overflow-hidden rounded-xl bg-white p-4 sm:p-5 shadow-xs border border-gray-200 transition-all hover:shadow-sm"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="rounded-xl bg-slate-900 p-3 shrink-0 text-white shadow-xs">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-500">{stat.name}</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5">{stat.value}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                <span>{stat.description}</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">محدث</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activities Card */}
        <div className="rounded-xl bg-white shadow-xs border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-3.5 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <span>آخر النشاطات</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">سجل الأحداث</span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <p className="text-center py-6 text-xs sm:text-sm text-gray-400">جاري تحميل النشاطات...</p>
            ) : recentActivities.length === 0 ? (
              <div className="text-center py-8 text-xs sm:text-sm text-gray-400">
                لا توجد نشاطات مسجلة مؤخراً.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentActivities.map((act) => (
                  <div key={act.id} className="py-2.5 flex items-start justify-between gap-3 text-xs sm:text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate">{act.action || 'إجراء نظام'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{act.entity_type} {act.entity_id ? `(#${act.entity_id.slice(0, 8)})` : ''}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap shrink-0">
                      {act.created_at ? format(new Date(act.created_at), 'HH:mm dd/MM') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Expiring / Active Licenses Card */}
        <div className="rounded-xl bg-white shadow-xs border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-3.5 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <span>أحدث التراخيص النشطة</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">الحالة</span>
          </div>
          <div className="p-4">
            {isLoading ? (
              <p className="text-center py-6 text-xs sm:text-sm text-gray-400">جاري التحميل...</p>
            ) : expiringLicenses.length === 0 ? (
              <div className="text-center py-8 text-xs sm:text-sm text-gray-400">
                لا توجد تراخيص نشطة حالياً.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {expiringLicenses.map((lic) => (
                  <div key={lic.id} className="py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 truncate">
                        {lic.clients?.business_name || lic.clients?.customer_name || 'عميل'}
                      </p>
                      <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{lic.license_key}</p>
                    </div>
                    <div className="text-end shrink-0">
                      <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                        {lic.plan_type || 'نشط'}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {lic.expires_at ? format(new Date(lic.expires_at), 'yyyy-MM-dd') : 'دائم'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

