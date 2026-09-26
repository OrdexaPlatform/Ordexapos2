import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLogger';
import { License, LicenseType, LicenseStatus } from '../../types';
import { LicenseFormModal } from './LicenseFormModal';
import { 
  getLicenseStatusBadge, 
  getLicenseTypeLabel, 
  getEffectiveLicenseStatus 
} from '../../lib/licenseUtils';
import { 
  Plus, 
  Search, 
  Loader2, 
  Key, 
  ExternalLink, 
  Eye, 
  Filter, 
  Ban, 
  CheckCircle2, 
  ShieldAlert,
  Building2,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function Licenses() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchLicenses = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('licenses')
        .select(`
          *,
          client:clients (
            id,
            client_code,
            customer_name,
            business_name,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('license_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let list = (data as License[]) || [];

      // Filter by status on effective status if needed
      if (statusFilter !== 'all') {
        list = list.filter((item) => {
          const effective = getEffectiveLicenseStatus(item.status, item.expiry_date);
          return effective === statusFilter;
        });
      }

      // Filter by search text
      if (search.trim()) {
        const queryTerm = search.toLowerCase().trim();
        list = list.filter((item) => {
          const keyMatch = item.license_key?.toLowerCase().includes(queryTerm);
          const customerMatch = item.client?.customer_name?.toLowerCase().includes(queryTerm);
          const businessMatch = item.client?.business_name?.toLowerCase().includes(queryTerm);
          const codeMatch = item.client?.client_code?.toLowerCase().includes(queryTerm);
          return keyMatch || customerMatch || businessMatch || codeMatch;
        });
      }

      setLicenses(list);
    } catch (err: any) {
      console.error('Error loading licenses:', err);
      toast.error('فشل في تحميل بيانات التراخيص');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, [search, statusFilter, typeFilter]);

  const handleQuickStatusChange = async (license: License, newStatus: LicenseStatus) => {
    const labels = {
      active: 'تفعيل',
      suspended: 'إيقاف',
      revoked: 'إلغاء نهائي',
      expired: 'انتهاء',
    };

    const toastId = toast.loading(`جارٍ ${labels[newStatus] || newStatus} الترخيص...`);

    try {
      const { error } = await supabase
        .from('licenses')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', license.id);

      if (error) throw error;

      await logActivity({
        action: `${newStatus}_license`,
        entityType: 'license',
        entityId: license.id,
        metadata: {
          license_key: license.license_key,
          previous_status: license.status,
          new_status: newStatus,
        },
      });

      toast.success('تم تحديث حالة الترخيص بنجاح', { id: toastId });
      fetchLicenses();
    } catch (err: any) {
      console.error('Error changing status:', err);
      toast.error(err.message || 'فشل في تحديث حالة الترخيص', { id: toastId });
    }
  };

  return (
    <div className="space-y-6 text-right">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">إدارة التراخيص (Licenses)</h2>
          <p className="text-sm text-slate-500 mt-1">
            إصدار ومتابعة تراخيص العملاء وصلاحيات نقاط البيع
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>إصدار ترخيص جديد</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بمفتاح الترخيص، اسم العميل، المنشأة، أو الكود..."
              className="block w-full rounded-md border-0 py-2 pr-9 pl-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            >
              <option value="all">جميع الحالات</option>
              <option value="active">نشط (Active)</option>
              <option value="suspended">موقوف (Suspended)</option>
              <option value="expired">منتهي (Expired)</option>
              <option value="revoked">ملغي نهائياً (Revoked)</option>
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="block w-full rounded-md border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
            >
              <option value="all">جميع الأنواع</option>
              <option value="trial">تجريبي (Trial)</option>
              <option value="monthly">شهري (Monthly)</option>
              <option value="quarterly">ربع سنوي (Quarterly)</option>
              <option value="semi_annual">نصف سنوي (Semi-Annual)</option>
              <option value="annual">سنوي (Annual)</option>
              <option value="lifetime">مدى الحياة (Lifetime)</option>
              <option value="custom">مخصص (Custom)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Licenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-right">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">مفتاح الترخيص</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">العميل / المنشأة</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">نوع الترخيص</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">الأجهزة المفعلة</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">تاريخ البداية</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">تاريخ الانتهاء</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900">الحالة</th>
                <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-slate-900 text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-900 mx-auto" />
                    <span className="text-xs text-slate-500 mt-2 block">جاري تحميل التراخيص...</span>
                  </td>
                </tr>
              ) : licenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Key className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">لا توجد تراخيص مطابقة للبحث أو الفلتر.</p>
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>إصدار ترخيص جديد الآن</span>
                    </button>
                  </td>
                </tr>
              ) : (
                licenses.map((lic) => {
                  const effectiveStatus = getEffectiveLicenseStatus(lic.status, lic.expiry_date);
                  const badge = getLicenseStatusBadge(lic.status, lic.expiry_date);

                  return (
                    <tr key={lic.id} className="hover:bg-slate-50 transition-colors">
                      {/* License Key */}
                      <td className="whitespace-nowrap px-6 py-4">
                        <Link
                          to={`/super-admin/licenses/${lic.id}`}
                          className="font-mono text-sm font-semibold text-slate-900 hover:underline tracking-wide flex items-center gap-1"
                          dir="ltr"
                        >
                          <span>{lic.license_key}</span>
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                        </Link>
                      </td>

                      {/* Client info */}
                      <td className="whitespace-nowrap px-6 py-4">
                        {lic.client ? (
                          <div>
                            <Link
                              to={`/super-admin/clients/${lic.client.id}`}
                              className="text-sm font-medium text-slate-900 hover:underline flex items-center gap-1"
                            >
                              <span>{lic.client.business_name}</span>
                              <span className="text-xs text-slate-400 font-mono">({lic.client.client_code})</span>
                            </Link>
                            <div className="text-xs text-slate-500">{lic.client.customer_name}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">غير مرتبط</span>
                        )}
                      </td>

                      {/* License Type */}
                      <td className="whitespace-nowrap px-6 py-4 text-xs font-medium text-slate-700">
                        {getLicenseTypeLabel(lic.license_type)}
                      </td>

                      {/* Devices */}
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-700">
                        <span className="font-bold text-slate-900">{lic.activated_devices}</span> / {lic.max_devices}
                      </td>

                      {/* Start Date */}
                      <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
                        {format(new Date(lic.start_date), 'yyyy-MM-dd')}
                      </td>

                      {/* Expiry Date */}
                      <td className="whitespace-nowrap px-6 py-4 text-xs font-mono">
                        <span className={effectiveStatus === 'expired' ? 'text-rose-600 font-semibold' : 'text-slate-700'}>
                          {format(new Date(lic.expiry_date), 'yyyy-MM-dd')}
                        </span>
                      </td>

                      {/* Status badge */}
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-6 py-4 text-left text-xs font-medium">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            to={`/super-admin/licenses/${lic.id}`}
                            className="text-slate-700 hover:text-slate-900 flex items-center gap-1"
                            title="تفاصيل الترخيص"
                          >
                            <Eye className="h-4 w-4" />
                            <span>عرض</span>
                          </Link>

                          {effectiveStatus === 'active' ? (
                            <button
                              onClick={() => handleQuickStatusChange(lic, 'suspended')}
                              className="text-amber-600 hover:text-amber-800"
                              title="إيقاف الترخيص"
                            >
                              إيقاف
                            </button>
                          ) : effectiveStatus !== 'revoked' ? (
                            <button
                              onClick={() => handleQuickStatusChange(lic, 'active')}
                              className="text-emerald-600 hover:text-emerald-800"
                              title="تفعيل الترخيص"
                            >
                              تفعيل
                            </button>
                          ) : null}
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

      {/* Create License Modal */}
      <LicenseFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          fetchLicenses();
        }}
      />
    </div>
  );
}
