import { useState, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { loginWithCredentials } from '../../lib/authService';
import { Loader2, Eye, EyeOff, LayoutDashboard } from 'lucide-react';
import toast from 'react-hot-toast';

export function Login() {
  const { isSuperAdmin, initialized, checkAdminRole } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // If already logged in and verified, redirect
  if (initialized && isSuperAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const { user: authUser, session, error } = await loginWithCredentials(
        email.trim(),
        password
      );

      if (error) {
        throw error;
      }

      if (authUser && session) {
        await checkAdminRole(authUser, session);
        // checkAdminRole will update the store and trigger redirect via component re-render if successful
        const storeState = useAuthStore.getState();
        if (!storeState.isSuperAdmin) {
           toast.error('ليس لديك صلاحيات الدخول لمركز التحكم.');
        } else {
           toast.success('تم تسجيل الدخول بنجاح.');
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const msg = error?.message || '';
      if (msg.includes('الإنترنت') || msg.includes('الخادم')) {
        toast.error(msg);
      } else {
        toast.error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8" dir="rtl">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
            <LayoutDashboard className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-slate-900">
          تسجيل الدخول - مركز التحكم
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          منصة Ordexa POS
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-white px-6 py-12 shadow-xl sm:rounded-xl sm:px-12 border border-slate-100">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium leading-6 text-slate-900">
                البريد الإلكتروني
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6 transition-all"
                  placeholder="admin@ordexa.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium leading-6 text-slate-900">
                كلمة المرور
              </label>
              <div className="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm sm:leading-6 transition-all pl-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'تسجيل الدخول'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
