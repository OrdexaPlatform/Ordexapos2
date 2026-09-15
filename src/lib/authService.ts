import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { ClientUser, ClientUserRole, ClientUserStatus } from '../types';

export interface LoginResult {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

export interface ProvisionUserInput {
  client_id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: ClientUserRole;
  status?: ClientUserStatus;
  custom_permissions?: string[];
}

/**
 * Universal login service:
 * 1. Tries the same-origin backend proxy (/api/auth/login) first to eliminate CORS, ad-blockers,
 *    and iframe cross-origin "Failed to fetch" errors.
 * 2. Syncs the resulting session with the Supabase client so all real-time listeners and RLS queries work.
 * 3. Gracefully falls back to direct client-side Supabase Auth if the server endpoint is not reached.
 */
export async function loginWithCredentials(
  email: string,
  password: string
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Try server-side API proxy (Same-origin request)
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
      }),
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data?.session) {
      // Sync session with the browser's Supabase instance
      try {
        await supabase.auth.setSession(data.session);
      } catch (syncErr) {
        console.warn('Session sync warning:', syncErr);
      }

      return {
        user: data.user || null,
        session: data.session,
        error: null,
      };
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 400) {
        return {
          user: null,
          session: null,
          error: new Error(data?.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'),
        };
      }
    }
  } catch (apiErr: any) {
    console.warn('API login proxy request failed, trying direct Supabase client:', apiErr);
  }

  // 2. Fallback to direct client-side Supabase Auth
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.'),
      };
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    };
  } catch (err: any) {
    console.error('Direct Supabase auth exception:', err);
    const isNetworkError =
      err?.message?.includes('Failed to fetch') ||
      err?.name === 'TypeError' ||
      !navigator.onLine;

    const message = isNetworkError
      ? 'تعذر الاتصال بخادم النظام. يرجى التحقق من اتصال الإنترنت وإعادة المحاولة.'
      : err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.';

    return {
      user: null,
      session: null,
      error: new Error(message),
    };
  }
}

/**
 * Provisions a client user via the secure server endpoint
 */
export async function provisionUserViaApi(
  input: ProvisionUserInput
): Promise<{ user: ClientUser; isAuthLinked: boolean; message: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch('/api/auth/provision-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });

    const data = await response.json();
    if (response.ok && data?.success) {
      return {
        user: data.user as ClientUser,
        isAuthLinked: Boolean(data.isAuthLinked),
        message: data.message || 'تم إنشاء الحساب بنجاح.',
      };
    }

    throw new Error(data?.error || 'تعذر إنشاء الحساب');
  } catch (err: any) {
    console.warn('Provision via API failed, falling back to direct DB record:', err);
    throw err;
  }
}

/**
 * Synchronizes the owner account for a client
 */
export async function syncClientOwnerViaApi(clientId: string): Promise<any> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch('/api/auth/sync-client-owner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ client_id: clientId }),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    console.warn('Sync client owner via API failed:', err);
    return null;
  }
}
