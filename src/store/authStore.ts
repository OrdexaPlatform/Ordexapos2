import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { ClientUser } from '../types';

export type UserType = 'super_admin' | 'client_user' | null;

interface AuthState {
  user: User | null;
  session: Session | null;
  userType: UserType;
  isSuperAdmin: boolean;
  clientUser: ClientUser | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  determineUserRole: (user: User, session: Session) => Promise<void>;
  checkAdminRole: (user: User, session: Session) => Promise<void>;
}

let isInitializing = false;
let authListenerAttached = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await get().determineUserRole(session.user, session);
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
      // 1. Check if user is a Super Admin
      const { data: adminData, error: adminErr } = await supabase
        .from('super_admin_users')
        .select('role, status')
        .eq('id', user.id)
        .maybeSingle();

      if (!adminErr && adminData && (adminData.role === 'super_admin' || adminData.role === 'admin') && adminData.status === 'active') {
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
        const { data: clientUserData, error: clientUserErr } = await supabase
          .from('client_users')
          .select('*')
          .or(`auth_user_id.eq.${user.id},email.eq.${user.email || ''}`)
          .maybeSingle();

        if (!clientUserErr && clientUserData) {
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
            await supabase
              .from('client_users')
              .update({ auth_user_id: user.id, last_login_at: now })
              .eq('id', clientUserData.id);
            clientUserData.auth_user_id = user.id;
          } else {
            await supabase
              .from('client_users')
              .update({ last_login_at: now })
              .eq('id', clientUserData.id);
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
        if (err.message && err.message.includes('معطل')) {
          throw err;
        }
        console.warn('Client users table query warning:', err);
      }

      // Neither active super admin nor active client user
      console.warn('User has no active roles in Ordexa system.');
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
    } catch (error) {
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
    }
  },

  // Backwards compatibility alias for checkAdminRole
  checkAdminRole: async (user: User, session: Session) => {
    return get().determineUserRole(user, session);
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('SignOut error:', error);
    } finally {
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
  }
}));

