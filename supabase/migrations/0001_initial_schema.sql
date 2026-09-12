-- Ordexa Architecture Foundation - Initial Schema
-- This schema establishes the core Control Center structure and its Row Level Security (RLS)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. clients table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_type TEXT,
    owner_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    logo TEXT,
    currency TEXT DEFAULT 'USD',
    language TEXT DEFAULT 'ar',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. licenses table
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    license_key TEXT UNIQUE NOT NULL,
    license_type TEXT NOT NULL,
    max_devices INT NOT NULL DEFAULT 1,
    activated_devices INT NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_date TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. devices table
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_fingerprint TEXT UNIQUE NOT NULL,
    operating_system TEXT,
    app_version TEXT,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
    deactivated_at TIMESTAMPTZ
);

-- 4. builds table
CREATE TABLE IF NOT EXISTS public.builds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version TEXT NOT NULL,
    build_number INT NOT NULL,
    release_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
    minimum_supported_version TEXT,
    release_notes TEXT,
    download_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(version, build_number)
);

-- 5. client_downloads table
CREATE TABLE IF NOT EXISTS public.client_downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    build_id UUID NOT NULL REFERENCES public.builds(id) ON DELETE CASCADE,
    download_token TEXT UNIQUE NOT NULL,
    download_url TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    download_count INT DEFAULT 0,
    last_downloaded_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('super_admin', 'client_device', 'system')),
    actor_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. super_admin_users table
-- Relies on Supabase Auth (auth.users)
CREATE TABLE IF NOT EXISTS public.super_admin_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-------------------------------------------------------
-- Security: Row Level Security (RLS)
-------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_users ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is an active super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.super_admin_users 
    WHERE id = auth.uid() 
    AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for Super Admins
-- Only active super admins can do CRUD on these tables via the UI

-- clients
CREATE POLICY "Super admins can do all on clients" ON public.clients FOR ALL USING (public.is_super_admin());

-- licenses
CREATE POLICY "Super admins can do all on licenses" ON public.licenses FOR ALL USING (public.is_super_admin());

-- devices
CREATE POLICY "Super admins can do all on devices" ON public.devices FOR ALL USING (public.is_super_admin());

-- builds
CREATE POLICY "Super admins can do all on builds" ON public.builds FOR ALL USING (public.is_super_admin());

-- client_downloads
CREATE POLICY "Super admins can do all on client_downloads" ON public.client_downloads FOR ALL USING (public.is_super_admin());

-- activity_logs
-- Only insert (system/client) and select (super admin) should generally happen, but for foundation:
CREATE POLICY "Super admins can select activity logs" ON public.activity_logs FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Super admins can insert activity logs" ON public.activity_logs FOR INSERT WITH CHECK (public.is_super_admin());

-- super_admin_users
CREATE POLICY "Super admins can read super_admin_users" ON public.super_admin_users FOR SELECT USING (public.is_super_admin() OR auth.uid() = id);
CREATE POLICY "Super admins can manage super_admin_users" ON public.super_admin_users FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.super_admin_users 
        WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
    )
);

-------------------------------------------------------
-- Triggers for updated_at
-------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_modtime BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_licenses_modtime BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_super_admin_users_modtime BEFORE UPDATE ON public.super_admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
