-- Migration: 0010_client_delivery_features.sql
-- Purpose: Support client delivery verification, initial user provisioning, and preview logging

-- 1. Indexing for fast delivery and user lookups
CREATE INDEX IF NOT EXISTS idx_client_users_client_role ON public.client_users(client_id, role);
CREATE INDEX IF NOT EXISTS idx_licenses_client_status ON public.licenses(client_id, status);

-- 2. Function to log preview access in activity_logs
CREATE OR REPLACE FUNCTION public.log_client_preview_access(
    p_client_id UUID,
    p_actor_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.activity_logs (
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        'super_admin',
        COALESCE(p_actor_id, auth.uid()),
        'client_preview_accessed',
        'client',
        p_client_id,
        jsonb_build_object('client_id', p_client_id, 'timestamp', NOW()),
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
