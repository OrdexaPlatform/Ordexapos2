import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { loginWithCredentials, persistOfflineAuthRecord } from '../../lib/authService';
import { InstallPwaButton } from '../../components/pwa/InstallPwaButton';
import { POSPage } from './POS';
import { ClientPOSLayout } from '../../components/client/ClientPOSLayout';
import { LicenseGuard } from '../../components/client/LicenseGuard';
import { DeviceGuard } from '../../components/client/DeviceGuard';
import { offlineStorage } from '../../lib/offline/offlineStorage';
import { 
  Store, 
  Loader2, 
  Eye, 
  EyeOff, 
  ShieldAlert, 
  AlertTriangle, 
  RefreshCw, 
  LogOut,
  ArrowRight,
  WifiOff
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ClientPosGatewayPage: React.FC = () => {
  const { clientCode } = useParams<{ clientCode: string }>();
  const navigate = useNavigate();

  const { 
    user, 
    userType, 
    isSuperAdmin, 
    clientUser, 
    initialized: authInitialized, 
    loading: authLoading,
    determineUserRole,
    signOut 
  } = useAuthStore();

  const { 
    client, 
    loadClientByCode, 
    loading: clientLoading, 
    error: clientError 
  } = useClientStore();

  const { initializeDevice, status: deviceStatus } = useDeviceStore();

  // Login form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);

  // 1. Load client configuration on mount or when clientCode changes
  useEffect(() => {
    if (clientCode) {
      loadClientByCode(clientCode);
    } else {
      const lastCode = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_last_client_code') : null;
      if (lastCode) {
        loadClientByCode(lastCode);
      }
    }
  }, [clientCode, loadClientByCode]);

  // Offline recovery effect: immediately populate client and auth if offline
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (!client) {
        const code = clientCode || (typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_last_client_code') : null);
        if (code) {
          const raw = localStorage.getItem(`ordexa_cached_client_by_code_${code.toUpperCase()}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              useClientStore.setState({ client: parsed, effectiveLicenseStatus: 'active', loading: false });
            } catch {}
          }
        }
        offlineStorage.getCachedClient().then(c => {
          if (c && !useClientStore.getState().client) {
            useClientStore.setState({ client: c, effectiveLicenseStatus: 'active', loading: false });
          }
        }).catch(() => {});
      }
    }
  }, [clientCode, client]);

  // 2. Initialize device verification when authenticated with client user
  const initDeviceRef = useRef<string | null>(null);
  useEffect(() => {
    if (user && clientUser?.client_id && client?.id === clientUser.client_id) {
      if (initDeviceRef.current !== client.id) {
        initDeviceRef.current = client.id;
        initializeDevice(client.id);
      }
    }
  }, [user, clientUser?.client_id, client?.id, initializeDevice]);

  // Loading state while resolving client configuration or auth session (only when online or still resolving)
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (!isOffline && ((clientLoading && !client) || (!authInitialized && authLoading))) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-4">
          <div className="h-16 w-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto shadow-xl border border-slate-700">
            <Loader2 className="animate-spin text-indigo-400 h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-white font-bold text-lg">نظام Ordexa Web POS</h3>
            <p className="text-slate-400 text-sm">جارٍ تحميل بيانات المنشأة ونقطة البيع...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state: Client not found or suspended
  if (clientError || !client) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6" dir="rtl">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl border border-slate-700 p-6 sm:p-8 text-center shadow-2xl space-y-5">
          <div className="h-14 w-14 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">تعذر العثور على المنشأة</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              {clientError || `الرمز (${clientCode}) غير مسجل في نظام Ordexa أو تم إيقافه.`}
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => clientCode && loadClientByCode(clientCode)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all"
            >
              <RefreshCw className="h-4 w-4" />
              <span>إعادة المحاولة</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl text-sm transition-all"
            >
              <span>تسجيل الدخول العام</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle Client POS Login Submission
  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalAuthError(null);

    if (!email || !password) {
      toast.error('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setSubmitting(true);
    try {
      const { user: authUser, session, error, isOffline: loginWasOffline } = await loginWithCredentials(
        email.trim(),
        password,
        client.id
      );

      if (error) throw error;

      if (authUser) {
        if (loginWasOffline) {
          const authState = useAuthStore.getState();
          toast.success(`مرحباً بك ${authState.clientUser?.name || 'الكاشير'} في كاشير ${client.business_name} (وضع عدم الاتصال)`);
          initializeDevice(client.id);
          return;
        }

        if (session) {
          await determineUserRole(authUser, session);
          const authState = useAuthStore.getState();

          // 1. Strict Isolation: Super Admin cannot enter client POS
          if (authState.isSuperAdmin) {
            await signOut();
            const err = 'حساب مسؤول النظام (Super Admin) غير مصرح له بتسجيل الدخول إلى نقاط بيع العملاء.';
            setLocalAuthError(err);
            toast.error(err);
            return;
          }

          // 2. Strict Isolation: Verify user belongs to THIS client
          if (authState.clientUser) {
            if (authState.clientUser.client_id !== client.id) {
              await signOut();
              const err = `عفواً، هذا الحساب غير تابع لمنشأة (${client.business_name}).`;
              setLocalAuthError(err);
              toast.error(err);
              return;
            }

            // Persist offline auth record with Web Crypto PBKDF2 verifier
            persistOfflineAuthRecord(
              password,
              authUser,
              authState.clientUser,
              client,
              useDeviceStore.getState(),
              useClientStore.getState()
            );

            toast.success(`مرحباً بك ${authState.clientUser.name} في كاشير ${client.business_name}`);
            // Re-initialize device for this client
            initializeDevice(client.id);
          } else {
            await signOut();
            const err = 'هذا الحساب غير مفعل أو غير مرتبط بمنشأة صالحة.';
            setLocalAuthError(err);
            toast.error(err);
          }
        }
      }
    } catch (err: any) {
      console.error('POS Gateway login error:', err);
      const msg = err?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة';
      setLocalAuthError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Case 1: USER IS NOT AUTHENTICATED
  // Show Client POS Landing & PWA Install Gateway + Login Form
  // -------------------------------------------------------------
  if (!user || userType !== 'client_user' || !clientUser) {
    const isOfflineMode = typeof navigator !== 'undefined' && !navigator.onLine;

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative" dir="rtl">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          {/* Client Branding Header */}
          <div className="text-center mb-6">
            <div className="h-20 w-20 bg-slate-900 rounded-3xl flex items-center justify-center shadow-2xl mx-auto p-2 border-2 border-indigo-500/40 overflow-hidden">
              {client.logo ? (
                <img
                  src={client.logo}
                  alt={client.business_name}
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Store className="h-10 w-10 text-indigo-400" />
              )}
            </div>

            <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {client.business_name}
            </h1>
            
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
              <span>نظام الكاشير ونقاط البيع السحابي والأوفلاين</span>
              <span>•</span>
              <span className="font-mono">{client.client_code}</span>
            </div>

            {isOfflineMode && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium">
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                <span>وضع عدم الاتصال (Offline POS) - تسجيل الدخول متاح للحسابات المحفوظة مسبقاً</span>
              </div>
            )}
          </div>

          {/* Prominent PWA Install Action Card */}
          <div className="mb-6">
            <InstallPwaButton
              clientName={client.business_name}
              clientCode={client.client_code}
              variant="hero"
            />
          </div>

          {/* Client POS Login Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="mb-5 pb-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white">تسجيل الدخول إلى نظام الكاشير</h2>
              <p className="text-xs text-slate-400 mt-1">
                أدخل بيانات حساب الكاشير الخاص بمنشأة {client.business_name} للمتابعة
              </p>
            </div>

            {localAuthError && (
              <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span>{localAuthError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  البريد الإلكتروني أو اسم المستخدم
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cashier@business.com أو اسم المستخدم"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ltr text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ltr text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4" />
                    <span>جارٍ التحقق وتأمين الجلسة...</span>
                  </>
                ) : (
                  <span>دخول الكاشير</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Case 2: AUTHENTICATED USER - STRICT ISOLATION CHECK
  // If user belongs to another client, display access denial
  // -------------------------------------------------------------
  if (clientUser.client_id !== client.id) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6" dir="rtl">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl space-y-5">
          <div className="h-16 w-16 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">تنبيه عزل بيانات المنشآت</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              أنت مسجل الدخول حالياً بحساب تابع لمنشأة أخرى. لا يمكنك فتح كاشير منشأة ({client.business_name}) بنفس الجلسة للحفاظ على خصوصية وعزل البيانات.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                toast.success('تم تسجيل الخروج. يمكنك الآن الدخول بحساب هذه المنشأة.');
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all"
            >
              <LogOut className="h-4 w-4" />
              <span>تسجيل الخروج والتبديل لمنشأة {client.business_name}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-all"
            >
              <ArrowRight className="h-4 w-4" />
              <span>العودة لمنشأتي الأصلية</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Case 3: AUTHENTICATED & VERIFIED
  // Wrap with LicenseGuard, DeviceGuard, and ClientPOSLayout
  // -------------------------------------------------------------
  return (
    <LicenseGuard>
      <DeviceGuard>
        <ClientPOSLayout>
          <POSPage />
        </ClientPOSLayout>
      </DeviceGuard>
    </LicenseGuard>
  );
};
