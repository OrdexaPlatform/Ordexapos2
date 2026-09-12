import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Layers,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Building2,
  Calendar,
  Eye,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  FileCode,
  Archive,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Build, Client, BuildStatus } from '../../types';
import { fetchBuilds, createBuild, transitionBuildStatus } from '../../lib/buildService';
import { CreateBuildModal } from '../../components/super-admin/CreateBuildModal';
import toast from 'react-hot-toast';

export function Builds() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch builds
      const { builds: buildsData, error: buildsErr } = await fetchBuilds();
      if (buildsErr) throw buildsErr;

      // 2. Fetch clients for dropdown
      const { data: clientsData, error: clientsErr } = await supabase
        .from('clients')
        .select('*')
        .order('business_name', { ascending: true });

      if (clientsErr) throw clientsErr;

      setBuilds(buildsData);
      setClients(clientsData as Client[] || []);
    } catch (err: any) {
      console.error('Error loading builds page data:', err);
      setError(err.message || 'حدث خطأ أثناء تحميل بيانات الإصدارات.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered builds
  const filteredBuilds = useMemo(() => {
    return builds.filter((build) => {
      // Status Filter
      if (statusFilter !== 'all' && build.status !== statusFilter) {
        return false;
      }

      // Client Filter
      if (clientFilter !== 'all') {
        if (clientFilter === 'general') {
          if (build.client_id) return false;
        } else if (build.client_id !== clientFilter) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const version = build.version?.toLowerCase() || '';
        const buildNum = String(build.build_number || '');
        const clientName = build.client?.business_name?.toLowerCase() || '';
        const clientCode = build.client?.client_code?.toLowerCase() || '';
        const notes = build.release_notes?.toLowerCase() || '';

        const matches =
          version.includes(query) ||
          buildNum.includes(query) ||
          clientName.includes(query) ||
          clientCode.includes(query) ||
          notes.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [builds, statusFilter, clientFilter, searchQuery]);

  // Paginated builds
  const paginatedBuilds = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredBuilds.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredBuilds, currentPage]);

  const totalPages = Math.ceil(filteredBuilds.length / itemsPerPage) || 1;

  // Handler for creating build
  const handleCreateBuild = async (formData: any) => {
    const result = await createBuild({
      clientId: formData.clientId || null,
      version: formData.version,
      releaseDate: formData.releaseDate,
      minimumSupportedVersion: formData.minimumSupportedVersion || null,
      releaseNotes: formData.releaseNotes || null,
      status: formData.status as BuildStatus,
    });

    if (result.success) {
      toast.success(result.message);
      setIsCreateOpen(false);
      await loadData();
    } else {
      toast.error(result.message);
    }
  };

  // Helper badge for build status
  const getStatusBadge = (status: BuildStatus) => {
    switch (status) {
      case 'ready':
      case 'published':
        return (
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>جاهز (Ready)</span>
          </span>
        );
      case 'building':
        return (
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
            <span>قيد التجهيز (Building)</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span>فشل (Failed)</span>
          </span>
        );
      case 'archived':
      case 'deprecated':
        return (
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <Archive className="h-3 w-3 text-slate-400" />
            <span>مؤرشف (Archived)</span>
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3 text-amber-500" />
            <span>مسودة (Draft)</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">إدارة الإصدارات (Build Management)</h2>
          <p className="text-sm text-slate-500 mt-1">
            تسجيل ومتابعة إصدارات Ordexa POS وتجهيز تكوينات النسخ المخصصة للعملاء
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة إصدار جديد</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي الإصدارات</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{builds.length}</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">الإصدارات الجاهزة</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {builds.filter((b) => b.status === 'ready' || b.status === 'published').length}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">قيد التجهيز / مسودة</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600">
            {builds.filter((b) => b.status === 'draft' || b.status === 'building').length}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">المؤرشفة</span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <Archive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600">
            {builds.filter((b) => b.status === 'archived' || b.status === 'deprecated').length}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="بحث برقم الإصدار، اسم العميل، كود العميل، أو ملاحظات الإصدار..."
              className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[140px]"
            >
              <option value="all">كافة الحالات</option>
              <option value="draft">مسودة (Draft)</option>
              <option value="building">قيد التجهيز (Building)</option>
              <option value="ready">جاهز (Ready)</option>
              <option value="failed">فشل (Failed)</option>
              <option value="archived">مؤرشف (Archived)</option>
            </select>
          </div>

          {/* Client Filter */}
          <div>
            <select
              value={clientFilter}
              onChange={(e) => {
                setClientFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full md:w-auto px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[170px]"
            >
              <option value="all">كافة العملاء والنسخ</option>
              <option value="general">نسخ عامة فقط (General)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name} ({c.client_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table or States */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-sm font-medium">جاري تحميل سجل الإصدارات...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-600">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 text-rose-500" />
            <h4 className="text-base font-semibold">خطأ أثناء التحميل</h4>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : filteredBuilds.length === 0 ? (
          <div className="p-16 text-center">
            <Layers className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-900">لا توجد إصدارات مطابقة</h4>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              {builds.length === 0
                ? 'لم يتم إنشاء أي إصدارات لتطبيق Ordexa POS حتى الآن. يمكنك البدء بإنشاء أول إصدار.'
                : 'لم يتم العثور على إصدارات تطابق شروط البحث والفلترة المحددة.'}
            </p>
            {builds.length === 0 && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة أول إصدار</span>
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-right">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">الإصدار والنسخة</th>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">العميل المخصص</th>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">حالة الإصدار</th>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">تاريخ الإصدار</th>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">الحد الأدنى المدعوم</th>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900">تاريخ الإنشاء</th>
                    <th className="px-5 py-3.5 text-xs font-semibold text-slate-900 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {paginatedBuilds.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Version & Build Number */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600">
                            <Layers className="h-4 w-4" />
                          </div>
                          <div>
                            <Link
                              to={`/super-admin/builds/${b.id}`}
                              className="font-mono text-sm font-bold text-indigo-600 hover:underline"
                              dir="ltr"
                            >
                              v{b.version}
                            </Link>
                            <span className="block text-[11px] text-slate-400 font-mono">
                              Build #{b.build_number}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Client */}
                      <td className="px-5 py-4">
                        {b.client ? (
                          <div>
                            <Link
                              to={`/super-admin/clients/${b.client_id}`}
                              className="text-xs font-bold text-slate-900 hover:underline flex items-center gap-1"
                            >
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              <span>{b.client.business_name}</span>
                            </Link>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {b.client.client_code}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            <span>نسخة عامة (General)</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">{getStatusBadge(b.status)}</td>

                      {/* Release Date */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-600">
                        {b.release_date ? format(new Date(b.release_date), 'yyyy-MM-dd') : '—'}
                      </td>

                      {/* Minimum Supported Version */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-600">
                        {b.minimum_supported_version ? `v${b.minimum_supported_version}` : '—'}
                      </td>

                      {/* Created At */}
                      <td className="px-5 py-4 text-xs font-mono text-slate-500">
                        {b.created_at ? format(new Date(b.created_at), 'yyyy-MM-dd') : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            to={`/super-admin/builds/${b.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>التفاصيل</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
                <div>
                  عرض صفحة {currentPage} من أصل {totalPages} (إجمالي {filteredBuilds.length} إصدار)
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    السابق
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-2.5 py-1 rounded border ${
                        currentPage === page
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Build Modal */}
      <CreateBuildModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateBuild}
        clients={clients}
      />
    </div>
  );
}
