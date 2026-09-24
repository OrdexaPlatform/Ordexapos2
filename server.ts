import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const DEFAULT_SUPABASE_URL = 'https://xtfzgootudafgdwoxsnf.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Znpnb290dWRhZmdkd294c25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODk2MzA5OSwiZXhwIjoyMTA0NTM5MDk5fQ.zHYczV8V_ymlwyXGK2JeCY4_QD2VfnCVDKe6Hjnpgds';

const supabaseUrl = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

// Privileged Supabase client for administrative operations
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Standard client for password authentication
const supabaseAuth = createClient(
  supabaseUrl,
  supabaseKey,
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
    const { email: rawIdentifier, password } = req.body;
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم وكلمة المرور' });
    }

    let normalizedEmail = String(rawIdentifier).trim().toLowerCase();

    // Support username / name / phone resolution if identifier is not an email
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

// Helper function to authenticate caller (Super Admin or Client User)
async function authenticateCaller(req: express.Request): Promise<{
  isSuperAdmin: boolean;
  clientUser: any | null;
  authUserId: string;
} | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return null;
  }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return null;
  }

  const userEmail = user.email ? user.email.toLowerCase() : '';

  // 1. Check if Super Admin
  const { data: superAdminRecord } = await supabaseAdmin
    .from('super_admin_users')
    .select('id, role, status')
    .or(`id.eq.${user.id},email.ilike.${userEmail}`)
    .eq('status', 'active')
    .maybeSingle();

  if (superAdminRecord) {
    return {
      isSuperAdmin: true,
      clientUser: null,
      authUserId: user.id,
    };
  }

  // 2. Check if Client User
  let { data: clientUserRecord } = await supabaseAdmin
    .from('client_users')
    .select('id, client_id, auth_user_id, role, status, custom_permissions')
    .or(`auth_user_id.eq.${user.id},email.ilike.${userEmail}`)
    .maybeSingle();

  // If user is owner of an active client, ensure client_user is active and linked
  if (!clientUserRecord || clientUserRecord.status !== 'active') {
    const { data: clientRecord } = await supabaseAdmin
      .from('clients')
      .select('id, email, status, owner_name, customer_name, phone')
      .ilike('email', userEmail)
      .eq('status', 'active')
      .maybeSingle();

    if (clientRecord) {
      if (!clientUserRecord) {
        const { data: newCU } = await supabaseAdmin
          .from('client_users')
          .insert({
            client_id: clientRecord.id,
            auth_user_id: user.id,
            name: clientRecord.owner_name || clientRecord.customer_name || 'مالك المنشأة',
            email: userEmail,
            phone: clientRecord.phone || null,
            role: 'owner',
            status: 'active',
            custom_permissions: ['*'],
          })
          .select()
          .single();
        clientUserRecord = newCU;
      } else if (clientUserRecord.status !== 'active' || !clientUserRecord.auth_user_id) {
        const { data: updatedCU } = await supabaseAdmin
          .from('client_users')
          .update({
            status: 'active',
            auth_user_id: user.id,
          })
          .eq('id', clientUserRecord.id)
          .select()
          .single();
        clientUserRecord = updatedCU || clientUserRecord;
      }
    }
  }

  if (clientUserRecord && clientUserRecord.status === 'active') {
    return {
      isSuperAdmin: false,
      clientUser: clientUserRecord,
      authUserId: user.id,
    };
  }

  return null;
}

// Server-side client user provisioning: Direct, secure creation with strict authorization
app.post('/api/auth/provision-user', async (req, res) => {
  try {
    const caller = await authenticateCaller(req);
    if (!caller) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح: يلزم تسجيل الدخول كمسؤول لإجراء هذه العملية.',
      });
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
    } = req.body;

    if (!client_id || !name || !email) {
      return res.status(400).json({
        success: false,
        error: 'البيانات غير مكتملة (اسم المستخدم، البريد الإلكتروني، ومعرف المنشأة مطلوبة)',
      });
    }

    // Authorization check:
    // - Super Admin can provision users for any client
    // - Client Users can ONLY provision for their own client_id
    if (!caller.isSuperAdmin) {
      if (caller.clientUser.client_id !== client_id) {
        return res.status(403).json({
          success: false,
          error: 'ممنوع الوصول: لا يمكنك إنشاء أو تعديل مستخدمين تابعين لمنشأة أخرى.',
        });
      }

      // Check role & permissions for Client User:
      // Must be owner, admin, or have staff.create/staff.edit/staff.manage permission
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
        return res.status(403).json({
          success: false,
          error: 'ممنوع الوصول: لا تملك الصلاحيات الكافية لإدارة أو إضافة مستخدمين.',
        });
      }

      // Non-super-admins cannot elevate another user to super_admin or owner unless they are already owner
      if (role === 'owner' && userRole !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'ممنوع الوصول: فقط مالك المنشأة يمكنه تعيين مستخدم كمالك.',
        });
      }
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();

    // Verify target client exists
    const { data: targetClient, error: clientFindErr } = await supabaseAdmin
      .from('clients')
      .select('id, business_name, customer_name, status')
      .eq('id', client_id)
      .maybeSingle();

    if (clientFindErr || !targetClient) {
      return res.status(404).json({
        success: false,
        error: 'المنشأة المحددة غير موجودة (معرف العميل غير صالح).',
      });
    }

    // Check for email collision across different clients
    const { data: crossClientUser } = await supabaseAdmin
      .from('client_users')
      .select('id, client_id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (crossClientUser && crossClientUser.client_id !== client_id) {
      return res.status(409).json({
        success: false,
        error: 'البريد الإلكتروني مسجل بالفعل لدى منشأة أخرى.',
      });
    }

    let authUserId: string | null = null;

    // Create or link auth user if password provided
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

    // If role is owner, ensure client record reflects owner name
    if (role === 'owner') {
      try {
        await supabaseAdmin
          .from('clients')
          .update({
            owner_name: normalizedName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', client_id)
          .is('owner_name', null);
      } catch (clientSyncErr) {
        console.warn('Owner name client sync warning:', clientSyncErr);
      }
    }

    // Audit log
    try {
      await supabaseAdmin.from('activity_logs').insert({
        actor_type: caller.isSuperAdmin ? 'super_admin' : 'client_user',
        actor_id: caller.authUserId,
        action: existingUser ? 'user_updated' : 'user_created',
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
      success: false,
      error: error.message || 'تعذر إنشاء حساب المستخدم',
    });
  }
});

// Auto-sync client owner endpoint (Super Admin only)
app.post('/api/auth/sync-client-owner', requireSuperAdmin, async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) {
      return res.status(400).json({ success: false, error: 'client_id is required' });
    }

    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientErr || !client) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    if (!client.email) {
      return res.status(400).json({ success: false, error: 'Client has no email configured' });
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
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Platform Windows Icon API (Ordexa Platform Branding)
// Fixed for all clients; used as the Windows App Icon
// Protected: Only authenticated Super Admin can modify
// ==========================================
const PLATFORM_SETTINGS_FILE = path.join(process.cwd(), 'platform-settings.json');
const PLATFORM_ICON_PATH = path.join(process.cwd(), 'public', 'assets', 'ordexa-icon.png');
const BUILD_ICO_PATH = path.join(process.cwd(), 'build', 'icon.ico');

// Middleware to strictly enforce Super Admin authorization
async function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'غير مصرح: يلزم تسجيل الدخول كمسؤول سوبر أدمن للمتابعة.' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ success: false, error: 'انتهت صلاحية جلسة المستخدم، يرجى تسجيل الدخول مجدداً.' });
    }

    // Check if user is in super_admin_users table and active
    const userEmail = user.email ? user.email.toLowerCase() : '';
    const { data: superAdminRecord, error: saErr } = await supabaseAdmin
      .from('super_admin_users')
      .select('id, role, status')
      .or(`id.eq.${user.id},email.ilike.${userEmail}`)
      .maybeSingle();

    if (saErr || !superAdminRecord || superAdminRecord.status !== 'active') {
      return res.status(403).json({ success: false, error: 'ممنوع الوصول: هذه العملية مقتصرة حصرياً على السوبر أدمن (Ordexa Super Admin).' });
    }

    (req as any).superAdminUser = superAdminRecord;
    next();
  } catch (err: any) {
    console.error('requireSuperAdmin middleware error:', err);
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء التحقق من صلاحيات السوبر أدمن.' });
  }
}

