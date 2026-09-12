import { supabase } from './supabase';
import { ClientUser, ClientUserRole, ClientUserStatus } from '../types';
import { logActivity } from './activityLogger';

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
    let query = supabase
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
 * Tries the secure Edge Function first, then safely falls back to standard authorized DB record.
 */
export async function provisionClientUser(
  input: CreateClientUserInput
): Promise<{ user: ClientUser; isAuthLinked: boolean; message?: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim();

  // 1. Try secure Supabase Edge Function
  if (input.password && input.password.length >= 6) {
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
        'provision-client-user',
        {
          body: {
            client_id: input.client_id,
            name: normalizedName,
            email: normalizedEmail,
            password: input.password,
            phone: input.phone?.trim() || null,
            role: input.role,
            status: input.status || 'active',
            custom_permissions: input.custom_permissions || [],
          },
        }
      );

      if (!edgeError && edgeData?.user) {
        return {
          user: edgeData.user as ClientUser,
          isAuthLinked: true,
          message: 'تم إنشاء المستخدم وحساب الدخول بنجاح عبر الخادم الآمن.',
        };
      }

      if (edgeError && !edgeError.message?.includes('Failed to send') && !edgeError.message?.includes('404')) {
        // Known business error from Edge Function (e.g. Email exists or forbidden)
        throw new Error(edgeData?.error || edgeError.message);
      }
    } catch (edgeCallErr: any) {
      // If error is explicit business validation, bubble it up
      if (edgeCallErr.message && !edgeCallErr.message.includes('Failed to send') && !edgeCallErr.message.includes('FunctionsFetchError')) {
        throw edgeCallErr;
      }
      console.info('Edge function offline or not yet deployed. Using secure database provisioning.');
    }
  }

  // 2. Direct database record creation (Compliant with RLS)
  const { data: insertedUser, error: insertError } = await supabase
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
 * Updates client user details (name, phone, role, custom_permissions)
 */
export async function updateClientUser(
  userId: string,
  clientId: string,
  updates: {
    name?: string;
    phone?: string | null;
    role?: ClientUserRole;
    custom_permissions?: string[];
  },
  previousRole?: ClientUserRole
): Promise<ClientUser> {
  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.phone !== undefined) payload.phone = updates.phone ? updates.phone.trim() : null;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.custom_permissions !== undefined) payload.custom_permissions = updates.custom_permissions;

  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
