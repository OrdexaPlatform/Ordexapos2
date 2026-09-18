import { supabase, supabaseAnonQuery } from './supabase';
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
 * Resolves username, name, phone, or email to the associated account email address.
 * Works seamlessly across Super Admin, Client Users, and Client Owners.
 */
export async function resolveUsernameOrEmail(identifier: string): Promise<string> {
  const trimmed = (identifier || '').trim();
  if (!trimmed) return '';

  // If already an email address, normalize to lowercase
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  try {
    // 1. Check super_admin_users by exact or partial name
    const { data: saExact } = await supabaseAnonQuery
      .from('super_admin_users')
      .select('email')
      .ilike('name', trimmed)
      .eq('status', 'active')
      .limit(1);

    if (saExact && saExact.length > 0 && saExact[0].email) {
      return saExact[0].email.toLowerCase();
    }

    const { data: saPartial } = await supabaseAnonQuery
      .from('super_admin_users')
      .select('email')
      .ilike('name', `%${trimmed}%`)
      .eq('status', 'active')
      .limit(1);

    if (saPartial && saPartial.length > 0 && saPartial[0].email) {
      return saPartial[0].email.toLowerCase();
    }

    // 2. Check client_users by exact name or phone
    const { data: cuExact } = await supabaseAnonQuery
      .from('client_users')
      .select('email')
      .or(`name.ilike.${trimmed},phone.eq.${trimmed}`)
      .eq('status', 'active')
      .limit(1);

    if (cuExact && cuExact.length > 0 && cuExact[0].email) {
      return cuExact[0].email.toLowerCase();
    }

    // Check client_users by partial name
    const { data: cuPartial } = await supabaseAnonQuery
      .from('client_users')
      .select('email')
      .ilike('name', `%${trimmed}%`)
      .eq('status', 'active')
      .limit(1);

    if (cuPartial && cuPartial.length > 0 && cuPartial[0].email) {
      return cuPartial[0].email.toLowerCase();
    }

    // 3. Check clients by exact owner_name, customer_name, or phone
    const { data: clExact } = await supabaseAnonQuery
      .from('clients')
      .select('email')
      .or(`owner_name.ilike.${trimmed},customer_name.ilike.${trimmed},phone.eq.${trimmed}`)
      .eq('status', 'active')
      .limit(1);

    if (clExact && clExact.length > 0 && clExact[0].email) {
      return clExact[0].email.toLowerCase();
    }

    // Check clients by partial owner_name or customer_name
    const { data: clPartial } = await supabaseAnonQuery
      .from('clients')
      .select('email')
      .or(`owner_name.ilike.%${trimmed}%,customer_name.ilike.%${trimmed}%`)
      .eq('status', 'active')
      .limit(1);

    if (clPartial && clPartial.length > 0 && clPartial[0].email) {
      return clPartial[0].email.toLowerCase();
    }
  } catch (err) {
    console.warn('Username to email resolution fallback warning:', err);
  }

  return trimmed.toLowerCase();
}

/**
 * Universal login service:
 * 1. Supports both Username / Name / Phone and Email inputs with automatic resolution.
 * 2. Tries the same-origin backend proxy (/api/auth/login) first to eliminate CORS, ad-blockers,
 *    and iframe cross-origin "Failed to fetch" errors.
 * 3. Syncs the resulting session with the Supabase client so all real-time listeners and RLS queries work.
 * 4. Gracefully falls back to direct client-side Supabase Auth if the server endpoint is not reached.
 */
export async function loginWithCredentials(
  identifier: string,
  password: string
): Promise<LoginResult> {
  const normalizedEmail = await resolveUsernameOrEmail(identifier);

  if (!normalizedEmail || !password) {
    return {
      user: null,
      session: null,
      error: new Error('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.'),
    };
  }

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
          error: new Error(data?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.'),
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
        error: new Error('اسم المستخدم أو كلمة المرور غير صحيحة.'),
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

    const contentType = response.headers.get('content-type') || '';
    let data: any = null;

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.warn('Failed to parse JSON response:', jsonErr);
      }
    } else {
      const rawText = await response.text().catch(() => '');
      console.warn('Backend API returned non-JSON response:', response.status, rawText.slice(0, 150));
    }

    if (response.ok && data?.success) {
      return {
        user: data.user as ClientUser,
        isAuthLinked: Boolean(data.isAuthLinked),
        message: data.message || 'تم إنشاء الحساب بنجاح.',
      };
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('خدمة تهيئة المستخدمين غير متاحة حالياً (رمز 404). يرجى التأكد من اتصال الخادم.');
      }
      if (response.status === 401) {
        throw new Error('غير مصرح: يلزم تسجيل الدخول كمسؤول سوبر أدمن للمتابعة.');
      }
      if (response.status === 403) {
        throw new Error('ممنوع الوصول: لا تملك الصلاحيات الكافية لإضافة مستخدم لهذه المنشأة.');
      }
      if (response.status === 409) {
        throw new Error('البريد الإلكتروني مسجل بالفعل لدى مستخدم أو منشأة أخرى.');
      }
      throw new Error(`تعذر إنشاء الحساب من الخادم (رمز الاستجابة: ${response.status}).`);
    }

    throw new Error('استجابة غير متوقعة من خادم النظام. يرجى إعادة المحاولة.');
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