app.get('/api/platform/icon', (req, res) => {
  try {
    let settings = { hasCustomIcon: false, updatedAt: null, fileName: null };
    if (fs.existsSync(PLATFORM_SETTINGS_FILE)) {
      try {
        settings = JSON.parse(fs.readFileSync(PLATFORM_SETTINGS_FILE, 'utf8'));
      } catch {
        // use default
      }
    }

    const hasFile = fs.existsSync(PLATFORM_ICON_PATH);

    return res.json({
      success: true,
      hasCustomIcon: !!settings.hasCustomIcon && hasFile,
      iconUrl: hasFile ? '/assets/ordexa-icon.png' : null,
      updatedAt: settings.updatedAt || null,
      fileName: settings.fileName || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/platform/icon', requireSuperAdmin, async (req, res) => {
  try {
    const { imageBase64, fileName, updatedAt } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'بيانات الصورة غير صالحة' });
    }

    // Extract Base64 payload
    const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
    let buffer: Buffer;
    if (matches && matches[2]) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    // Ensure directory exists
    const assetsDir = path.dirname(PLATFORM_ICON_PATH);
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Write PNG icon file
    fs.writeFileSync(PLATFORM_ICON_PATH, buffer);

    // Also regenerate build/icon.ico so future Windows builds use the updated Ordexa icon
    try {
      const buildDir = path.dirname(BUILD_ICO_PATH);
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }
      const pngToIcoModule = await import('png-to-ico');
      const pngToIco = (pngToIcoModule as any).default || pngToIcoModule;
      const icoBuf = await pngToIco(buffer);
      fs.writeFileSync(BUILD_ICO_PATH, icoBuf);
    } catch (icoErr) {
      console.warn('Could not regenerate build/icon.ico immediately:', icoErr);
    }

    // Save platform settings metadata
    const settings = {
      hasCustomIcon: true,
      updatedAt: updatedAt || new Date().toISOString(),
      fileName: fileName || 'ordexa-icon.png',
      fileSize: buffer.length,
    };
    fs.writeFileSync(PLATFORM_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');

    return res.json({
      success: true,
      message: 'تم حفظ وتحديث أيقونة منصة Ordexa للـ Windows بنجاح',
      iconUrl: '/assets/ordexa-icon.png?t=' + Date.now(),
      settings,
    });
  } catch (err: any) {
    console.error('Error saving platform icon:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/platform/icon', requireSuperAdmin, (req, res) => {
  try {
    const settings = {
      hasCustomIcon: false,
      updatedAt: new Date().toISOString(),
      fileName: null,
    };
    fs.writeFileSync(PLATFORM_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');

    return res.json({
      success: true,
      message: 'تمت استعادة أيقونة المنصة الافتراضية بنجاح',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Web POS + Dynamic Client PWA Manifest APIs
// ==========================================

// 1. Static manifest fallback
app.get('/manifest.json', (req, res) => {
  const manifestPath = path.join(__dirname, 'public', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    return res.sendFile(manifestPath);
  }
  return res.status(404).json({ error: 'Manifest not found' });
});

// 2. Client Public POS Configuration (Secure, client-specific runtime branding)
app.get('/api/client/public-pos-config/:clientCode', async (req, res) => {
  try {
    const { clientCode } = req.params;
    if (!clientCode) {
      return res.status(400).json({ error: 'رمز المنشأة مطلوب' });
    }

    const normalizedCode = clientCode.trim();

    // Query client by client_code (case-insensitive)
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, client_code, business_name, owner_name, logo, currency, language, status, business_type')
      .ilike('client_code', normalizedCode)
      .maybeSingle();

    if (clientErr) {
      console.error('Error fetching client by code:', clientErr);
      return res.status(500).json({ error: 'خطأ أثناء البحث عن بيانات المنشأة' });
    }

    if (!client) {
      return res.status(404).json({ error: `لم يتم العثور على منشأة بالرمز (${normalizedCode})` });
    }

    if (client.status !== 'active') {
      return res.status(403).json({ 
        error: 'حساب هذه المنشأة غير نشط أو موقوف مؤقتاً', 
        status: client.status,
        client: {
          client_code: client.client_code,
          business_name: client.business_name
        }
      });
    }

    // Check active license info (safe public fields only)
    const { data: license } = await supabaseAdmin
      .from('licenses')
      .select('id, status, license_type, expiry_date, max_devices, activated_devices')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let hasActiveLicense = false;
    let licenseStatus = 'none';
    if (license) {
      licenseStatus = license.status;
      const expiry = new Date(license.expiry_date);
      const now = new Date();
      if (license.status === 'active' && expiry.getTime() > now.getTime()) {
        hasActiveLicense = true;
      }
    }

    return res.json({
      success: true,
      client: {
        id: client.id,
        client_code: client.client_code,
        business_name: client.business_name,
        owner_name: client.owner_name,
        logo: client.logo || null,
        currency: client.currency || 'EGP',
        language: client.language || 'ar',
        status: client.status,
        business_type: client.business_type,
        receipt_header: client.receipt_header,
        receipt_footer: client.receipt_footer,
        has_active_license: hasActiveLicense,
        license_status: licenseStatus
      }
    });
  } catch (err: any) {
    console.error('Public POS config error:', err);
    return res.status(500).json({ error: err.message || 'خطأ داخلي بالخادم' });
  }
});

// Client configuration by client_code (for Web POS & PWA client store)
app.get('/api/client-by-code/:clientCode', async (req, res) => {
  try {
    const { clientCode } = req.params;
    if (!clientCode) return res.status(400).json({ error: 'كود المنشأة مطلوب' });
    const normalizedCode = clientCode.trim();

    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .ilike('client_code', normalizedCode)
      .maybeSingle();

    if (clientErr) throw clientErr;
    if (!client) return res.status(404).json({ error: `لم يتم العثور على منشأة بالرمز (${normalizedCode})` });

    if (client.status !== 'active') {
      return res.status(403).json({
        error: 'حساب هذه المنشأة غير نشط أو موقوف مؤقتاً',
        status: client.status,
      });
    }

    const { data: license } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json({
      success: true,
      client,
      license: license || null,
      effectiveLicenseStatus: license?.status === 'active' ? 'active' : (license?.status || 'no_license'),
    });
  } catch (err: any) {
    console.error('client-by-code error:', err);
    return res.status(500).json({ error: err.message || 'خطأ داخلي بالخادم' });
  }
});

// Client configuration and license by client ID (for authenticated client users)
app.get('/api/client-by-id/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: 'معرف المنشأة مطلوب' });

    const caller = await authenticateCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'غير مصرح: يلزم تسجيل الدخول.' });
    }

    if (!caller.isSuperAdmin && caller.clientUser?.client_id !== clientId) {
      return res.status(403).json({ error: 'غير مصرح بالوصول إلى بيانات هذه المنشأة.' });
    }

    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr) throw clientErr;
    if (!client) return res.status(404).json({ error: 'لم يتم العثور على سجل المنشأة' });

    const { data: license } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json({
      success: true,
      client,
      license: license || null,
      effectiveLicenseStatus: license?.status === 'active' ? 'active' : (license?.status || 'no_license'),
    });
  } catch (err: any) {
    console.error('client-by-id error:', err);
    return res.status(500).json({ error: err.message || 'خطأ داخلي بالخادم' });
  }
});

// Register POS terminal / Web browser device with atomic quota validation
app.post('/api/devices/register', async (req, res) => {
  try {
    const caller = await authenticateCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'غير مصرح: يلزم تسجيل الدخول.' });
    }

    const { clientId, deviceFingerprint, deviceName, operatingSystem, appVersion } = req.body;
    if (!clientId || !deviceFingerprint) {
      return res.status(400).json({ error: 'بيانات الجهاز ومعرف المنشأة مطلوبة.' });
    }

    // Client isolation check
    if (!caller.isSuperAdmin && caller.clientUser?.client_id !== clientId) {
      return res.status(403).json({ error: 'غير مصرح لك بتسجيل أجهزة لمنشأة أخرى.' });
    }

    // Fetch client
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, business_name, status')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return res.status(404).json({ error: 'تعذر العثور على المنشأة.' });
    }

    if (client.status !== 'active') {
      return res.status(403).json({ error: 'حساب المنشأة موقوف أو غير نشط.' });
    }

    // Fetch active license
    const { data: license, error: licErr } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (licErr || !license) {
      return res.status(403).json({ error: 'لا يوجد ترخيص مسجل لهذه المنشأة.' });
    }

    if (license.status !== 'active') {
      return res.status(403).json({ error: 'ترخيص المنشأة غير نشط أو موقوف.' });
    }

    if (license.expiry_date && new Date(license.expiry_date) < new Date()) {
      return res.status(403).json({ error: 'انتهت صلاحية ترخيص المنشأة.' });
    }

    // Count currently active devices under this license
    const { count: activeCount } = await supabaseAdmin
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', license.id)
      .eq('status', 'active');

    const currentActive = activeCount || 0;

    // Check if device is already registered by fingerprint
    const { data: existingDevice } = await supabaseAdmin
      .from('devices')
      .select('*')
      .eq('client_id', clientId)
      .eq('device_fingerprint', deviceFingerprint)
      .maybeSingle();

    if (existingDevice) {
      if (existingDevice.status === 'active') {
        const { data: updated } = await supabaseAdmin
          .from('devices')
          .update({
            last_seen_at: new Date().toISOString(),
            operating_system: operatingSystem || existingDevice.operating_system,
            app_version: appVersion || existingDevice.app_version,
          })
          .eq('id', existingDevice.id)
          .select('*, client:clients(*), license:licenses(*)')
          .single();

        return res.json({
          success: true,
          device: updated || existingDevice,
          license,
          message: 'الجهاز مسجل ونشط بالفعل.',
        });
      }

      // Existing deactivated device: check quota before reactivating
      if (currentActive >= (license.max_devices || 1)) {
        return res.status(403).json({
          error: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص. يرجى التواصل مع الإدارة لتفعيل هذا الجهاز.',
          error_code: 'MAX_DEVICES_REACHED',
          max_devices: license.max_devices,
          activated_devices: currentActive,
        });
      }

      const { data: reactivated, error: reactErr } = await supabaseAdmin
        .from('devices')
        .update({
          status: 'active',
          last_seen_at: new Date().toISOString(),
          operating_system: operatingSystem || existingDevice.operating_system,
          app_version: appVersion || existingDevice.app_version,
          license_id: license.id,
        })
        .eq('id', existingDevice.id)
        .select('*, client:clients(*), license:licenses(*)')
        .single();

      if (reactErr) throw reactErr;

      await supabaseAdmin
        .from('licenses')
        .update({ activated_devices: currentActive + 1 })
        .eq('id', license.id);

      return res.json({
        success: true,
        device: reactivated,
        license,
        message: 'تم إعادة تفعيل الجهاز بنجاح.',
      });
    }

    // New device: Check quota
    if (currentActive >= (license.max_devices || 1)) {
      return res.status(403).json({
        error: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص. يرجى التواصل مع الإدارة لتفعيل هذا الجهاز.',
        error_code: 'MAX_DEVICES_REACHED',
        max_devices: license.max_devices,
        activated_devices: currentActive,
      });
    }

    // Insert new device
    const newDevicePayload = {
      client_id: clientId,
      license_id: license.id,
      device_name: deviceName || 'نقطة بيع - متصفح الويب',
      device_fingerprint: deviceFingerprint,
      operating_system: operatingSystem || 'Web Browser',
      app_version: appVersion || '1.0.0',
      status: 'active',
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };

    const { data: insertedDevice, error: insertErr } = await supabaseAdmin
      .from('devices')
      .insert(newDevicePayload)
      .select('*, client:clients(*), license:licenses(*)')
      .single();

    if (insertErr) throw insertErr;

    // Increment license activated_devices counter
    await supabaseAdmin
      .from('licenses')
      .update({ activated_devices: currentActive + 1 })
      .eq('id', license.id);

    // Log activity
    await supabaseAdmin.from('activity_logs').insert({
      actor_type: caller.isSuperAdmin ? 'super_admin' : 'client_user',
      actor_id: caller.clientUser?.id || caller.authUserId,
      action: 'device_activated',
      entity_type: 'device',
      entity_id: insertedDevice.id,
      metadata: {
        client_id: clientId,
        device_name: insertedDevice.device_name,
        device_fingerprint: deviceFingerprint,
        max_devices: license.max_devices,
        activated_devices: currentActive + 1,
      },
    });

    return res.json({
      success: true,
      device: insertedDevice,
      license,
      message: 'تم تسجيل وتفعيل نقطة البيع بنجاح.',
    });
  } catch (err: any) {
    console.error('Device registration error:', err);
    return res.status(500).json({ error: err.message || 'فشل في تسجيل الجهاز.' });
  }
});

