-- Migration: 0005_client_permissions_and_rls.sql
-- Purpose: Support custom permissions, Client Admin management, and client_user activity logs

-- 1. Add custom_permissions to client_users if not exists
ALTER TABLE public.client_users 
ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '[]'::jsonb;

-- 2. Update actor_type check constraint in activity_logs to allow 'client_user'
ALTER TABLE public.activity_logs 
DROP CONSTRAINT IF EXISTS activity_logs_actor_type_check;

ALTER TABLE public.activity_logs 
ADD CONSTRAINT activity_logs_actor_type_check 
CHECK (actor_type IN ('super_admin', 'client_device', 'system', 'client_user'));

-- 3. RLS Policies for client_users table

-- Allow Client Admins & Owners to insert users for their own client only
CREATE POLICY "Client admins and owners can insert client_users" 
ON public.client_users 
FOR INSERT 
WITH CHECK (
    -- Super admins can insert for any client
    public.is_super_admin()
    OR
    -- Client owner or admin can insert only for their client
    client_id IN (
        SELECT cu.client_id 
        FROM public.client_users cu 
        WHERE cu.auth_user_id = auth.uid() 
          AND cu.role IN ('owner', 'admin') 
          AND cu.status = 'active'
    )
);

-- Allow Client Admins & Owners to update users in their own client
CREATE POLICY "Client admins and owners can update client_users" 
ON public.client_users 
FOR UPDATE 
USING (
    public.is_super_admin()
    OR
    client_id IN (
        SELECT cu.client_id 
        FROM public.client_users cu 
        WHERE cu.auth_user_id = auth.uid() 
          AND cu.role IN ('owner', 'admin') 
          AND cu.status = 'active'
    )
    OR
    -- Allow any user to update their own record (for last_login_at or profile)
    auth_user_id = auth.uid()
);

-- 4. RLS Policy for activity_logs to allow authenticated client users to insert logs
CREATE POLICY "Authenticated client users can insert activity logs" 
ON public.activity_logs 
FOR INSERT 
WITH CHECK (
    auth.uid() IS NOT NULL
);

-- 5. Helper function to get current user's client_id
CREATE OR REPLACE FUNCTION public.get_current_client_id()
RETURNS UUID AS $$
DECLARE
    cid UUID;
BEGIN
    SELECT client_id INTO cid 
    FROM public.client_users 
    WHERE auth_user_id = auth.uid() 
      AND status = 'active'
    LIMIT 1;
    RETURN cid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
