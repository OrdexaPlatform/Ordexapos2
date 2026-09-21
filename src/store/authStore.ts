import { create } from 'zustand';
import { supabase, supabaseAnonQuery } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { ClientUser } from '../types';
import type { OfflineCredentialRecord } from '../lib/offline/offlineStorage';

export type UserType = 'super_admin' | 'client_user' | null;
export type AuthMode = 'online' | 'offline';

interface AuthState {
  user: User | null;
  session: Session | null;
  authMode: AuthMode;
  userType: UserType;
  isSuperAdmin: boolean;
  clientUser: ClientUser | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  loginOffline: (record: OfflineCredentialRecord) => void;
  signOut: () => Promise<void>;
  determineUserRole: (user: User, session: Session) => Promise<void>;
  checkAdminRole: (user: User, session: Session) => Promise<void>;
}

let isInitializing = false;
let authListenerAttached = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  authMode: 'online',
  userType: null,
  isSuperAdmin: false,
  clientUser: null,
  loading: true,
  initialized: false,
  
  initialize: async () => {
    if (get().initialized || isInitializing) {
      return;
    }
    isInitializing = true;

    try {
      // When offline, do NOT auto-login without credentials verification.
      // Present the natural login screen so the user enters their email and password.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        set({
          user: null,
          session: null,
          authMode: 'offline',
          userType: null,
          isSuperAdmin: false,
          clientUser: null,
          initialized: true,
          loading: false,
        });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await get().determineUserRole(session.user, session);
      } else {
        set({ 
          user: null, 
          session: null, 
          authMode: 'online',
          userType: null,
          isSuperAdmin: false, 
          clientUser: null,
          initialized: true, 
          loading: false 
        });
      }

      if (!authListenerAttached) {
        authListenerAttached = true;
        supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (newSession?.user) {
            // If already verified current user
            if (get().user?.id === newSession.user.id && (get().isSuperAdmin || get().clientUser)) {
              set({ session: newSession, loading: false });
            } else {
              await get().determineUserRole(newSession.user, newSession);
            }
          } else {
            set({ 
              user: null, 
              session: null, 
              userType: null,
              isSuperAdmin: false, 
              clientUser: null,
              initialized: true, 
              loading: false 
            });
          }
        });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ 
        user: null, 
        session: null, 
        userType: null,
        isSuperAdmin: false, 
        clientUser: null,
        initialized: true, 
        loading: false 
      });
    } finally {
      isInitializing = false;
    }
  },

  determineUserRole: async (user: User, session: Session) => {
    set({ loading: true });
    try {
      const normalizedEmail = (user.email || '').trim().toLowerCase();

      // 1. Check if user is a Super Admin (check by ID or by email) - STRICT PRIORITY
      let adminData: any = null;
      
      // Use supabaseAnonQuery to bypass recursive RLS policies on super_admin_users
      try {
        const { data: byIdData } = await supabaseAnonQuery
          .from('super_admin_users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (byIdData) {
          adminData = byIdData;
        } else if (normalizedEmail) {
          const { data: byEmailData } = await supabaseAnonQuery
            .from('super_admin_users')
            .select('*')
            .ilike('email', normalizedEmail)
            .maybeSingle();
          if (byEmailData) {
            adminData = byEmailData;
          }
        }
      } catch (adminQueryErr) {
        console.warn('Super admin query exception:', adminQueryErr);
      }

      if (adminData && (adminData.role === 'super_admin' || adminData.role === 'admin' || adminData.role === 'viewer') && adminData.status === 'active') {
        // Sync user.id if it differed
        if (adminData.id !== user.id) {
          try {
            await supabaseAnonQuery
              .from('super_admin_users')
              .update({ id: user.id, last_login_at: new Date().toISOString() })
              .eq('email', normalizedEmail);
          } catch (e) {
            console.warn('Could not sync super_admin user id:', e);
          }
        } else {
          try {
            await supabaseAnonQuery
              .from('super_admin_users')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', user.id);
          } catch (e) {
            console.warn('Could not update super_admin last_login_at:', e);
          }
        }

        // STRICT SEPARATION: Super Admin is pure Super Admin, clientUser is always null
        set({
          user,
          session,
          userType: 'super_admin',
          isSuperAdmin: true,
          clientUser: null,
          initialized: true,
          loading: false,
        });
        return;
      }

      // 2. Check if user is a Client User (either by auth_user_id or by email)
      try {
        let clientUserData: any = null;
        const { data: cuData, error: clientUserErr } = await supabaseAnonQuery
          .from('client_users')
          .select('*')
          .or(`auth_user_id.eq.${user.id},email.ilike.${normalizedEmail}`)
          .maybeSingle();

        clientUserData = cuData;

        // Fallback: If not found in client_users, check if user is the registered owner of an active client
        if (!clientUserData && normalizedEmail) {
          const { data: clientRecord } = await supabaseAnonQuery
            .from('clients')
            .select('id, business_name, email, status, owner_name, customer_name, phone')
            .ilike('email', normalizedEmail)
            .maybeSingle();

          if (clientRecord && clientRecord.status === 'active') {
            clientUserData = {
              id: user.id,
              client_id: clientRecord.id,
              auth_user_id: user.id,
              name: clientRecord.owner_name || clientRecord.customer_name || 'مالك المنشأة',
              email: normalizedEmail,
              phone: clientRecord.phone || null,
              role: 'owner' as const,
              status: 'active' as const,
              custom_permissions: ['*'],
            };
          }
        }

        if (clientUserData) {
          // Reject inactive user with clear reason
          if (clientUserData.status === 'inactive') {
            await supabase.auth.signOut();
            set({ 
              user: null, 
              session: null, 
              userType: null,
              isSuperAdmin: false, 
              clientUser: null,
              initialized: true, 
              loading: false 
            });
            throw new Error('حسابك معطل حالياً من قبل إدارة المنشأة. يرجى مراجعة المشرف.');
          }

          const now = new Date().toISOString();

          // Link auth_user_id if not yet linked
          if (!clientUserData.auth_user_id && user.id) {
            try {
              await supabaseAnonQuery
                .from('client_users')
                .update({ auth_user_id: user.id, last_login_at: now })
                .eq('id', clientUserData.id);
            } catch (e) {
              console.warn('Could not update client_user auth_user_id:', e);
            }
            clientUserData.auth_user_id = user.id;
          } else {
            try {
              await supabaseAnonQuery
                .from('client_users')
                .update({ last_login_at: now })
                .eq('id', clientUserData.id);
            } catch (e) {
              console.warn('Could not update client_user last_login_at:', e);
            }
          }

          clientUserData.last_login_at = now;

          // Record user_login in Activity Logs
          try {
            await supabase.from('activity_logs').insert({
              actor_type: 'client_user',
              actor_id: user.id,
              action: 'user_login',
              entity_type: 'client_user',
              entity_id: clientUserData.id,
              metadata: {
                client_id: clientUserData.client_id,
                name: clientUserData.name,
                role: clientUserData.role,
              },
            });
          } catch (logErr) {
            console.warn('Activity log for login failed:', logErr);
          }

          // Cache user credentials for offline POS continuity
          try {
            localStorage.setItem('ordexa_cached_client_user', JSON.stringify(clientUserData));
            localStorage.setItem('ordexa_cached_auth_user', JSON.stringify(user));
            localStorage.setItem('ordexa_cached_user_type', 'client_user');
          } catch {}

          set({
            user,
            session,
            userType: 'client_user',
            isSuperAdmin: false,
            clientUser: clientUserData as ClientUser,
            initialized: true,
            loading: false,
          });
          return;
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('معطل') || err.message.includes('حسابك'))) {
          throw err;
        }
        console.warn('Client users table query warning:', err);
      }

      // Fallback to offline cached user if offline or network unavailable
      const cachedCuStr = typeof localStorage !== 'undefined' ? localStorage.getItem('ordexa_cached_client_user') : null;
      if (cachedCuStr && (typeof navigator !== 'undefined' && !navigator.onLine)) {
        try {
          const cachedCu = JSON.parse(cachedCuStr);
          set({
            user,
            session,
            userType: 'client_user',
            isSuperAdmin: false,
            clientUser: cachedCu as ClientUser,
            initialized: true,
            loading: false,
          });
          return;
        } catch {}
      }

      // Neither active super admin nor active client user
      console.warn('User has no active roles in Ordexa system.');
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await supabase.auth.signOut();
      }
      set({ 
        user: null, 
        session: null, 
        userType: null,
        isSuperAdmin: false, 
        clientUser: null,
        initialized: true, 
        loading: false 
      });
      throw new Error('هذا الحساب غير مسجل أو غير مرتبط بمنشأة نشطة في نظام Ordexa.');
    } catch (error: any) {
      console.error('Error determining user role:', error);
      await supabase.auth.signOut();
      set({ 
        user: null, 
        session: null, 
        userType: null,
        isSuperAdmin: false, 
        clientUser: null,
        initialized: true, 
        loading: false 
      });
      throw error;
    }
  },

  // Backwards compatibility alias for checkAdminRole
  checkAdminRole: async (user: User, session: Session) => {
    return get().determineUserRole(user, session);
  },

  loginOffline: (record: OfflineCredentialRecord) => {
    const offlineUser = {
      id: record.auth_user_id,
      email: record.email,
      app_metadata: {},
      user_metadata: { name: record.name },
      aud: 'authenticated',
      created_at: record.created_at,
    } as unknown as User;

    const offlineClientUser: ClientUser = {
      id: record.client_user_id,
      client_id: record.client_id,
      auth_user_id: record.auth_user_id,
      name: record.name || 'الكاشير',
      email: record.email,
      phone: record.phone || '',
      role: (record.role as any) || 'cashier',
      status: 'active',
      custom_permissions: record.permissions || [],
      created_at: record.created_at,
      updated_at: record.created_at,
    };

    try {
      localStorage.setItem('ordexa_cached_client_user', JSON.stringify(offlineClientUser));
      localStorage.setItem('ordexa_cached_auth_user', JSON.stringify(offlineUser));
      localStorage.setItem('ordexa_cached_user_type', 'client_user');
      localStorage.setItem('ordexa_last_client_code', record.client_code);
    } catch {}

    set({
      user: offlineUser,
      session: null,
      authMode: 'offline',
      userType: 'client_user',
      isSuperAdmin: false,
      clientUser: offlineClientUser,
      initialized: true,
      loading: false,
    });
  },

  signOut: async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('SignOut error:', error);
    } finally {
      set({ 
        user: null, 
        session: null, 
        authMode: 'online',
        userType: null,
        isSuperAdmin: false, 
        clientUser: null,
        initialized: true, 
        loading: false 
      });
    }
  }
}));