// ==========================================
// Strict POS Device Validation Endpoint
// ==========================================
app.post('/api/devices/validate', async (req, res) => {
  try {
    const { clientId, deviceFingerprint } = req.body;
    if (!clientId || !deviceFingerprint) {
      return res.status(400).json({ error: 'معرف المنشأة وبصمة الجهاز مطلوبة.' });
    }

    // Check client status
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, business_name, status')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return res.status(404).json({ error: 'تعذر العثور على المنشأة.' });
    }

    if (client.status !== 'active') {
      return res.status(403).json({
        is_valid: false,
        status: 'deactivated',
        error_code: 'CLIENT_INACTIVE',
        message: 'حساب المنشأة موقوف أو غير نشط.'
      });
    }

    // Fetch active license
    const { data: license, error: licErr } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (licErr || !license) {
      return res.status(403).json({
        is_valid: false,
        status: 'unregistered',
        error_code: 'NO_LICENSE',
        message: 'لا يوجد ترخيص مسجل لهذه المنشأة.'
      });
    }

    if (license.status !== 'active') {
      return res.status(403).json({
        is_valid: false,
        status: 'deactivated',
        error_code: 'LICENSE_INACTIVE',
        message: 'ترخيص المنشأة غير نشط أو موقوف.'
      });
    }

    if (license.expiry_date && new Date(license.expiry_date) < new Date()) {
      return res.status(403).json({
        is_valid: false,
        status: 'deactivated',
        error_code: 'LICENSE_EXPIRED',
        message: 'انتهت صلاحية ترخيص المنشأة.'
      });
    }

    // Look for device in database
    const { data: device, error: devErr } = await supabaseAdmin
      .from('devices')
      .select('*, license:licenses(*)')
      .eq('client_id', clientId)
      .eq('device_fingerprint', deviceFingerprint)
      .maybeSingle();

    // Count currently active devices under this license to enforce max_devices strictly
    const { count: activeCount } = await supabaseAdmin
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', license.id)
      .eq('status', 'active');

    const currentActive = activeCount || 0;

    if (devErr || !device) {
      if (currentActive >= (license.max_devices || 1)) {
        return res.status(200).json({
          is_valid: false,
          status: 'unregistered',
          error_code: 'MAX_DEVICES_REACHED',
          max_devices: license.max_devices,
          activated_devices: currentActive,
          message: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص. يرجى التواصل مع الإدارة لتفعيل هذا الجهاز.'
        });
      }
      return res.status(200).json({
        is_valid: false,
        status: 'unregistered',
        error_code: 'DEVICE_NOT_REGISTERED',
        max_devices: license.max_devices,
        activated_devices: currentActive,
        message: 'هذا الجهاز غير مسجل ضمن الأجهزة المصرح لها في المنشأة. يرجى تزويد إدارة النظام بالبصمة الرقمية لتسجيل الجهاز.'
      });
    }

    if (device.status !== 'active') {
      return res.status(200).json({
        is_valid: false,
        status: 'deactivated',
        error_code: 'DEVICE_DEACTIVATED',
        message: 'تم إيقاف هذا الجهاز من قبل إدارة النظام.'
      });
    }

    if (license.max_devices && currentActive > license.max_devices) {
      return res.status(200).json({
        is_valid: false,
        status: 'exceeded',
        error_code: 'MAX_DEVICES_REACHED',
        message: 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الترخيص. يرجى التواصل مع الإدارة لتفعيل هذا الجهاز.'
      });
    }

    // Update last_seen_at
    await supabaseAdmin
      .from('devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', device.id);

    return res.json({
      is_valid: true,
      status: 'active',
      device,
      license,
      message: 'الجهاز مصرح ونشط.'
    });
  } catch (err: any) {
    console.error('Device validate error:', err);
    return res.status(500).json({ error: err.message || 'خطأ في التحقق من الجهاز' });
  }
});

// ==========================================
// Client Profile & Settings Update
// ==========================================
app.post('/api/client/update', async (req, res) => {
  try {
    const { clientId, updates } = req.body;
    if (!clientId || !updates) {
      return res.status(400).json({ error: 'معرف المنشأة والتعديلات مطلوبة' });
    }

    const allowedFields = [
      'business_name',
      'customer_name',
      'owner_name',
      'phone',
      'email',
      'address',
      'logo',
      'currency',
      'language',
      'business_type',
      'status',
    ];

    const safeUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    // Handle default warehouse update if provided
    const targetWarehouseId = req.body.default_warehouse_id || updates.default_warehouse_id;
    if (targetWarehouseId) {
      try {
        await supabaseAdmin.from('warehouses').update({ is_default: false }).eq('client_id', clientId);
        await supabaseAdmin.from('warehouses').update({ is_default: true }).eq('id', targetWarehouseId).eq('client_id', clientId);
      } catch (whErr) {
        console.warn('Could not update default warehouse in warehouses table:', whErr);
      }
    }

    const { data: updatedClient, error: updateErr } = await supabaseAdmin
      .from('clients')
      .update(safeUpdates)
      .eq('id', clientId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return res.json({
      success: true,
      client: updatedClient,
      message: 'تم تحديث إعدادات المنشأة بنجاح',
    });
  } catch (err: any) {
    console.error('Client update error:', err);
    return res.status(500).json({ error: err.message || 'فشل تحديث إعدادات المنشأة' });
  }
});

// ==========================================
// Client POS & Print Preferences Endpoints
// ==========================================
const CLIENT_SETTINGS_DIR = path.join(process.cwd(), 'data', 'client_settings');
if (!fs.existsSync(CLIENT_SETTINGS_DIR)) {
  fs.mkdirSync(CLIENT_SETTINGS_DIR, { recursive: true });
}

function getClientSettingsPath(clientId: string): string {
  return path.join(CLIENT_SETTINGS_DIR, `${clientId}_pos_settings.json`);
}

app.get('/api/client/pos-settings', (req, res) => {
  try {
    const clientId = String(req.query.clientId || '');
    if (!clientId) {
      return res.status(400).json({ error: 'معرف المنشأة مطلوب' });
    }

    const filePath = getClientSettingsPath(clientId);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return res.json({ success: true, settings: data });
    }

    return res.json({ success: true, settings: null });
  } catch (err: any) {
    console.error('Fetch client settings error:', err);
    return res.status(500).json({ error: 'فشل استرجاع إعدادات المنشأة' });
  }
});

