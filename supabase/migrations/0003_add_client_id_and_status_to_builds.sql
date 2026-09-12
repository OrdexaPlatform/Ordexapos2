-- Migration: 0003_add_client_id_and_status_to_builds.sql
-- Description: Adds optional client_id to builds table for client-customized builds,
-- and updates status constraint to support 'draft', 'building', 'ready', 'failed', 'archived', 'published', 'deprecated'.
-- NOTE: Safe migration. Does not drop any tables, columns, or data.

-- 1. Add client_id column to builds table referencing clients table (nullable to allow general release builds or client-specific builds)
ALTER TABLE public.builds 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- 2. Update status check constraint on builds table safely
ALTER TABLE public.builds DROP CONSTRAINT IF EXISTS builds_status_check;
ALTER TABLE public.builds ADD CONSTRAINT builds_status_check 
CHECK (status IN ('draft', 'building', 'ready', 'failed', 'archived', 'published', 'deprecated'));

-- 3. Create index on client_id for performance
CREATE INDEX IF NOT EXISTS idx_builds_client_id ON public.builds(client_id);
