-- ============================================================================
-- Migration: 0010_offline_pos_and_desktop.sql
-- Description: Phase 12 — Windows Desktop POS, Idempotent Offline Sync &
--              Terminal Hardware Metadata tracking.
-- Status: Non-breaking extension for Phase 12.
-- ============================================================================

-- 1. Extend Sales table for offline synchronization and idempotency
ALTER TABLE public.sales 
    ADD COLUMN IF NOT EXISTS local_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS is_offline_sync BOOLEAN NOT NULL DEFAULT FALSE;

-- Create unique index to strictly guarantee idempotency (no duplicate sales on retry)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_local_tx 
    ON public.sales(client_id, local_transaction_id) 
    WHERE local_transaction_id IS NOT NULL;

-- 2. Extend Devices table for Windows Desktop hardware metadata
ALTER TABLE public.devices 
    ADD COLUMN IF NOT EXISTS is_desktop_app BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hostname TEXT,
    ADD COLUMN IF NOT EXISTS mac_address TEXT;

-- 3. Helpful comment documenting Phase 12 enhancements
COMMENT ON COLUMN public.sales.local_transaction_id IS 'Unique client-generated transaction ID for offline sales idempotency';
COMMENT ON COLUMN public.sales.is_offline_sync IS 'True if the sale was captured offline and synced to the cloud';
COMMENT ON COLUMN public.devices.is_desktop_app IS 'True if the terminal device is running the native Windows Desktop Electron app';