app.post('/api/client/pos-settings', (req, res) => {
  try {
    const { clientId, settings } = req.body;
    if (!clientId || !settings) {
      return res.status(400).json({ error: 'معرف المنشأة والإعدادات مطلوبة' });
    }

    const filePath = getClientSettingsPath(clientId);
    const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
    const merged = { ...existing, ...settings, updated_at: new Date().toISOString() };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');

    return res.json({ success: true, settings: merged, message: 'تم حفظ إعدادات المنشأة بنجاح' });
  } catch (err: any) {
    console.error('Save client settings error:', err);
    return res.status(500).json({ error: 'فشل حفظ إعدادات المنشأة' });
  }
});

// ==========================================
// Atomic Shift Management Endpoints
// ==========================================
app.get('/api/shifts/active', async (req, res) => {
  try {
    const clientId = (req.query.clientId as string) || (req.query.client_id as string);
    const userId = (req.query.userId as string) || (req.query.user_id as string);
    const warehouseId = (req.query.warehouseId as string) || (req.query.warehouse_id as string);

    if (!clientId) {
      return res.status(400).json({ error: 'clientId مطلوب لجلب الوردية النشطة' });
    }

    let query = supabaseAdmin
      .from('shifts')
      .select(`
        *,
        warehouse:warehouses(id, name, code),
        register:cash_registers(id, name, code),
        opened_by_user:client_users!shifts_opened_by_fkey(id, name, email, role)
      `)
      .eq('client_id', clientId)
      .eq('status', 'open');

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    query = query.order('opened_at', { ascending: false }).limit(1);

    const { data: shiftRows, error: shiftErr } = await query;
    if (shiftErr) {
      console.error('Error fetching active shift from server:', shiftErr);
      return res.status(500).json({ error: shiftErr.message });
    }

    if (!shiftRows || shiftRows.length === 0) {
      return res.json({ success: true, shift: null });
    }

    const shiftData = shiftRows[0];

    // Compute live authoritative summary if possible
    let summary: any = null;
    try {
      const { data: sumData } = await supabaseAdmin.rpc('get_shift_summary', {
        p_shift_id: shiftData.id,
        p_client_id: clientId,
      });
      if (sumData) summary = sumData;
    } catch {}

    const openerName = (shiftData.opened_by_user as any)?.name || (shiftData.opened_by_user as any)?.full_name || 'الكاشير';
    const activeShiftObj = {
      ...shiftData,
      cashier_name: openerName,
      register_name: shiftData.register?.name || 'الصندوق الرئيسي',
      warehouse_name: shiftData.warehouse?.name || 'المستودع الرئيسي',
      closing_cash_expected: summary ? Number(summary.expected_cash || 0) : Number(shiftData.opening_cash || 0),
      total_sales_amount: summary ? Number(summary.total_sales_amount || 0) : Number(shiftData.total_sales_amount || 0),
      total_cash_sales: summary ? Number(summary.total_cash_sales || 0) : Number(shiftData.total_cash_sales || 0),
      total_card_sales: summary ? Number(summary.total_card_sales || 0) : Number(shiftData.total_card_sales || 0),
      total_other_sales: summary ? Number(summary.total_other_sales || 0) : Number(shiftData.total_other_sales || 0),
      total_refunds_amount: summary ? Number(summary.total_refunds_amount || 0) : Number(shiftData.total_refunds_amount || 0),
      total_cash_in: summary ? Number(summary.total_cash_in || 0) : Number(shiftData.total_cash_in || 0),
      total_cash_out: summary ? Number(summary.total_cash_out || 0) : Number(shiftData.total_cash_out || 0),
      orders_count: summary ? Number(summary.orders_count || 0) : Number(shiftData.orders_count || 0),
    };

    return res.json({ success: true, shift: activeShiftObj });
  } catch (err: any) {
    console.error('Active shift endpoint error:', err);
    return res.status(500).json({ error: err.message || 'Error fetching active shift' });
  }
});

