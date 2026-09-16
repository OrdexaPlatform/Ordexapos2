import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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
        error: 'غير مصرح: يلزم تسجيل الدخول لإجراء هذه العملية.',
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
        error: 'البيانات غير مكتملة (اسم المستخدم، البريد، ومعرف العميل مطلوبة)',
      });
    }

    // Authorization check:
    // - Super Admin can provision users for any client
    // - Client Users can ONLY provision for their own client_id
    if (!caller.isSuperAdmin) {
      if (caller.clientUser.client_id !== client_id) {
        return res.status(403).json({
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
          error: 'ممنوع الوصول: لا تملك الصلاحيات الكافية لإدارة أو إضافة مستخدمين.',
        });
      }

      // Non-super-admins cannot elevate another user to super_admin or owner unless they are already owner
      if (role === 'owner' && userRole !== 'owner') {
        return res.status(403).json({
          error: 'ممنوع الوصول: فقط مالك المنشأة يمكنه تعيين مستخدم كمالك.',
        });
      }
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
      error: error.message || 'تعذر إنشاء حساب المستخدم',
    });
  }
});

// Auto-sync client owner endpoint (Super Admin only)
app.post('/api/auth/sync-client-owner', requireSuperAdmin, async (req, res) => {
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
      return res.status(401).json({ error: 'غير مصرح: يلزم تسجيل الدخول كمسؤول سوبر أدمن للمتابعة.' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'رمز الجلسة غير صالح أو منتهي الصلاحية.' });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'انتهت صلاحية جلسة المستخدم، يرجى تسجيل الدخول مجدداً.' });
    }

    // Check if user is in super_admin_users table and active
    const userEmail = user.email ? user.email.toLowerCase() : '';
    const { data: superAdminRecord, error: saErr } = await supabaseAdmin
      .from('super_admin_users')
      .select('id, role, status')
      .or(`id.eq.${user.id},email.ilike.${userEmail}`)
      .maybeSingle();

    if (saErr || !superAdminRecord || superAdminRecord.status !== 'active') {
      return res.status(403).json({ error: 'ممنوع الوصول: هذه العملية مقتصرة حصرياً على السوبر أدمن (Ordexa Super Admin).' });
    }

    (req as any).superAdminUser = superAdminRecord;
    next();
  } catch (err: any) {
    console.error('requireSuperAdmin middleware error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء التحقق من صلاحيات السوبر أدمن.' });
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
          error: `تم استنفاد الحد الأقصى للأجهزة المسموح بها في ترخيصكم (${license.max_devices} جهاز). يرجى ترقية الخطة أو تعطيل جهاز آخر أولاً.`,
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
        error: `تم استنفاد الحد الأقصى للأجهزة المسموح بها في ترخيصكم (${license.max_devices} جهاز). يرجى ترقية الخطة أو تعطيل جهاز آخر أولاً.`,
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
      'owner_name',
      'phone',
      'email',
      'address',
      'logo',
      'currency',
      'language',
      'receipt_header',
      'receipt_footer',
      'business_type',
    ];

    const safeUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
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
    const productIds = items.map((i: any) => i.product_id);
    const { data: productsData, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, barcode, selling_price, cost_price, tax_rate, track_stock, current_stock, is_active')
      .eq('client_id', clientId)
      .in('id', productIds);

    if (prodErr || !productsData) {
      return res.status(400).json({ error: 'فشل جلب بيانات الأصناف: ' + (prodErr?.message || '') });
    }

    const productsMap = new Map(productsData.map((p: any) => [p.id, p]));

    // 2. Compute items and totals
    let totalSubtotal = 0;
    let totalLineDiscounts = 0;
    let totalTax = 0;
    const preparedItems: any[] = [];

    for (const item of items) {
      const product = productsMap.get(item.product_id);
      if (!product) {
        return res.status(400).json({ error: 'صنف غير موجود بقاعدة البيانات' });
      }
      const unitPrice = item.unit_price != null && item.unit_price >= 0 ? Number(item.unit_price) : Number(product.selling_price);
      const lineDiscount = Math.min(Number(item.discount_amount || 0), item.quantity * unitPrice);
      const taxableAmount = (item.quantity * unitPrice) - lineDiscount;
      const itemTax = Math.round(taxableAmount * (Number(product.tax_rate || 0) / 100) * 10000) / 10000;
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
        tax_rate: Number(product.tax_rate || 0),
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
        created_by: createdBy,
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
      reference_number: p.reference || null,
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
        }).catch(() => {});
      }
    }

    // 7. Cash Drawer movement if cash payment on active shift
    if (shiftId) {
      const cashPaid = payments
        .filter((p: any) => p.payment_method === 'cash')
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const actualCashAdded = Math.max(0, cashPaid - changeAmount);

      if (actualCashAdded > 0) {
        await supabaseAdmin.from('cash_drawer_transactions').insert({
          client_id: clientId,
          shift_id: shiftId,
          transaction_type: 'cash_in',
          amount: actualCashAdded,
          reason: `مبيعات نقدية فاتورة ${invoiceNumber}`,
          performed_by: createdBy,
        }).catch(() => {});
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
    return res.status(500).json({ error: 'Failed to generate manifest' });
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
