import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

// Privileged Supabase client for administrative operations
const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Standard client for password authentication
const supabaseAuth = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    configured: Boolean(supabaseUrl && supabaseKey),
    time: new Date().toISOString(),
  });
});

// Server-side login proxy: Prevents browser ad-blockers / CORS issues from causing "Failed to fetch"
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. First attempt direct Supabase authentication
    let authResult = await supabaseAuth.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // 2. If login failed with invalid credentials, check if this is an existing super admin or client user needing auto-provisioning
    if (authResult.error) {
      // 2a. Priority Check: Super Admin Users
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
        // 2b. Check if user exists in client_users or clients
        const { data: clientUser } = await supabaseAdmin
          .from('client_users')
          .select('*')
          .eq('email', normalizedEmail)
          .maybeSingle();

        const { data: clientRecord } = await supabaseAdmin
          .from('clients')
          .select('*')
          .eq('email', normalizedEmail)
          .maybeSingle();

        if (clientUser || clientRecord) {
          // Find if an auth user already exists
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          let authUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === normalizedEmail
          );

          const clientId = clientUser?.client_id || clientRecord?.id;
          const userName = clientUser?.name || clientRecord?.owner_name || clientRecord?.customer_name || 'العميل';

          if (!authUser) {
            // Create auth user with provided password
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
            // If first-time login / setup, sync password
            await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
              password,
            });
          }

          if (authUser && clientId) {
            // Ensure client_users has an entry linked to auth_user_id
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

            // Retry sign-in with the synced password
            authResult = await supabaseAuth.auth.signInWithPassword({
              email: normalizedEmail,
              password,
            });
          }
        }
      }
    }

    if (authResult.error) {
      return res.status(401).json({
        error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
        details: authResult.error.message,
      });
    }

    const { session, user } = authResult.data;

    // Update last_login_at in super_admin_users OR client_users
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
          .or(`auth_user_id.eq.${user.id},email.eq.${normalizedEmail}`);
      }
    }

    return res.json({
      success: true,
      session,
      user,
    });
  } catch (error: any) {
    console.error('Server /api/auth/login error:', error);
    return res.status(500).json({
      error: 'حدث خطأ في الخادم أثناء تسجيل الدخول.',
      message: error.message,
    });
  }
});

// Server-side client user provisioning: Direct, secure creation without relying on undeployed Edge Functions
app.post('/api/auth/provision-user', async (req, res) => {
  try {
    const {
      client_id,
      name,
      email,
      password,
      phone,
      role = 'cashier',
      status = 'active',
      custom_permissions = [],
    } = req.body;

    if (!client_id || !name || !email) {
      return res.status(400).json({
        error: 'البيانات غير مكتملة (اسم المستخدم، البريد، ومعرف العميل مطلوبة)',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    let authUserId: string | null = null;

    // Create auth user if password provided
    if (password && password.length >= 6) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (existing) {
        authUserId = existing.id;
        // Update password
        await supabaseAdmin.auth.admin.updateUserById(authUserId, { password });
      } else {
        const { data: newAuth, error: authErr } =
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

        if (authErr) {
          console.warn('Auth user creation warning:', authErr);
        } else if (newAuth?.user) {
          authUserId = newAuth.user.id;
        }
      }
    }

    // Check if client_users row already exists
    const { data: existingUser } = await supabaseAdmin
      .from('client_users')
      .select('*')
      .eq('client_id', client_id)
      .eq('email', normalizedEmail)
      .maybeSingle();

    let savedUser;

    if (existingUser) {
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('client_users')
        .update({
          name: normalizedName,
          phone: phone?.trim() || null,
          role,
          status,
          custom_permissions,
          ...(authUserId ? { auth_user_id: authUserId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      savedUser = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('client_users')
        .insert({
          client_id,
          auth_user_id: authUserId,
          name: normalizedName,
          email: normalizedEmail,
          phone: phone?.trim() || null,
          role,
          status,
          custom_permissions,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      savedUser = inserted;
    }

    // Audit log
    try {
      await supabaseAdmin.from('activity_logs').insert({
        actor_type: 'super_admin',
        action: 'user_created',
        entity_type: 'client_user',
        entity_id: savedUser.id,
        metadata: {
          client_id,
          name: normalizedName,
          email: normalizedEmail,
          role,
          has_auth: Boolean(authUserId),
        },
      });
    } catch (logErr) {
      console.warn('Activity log warning:', logErr);
    }

    return res.json({
      success: true,
      user: savedUser,
      isAuthLinked: Boolean(authUserId),
      message: 'تم إنشاء وربط حساب المستخدم بنجاح.',
    });
  } catch (error: any) {
    console.error('Provision user error:', error);
    return res.status(500).json({
      error: error.message || 'تعذر إنشاء حساب المستخدم',
    });
  }
});

// Auto-sync client owner endpoint
app.post('/api/auth/sync-client-owner', async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientErr || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!client.email) {
      return res.status(400).json({ error: 'Client has no email configured' });
    }

    const normalizedEmail = client.email.trim().toLowerCase();
    const ownerName = client.owner_name || client.customer_name || 'مالك المنشأة';

    // 1. Ensure Auth User exists
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    let authUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (!authUser) {
      const { data: created, error: cErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password: 'Password123!',
          email_confirm: true,
          user_metadata: {
            name: ownerName,
            role: 'owner',
            client_id,
          },
        });
      if (cErr) throw cErr;
      authUser = created.user;
    }

    // 2. Ensure client_users row exists
    const { data: existingCU } = await supabaseAdmin
      .from('client_users')
      .select('*')
      .eq('client_id', client_id)
      .eq('email', normalizedEmail)
      .maybeSingle();

    let clientUserRecord;
    if (!existingCU) {
      const { data: newCU, error: cuErr } = await supabaseAdmin
        .from('client_users')
        .insert({
          client_id,
          auth_user_id: authUser?.id || null,
          name: ownerName,
          email: normalizedEmail,
          phone: client.phone || null,
          role: 'owner',
          status: 'active',
          custom_permissions: ['all'],
        })
        .select()
        .single();
      if (cuErr) throw cuErr;
      clientUserRecord = newCU;
    } else {
      if (!existingCU.auth_user_id && authUser) {
        const { data: updated } = await supabaseAdmin
          .from('client_users')
          .update({ auth_user_id: authUser.id })
          .eq('id', existingCU.id)
          .select()
          .single();
        clientUserRecord = updated || existingCU;
      } else {
        clientUserRecord = existingCU;
      }
    }

    return res.json({
      success: true,
      clientUser: clientUserRecord,
      authUser: authUser ? { id: authUser.id, email: authUser.email } : null,
    });
  } catch (err: any) {
    console.error('Sync client owner error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Start the Express server with Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ordexa POS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