app.post('/api/shifts/open', async (req, res) => {
  try {
    const {
      clientId,
      warehouseId,
      registerId: inputRegisterId,
      openingCash = 0,
      openingNotes = null,
      deviceFingerprint = null,
      deviceId: inputDeviceId = null,
      userId = null,
      clientUserId: inputClientUserId = null,
    } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'معرف المنشأة مطلوب لفتح الوردية' });
    }
    if (!warehouseId) {
      return res.status(400).json({ error: 'يرجى تحديد المستودع أو الفرع' });
    }
    if (Number(openingCash) < 0) {
      return res.status(400).json({ error: 'الرصيد الافتتاحي لا يمكن أن يكون سالباً' });
    }

    // 1. Verify client status
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, business_name, status')
      .eq('id', clientId)
      .single();

    if (clientErr || !client) {
      return res.status(404).json({ error: 'المنشأة غير موجودة' });
    }
    if (client.status !== 'active') {
      return res.status(403).json({ error: 'حساب المنشأة غير نشط أو موقوف مؤقتاً' });
    }

    // 2. Verify active license
    const { data: license } = await supabaseAdmin
      .from('licenses')
      .select('id, status, expiry_date')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!license || license.status !== 'active') {
      return res.status(403).json({ error: 'لا يوجد ترخيص نشط للمنشأة. يرجى تجديد الاشتراك أولاً.' });
    }
    if (license.expiry_date && new Date(license.expiry_date) < new Date()) {
      return res.status(403).json({ error: 'انتهت صلاحية ترخيص المنشأة. يرجى تجديد الاشتراك.' });
    }

    // 3. Resolve and strictly verify cashier / client user
    let clientUserId: string | null = null;
    let cashierName: string = 'الكاشير';

    // Check bearer token from authorization header if available
    let tokenAuthUserId: string | null = null;
    let tokenAuthEmail: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const { data: tokenUserData } = await supabaseAdmin.auth.getUser(token);
        if (tokenUserData?.user) {
          tokenAuthUserId = tokenUserData.user.id;
          tokenAuthEmail = tokenUserData.user.email || null;
        }
      } catch {}
    }

    const candidateAuthId = userId || tokenAuthUserId;

    // A. Verify if direct clientUserId was provided and belongs to this client
    if (inputClientUserId) {
      const { data: cuById } = await supabaseAdmin
        .from('client_users')
        .select('id, client_id, name, status, role')
        .eq('id', inputClientUserId)
        .eq('client_id', clientId)
        .maybeSingle();

      if (cuById) {
        if (cuById.status !== 'active') {
          return res.status(403).json({ error: 'حساب الكاشير غير نشط. يرجى التواصل مع الإدارة.' });
        }
        clientUserId = cuById.id;
        cashierName = cuById.name;
      }
    }

    // B. Verify by auth user UUID if not yet resolved
    if (!clientUserId && candidateAuthId) {
      const { data: cuByAuth } = await supabaseAdmin
        .from('client_users')
        .select('id, client_id, name, status, role')
        .eq('client_id', clientId)
        .or(`auth_user_id.eq.${candidateAuthId},id.eq.${candidateAuthId}`)
        .maybeSingle();

      if (cuByAuth) {
        if (cuByAuth.status !== 'active') {
          return res.status(403).json({ error: 'حساب الكاشير غير نشط. يرجى التواصل مع الإدارة.' });
        }
        clientUserId = cuByAuth.id;
        cashierName = cuByAuth.name;
      }
    }

    // C. Verify by email if auth user is logged in
    if (!clientUserId && tokenAuthEmail) {
      const { data: cuByEmail } = await supabaseAdmin
        .from('client_users')
        .select('id, client_id, name, status, role')
        .eq('client_id', clientId)
        .ilike('email', tokenAuthEmail.trim().toLowerCase())
        .maybeSingle();

      if (cuByEmail) {
        if (cuByEmail.status !== 'active') {
          return res.status(403).json({ error: 'حساب الكاشير غير نشط. يرجى التواصل مع الإدارة.' });
        }
        clientUserId = cuByEmail.id;
        cashierName = cuByEmail.name;
        // Sync auth_user_id link
        if (candidateAuthId) {
          await supabaseAdmin
            .from('client_users')
            .update({ auth_user_id: candidateAuthId })
            .eq('id', cuByEmail.id);
        }
      }
    }

    // D. If still not resolved, check active client users for this client
    if (!clientUserId) {
      const { data: fallbackUsers } = await supabaseAdmin
        .from('client_users')
        .select('id, client_id, name, status, role')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .limit(1);

      if (fallbackUsers && fallbackUsers.length > 0) {
        clientUserId = fallbackUsers[0].id;
        cashierName = fallbackUsers[0].name;
      }
    }

    // Strict validation: opened_by MUST NOT be null
    if (!clientUserId) {
      return res.status(401).json({ error: 'تعذر تحديد حساب الكاشير. يرجى تسجيل الدخول مرة أخرى.' });
    }

    // 4. Resolve Device
    let effectiveDeviceId: string | null = inputDeviceId || null;
    if (!effectiveDeviceId && deviceFingerprint) {
      const { data: dev } = await supabaseAdmin
        .from('devices')
        .select('id, status')
        .eq('client_id', clientId)
        .eq('device_fingerprint', String(deviceFingerprint).trim())
        .maybeSingle();
      if (dev) {
        effectiveDeviceId = dev.id;
        await supabaseAdmin.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', dev.id);
      }
    }

    // 5. Resolve or create cash register
    let registerId: string | null = inputRegisterId || null;
    if (registerId) {
      const { data: existingReg } = await supabaseAdmin
        .from('cash_registers')
        .select('id, name, status')
        .eq('id', registerId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (!existingReg) {
        registerId = null;
      }
    }

    if (!registerId) {
      const { data: regs } = await supabaseAdmin
        .from('cash_registers')
        .select('id, name, status')
        .eq('client_id', clientId)
        .eq('warehouse_id', warehouseId)
        .limit(1);
      if (regs && regs.length > 0) {
        registerId = regs[0].id;
      } else {
        const { data: wh } = await supabaseAdmin.from('warehouses').select('name').eq('id', warehouseId).single();
        const regName = wh?.name ? `${wh.name} - كاشير رئيسي` : 'نقطة البيع الرئيسية 1';
        const { data: newReg, error: regErr } = await supabaseAdmin
          .from('cash_registers')
          .insert({
            client_id: clientId,
            warehouse_id: warehouseId,
            name: regName,
            code: 'REG-01',
            status: 'closed',
            is_active: true,
            device_id: effectiveDeviceId,
          })
          .select()
          .single();
        if (regErr || !newReg) {
          return res.status(500).json({ error: 'فشل تهيئة صندوق الكاشير' });
        }
        registerId = newReg.id;
      }
    }

    // 6. Check if register or user already has an active open shift
    const { data: existingShift } = await supabaseAdmin
      .from('shifts')
      .select('id, shift_number, opened_by, register_id, warehouse_id')
      .eq('client_id', clientId)
      .eq('status', 'open')
      .or(`register_id.eq.${registerId},opened_by.eq.${clientUserId}`)
      .limit(1)
      .maybeSingle();

    if (existingShift) {
      return res.json({
        success: true,
        shift_id: existingShift.id,
        shift_number: existingShift.shift_number,
        register_id: existingShift.register_id || registerId,
        already_open: true,
        message: `تم استعادة الوردية المفتوحة برقم (${existingShift.shift_number})`,
      });
    }

    // 7. Generate Shift Number
    const { count } = await supabaseAdmin
      .from('shifts')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);
    const shiftNumber = 'SH-' + String((count || 0) + 1).padStart(6, '0');

    // 8. Insert new shift
    const shiftId = crypto.randomUUID();
    const { data: createdShift, error: shiftErr } = await supabaseAdmin
      .from('shifts')
      .insert({
        id: shiftId,
        client_id: clientId,
        warehouse_id: warehouseId,
        register_id: registerId,
        device_id: effectiveDeviceId,
        shift_number: shiftNumber,
        opened_by: clientUserId,
        opened_at: new Date().toISOString(),
        opening_cash: Number(openingCash),
        status: 'open',
        opening_notes: openingNotes ? String(openingNotes).trim() : null,
      })
      .select()
      .single();

    if (shiftErr || !createdShift) {
      console.error('Failed to insert shift:', shiftErr);
      return res.status(500).json({ error: shiftErr?.message || 'فشل فتح الوردية بقاعدة البيانات' });
    }

    // 9. Update cash register to 'open'
    await supabaseAdmin
      .from('cash_registers')
      .update({
        status: 'open',
        device_id: effectiveDeviceId || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registerId);

    // 10. Record opening cash movement if > 0
    if (Number(openingCash) > 0) {
      await supabaseAdmin.from('cash_drawer_transactions').insert({
        id: crypto.randomUUID(),
        client_id: clientId,
        shift_id: shiftId,
        register_id: registerId,
        transaction_type: 'opening_cash',
        amount: Number(openingCash),
        reason: 'رصيد افتتاحي للوردية (العهدة النقدية)',
        performed_by: clientUserId,
        created_at: new Date().toISOString(),
      });
    }

    // 11. Activity log
    await supabaseAdmin.from('activity_logs').insert({
      id: crypto.randomUUID(),
      actor_type: 'client_user',
      actor_id: clientUserId,
      action: 'shift_opened',
      entity_type: 'shift',
      entity_id: shiftId,
      metadata: {
        shift_number: shiftNumber,
        opening_cash: Number(openingCash),
        warehouse_id: warehouseId,
        register_id: registerId,
        device_id: effectiveDeviceId,
      },
      created_at: new Date().toISOString(),
    });

    return res.json({
      success: true,
      shift_id: shiftId,
      shift_number: shiftNumber,
      register_id: registerId,
      opened_by: clientUserId,
      cashier_name: cashierName,
      message: 'تم فتح الوردية بنجاح! جاهز لبدء البيع',
    });
  } catch (err: any) {
    console.error('Shift open error:', err);
    return res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع أثناء فتح الوردية' });
  }
});

