/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://xtfzgootudafgdwoxsnf.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Znpnb290dWRhZmdkd294c25mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODk2MzA5OSwiZXhwIjoyMTA0NTM5MDk5fQ.zHYczV8V_ymlwyXGK2JeCY4_QD2VfnCVDKe6Hjnpgds';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// We track if it is misconfigured so we can show a warning in the UI
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Unauthenticated client instance specifically for reading role definitions and global metadata
// without triggering recursive RLS policies on relations like super_admin_users
export const supabaseAnonQuery = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
