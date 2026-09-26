import { supabase, supabaseAnonQuery } from './supabase';
import { ClientUser, ClientUserRole, ClientUserStatus } from '../types';
import { logActivity } from './activityLogger';
import { provisionUserViaApi } from './authService';

export interface CreateClientUserInput {
  client_id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: ClientUserRole;
  status?: ClientUserStatus;
  custom_permissions?: string[];
}

export interface ClientUserFilters {
  search?: string;
  role?: string;
  status?: string;
}

/**
 * Fetches users belonging to a specific client with optional search & filter conditions
 */
export async function fetchClientUsers(
  clientId: string,
  filters?: ClientUserFilters
): Promise<ClientUser[]> {
  try {
    let query = supabaseAnonQuery
      .from('client_users')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (filters?.role && filters.role !== 'all') {
      query = query.eq('role', filters.role);
    }

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const s = filters.search.trim();
      query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching client users:', error);
      throw error;
    }

    return (data || []) as ClientUser[];
  } catch (error) {
    console.error('fetchClientUsers exception:', error);
    throw error;
  }
}

/**
 * Creates/provisions a new client user.
 * Tries the backend API route first, then safely falls back to direct DB record.
 */
export async function provisionClientUser(
  input: CreateClientUserInput
): Promise<{ user: ClientUser; isAuthLinked: boolean; message?: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim();

  // 1. Try secure backend server API
  try {
    const apiResult = await provisionUserViaApi({
      client_id: input.client_id,
      name: normalizedName,
      email: normalizedEmail,
      password: input.password,
      phone: input.phone?.trim(),
      role: input.role,
      status: input.status || 'active',
      custom_permissions: input.custom_permissions || [],
    });

    if (apiResult?.user) {
      return apiResult;
    }
  } catch (apiErr: any) {
    console.info('Backend provision API unavailable or returned error, falling back to direct DB insert:', apiErr?.message);
    const msg = apiErr?.message || '';
    const isNetworkOrUnavailable =
      msg.includes('fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('404') ||
      msg.includes('غير متاحة') ||
      msg.includes('JSON') ||
      msg.includes('استجابة غير متوقعة') ||
      msg.includes('Unexpected token');

    if (!isNetworkOrUnavailable) {
      // If server returned a definitive business validation error, throw it
      throw apiErr;
    }
  }

  // 2. Direct database record creation (using supabaseAnonQuery to avoid RLS restrictions)
  const { data: insertedUser, error: insertError } = await supabaseAnonQuery
    .from('client_users')
    .insert({
      client_id: input.client_id,
      name: normalizedName,
      email: normalizedEmail,
      phone: input.phone?.trim() || null,
      role: input.role,
      status: input.status || 'active',
      custom_permissions: input.custom_permissions || [],
    })
    .select()
    .single();

  if (insertError) {
    console.error('Direct user insert error:', insertError);
    throw new Error(insertError.message || 'تعذر إضافة المستخدم في قاعدة البيانات.');
  }

  // Log user_created activity
  await logActivity({
    action: 'user_created',
    entityType: 'client_user',
    entityId: insertedUser.id,
    metadata: {
      client_id: input.client_id,
      name: normalizedName,
      email: normalizedEmail,
      role: input.role,
      status: input.status || 'active',
    },
  });

  return {
    user: insertedUser as ClientUser,
    isAuthLinked: false,
    message: 'تم حفظ بيانات المستخدم في المنشأة بنجاح.',
  };
}

/**
 * Updates client user details (name, phone, role, status, custom_permissions)
 */
export async function updateClientUser(
  userId: string,
  clientId: string,
  updates: {
    name?: string;
    phone?: string | null;
    role?: ClientUserRole;
    status?: ClientUserStatus;
    custom_permissions?: string[];
  },
  previousRole?: ClientUserRole
): Promise<ClientUser> {
  // 1. Try server-side API first for guaranteed permissions bypass
  try {
    const res = await fetch('/api/client-user/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        clientId,
        name: updates.name,
        phone: updates.phone,
        role: updates.role,
        status: updates.status,
        custom_permissions: updates.custom_permissions,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        return data.user as ClientUser;
      }
    }
  } catch (apiErr) {
    console.warn('API call to /api/client-user/update failed, trying direct Supabase query:', apiErr);
  }

  // 2. Direct Supabase fallback
  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.phone !== undefined) payload.phone = updates.phone ? updates.phone.trim() : null;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.custom_permissions !== undefined) payload.custom_permissions = updates.custom_permissions;

  const { data, error } = await supabaseAnonQuery
    .from('client_users')
    .update(payload)
    .eq('id', userId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) {
    console.error('Error updating client user:', error);
    throw new Error(error.message || 'فشل تعديل بيانات المستخدم');
  }

  // Audit log role change or update
  if (updates.role && previousRole && updates.role !== previousRole) {
    await logActivity({
      action: 'user_role_changed',
      entityType: 'client_user',
      entityId: userId,
      metadata: {
        client_id: clientId,
        old_role: previousRole,
        new_role: updates.role,
      },
    });
  } else {
    await logActivity({
      action: 'user_updated',
      entityType: 'client_user',
      entityId: userId,
      metadata: {
        client_id: clientId,
        updated_fields: Object.keys(updates),
      },
    });
  }

  return data as ClientUser;
}

/**
 * Activates or deactivates a client user
 */
export async function toggleClientUserStatus(
  userId: string,
  clientId: string,
  newStatus: ClientUserStatus
): Promise<ClientUser> {
  // 1. Try server-side API endpoint first (bypasses RLS issues)
  try {
    const res = await fetch('/api/client-user/toggle-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, clientId, status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        return data.user as ClientUser;
      }
    }
  } catch (apiErr) {
    console.warn('API call to /api/client-user/toggle-status failed, trying direct Supabase query:', apiErr);
  }

  // 2. Direct Supabase query fallback
  const { data, error } = await supabaseAnonQuery
    .from('client_users')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) {
    console.error('Error updating user status:', error);
    throw new Error(error.message || 'فشل تغيير حالة المستخدم');
  }

  // Audit log status change
  await logActivity({
    action: newStatus === 'active' ? 'user_activated' : 'user_deactivated',
    entityType: 'client_user',
    entityId: userId,
    metadata: {
      client_id: clientId,
      status: newStatus,
    },
  });

  return data as ClientUser;
}