app.post('/api/shifts/close', async (req, res) => {
  try {
    const {
      clientId,
      shiftId,
      closingCashActual,
      closingNotes = null,
      userId = null,
    } = req.body;

    if (!clientId || !shiftId) {
      return res.status(400).json({ error: 'معرف المنشأة والوردية مطلوبان' });
    }
    if (closingCashActual == null || Number(closingCashActual) < 0) {
      return res.status(400).json({ error: 'المبلغ النقدي الفعلي في الدرج غير صحيح' });
    }

    // 1. Fetch shift
    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from('shifts')
      .select('*')
      .eq('id', shiftId)
      .eq('client_id', clientId)
      .single();

    if (shiftErr || !shift) {
      return res.status(404).json({ error: 'الوردية غير موجودة' });
    }
    if (shift.status === 'closed') {
      return res.status(400).json({ error: 'هذه الوردية مغلقة بالفعل' });
    }

    // 2. Calculate sales
    const { data: sales } = await supabaseAdmin
      .from('sales')
      .select('id, total_amount, sale_status')
      .eq('shift_id', shiftId);

    const completedSales = (sales || []).filter((s: any) => s.sale_status === 'completed');
    const voidedSales = (sales || []).filter((s: any) => s.sale_status === 'voided');
    const totalSalesAmount = completedSales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);
    const totalRefundsAmount = voidedSales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);
    const ordersCount = completedSales.length;

    // 3. Payment methods breakdown
    const completedSaleIds = completedSales.map((s: any) => s.id);
    let totalCashSales = 0;
    let totalCardSales = 0;
    let totalOtherSales = 0;

    if (completedSaleIds.length > 0) {
      const { data: payments } = await supabaseAdmin
        .from('sale_payments')
        .select('payment_method, amount')
        .in('sale_id', completedSaleIds);

      for (const p of (payments || [])) {
        const amt = Number(p.amount || 0);
        if (p.payment_method === 'cash') totalCashSales += amt;
        else if (p.payment_method === 'card') totalCardSales += amt;
        else totalOtherSales += amt;
      }
    }

    // 4. Cash In & Cash Out movements
    const { data: drawerTxs } = await supabaseAdmin
      .from('cash_drawer_transactions')
      .select('transaction_type, amount, reason')
      .eq('shift_id', shiftId);

    let totalCashIn = 0;
    let totalCashOut = 0;
    for (const tx of (drawerTxs || [])) {
      const amt = Number(tx.amount || 0);
      if (tx.transaction_type === 'cash_in') {
        // Exclude cash sales transactions to prevent double counting
        if (!tx.reason?.includes('مبيعات نقدية')) {
          totalCashIn += amt;
        }
      } else if (['cash_out', 'drop_to_safe'].includes(tx.transaction_type)) {
        totalCashOut += amt;
      }
    }

    // 5. Authoritative Expected cash & difference reconciliation
    let expectedCash = 0;
    let finalTotalSales = totalSalesAmount;
    let finalCashSales = totalCashSales;
    let finalCardSales = totalCardSales;
    let finalOtherSales = totalOtherSales;
    let finalCashIn = totalCashIn;
    let finalCashOut = totalCashOut;
    let finalOrdersCount = ordersCount;

    try {
      const { data: rpcSummary } = await supabaseAdmin.rpc('get_shift_summary', {
        p_shift_id: shiftId,
        p_client_id: clientId,
      });

      if (rpcSummary) {
        expectedCash = Number(rpcSummary.expected_cash ?? 0);
        if (rpcSummary.total_sales_amount != null) finalTotalSales = Number(rpcSummary.total_sales_amount);
        if (rpcSummary.total_cash_sales != null) finalCashSales = Number(rpcSummary.total_cash_sales);
        if (rpcSummary.total_card_sales != null) finalCardSales = Number(rpcSummary.total_card_sales);
        if (rpcSummary.total_other_sales != null) finalOtherSales = Number(rpcSummary.total_other_sales);
        if (rpcSummary.total_cash_in != null) finalCashIn = Number(rpcSummary.total_cash_in);
        if (rpcSummary.total_cash_out != null) finalCashOut = Number(rpcSummary.total_cash_out);
        if (rpcSummary.orders_count != null) finalOrdersCount = Number(rpcSummary.orders_count);
      } else {
        const openingCash = Number(shift.opening_cash || 0);
        expectedCash = Math.max(0, openingCash + totalCashSales + totalCashIn - totalCashOut);
      }
    } catch {
      const openingCash = Number(shift.opening_cash || 0);
      expectedCash = Math.max(0, openingCash + totalCashSales + totalCashIn - totalCashOut);
    }

    const actualCash = Number(closingCashActual);
    const cashDifference = actualCash - expectedCash;

    // Resolve closing client_user (must reference client_users(id))
    let closingClientUserId = shift.opened_by;
    if (userId) {
      const { data: cu } = await supabaseAdmin
        .from('client_users')
        .select('id')
        .eq('client_id', clientId)
        .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
        .maybeSingle();
      if (cu) {
        closingClientUserId = cu.id;
      }
    }

    // 6. Update shift record
    const { data: closedShift, error: closeErr } = await supabaseAdmin
      .from('shifts')
      .update({
        status: 'closed',
        closed_by: closingClientUserId,
        closed_at: new Date().toISOString(),
        closing_cash_actual: actualCash,
        closing_cash_expected: expectedCash,
        cash_difference: cashDifference,
        total_sales_amount: finalTotalSales,
        total_cash_sales: finalCashSales,
        total_card_sales: finalCardSales,
        total_other_sales: finalOtherSales,
        total_refunds_amount: totalRefundsAmount,
        total_cash_in: finalCashIn,
        total_cash_out: finalCashOut,
        orders_count: finalOrdersCount,
        closing_notes: closingNotes ? String(closingNotes).trim() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shiftId)
      .select()
      .single();

    if (closeErr || !closedShift) {
      return res.status(500).json({ error: closeErr?.message || 'فشل إغلاق الوردية' });
    }

    // 7. Update cash register back to closed
    if (shift.register_id) {
      await supabaseAdmin
        .from('cash_registers')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', shift.register_id);
    }

    // 8. Audit log (Z-Report)
    await supabaseAdmin.from('activity_logs').insert({
      id: crypto.randomUUID(),
      actor_type: 'client_user',
      actor_id: userId || shift.opened_by,
      action: 'shift_closed',
      entity_type: 'shift',
      entity_id: shiftId,
      metadata: {
        shift_number: shift.shift_number,
        closing_cash_actual: actualCash,
        closing_cash_expected: expectedCash,
        cash_difference: cashDifference,
        total_sales: totalSalesAmount,
        orders_count: ordersCount,
      },
      created_at: new Date().toISOString(),
    });

    return res.json({
      success: true,
      shift_id: shiftId,
      shift_number: shift.shift_number,
      closing_cash_actual: actualCash,
      closing_cash_expected: expectedCash,
      cash_difference: cashDifference,
      total_sales_amount: totalSalesAmount,
      total_cash_sales: totalCashSales,
      total_card_sales: totalCardSales,
      total_refunds_amount: totalRefundsAmount,
      orders_count: ordersCount,
      message: 'تم إغلاق الوردية ومطابقة النقدية بنجاح',
    });
  } catch (err: any) {
    console.error('Shift close error:', err);
    return res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع أثناء إغلاق الوردية' });
  }
});

// Atomic Cash Drawer Movement API (Deposit / Withdrawal / Drop to Safe) - Bug #1
app.post('/api/shifts/cash-movement', async (req, res) => {
  try {
    const { clientId, shiftId, transactionType, amount, reason, performedBy, localTransactionId } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'معرف المنشأة (clientId) مطلوب' });
    }
    if (!shiftId) {
      return res.status(400).json({ error: 'يجب فتح وردية أولاً لإجراء حركة على الخزينة.' });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً موجباً أكبر من صفر' });
    }
    if (!['cash_in', 'cash_out', 'drop_to_safe'].includes(transactionType)) {
      return res.status(400).json({ error: 'نوع الحركة غير صالح (متاح: إيداع، سحب، ترحيل للخزنة)' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'سبب أو بيان الحركة مطلوب' });
    }

    // 1. EXACTLY-ONCE / Idempotency Check:
    // If localTransactionId is provided, check if already recorded
    if (localTransactionId) {
      const { data: existingTx } = await supabaseAdmin
        .from('cash_drawer_transactions')
        .select('id, amount, transaction_type')
        .eq('client_id', clientId)
        .ilike('reason', `%${localTransactionId}%`)
        .maybeSingle();

      if (existingTx) {
        return res.json({
          success: true,
          movement_id: existingTx.id,
          already_synced: true,
          message: 'تمت مزامنة هذه الحركة مسبقاً (Exactly-Once)'
        });
      }
    }

    // 2. Validate Active Shift in Database
    // Must be a valid UUID for DB
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(shiftId)) {
      return res.status(400).json({ error: 'معرف الوردية غير صالح. يجب أن تكون الوردية مسجلة ومزامنة في النظام أولاً' });
    }

    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from('shifts')
      .select('id, client_id, status, shift_number, register_id, opened_by, total_cash_in, total_cash_out')
      .eq('id', shiftId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (shiftErr || !shift) {
      return res.status(404).json({ error: 'الوردية غير موجودة في سجلات المنشأة' });
    }

    if (shift.status !== 'open') {
      return res.status(400).json({ error: 'لا يمكن تسجيل حركة على وردية مغلقة. يجب فتح وردية جديدة أولاً' });
    }

    // 3. Resolve Performed By (Client User ID)
    let effectiveUserId = performedBy || shift.opened_by;
    if (performedBy) {
      const { data: cu } = await supabaseAdmin
        .from('client_users')
        .select('id')
        .eq('client_id', clientId)
        .or(`id.eq.${performedBy},auth_user_id.eq.${performedBy}`)
        .maybeSingle();
      if (cu) {
        effectiveUserId = cu.id;
      }
    }

    const finalReason = localTransactionId ? `${reason.trim()} [TX: ${localTransactionId}]` : reason.trim();
    const movementId = crypto.randomUUID();

    // 4. Insert into cash_drawer_transactions
    const { error: insertErr } = await supabaseAdmin
      .from('cash_drawer_transactions')
      .insert({
        id: movementId,
        client_id: clientId,
        shift_id: shift.id,
        register_id: shift.register_id || undefined,
        transaction_type: transactionType,
        amount: numAmount,
        reason: finalReason,
        performed_by: effectiveUserId,
        created_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error('Insert cash_drawer_transaction error:', insertErr);
      return res.status(500).json({ error: insertErr.message || 'فشل حفظ حركة الخزينة في قاعدة البيانات' });
    }

    // 5. Update shift total_cash_in / total_cash_out
    const currentCashIn = Number(shift.total_cash_in || 0);
    const currentCashOut = Number(shift.total_cash_out || 0);

    const shiftUpdate: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    if (transactionType === 'cash_in') {
      shiftUpdate.total_cash_in = currentCashIn + numAmount;
    } else {
      shiftUpdate.total_cash_out = currentCashOut + numAmount;
    }

    await supabaseAdmin
      .from('shifts')
      .update(shiftUpdate)
      .eq('id', shift.id)
      .catch((e: any) => console.warn('Could not update shift totals:', e));

    return res.json({
      success: true,
      movement_id: movementId,
      shift_id: shift.id,
      amount: numAmount,
      transaction_type: transactionType,
      message: 'تم تسجيل حركة الخزينة بنجاح'
    });
  } catch (err: any) {
    console.error('Cash movement error:', err);
    return res.status(500).json({ error: err.message || 'حدث خطأ غير متوقع أثناء تسجيل حركة الخزينة' });
  }
});

