import { supabase, supabaseAnonQuery } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import type { ClientUser, ClientUserRole, ClientUserStatus } from '../types';
import { createPasswordVerifier, verifyPasswordWithVerifier } from './offline/offlineCrypto';
import { offlineStorage, type OfflineCredentialRecord } from './offline/offlineStorage';
import { useAuthStore } from '../store/authStore';
import { useDeviceStore, getOrCreateLocalDeviceFingerprint } from '../store/deviceStore';
import { useClientStore } from '../store/clientStore';

export interface LoginResult {
  user: User | null;
  session: Session | null;
  error: Error | null;
  isOffline?: boolean;
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
 * Attempts secure offline login using locally stored credentials and PBKDF2 password verifier
 */
export async function attemptOfflineLogin(
  identifier: string,
  password: string,
  targetClientId?: string
): Promise<LoginResult> {
  const cleanId = (identifier || '').trim();
  if (!cleanId || !password) {
    return {
      user: null,
      session: null,
      error: new Error('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.'),
      isOffline: true,
    };
  }

  // 1. Locate OfflineCredentialRecord
  const record = await offlineStorage.getOfflineCredentialByIdentifier(cleanId, targetClientId);
  if (!record) {
    return {
      user: null,
      session: null,
      error: new Error(
        'لا يوجد حساب مسجل محلياً للعمل دون اتصال بالإنترنت بهذا الاسم على هذا الجهاز. يجب تسجيل الدخول لمرة واحدة على الأقل عبر الإنترنت أولاً.'
      ),
      isOffline: true,
    };
  }

  // 2. Validate Device Authorization
  const deviceFp = useDeviceStore.getState().fingerprint || getOrCreateLocalDeviceFingerprint();
  if (record.device_fingerprint && record.device_fingerprint !== deviceFp) {
    return {
      user: null,
      session: null,
      error: new Error('هذا الجهاز غير مصرح له بتسجيل الدخول في وضع عدم الاتصال.'),
      isOffline: true,
    };
  }

  if (record.device_authorization !== 'active') {
    return {
      user: null,
      session: null,
      error: new Error('جهاز نقطة البيع غير مفعل للعمل دون اتصال.'),
      isOffline: true,
    };
  }

  // Verify Auth Snapshot & License Offline validation
  const authSnap = await offlineStorage.verifyAuthSnapshot(record.client_id, deviceFp);
  if (!authSnap.valid) {
    return {
      user: null,
      session: null,
      error: new Error(authSnap.reason || 'انتهت صلاحية أمان الجهاز للعمل دون اتصال.'),
      isOffline: true,
    };
  }

  // 3. Validate License & Offline Grace Period
  if (record.license_status !== 'active') {
    return {
      user: null,
      session: null,
      error: new Error('ترخيص المنشأة غير نشط. لا يمكن تسجيل الدخول دون اتصال بالإنترنت.'),
      isOffline: true,
    };
  }

  const graceExpiry = new Date(record.offline_grace_expiry).getTime();
  if (Date.now() > graceExpiry) {
    return {
      user: null,
      session: null,
      error: new Error('انتهت فترة السماح بالعمل دون اتصال بالإنترنت. يرجى الاتصال بالإنترنت لتجديد التحقق من الترخيص.'),
      isOffline: true,
    };
  }

  // 4. Cryptographic Password Verification with PBKDF2 Web Crypto
  const isPasswordValid = await verifyPasswordWithVerifier(password, record.password_verifier);
  if (!isPasswordValid) {
    return {
      user: null,
      session: null,
      error: new Error('اسم المستخدم أو كلمة المرور غير صحيحة.'),
      isOffline: true,
    };
  }

  // 5. Successful Offline Login -> Configure stores and return
  useAuthStore.getState().loginOffline(record);

  // Activate device store in offline grace mode
  useDeviceStore.setState({
    status: 'active',
    isActivated: true,
    isOfflineGraceActive: true,
    remainingGraceHours: Math.max(0, Math.round((graceExpiry - Date.now()) / (1000 * 3600))),
    errorMessage: null,
    device: {
      id: record.device_id,
      client_id: record.client_id,
      device_fingerprint: record.device_fingerprint,
      terminal_name: 'نقطة بيع محلية (Offline)',
      is_active: true,
    } as any,
  });

  // Activate client store
  const cachedClient = await offlineStorage.getCachedClient(record.client_id);
  useClientStore.setState({
    client: cachedClient || {
      id: record.client_id,
      client_code: record.client_code,
      business_name: record.business_name || 'Ordexa Client',
      status: 'active',
    } as any,
    effectiveLicenseStatus: 'active',
    loading: false,
    error: null,
  });

  return {
    user: {
      id: record.auth_user_id,
      email: record.email,
    } as any,
    session: null,
    error: null,
    isOffline: true,
  };
}

/**
 * Universal login service:
 * 1. Supports both Username / Name / Phone and Email inputs with automatic resolution.
 * 2. If offline, directly runs secure offline login via Web Crypto PBKDF2.
 * 3. If online, tries the same-origin backend proxy (/api/auth/login) first.
 * 4. Strictly distinguishes between Auth Rejection (401/400) and Network Failures.
 *    - Auth Rejection: Immediately fails, NO offline fallback.
 *    - Network Failure: Seamlessly falls back to offline verification.
 */
export async function loginWithCredentials(
  identifier: string,
  password: string,
  targetClientId?: string
): Promise<LoginResult> {
  const isDefinitelyOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  // Immediate offline fallback when navigator is offline
  if (isDefinitelyOffline) {
    return attemptOfflineLogin(identifier, password, targetClientId);
  }

  let normalizedEmail = '';
  try {
    normalizedEmail = await resolveUsernameOrEmail(identifier);
  } catch {
    normalizedEmail = (identifier || '').trim().toLowerCase();
  }

  if (!normalizedEmail || !password) {
    return {
      user: null,
      session: null,
      error: new Error('يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور.'),
    };
  }

  let networkFailed = false;

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
      // STRICT RULE: Auth Rejection (401/400) must NEVER fallback to offline
      if (response.status === 401 || response.status === 400 || response.status === 403) {
        return {
          user: null,
          session: null,
          error: new Error(data?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.'),
        };
      }
      networkFailed = true;
    }
  } catch (apiErr: any) {
    console.warn('API login proxy request failed, trying direct Supabase client:', apiErr);
    networkFailed = true;
  }

