import { useState, FormEvent } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useClientStore } from '../../store/clientStore';
import { useDeviceStore } from '../../store/deviceStore';
import { loginWithCredentials, persistOfflineAuthRecord } from '../../lib/authService';
import { Loader2, Eye, EyeOff, Store, ShieldCheck, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';

export function ClientLogin() {
  const navigate = useNavigate();
  const { user, userType, isSuperAdmin, initialized, determineUserRole } = useAuthStore();
  const { client } = useClientStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // If already authenticated: prioritize Super Admin to /super-admin, client to /dashboard
  if (initialized && user) {
    if (isSuperAdmin) {
      return <Navigate to="/super-admin" replace />;
    }
    if (userType === 'client_user') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const { user: authUser, session, error, isOffline: loginWasOffline } = await loginWithCredentials(
        email.trim(),
        password,
        client?.id
      );

      if (error) {
        throw error;
      }

      if (authUser) {
        if (loginWasOffline) {
          const storeState = useAuthStore.getState();
          toast.success(`تم تسجيل الدخول بنجاح دون اتصال (أوفلاين) - مرحباً بك ${storeState.clientUser?.name || 'الكاشير'}`);
          navigate('/dashboard', { replace: true });
          return;
        }

        if (session) {
          await determineUserRole(authUser, session);
          const storeState = useAuthStore.getState();

          if (storeState.clientUser && client) {
            persistOfflineAuthRecord(
              password,
              authUser,
              storeState.clientUser,
              client,
              useDeviceStore.getState(),
              useClientStore.getState()
            );
          }

          if (storeState.isSuperAdmin) {
            toast.success('تم تسجيل الدخول بنجاح كمسؤول نظام (Super Admin)');
            navigate('/super-admin', { replace: true });
          } else if (storeState.userType === 'client_user') {
            toast.success(`مرحباً بك ${storeState.clientUser?.name || ''}`);
            navigate('/dashboard', { replace: true });
          } else {
            toast.error('هذا الحساب غير مفعل أو غير مرتبط بمنشأة صالحة.');
          }
        }
      }
    } catch (error: any) {
      console.error('Client login error:', error);
      const msg = error?.message || '';
      if (msg) {
        toast.error(msg);
      } else {
        toast.error('اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg text-white overflow-hidden p-1">
            {client?.logo ? (
              <img
                src={client.logo}
                alt={client.business_name || 'شعار المنشأة'}
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Store className="h-8 w-8 text-indigo-400" />
            )}
          </div>
        </div>
        <h2 className="mt-5 text-center text-2xl font-bold tracking-tight text-slate-900">
          {client?.business_name ? `${client.business_name} - تسجيل الدخول` : 'Ordexa POS - تسجيل الدخول'}
        </h2>
        {isOffline && (
          <div className="mt-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-medium">
              <WifiOff className="h-3.5 w-3.5 text-amber-700" />
              وضع العمل دون اتصال بالإنترنت (Offline Mode)
            </span>
          </div>
        )}
        <p className="mt-2 text-center text-sm text-slate-600">
          {client?.business_name
            ? `نظام إدارة نقطة البيع للمنشأة (${client.client_code})`
            : 'نظام Ordexa POS لإدارة المنشآت ونقاط البيع'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm rounded-2xl border border-slate-200 sm:px-10">
          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                البريد الإلكتروني أو اسم المستخدم
              </label>
              <div className="mt-1.5">
                <input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.com أو اسم المستخدم"
                  className="block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 text-sm ltr text-left"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                كلمة المرور
              </label>
              <div className="mt-1.5 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 text-sm ltr text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-2.5 px-4 rounded-xl shadow-sm text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ms-1 me-2 h-4 w-4 text-white" />
                    جارٍ التحقق...
                  </>
                ) : (
                  'تسجيل الدخول'
                )}
              </button>
            </div>
          </form>

          {/* Super admin portal gateway link */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link
              to="/super-admin/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>تسجيل دخول مسؤول النظام (Super Admin)</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
