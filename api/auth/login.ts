import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://xtfzgootudafgdwoxsnf.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Znpnb290dWRhZmdkd294c25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODk2MzA5OSwiZXhwIjoyMTA0NTM5MDk5fQ.zHYczV8V_ymlwyXGK2JeCY4_QD2VfnCVDKe6Hjnpgds';

const supabaseUrl = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default async function handler(req: any, res: any) {
  // Always return JSON
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
      // Stream buffer fallback
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

    const { email: rawIdentifier, password } = body || {};
    if (!rawIdentifier || !password) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, error: 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم وكلمة المرور' }));
      return;
    }

    let normalizedEmail = String(rawIdentifier).trim().toLowerCase();

    // 1. Resolve username/name/phone if input is not an email
    if (!normalizedEmail.includes('@')) {
      const trimmedId = String(rawIdentifier).trim();

      // Check super_admin_users
      const { data: saExact } = await supabaseAdmin
        .from('super_admin_users')
        .select('email')
        .ilike('name', trimmedId)
        .limit(1);

      if (saExact && saExact.length > 0 && saExact[0].email) {
        normalizedEmail = saExact[0].email.toLowerCase();
      } else {
        const { data: saPartial } = await supabaseAdmin
          .from('super_admin_users')
          .select('email')
          .ilike('name', `%${trimmedId}%`)
          .limit(1);

        if (saPartial && saPartial.length > 0 && saPartial[0].email) {
          normalizedEmail = saPartial[0].email.toLowerCase();
        } else {
          // Check client_users exact
          const { data: cuExact } = await supabaseAdmin
            .from('client_users')
            .select('email')
            .or(`name.ilike.${trimmedId},phone.eq.${trimmedId}`)
            .limit(1);

          if (cuExact && cuExact.length > 0 && cuExact[0].email) {
            normalizedEmail = cuExact[0].email.toLowerCase();
          } else {
            // Check client_users partial
            const { data: cuPartial } = await supabaseAdmin
              .from('client_users')
              .select('email')
              .ilike('name', `%${trimmedId}%`)
              .limit(1);

            if (cuPartial && cuPartial.length > 0 && cuPartial[0].email) {
              normalizedEmail = cuPartial[0].email.toLowerCase();
            } else {
              // Check clients exact
              const { data: clExact } = await supabaseAdmin
                .from('clients')
                .select('email')
                .or(`owner_name.ilike.${trimmedId},customer_name.ilike.${trimmedId},phone.eq.${trimmedId}`)
                .limit(1);

              if (clExact && clExact.length > 0 && clExact[0].email) {
                normalizedEmail = clExact[0].email.toLowerCase();
              } else {
                // Check clients partial
                const { data: clPartial } = await supabaseAdmin
                  .from('clients')
                  .select('email')
                  .or(`owner_name.ilike.%${trimmedId}%,customer_name.ilike.%${trimmedId}%`)
                  .limit(1);

                if (clPartial && clPartial.length > 0 && clPartial[0].email) {
                  normalizedEmail = clPartial[0].email.toLowerCase();
                }
              }
            }
          }
        }
      }
    }

    // 2. Direct Supabase authentication
    let authResult = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // 3. Fallback auto-sync for existing users
    if (authResult.error) {
      // 3a. Super Admin
      const { data: superAdminRecord } = await supabaseAdmin
        .from('super_admin_users')
        .select('*')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (superAdminRecord && superAdminRecord.status === 'active') {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        let authUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );

        if (!authUser) {
          const { data: createdAuth, error: createAuthErr } =
            await supabaseAdmin.auth.admin.createUser({
              email: normalizedEmail,
              password,
              email_confirm: true,
              user_metadata: {
                name: superAdminRecord.name || 'Super Admin',
                role: 'super_admin',
              },
            });

          if (!createAuthErr && createdAuth?.user) {
            authUser = createdAuth.user;
          }
        } else {
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            password,
          });
        }

        if (authUser) {
          if (superAdminRecord.id !== authUser.id) {
            await supabaseAdmin
              .from('super_admin_users')
              .update({ id: authUser.id, last_login_at: new Date().toISOString() })
              .eq('id', superAdminRecord.id);
          }

          authResult = await supabaseAuth.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
        }
      } else {
        // 3b. Client Users or Clients
        const { data: clientUser } = await supabaseAdmin
          .from('client_users')
          .select('*')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        const { data: clientRecord } = await supabaseAdmin
          .from('clients')
          .select('*')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (clientUser || clientRecord) {
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          let authUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === normalizedEmail
          );

          const clientId = clientUser?.client_id || clientRecord?.id;
          const userName = clientUser?.name || clientRecord?.owner_name || clientRecord?.customer_name || 'العميل';

          if (!authUser) {
            const { data: createdAuth, error: createAuthErr } =
              await supabaseAdmin.auth.admin.createUser({
                email: normalizedEmail,
                password,
                email_confirm: true,
                user_metadata: {
                  name: userName,
                  role: clientUser?.role || 'owner',
                  client_id: clientId,
                },
              });

            if (!createAuthErr && createdAuth?.user) {
              authUser = createdAuth.user;
            }
          } else if (!clientUser || clientUser.last_login_at === null) {
            await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
              password,
            });
          }

          if (authUser && clientId) {
            if (!clientUser) {
              await supabaseAdmin.from('client_users').insert({
                client_id: clientId,
                auth_user_id: authUser.id,
                name: userName,
                email: normalizedEmail,
                phone: clientRecord?.phone || null,
                role: 'owner',
                status: 'active',
                custom_permissions: ['all'],
              });
            } else if (!clientUser.auth_user_id) {
              await supabaseAdmin
                .from('client_users')
                .update({ auth_user_id: authUser.id })
                .eq('id', clientUser.id);
            }

            authResult = await supabaseAuth.auth.signInWithPassword({
              email: normalizedEmail,
              password,
            });
          }
        }
      }
    }

    if (authResult.error) {
      res.statusCode = 401;
      res.end(
        JSON.stringify({
          success: false,
          error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
          details: authResult.error.message,
        })
      );
      return;
    }

    const { session, user } = authResult.data;

    if (user) {
      const { data: superAdmin } = await supabaseAdmin
        .from('super_admin_users')
        .select('id')
        .or(`id.eq.${user.id},email.ilike.${normalizedEmail}`)
        .maybeSingle();

      if (superAdmin) {
        await supabaseAdmin
          .from('super_admin_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', superAdmin.id);
      } else {
        await supabaseAdmin
          .from('client_users')
          .update({ last_login_at: new Date().toISOString() })
          .or(`auth_user_id.eq.${user.id},email.ilike.${normalizedEmail}`);
      }
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        success: true,
        session,
        user,
      })
    );
  } catch (error: any) {
    console.error('API /api/auth/login error:', error);
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        success: false,
        error: 'حدث خطأ في الخادم أثناء تسجيل الدخول.',
        message: error?.message,
      })
    );
  }
}
