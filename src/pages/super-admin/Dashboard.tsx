import { Users, Key, Monitor, Box, Download, AlertCircle } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';

const stats = [
  { name: 'إجمالي العملاء', value: '-', icon: Users, description: 'عملاء مسجلين' },
  { name: 'التراخيص النشطة', value: '-', icon: Key, description: 'تراخيص مفعلة' },
  { name: 'الأجهزة المتصلة', value: '-', icon: Monitor, description: 'خلال 24 ساعة' },
  { name: 'الإصدارات المتاحة', value: '-', icon: Box, description: 'نسخ جاهزة للتحميل' },
  { name: 'إجمالي التحميلات', value: '-', icon: Download, description: 'لجميع الإصدارات' },
];

export function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">لوحة التحكم</h2>
      </div>

      {!isSupabaseConfigured && (
        <div className="bg-amber-50 border-s-4 border-amber-500 p-4 rounded-md shadow-sm">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="ms-3">
              <h3 className="text-sm font-medium text-amber-800">تنبيه: قاعدة البيانات غير متصلة</h3>
              <div className="mt-2 text-sm text-amber-700">
                <p>
                  يرجى إعداد متغيرات البيئة <code>VITE_SUPABASE_URL</code> و <code>VITE_SUPABASE_ANON_KEY</code> في ملف <code>.env</code> للاتصال بقاعدة البيانات وعرض البيانات الحقيقية.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="relative overflow-hidden rounded-lg bg-white p-5 shadow-sm border border-gray-200"
            >
              <dt>
                <div className="absolute rounded-md bg-slate-900 p-3">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <p className="ms-16 truncate text-sm font-medium text-gray-500">{stat.name}</p>
              </dt>
              <dd className="ms-16 flex items-baseline pb-1 sm:pb-2">
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                <p className="ms-2 flex items-baseline text-sm font-semibold text-gray-500">
                  {stat.description}
                </p>
              </dd>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white shadow-sm border border-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-base font-semibold leading-6 text-gray-900">آخر النشاطات</h3>
          </div>
          <div className="p-6 text-center text-gray-500 text-sm">
            {isSupabaseConfigured ? 'جاري تحميل النشاطات...' : 'لا توجد بيانات لعرضها.'}
          </div>
        </div>

        <div className="rounded-lg bg-white shadow-sm border border-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-base font-semibold leading-6 text-gray-900">التراخيص المنتهية قريباً</h3>
          </div>
          <div className="p-6 text-center text-gray-500 text-sm">
            {isSupabaseConfigured ? 'جاري التحميل...' : 'لا توجد بيانات لعرضها.'}
          </div>
        </div>
      </div>
    </div>
  );
}
