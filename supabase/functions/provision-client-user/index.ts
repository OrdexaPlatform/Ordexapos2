// Supabase Edge Function: provision-client-user
// Secure Server-side Client User Provisioning for Ordexa POS
// Follows strict Supabase Deno runtime guidelines

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Authenticate the caller using their Bearer JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Parse request payload
    const {
      client_id,
      name,
      email,
      password,
      phone,
      role = 'cashier',
      status = 'active',
      custom_permissions = []
    } = await req.json();

    if (!client_id || !name || !email || !password) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: client_id, name, email, and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Initialize Privileged Service Role Client (Never exposed to browser)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Verify caller authorization: Must be Super Admin OR (Owner/Admin of the specified client_id)
    const { data: superAdmin } = await adminClient
      .from('super_admin_users')
      .select('role, status')
      .eq('id', callerUser.id)
      .eq('status', 'active')
      .maybeSingle();

    const isSuperAdmin = !!superAdmin;

    if (!isSuperAdmin) {
      const { data: callerClientUser } = await adminClient
        .from('client_users')
        .select('role, status, client_id')
        .eq('auth_user_id', callerUser.id)
        .eq('status', 'active')
        .maybeSingle();

      if (
        !callerClientUser ||
        callerClientUser.client_id !== client_id ||
        !['owner', 'admin'].includes(callerClientUser.role)
      ) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: You do not have permission to provision users for this business' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Create the user in Supabase Auth securely
    const { data: newAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        role,
        client_id,
      },
    });

    if (createAuthError) {
      // If user already exists in auth.users, check if they can be linked to client_users
      if (createAuthError.message.includes('already registered')) {
        return new Response(
          JSON.stringify({ error: 'هذا البريد الإلكتروني مسجل بالفعل في النظام.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: createAuthError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authUserId = newAuthUser.user.id;

    // 6. Insert client_users record bound to client_id
    const { data: clientUserRecord, error: dbError } = await adminClient
      .from('client_users')
      .insert({
        client_id,
        auth_user_id: authUserId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        role,
        status,
        custom_permissions: custom_permissions || [],
      })
      .select()
      .single();

    if (dbError) {
      // Rollback auth user creation if db record fails to keep DB clean
      await adminClient.auth.admin.deleteUser(authUserId);
      return new Response(
        JSON.stringify({ error: dbError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Audit log user_created activity securely (without password)
    await adminClient.from('activity_logs').insert({
      actor_type: isSuperAdmin ? 'super_admin' : 'client_user',
      actor_id: callerUser.id,
      action: 'user_created',
      entity_type: 'client_user',
      entity_id: clientUserRecord.id,
      metadata: {
        client_id,
        created_user_id: clientUserRecord.id,
        email: clientUserRecord.email,
        name: clientUserRecord.name,
        role: clientUserRecord.role,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user: clientUserRecord,
        message: 'تم إنشاء وربط حساب المستخدم بنجاح',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
