import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Layers,
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  Archive,
  Play,
  CheckCircle2,
  XCircle,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  Image as ImageIcon,
  Phone,
  Mail,
  MapPin,
  Coins,
  Globe,
  RefreshCw,
  Key,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Build, Client, BuildStatus, ClientBuildConfig, ActivityLogItem } from '../../types';
import {
  fetchBuildById,
  transitionBuildStatus,
  generateClientBuildConfig,
} from '../../lib/buildService';
import { BuildConfigModal } from '../../components/super-admin/BuildConfigModal';
import toast from 'react-hot-toast';

export function BuildDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [build, setBuild] = useState<Build | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Configuration Modal
  const [generatedConfig, setGeneratedConfig] = useState<ClientBuildConfig | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isGeneratingConfig, setIsGeneratingConfig] = useState(false);

  // Status transition state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const loadBuildDetails = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch Build
      const { build: buildData, error: buildErr } = await fetchBuildById(id);
      if (buildErr) throw buildErr;
      if (!buildData) {
        setError('الإصدار المطلوب غير موجود');
        setIsLoading(false);
        return;
      }

      setBuild(buildData);

      // 2. Fetch Client if associated
      if (buildData.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('*')
          .eq('id', buildData.client_id)
          .maybeSingle();

        setClient((clientData as Client) || buildData.client || null);
      } else {
        setClient(null);
      }

      // 3. Fetch Activity Logs for this build
      const { data: logsData } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('entity_type', 'build')
        .eq('entity_id', id)
        .order('created_at', { ascending: false });

      setActivities((logsData as ActivityLogItem[]) || []);
    } catch (err: any) {
      console.error('Error loading build details:', err);
      setError(err.message || 'حدث خطأ أثناء تحميل بيانات الإصدار.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBuildDetails();
  }, [loadBuildDetails]);

  // Lifecycle transition handler
  const handleTransition = async (nextStatus: BuildStatus, actionLabel: string) => {
    if (!build) return;

    setIsUpdatingStatus(true);
    try {
      const result = await transitionBuildStatus(build.id, nextStatus, `تم تغيير الحالة إلى ${actionLabel}`);
      if (result.success) {
        toast.success(result.message);
        await loadBuildDetails();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل في تغيير حالة الإصدار');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Generate Configuration Handler
  const handleGenerateConfiguration = async () => {
    if (!build) return;

    if (!client) {
      toast.error('لا يمكن توليد إعدادات مخصصة لنسخة عامة بدون ربط عميل محدد. يرجى اختيار عميل للإصدار.');
      return;
    }

    setIsGeneratingConfig(true);
    try {
      const result = await generateClientBuildConfig(build, client);
      if (result.success && result.config) {
        setGeneratedConfig(result.config);
        setIsConfigModalOpen(true);
        toast.success(result.message);
        // Refresh activity logs
        await loadBuildDetails();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء تجهيز إعدادات الإصدار');
    } finally {
      setIsGeneratingConfig(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm font-medium">جاري تحميل تفاصيل الإصدار...</p>
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="p-12 text-center text-rose-600 bg-white rounded-xl border border-rose-200">
        <AlertTriangle className="h-10 w-10 mx-auto mb-2 text-rose-500" />
        <h4 className="text-base font-semibold">خطأ</h4>
        <p className="text-sm text-slate-500 mt-1">{error || 'الإصدار غير موجود'}</p>
        <Link
          to="/super-admin/builds"
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة لقائمة الإصدارات</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/super-admin/builds" className="hover:text-slate-800 transition-colors">
            إدارة الإصدارات
          </Link>
          <span>/</span>
          <span className="font-mono text-slate-900 font-bold">v{build.version}</span>
        </div>
        <Link
          to="/super-admin/builds"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
        >
          <ArrowRight className="h-4 w-4" />
          <span>العودة للقائمة</span>
        </Link>
      </div>

      {/* Main Header Banner */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Layers className="h-8 w-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 font-mono tracking-tight" dir="ltr">
                v{build.version}
              </h1>
              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Build #{build.build_number}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md ${
                  build.status === 'ready' || build.status === 'published'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : build.status === 'building'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : build.status === 'failed'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : build.status === 'archived'
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {build.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <span>تاريخ الإصدار: {build.release_date ? format(new Date(build.release_date), 'yyyy-MM-dd') : '—'}</span>
              <span>•</span>
              <span className="font-mono">ID: {build.id}</span>
            </p>
          </div>
        </div>

        {/* Lifecycle Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Transition: Draft -> Building */}
          {build.status === 'draft' && (
            <button
              onClick={() => handleTransition('building', 'قيد التجهيز')}
              disabled={isUpdatingStatus}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>بدء التجهيز (Start Building)</span>
            </button>
          )}

          {/* Transition: Building -> Ready OR Failed */}
          {build.status === 'building' && (
            <>
              <button
                onClick={() => handleTransition('ready', 'جاهز')}
                disabled={isUpdatingStatus}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>تعيين كـ جاهز (Mark Ready)</span>
              </button>
              <button
                onClick={() => handleTransition('failed', 'فشل')}
                disabled={isUpdatingStatus}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>تسجيل فشل (Mark Failed)</span>
              </button>
            </>
          )}

          {/* Transition: Failed -> Building (Retry) */}
          {build.status === 'failed' && (
            <button
              onClick={() => handleTransition('building', 'إعادة التجهيز')}
              disabled={isUpdatingStatus}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة (Retry Building)</span>
            </button>
          )}

          {/* Transition to Archived */}
          {build.status !== 'archived' && (
            <button
              onClick={() => handleTransition('archived', 'مؤرشف')}
              disabled={isUpdatingStatus}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>أرشفة الإصدار</span>
            </button>
          )}

          {/* Generate Configuration Button */}
          {client && (
            <button
              onClick={handleGenerateConfiguration}
              disabled={isGeneratingConfig}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-xs disabled:opacity-50"
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>{isGeneratingConfig ? 'جاري التجهيز...' : 'Generate Configuration'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Build Specs & Client Branding */}
        <div className="lg:col-span-2 space-y-6">
          {/* Build Specifications Card */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
              بيانات ومواصفات الإصدار (Build Specifications)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-1">رقم الإصدار (Version)</span>
                <span className="font-mono text-sm font-bold text-slate-900">v{build.version}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-1">رقم البناء التراكمي (Build Number)</span>
                <span className="font-mono text-sm font-bold text-slate-900">#{build.build_number}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-1">الحد الأدنى المدعوم (Minimum Supported Version)</span>
                <span className="font-mono text-sm font-bold text-slate-900">
                  {build.minimum_supported_version ? `v${build.minimum_supported_version}` : 'لا يوجد قيد'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-1">حالة التنزيل (Download Enabled)</span>
                <span className={`font-semibold ${build.download_enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {build.download_enabled ? 'مفعل للتحميل' : 'معطل مؤقتاً'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-1">تاريخ الإصدار (Release Date)</span>
                <span className="font-mono text-slate-800">
                  {build.release_date ? format(new Date(build.release_date), 'yyyy-MM-dd HH:mm') : '—'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-400 block mb-1">تاريخ الإنشاء في النظام (Created At)</span>
                <span className="font-mono text-slate-800">
                  {build.created_at ? format(new Date(build.created_at), 'yyyy-MM-dd HH:mm') : '—'}
                </span>
              </div>
            </div>

            {/* Release Notes */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-700 block mb-1.5">
                ملاحظات الإصدار (Release Notes)
              </span>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                {build.release_notes || 'لا توجد ملاحظات مسجلة لهذا الإصدار.'}
              </div>
            </div>
          </div>

          {/* Client Branding Preview Section (Only if associated with a client) */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  معاينة هوية العميل (Client Branding Preview)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  البيانات التي ستدمج داخل تكوين التطبيق المخصص للمنشأة
                </p>
              </div>
              {client && (
                <button
                  onClick={handleGenerateConfiguration}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <FileCode className="h-3.5 w-3.5" />
                  <span>توليد ملف الإعدادات</span>
                </button>
              )}
            </div>

            {client ? (
              <div className="space-y-4">
                {/* Logo & Identity Row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="h-20 w-20 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                    {client.logo ? (
                      <img
                        src={client.logo}
                        alt={client.business_name}
                        className="h-full w-full object-contain p-1"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="h-6 w-6 text-slate-300 mx-auto mb-1" />
                        <span className="text-[10px] text-slate-400 block leading-tight">
                          لم يتم رفع شعار للعميل بعد
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-slate-900">{client.business_name}</h4>
                      <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                        {client.client_code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{client.customer_name}</p>
                    <p className="text-xs text-slate-400">
                      سيتم تضمين هذا الاسم التجاري والشعار في شاشات تسجيل الدخول وتطبيق الكاشير الخاص بالعميل.
                    </p>
                  </div>
                </div>

                {/* Additional Client Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Coins className="h-3.5 w-3.5" />
                      <span>العملة الافتراضية</span>
                    </div>
                    <span className="font-bold text-slate-800">{client.currency || 'USD'}</span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Globe className="h-3.5 w-3.5" />
                      <span>لغة الواجهة</span>
                    </div>
                    <span className="font-bold text-slate-800 uppercase">{client.language || 'ar'}</span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Phone className="h-3.5 w-3.5" />
                      <span>الهاتف</span>
                    </div>
                    <span className="font-medium text-slate-800 truncate block">{client.phone || '—'}</span>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Mail className="h-3.5 w-3.5" />
                      <span>البريد الإلكتروني</span>
                    </div>
                    <span className="font-medium text-slate-800 truncate block">{client.email || '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <Building2 className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700">هذا الإصدار عام (General Release)</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  لم يتم تخصيص هذا الإصدار لعميل محدد، بل يمثل نسخة عامة من Ordexa POS بدون شعار أو إعدادات هوية تجارية مدمجة.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Linked Client & Activity History */}
        <div className="space-y-6">
          {/* Linked Client Card */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span>العميل المرتبط</span>
            </h3>

            {client ? (
              <div className="space-y-3 text-xs">
                <div>
                  <Link
                    to={`/super-admin/clients/${client.id}`}
                    className="font-bold text-slate-900 hover:text-indigo-600 hover:underline text-sm block"
                  >
                    {client.business_name}
                  </Link>
                  <p className="text-slate-500 mt-0.5">{client.customer_name}</p>
                  <span className="inline-block mt-1 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                    {client.client_code}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-1.5 text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">حالة العميل:</span>
                    <span className="font-semibold text-emerald-700">{client.status}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">تاريخ التسجيل:</span>
                    <span className="font-mono">
                      {client.created_at ? format(new Date(client.created_at), 'yyyy-MM-dd') : '—'}
                    </span>
                  </div>
                </div>

                <Link
                  to={`/super-admin/clients/${client.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                >
                  <span>عرض ملف العميل الكامل</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-2">
                نسخة عامة لجميع العملاء (Unassigned)
              </div>
            )}
          </div>

          {/* Activity Logs History */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>سجل الحركات (Build Activity)</span>
            </h3>

            {activities.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">لا توجد حركات مسجلة لهذا الإصدار بعد</p>
            ) : (
              <div className="space-y-3">
                {activities.map((act) => (
                  <div key={act.id} className="text-xs border-r-2 border-indigo-500 pr-3 py-1 space-y-0.5">
                    <div className="font-semibold text-slate-800">
                      {act.action === 'build_created'
                        ? 'إنشاء الإصدار'
                        : act.action === 'build_status_changed'
                        ? `تغيير الحالة إلى ${act.metadata?.new_status || ''}`
                        : act.action === 'build_configuration_generated'
                        ? 'توليد ملف الإعدادات'
                        : act.action}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {format(new Date(act.created_at), 'yyyy-MM-dd HH:mm:ss')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Configuration Viewer Modal */}
      <BuildConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={generatedConfig}
      />
    </div>
  );
}