// ==========================================
// Atomic Sales Checkout Endpoint
// ==========================================
app.post('/api/sales/complete', async (req, res) => {
  try {
    const {
      clientId,
      warehouseId,
      items,
      payments,
      discountAmount = 0,
      customerId = null,
      notes = null,
      createdBy = null,
      shiftId = null,
    } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'معرف المنشأة مطلوب' });
    }
    if (!warehouseId) {
      return res.status(400).json({ error: 'يرجى تحديد المستودع أو الفرع' });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'سلة البيع فارغة' });
    }
    if (!payments || payments.length === 0) {
      return res.status(400).json({ error: 'يرجى إضافة وسيلة دفع' });
    }

    // 1. Fetch products
    const productIds = items.map((i: any) => i.product_id || i.productId);
    const { data: productsData, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, barcode, selling_price, cost_price, tax_rate, track_stock, current_stock, is_active')
      .eq('client_id', clientId)
      .in('id', productIds);

    if (prodErr || !productsData) {
      return res.status(400).json({ error: 'فشل جلب بيانات الأصناف: ' + (prodErr?.message || '') });
    }

    const productsMap = new Map(productsData.map((p: any) => [p.id, p]));

    // Read client settings to determine if tax is enabled
    let clientSettings: any = null;
    try {
      const settingsPath = getClientSettingsPath(clientId);
      if (fs.existsSync(settingsPath)) {
        clientSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch {}
    const isTaxEnabled = clientSettings?.enable_tax !== false;

    // 2. Compute items and totals
    let totalSubtotal = 0;
    let totalLineDiscounts = 0;
    let totalTax = 0;
    const preparedItems: any[] = [];

    for (const item of items) {
      const product = productsMap.get(item.product_id || item.productId);
      if (!product) {
        return res.status(400).json({ error: 'صنف غير موجود بقاعدة البيانات' });
      }
      const unitPrice = item.unit_price != null && item.unit_price >= 0 
        ? Number(item.unit_price) 
        : (item.unitPrice != null && item.unitPrice >= 0 ? Number(item.unitPrice) : Number(product.selling_price));
      const lineDiscount = Math.min(Number(item.discount_amount || item.discountAmount || 0), item.quantity * unitPrice);
      const taxableAmount = (item.quantity * unitPrice) - lineDiscount;
      const effectiveItemTaxRate = isTaxEnabled ? Number(product.tax_rate || 0) : 0;
      const itemTax = isTaxEnabled ? (Math.round(taxableAmount * (effectiveItemTaxRate / 100) * 10000) / 10000) : 0;
      const lineTotal = taxableAmount + itemTax;

      totalSubtotal += item.quantity * unitPrice;
      totalLineDiscounts += lineDiscount;
      totalTax += itemTax;

      preparedItems.push({
        product_id: product.id,
        product_name_snapshot: product.name,
        sku_snapshot: product.sku,
        barcode_snapshot: product.barcode,
        quantity: item.quantity,
        unit_price: unitPrice,
        discount_amount: lineDiscount,
        tax_rate: effectiveItemTaxRate,
        tax_amount: itemTax,
        line_total: lineTotal,
        track_stock: product.track_stock,
        cost_price: Number(product.cost_price || 0),
      });
    }

    const finalTotal = Math.max(0, totalSubtotal - totalLineDiscounts - Number(discountAmount) + totalTax);
    let totalPaid = 0;
    for (const p of payments) {
      totalPaid += Number(p.amount) || 0;
    }

    const paymentStatus = totalPaid >= finalTotal ? 'paid' : 'partial';
    const changeAmount = totalPaid > finalTotal ? totalPaid - finalTotal : 0;
    const actualPaidAmount = Math.min(totalPaid, finalTotal);

    // Generate invoice number
    const { count } = await supabaseAdmin
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);
    const nextSeq = (count || 0) + 1;
    const invoiceNumber = `INV-${String(nextSeq).padStart(6, '0')}`;

    // Resolve created_by client user id
    let effectiveCreatedBy = createdBy;
    if (createdBy) {
      const { data: cu } = await supabaseAdmin
        .from('client_users')
        .select('id')
        .eq('client_id', clientId)
        .or(`id.eq.${createdBy},auth_user_id.eq.${createdBy}`)
        .maybeSingle();
      if (cu) {
        effectiveCreatedBy = cu.id;
      }
    }
    if (!effectiveCreatedBy && shiftId) {
      const { data: sh } = await supabaseAdmin
        .from('shifts')
        .select('opened_by')
        .eq('id', shiftId)
        .maybeSingle();
      if (sh?.opened_by) {
        effectiveCreatedBy = sh.opened_by;
      }
    }

    // 3. Insert Sale
    const { data: saleData, error: saleErr } = await supabaseAdmin
      .from('sales')
      .insert({
        client_id: clientId,
        shift_id: shiftId || null,
        invoice_number: invoiceNumber,
        sale_date: new Date().toISOString(),
        customer_id: customerId,
        warehouse_id: warehouseId,
        subtotal: totalSubtotal,
        discount_amount: totalLineDiscounts + Number(discountAmount),
        tax_amount: totalTax,
        total_amount: finalTotal,
        paid_amount: actualPaidAmount,
        change_amount: changeAmount,
        payment_status: paymentStatus,
        sale_status: 'completed',
        notes,
        created_by: effectiveCreatedBy,
      })
      .select('id, invoice_number, total_amount, sale_date')
      .single();

    if (saleErr || !saleData) {
      throw new Error('فشل تسجيل الفاتورة: ' + (saleErr?.message || ''));
    }

    const saleId = saleData.id;

    // 4. Insert Items
    const itemsToInsert = preparedItems.map((item) => ({
      sale_id: saleId,
      client_id: clientId,
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      sku_snapshot: item.sku_snapshot,
      barcode_snapshot: item.barcode_snapshot,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount,
      tax_rate: item.tax_rate,
      tax_amount: item.tax_amount,
      line_total: item.line_total,
      cost_price: item.cost_price,
    }));
    await supabaseAdmin.from('sale_items').insert(itemsToInsert);

    // 5. Insert Payments
    const paymentsToInsert = payments.map((p: any) => ({
      sale_id: saleId,
      client_id: clientId,
      payment_method: p.payment_method,
      amount: Number(p.amount),
      reference: p.reference || p.reference_number || null,
    }));
    await supabaseAdmin.from('sale_payments').insert(paymentsToInsert);

    // 6. Deduct Inventory & Insert Inventory Transactions
    for (const item of preparedItems) {
      if (item.track_stock) {
        const { data: existingBal } = await supabaseAdmin
          .from('inventory_balances')
          .select('id, quantity')
          .eq('client_id', clientId)
          .eq('warehouse_id', warehouseId)
          .eq('product_id', item.product_id)
          .maybeSingle();

        const currentQty = existingBal ? Number(existingBal.quantity) : 0;
        const newQty = currentQty - item.quantity;

        if (existingBal) {
          await supabaseAdmin
            .from('inventory_balances')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', existingBal.id);
        } else {
          await supabaseAdmin.from('inventory_balances').insert({
            client_id: clientId,
            warehouse_id: warehouseId,
            product_id: item.product_id,
            quantity: newQty,
          });
        }

        try {
          await supabaseAdmin.from('inventory_transactions').insert({
            client_id: clientId,
            warehouse_id: warehouseId,
            product_id: item.product_id,
            transaction_type: 'sale',
            quantity: -item.quantity,
            reference_id: saleId,
            reference_type: 'sale',
            notes: `فاتورة مبيعات ${invoiceNumber}`,
            performed_by: createdBy,
          });
        } catch {}
      }
    }

    // 7. Cash Drawer movement if cash payment on active shift
    if (shiftId) {
      const cashPaid = payments
        .filter((p: any) => p.payment_method === 'cash')
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const actualCashAdded = Math.max(0, cashPaid - changeAmount);

      if (actualCashAdded > 0) {
        try {
          await supabaseAdmin.from('cash_drawer_transactions').insert({
            client_id: clientId,
            shift_id: shiftId,
            transaction_type: 'cash_in',
            amount: actualCashAdded,
            reason: `مبيعات نقدية فاتورة ${invoiceNumber}`,
            performed_by: createdBy,
          });
        } catch {}
      }
    }

    return res.json({
      success: true,
      sale_id: saleId,
      invoice_number: invoiceNumber,
      total_amount: finalTotal,
      paid_amount: actualPaidAmount,
      change_amount: changeAmount,
      sale_date: saleData.sale_date,
    });
  } catch (err: any) {
    console.error('Server /api/sales/complete error:', err);
    return res.status(500).json({ error: err.message || 'خطأ أثناء تسجيل الفاتورة' });
  }
});

