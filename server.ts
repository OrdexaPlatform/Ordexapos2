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
  const { data: clientUserRecord } = await supabaseAdmin
    .from('client_users')
    .select('id, client_id, auth_user_id, role, status, custom_permissions')
    .or(`auth_user_id.eq.${user.id},email.ilike.${userEmail}`)
    .eq('status', 'active')
    .maybeSingle();

  if (clientUserRecord) {
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