  // 2. Fallback to direct client-side Supabase Auth
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      // STRICT RULE: Auth Rejection from Supabase must NEVER fallback to offline
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
      !navigator.onLine ||
      networkFailed;

    if (isNetworkError) {
      // Network Failure -> Offline fallback is allowed!
      return attemptOfflineLogin(identifier, password, targetClientId);
    }

    return {
      user: null,
      session: null,
      error: new Error(err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.'),
    };
  }
}

/**
 * Persists an offline auth record after a successful online login.
 * Derives a secure PBKDF2 verifier without storing the plaintext password.
 */
export async function persistOfflineAuthRecord(
  password: string,
  authUser: User,
  clientUser: ClientUser,
  client: any,
  deviceState?: any,
  licenseState?: any
): Promise<void> {
  try {
    if (!password || !authUser || !clientUser || !client) return;

    // 1. Create PBKDF2 Password Verifier
    const verifier = await createPasswordVerifier(password);

    const deviceFp = deviceState?.fingerprint || getOrCreateLocalDeviceFingerprint();
    const deviceId = deviceState?.device?.id || `dev_${deviceFp}`;
    const deviceAuth = deviceState?.status === 'active' || deviceState?.isActivated ? 'active' : 'pending';

    const maxOfflineHours = licenseState?.license?.max_offline_hours || 168; // Default 7 days
    const graceExpiry = new Date(Date.now() + maxOfflineHours * 3600 * 1000).toISOString();

    const record: OfflineCredentialRecord = {
      id: `${client.id}:${authUser.id}`,
      auth_user_id: authUser.id,
      client_user_id: clientUser.id,
      client_id: client.id,
      client_code: client.client_code || '',
      business_name: client.business_name,
      email: (authUser.email || clientUser.email || '').toLowerCase(),
      name: clientUser.name,
      phone: clientUser.phone,
      role: clientUser.role,
      permissions: clientUser.custom_permissions || [],
      device_id: deviceId,
      device_fingerprint: deviceFp,
      device_authorization: deviceAuth,
      license_id: licenseState?.license?.id || `lic_${client.id}`,
      license_key: licenseState?.license?.license_key || '',
      license_status: licenseState?.effectiveLicenseStatus || client.status || 'active',
      license_expiry: licenseState?.license?.expiry_date || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      offline_grace_expiry: graceExpiry,
      password_verifier: verifier,
      created_at: new Date().toISOString(),
      last_online_login_at: new Date().toISOString(),
    };

    // Save offline credential in IndexedDB & LocalStorage
    await offlineStorage.saveOfflineCredential(record);

    // Save Auth Snapshot for offline device verification
    const snapshotBase = {
      client_id: client.id,
      client_code: client.client_code || '',
      client_name: client.business_name || '',
      client_user_id: clientUser.id,
      user_role: clientUser.role,
      permissions: clientUser.custom_permissions || [],
      device_id: deviceId,
      device_fingerprint: deviceFp,
      device_authorization_status: deviceAuth,
      license_id: record.license_id,
      license_key: record.license_key,
      license_status: record.license_status,
      license_expiry: record.license_expiry,
      max_offline_hours: maxOfflineHours,
      created_at: record.created_at,
      last_validated_at: new Date().toISOString(),
      offline_grace_expiry: graceExpiry,
    };
    const checksum = offlineStorage.computeAuthSnapshotChecksum(snapshotBase);
    await offlineStorage.saveAuthSnapshot({
      ...snapshotBase,
      checksum,
    });

    // Save Cached Client
    await offlineStorage.saveCachedClient(client);

    // Cache License validation
    await offlineStorage.cacheLicenseValidation({
      clientId: client.id,
      licenseId: record.license_id,
      licenseKey: record.license_key || 'ONLINE_VERIFIED',
      deviceFingerprint: deviceFp,
      status: 'active',
      maxOfflineHours,
    });
  } catch (err) {
    console.warn('Could not persist offline auth record:', err);
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
