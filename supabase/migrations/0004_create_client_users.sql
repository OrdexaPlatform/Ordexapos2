-- Migration: 0004_create_client_users.sql
-- Purpose: Establish client_users table for multi-role POS client foundation

CREATE TABLE IF NOT EXISTS public.client_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'inventory', 'accountant')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for fast lookups
CREATE INDEX IF NOT EXISTS idx_client_users_client_id ON public.client_users(client_id);
CREATE INDEX IF NOT EXISTS idx_client_users_auth_user_id ON public.client_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_client_users_email ON public.client_users(email);

-- Enable RLS
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at
CREATE TRIGGER update_client_users_modtime 
BEFORE UPDATE ON public.client_users 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Policies:
-- 1. Super Admins can manage all client users
CREATE POLICY "Super admins can manage client_users" 
ON public.client_users 
FOR ALL 
USING (public.is_super_admin());

-- 2. Client users can read their own client_users record or other users of their same client
CREATE POLICY "Client users can read users in their business" 
ON public.client_users 
FOR SELECT 
USING (
    auth_user_id = auth.uid() 
    OR client_id IN (
        SELECT client_id FROM public.client_users WHERE auth_user_id = auth.uid() AND status = 'active'
    )
);