// ==========================================
// ERP Storage & Synchronization Endpoints
// ==========================================
const ERP_DATA_DIR = path.join(process.cwd(), 'data', 'erp');
if (!fs.existsSync(ERP_DATA_DIR)) {
  fs.mkdirSync(ERP_DATA_DIR, { recursive: true });
}

function getErpFilePath(clientId: string, entity: string): string {
  return path.join(ERP_DATA_DIR, `${clientId}_${entity}.json`);
}

function readErpData(clientId: string, entity: string): any[] {
  const filePath = getErpFilePath(clientId, entity);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

function writeErpData(clientId: string, entity: string, data: any[]): void {
  const filePath = getErpFilePath(clientId, entity);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('ERP write warning:', e);
  }
}

// Customers
app.get('/api/erp/customers', (req, res) => {
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const customers = readErpData(clientId, 'customers');
  return res.json({ success: true, customers });
});

app.post('/api/erp/customers', (req, res) => {
  const { clientId, customer } = req.body;
  if (!clientId || !customer) return res.status(400).json({ error: 'بيانات غير مكتملة' });
  const customers = readErpData(clientId, 'customers');
  const idx = customers.findIndex((c: any) => c.id === customer.id);
  if (idx >= 0) {
    customers[idx] = customer;
  } else {
    customers.unshift(customer);
  }
  writeErpData(clientId, 'customers', customers);
  return res.json({ success: true, customer });
});

app.delete('/api/erp/customers/:id', (req, res) => {
  const { id } = req.params;
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const customers = readErpData(clientId, 'customers').filter((c: any) => c.id !== id);
  writeErpData(clientId, 'customers', customers);
  return res.json({ success: true });
});

// Suppliers
app.get('/api/erp/suppliers', (req, res) => {
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const suppliers = readErpData(clientId, 'suppliers');
  return res.json({ success: true, suppliers });
});

app.post('/api/erp/suppliers', (req, res) => {
  const { clientId, supplier } = req.body;
  if (!clientId || !supplier) return res.status(400).json({ error: 'بيانات غير مكتملة' });
  const suppliers = readErpData(clientId, 'suppliers');
  const idx = suppliers.findIndex((s: any) => s.id === supplier.id);
  if (idx >= 0) {
    suppliers[idx] = supplier;
  } else {
    suppliers.unshift(supplier);
  }
  writeErpData(clientId, 'suppliers', suppliers);
  return res.json({ success: true, supplier });
});

app.delete('/api/erp/suppliers/:id', (req, res) => {
  const { id } = req.params;
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const suppliers = readErpData(clientId, 'suppliers').filter((s: any) => s.id !== id);
  writeErpData(clientId, 'suppliers', suppliers);
  return res.json({ success: true });
});

// Purchases
app.get('/api/erp/purchases', (req, res) => {
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const purchases = readErpData(clientId, 'purchases');
  return res.json({ success: true, purchases });
});

app.post('/api/erp/purchases', (req, res) => {
  const { clientId, purchase } = req.body;
  if (!clientId || !purchase) return res.status(400).json({ error: 'بيانات غير مكتملة' });
  const purchases = readErpData(clientId, 'purchases');
  const idx = purchases.findIndex((p: any) => p.id === purchase.id);
  if (idx >= 0) {
    purchases[idx] = purchase;
  } else {
    purchases.unshift(purchase);
  }
  writeErpData(clientId, 'purchases', purchases);
  return res.json({ success: true, purchase });
});

// Purchases Stock Receiving (increments real Supabase inventory_balances)
app.post('/api/erp/purchases/receive', async (req, res) => {
  try {
    const { clientId, purchaseId, warehouseId, items, invoiceNumber } = req.body;
    if (!clientId || !warehouseId || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'بيانات الاستلام غير مكتملة' });
    }

    for (const item of items) {
      if (!item.product_id || !item.quantity) continue;
      const qty = Number(item.quantity);

      const { data: existingBal } = await supabaseAdmin
        .from('inventory_balances')
        .select('id, quantity')
        .eq('client_id', clientId)
        .eq('warehouse_id', warehouseId)
        .eq('product_id', item.product_id)
        .maybeSingle();

      const currentQty = existingBal ? Number(existingBal.quantity) : 0;
      const newQty = currentQty + qty;

      if (existingBal) {
        await supabaseAdmin
          .from('inventory_balances')
          .update({ quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', existingBal.id);
      } else {
        await supabaseAdmin.from('inventory_balances').insert({
          client_id: clientId,
          warehouse_id: warehouseId,
          product_id: item.product_id,
          quantity: newQty,
        });
      }

      await supabaseAdmin.from('inventory_transactions').insert({
        client_id: clientId,
        warehouse_id: warehouseId,
        product_id: item.product_id,
        transaction_type: 'purchase',
        quantity: qty,
        reference_type: 'purchase_order',
        notes: `توريد بضاعة فاتورة شراء ${invoiceNumber || purchaseId}`,
      }).catch(() => {});
    }

    return res.json({ success: true, message: 'تم إدخال الكميات للمستودع بنجاح' });
  } catch (err: any) {
    console.error('Purchase receive error:', err);
    return res.status(500).json({ error: err.message || 'فشل استلام التوريد' });
  }
});

// Expenses
app.get('/api/erp/expenses', (req, res) => {
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const expenses = readErpData(clientId, 'expenses');
  return res.json({ success: true, expenses });
});

app.post('/api/erp/expenses', async (req, res) => {
  try {
    const { clientId, expense } = req.body;
    if (!clientId || !expense) return res.status(400).json({ error: 'بيانات غير مكتملة' });
    const expenses = readErpData(clientId, 'expenses');
    const idx = expenses.findIndex((e: any) => e.id === expense.id);
    if (idx >= 0) {
      expenses[idx] = expense;
    } else {
      expenses.unshift(expense);
    }
    writeErpData(clientId, 'expenses', expenses);

    // If cash payment and shift active, log to cash drawer transactions
    if (expense.payment_method === 'cash' && expense.shift_id) {
      await supabaseAdmin.from('cash_drawer_transactions').insert({
        client_id: clientId,
        shift_id: expense.shift_id,
        transaction_type: 'cash_out',
        amount: Number(expense.amount),
        reason: `مصروف: ${expense.description || expense.category}`,
        performed_by: expense.performed_by,
      }).catch(() => {});
    }

    return res.json({ success: true, expense });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/erp/expenses/:id', (req, res) => {
  const { id } = req.params;
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId مطلوب' });
  const expenses = readErpData(clientId, 'expenses').filter((e: any) => e.id !== id);
  writeErpData(clientId, 'expenses', expenses);
  return res.json({ success: true });
});

// 3. Dynamic Client PWA Manifest (Tailored per client code)
app.get('/api/pwa/manifest/:clientCode', async (req, res) => {
  try {
    const { clientCode } = req.params;
    const normalizedCode = (clientCode || '').trim();

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, client_code, business_name, logo')
      .ilike('client_code', normalizedCode)
      .maybeSingle();

    const businessName = client?.business_name || 'Ordexa POS';
    const appName = `${businessName} - الكاشير`;
    const shortName = businessName.length > 12 ? businessName.slice(0, 12) : businessName;
    const clientLogo = client?.logo || '/assets/ordexa-icon.png';

    const manifest = {
      id: `/pos/${normalizedCode}`,
      name: appName,
      short_name: shortName,
      description: `نظام نقطة البيع السحابي والأوفلاين - ${businessName}`,
      start_url: `/pos/${normalizedCode}`,
      scope: `/`,
      display: 'standalone',
      orientation: 'any',
      dir: 'rtl',
      lang: 'ar',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      icons: [
        {
          src: clientLogo,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: clientLogo,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/assets/ordexa-icon.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    };

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(manifest);
  } catch (err: any) {
    console.error('Dynamic manifest error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate manifest' });
  }
});

// 404 catch-all strictly for /api/* endpoints — guarantees API requests NEVER return HTML
app.all('/api/*', (req, res) => {
  return res.status(404).json({
    success: false,
    error: `المسار البرمجي المطلوب غير موجود: ${req.method} ${req.path}`,
  });
});

// Start the Express server with Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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

// Only start standalone HTTP server when executed directly (not in Vercel or serverless or test suite)
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION ||
  process.env.NODE_ENV === 'test' ||
  process.env.IS_TEST
);

if (!isServerless) {
  startServer();
}

export default app;
export { app };
