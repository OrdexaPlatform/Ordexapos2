-- Migration: 0002_add_suspended_to_licenses_status.sql
-- Purpose: Allow 'suspended' status in public.licenses status constraint

ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_status_check;
ALTER TABLE public.licenses ADD CONSTRAINT licenses_status_check CHECK (status IN ('active', 'suspended', 'expired', 'revoked'));
