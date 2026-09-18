import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://xtfzgootudafgdwoxsnf.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Znpnb290dWRhZmdkd294c25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODk2MzA5OSwiZXhwIjoyMTA0NTM5MDk5fQ.zHYczV8V_ymlwyXGK2JeCY4_QD2VfnCVDKe6Hjnpgds';

const supabaseUrl = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function authenticateCaller(authHeader: string | undefined): Promise<{
  isSuperAdmin: boolean;
  clientUser: any | null;
  authUserId: string;
} | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) return null;

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return null;

  const userEmail = user.email ? user.email.toLowerCase() : '';

  // Check Super Admin
  const { data: superAdminRecord } = await supabaseAdmin
    .from('super_admin_users')
    .select('id, role, status')
    .or(`id.eq.${user.id},email.ilike.${userEmail}`)
    .eq('status', 'active')
    .maybeSingle();

  if (superAdminRecord) {
    return { isSuperAdmin: true, clientUser: null, authUserId: user.id };
  }

  // Check Client User
  const { data: clientUserRecord } = await supabaseAdmin
    .from('client_users')
    .select('id, client_id, auth_user_id, role, status, custom_permissions')
    .or(`auth_user_id.eq.${user.id},email.ilike.${userEmail}`)
    .maybeSingle();

  if (clientUserRecord && clientUserRecord.status === 'active') {
    return { isSuperAdmin: false, clientUser: clientUserRecord, authUserId: user.id };
  }

  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
    return;
  }

  try {
    const caller = await authenticateCaller(req.headers.authorization);
    if (!caller) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, error: 'غير مصرح: يلزم تسجيل الدخول كمسؤول لإجراء هذه العملية.' }));
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ success: false, error: 'صيغة البيانات غير صحيحة (Invalid JSON)' }));
        return;
      }
    } else if (!body && typeof req.on === 'function') {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const raw = Buffer.concat(buffers).toString('utf-8');
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ success: false, error: 'صيغة البيانات غير صحيحة (Invalid JSON)' }));
        return;
      }
    }

    const {
      client_id,
      name,
      email,
      password,
      phone,
      role = 'cashier',
      status = 'active',
      custom_permissions = [],
    } = body || {};

    if (!client_id || !name || !email) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        success: false,
        error: 'البيانات غير مكتملة (اسم المستخدم، البريد الإلكتروني، ومعرف المنشأة مطلوبة)',
      }));
      return;
    }

    if (!caller.isSuperAdmin) {
      if (caller.clientUser.client_id !== client_id) {
        res.statusCode = 403;
        res.end(JSON.stringify({
          success: false,
          error: 'ممنوع الوصول: لا يمكنك إنشاء أو تعديل مستخدمين تابعين لمنشأة أخرى.',
        }));
        return;
      }

      const userRole = caller.clientUser.role;
      const userPerms: string[] = caller.clientUser.custom_permissions || [];
      const hasStaffPermission =
        userRole === 'owner' ||
        userRole === 'admin' ||
        userPerms.includes('*') ||
        userPerms.includes('staff.*') ||
        userPerms.includes('staff.create') ||
        userPerms.includes('staff.edit') ||
        userPerms.includes('staff.manage');

      if (!hasStaffPermission) {
        res.statusCode = 403;
        res.end(JSON.stringify({
          success: false,
          error: 'ممنوع الوصول: لا تملك الصلاحيات الكافية لإدارة أو إضافة مستخدمين.',
        }));
        return;
      }

      if (role === 'owner' && userRole !== 'owner') {
        res.statusCode = 403;
        res.end(JSON.stringify({
          success: false,
          error: 'ممنوع الوصول: فقط مالك المنشأة يمكنه تعيين مستخدم كمالك.',
        }));
        return;
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();

    const { data: targetClient, error: clientFindErr } = await supabaseAdmin
      .from('clients')
      .select('id, business_name, customer_name, status')
      .eq('id', client_id)
      .maybeSingle();

    if (clientFindErr || !targetClient) {
      res.statusCode = 404;
      res.end(JSON.stringify({
        success: false,
        error: 'المنشأة المحددة غير موجودة (معرف العميل غير صالح).',
      }));
      return;
    }

    const { data: crossClientUser } = await supabaseAdmin
      .from('client_users')
      .select('id, client_id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (crossClientUser && crossClientUser.client_id !== client_id) {
      res.statusCode = 409;
      res.end(JSON.stringify({
        success: false,
        error: 'البريد الإلكتروني مسجل بالفعل لدى منشأة أخرى.',
      }));
      return;
    }

    let authUserId: string | null = null;

    if (password && password.length >= 6) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (existing) {
        authUserId = existing.id;
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password,
          user_metadata: {
            name: normalizedName,
            role,
            client_id,
          },
        });
      } else {
        const { data: newAuth, error: authCreateErr } =
          await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: {
              name: normalizedName,
              role,
              client_id,
            },
          });

        if (authCreateErr) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            success: false,
            error: 'تعذر إنشاء حساب المصادقة: ' + authCreateErr.message,
          }));
          return;
        }
        authUserId = newAuth.user?.id || null;
      }
    }

    const { data: existingUser } = await supabaseAdmin
      .from('client_users')
      .select('id')
      .eq('client_id', client_id)
      .ilike('email', normalizedEmail)
      .maybeSingle();

    let clientUserRecord;
    if (existingUser) {
      const updatePayload: Record<string, any> = {
        name: normalizedName,
        phone: phone || null,
        role,
        status,
        custom_permissions: custom_permissions || [],
      };
      if (authUserId) updatePayload.auth_user_id = authUserId;

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('client_users')
        .update(updatePayload)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateErr) {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: 'تعذر تحديث بيانات المستخدم: ' + updateErr.message }));
        return;
      }
      clientUserRecord = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('client_users')
        .insert({
          client_id,
          auth_user_id: authUserId,
          name: normalizedName,
          email: normalizedEmail,
          phone: phone || null,
          role,
          status,
          custom_permissions: custom_permissions || [],
        })
        .select()
        .single();

      if (insertErr) {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: 'تعذر إضافة المستخدم: ' + insertErr.message }));
        return;
      }
      clientUserRecord = inserted;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({
      success: true,
      message: 'تم حفظ وتفعيل حساب المستخدم بنجاح',
      user: clientUserRecord,
    }));
  } catch (err: any) {
    console.error('Provision user error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({
      success: false,
      error: 'حدث خطأ في الخادم أثناء حفظ المستخدم: ' + (err?.message || 'خطأ غير معروف'),
    }));
  }
}
