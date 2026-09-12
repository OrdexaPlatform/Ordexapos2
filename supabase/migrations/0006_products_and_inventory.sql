-- Migration: 0006_products_and_inventory.sql
-- Purpose: Enterprise General POS Products & Inventory Engine (Phase 8)
-- Tables: product_categories, product_brands, product_units, products, 
--         product_barcodes, warehouses, inventory_balances, inventory_transactions, 
--         inventory_transfers, inventory_transfer_items
-- Includes: RLS Policies, Indexes, Integrity Constraints, and Atomic Inventory RPC Functions

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. Product Categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_categories_client_name_key UNIQUE (client_id, name)
);

-- ============================================================================
-- 2. Product Brands
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_brands_client_name_key UNIQUE (client_id, name)
);

-- ============================================================================
-- 3. Product Units (piece, box, kg, liter, meter, pack, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_units_client_name_key UNIQUE (client_id, name)
);

-- ============================================================================
-- 4. Warehouses (Multiple Warehouses per client)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    address TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT warehouses_client_name_key UNIQUE (client_id, name)
);

-- ============================================================================
-- 5. Products (General POS, Retail, Supermarket, Electronics, Clothing, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES public.product_brands(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES public.product_units(id) ON DELETE SET NULL,
    cost_price NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (cost_price >= 0),
    selling_price NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (selling_price >= 0),
    tax_rate NUMERIC(6, 3) NOT NULL DEFAULT 0.000 CHECK (tax_rate >= 0),
    min_stock NUMERIC(15, 3) NOT NULL DEFAULT 0.000 CHECK (min_stock >= 0),
    current_stock NUMERIC(15, 3) NOT NULL DEFAULT 0.000,
    track_stock BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Variant Foundation (Size, Color, Model, etc.)
    has_variants BOOLEAN NOT NULL DEFAULT false,
    parent_product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    variant_attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT products_client_sku_key UNIQUE (client_id, sku)
);

-- Unique index for product primary barcode when populated
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_client_barcode_unique 
ON public.products (client_id, barcode) 
WHERE barcode IS NOT NULL AND barcode != '';

-- ============================================================================
-- 6. Product Barcodes (Supports multiple barcodes per product)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.product_barcodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_barcodes_client_barcode_key UNIQUE (client_id, barcode)
);

-- ============================================================================
-- 7. Inventory Balances (Product stock per Warehouse)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    quantity NUMERIC(15, 3) NOT NULL DEFAULT 0.000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inventory_balances_client_product_wh_key UNIQUE (client_id, product_id, warehouse_id)
);

-- ============================================================================
-- 8. Inventory Transactions (Double-entry style Stock Ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'opening', 
        'purchase', 
        'sale', 
        'sale_return', 
        'purchase_return', 
        'adjustment_in', 
        'adjustment_out', 
        'transfer_in', 
        'transfer_out', 
        'damage'
    )),
    quantity NUMERIC(15, 3) NOT NULL,
    unit_cost NUMERIC(15, 4) DEFAULT 0.0000,
    reference_type TEXT,
    reference_id TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. Inventory Transfers (Inter-Warehouse Transfers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    transfer_number TEXT NOT NULL,
    from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT inventory_transfers_client_number_key UNIQUE (client_id, transfer_number),
    CONSTRAINT chk_transfers_different_warehouses CHECK (from_warehouse_id != to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(15, 3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15, 4) DEFAULT 0.0000
);

-- ============================================================================
-- 10. Performance Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_client_sku ON public.products (client_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_client_category ON public.products (client_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_client_brand ON public.products (client_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_products_client_active ON public.products (client_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_client_stock ON public.products (client_id, track_stock, current_stock);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_lookup ON public.product_barcodes (client_id, barcode);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON public.product_barcodes (product_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_client_active ON public.warehouses (client_id, is_active);

CREATE INDEX IF NOT EXISTS idx_inv_balances_lookup ON public.inventory_balances (client_id, product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_balances_warehouse ON public.inventory_balances (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_inv_transactions_history ON public.inventory_transactions (client_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_type ON public.inventory_transactions (client_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_ref ON public.inventory_transactions (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_inv_transfers_client ON public.inventory_transfers (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_status ON public.inventory_transfers (client_id, status);

-- ============================================================================
-- 11. Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

-- Product Categories
CREATE POLICY "product_categories_select_policy" ON public.product_categories
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_categories_insert_policy" ON public.product_categories
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_categories_update_policy" ON public.product_categories
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_categories_delete_policy" ON public.product_categories
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Product Brands
CREATE POLICY "product_brands_select_policy" ON public.product_brands
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_brands_insert_policy" ON public.product_brands
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_brands_update_policy" ON public.product_brands
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_brands_delete_policy" ON public.product_brands
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Product Units
CREATE POLICY "product_units_select_policy" ON public.product_units
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_units_insert_policy" ON public.product_units
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_units_update_policy" ON public.product_units
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_units_delete_policy" ON public.product_units
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Warehouses
CREATE POLICY "warehouses_select_policy" ON public.warehouses
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "warehouses_insert_policy" ON public.warehouses
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "warehouses_update_policy" ON public.warehouses
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "warehouses_delete_policy" ON public.warehouses
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Products
CREATE POLICY "products_select_policy" ON public.products
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "products_insert_policy" ON public.products
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "products_update_policy" ON public.products
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "products_delete_policy" ON public.products
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Product Barcodes
CREATE POLICY "product_barcodes_select_policy" ON public.product_barcodes
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_barcodes_insert_policy" ON public.product_barcodes
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_barcodes_update_policy" ON public.product_barcodes
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "product_barcodes_delete_policy" ON public.product_barcodes
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Inventory Balances
CREATE POLICY "inventory_balances_select_policy" ON public.inventory_balances
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "inventory_balances_insert_policy" ON public.inventory_balances
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "inventory_balances_update_policy" ON public.inventory_balances
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "inventory_balances_delete_policy" ON public.inventory_balances
    FOR DELETE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Inventory Transactions (Ledger is append-only)
CREATE POLICY "inventory_transactions_select_policy" ON public.inventory_transactions
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "inventory_transactions_insert_policy" ON public.inventory_transactions
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Inventory Transfers
CREATE POLICY "inventory_transfers_select_policy" ON public.inventory_transfers
    FOR SELECT USING (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "inventory_transfers_insert_policy" ON public.inventory_transfers
    FOR INSERT WITH CHECK (public.is_super_admin() OR client_id = public.get_current_client_id());
CREATE POLICY "inventory_transfers_update_policy" ON public.inventory_transfers
    FOR UPDATE USING (public.is_super_admin() OR client_id = public.get_current_client_id());

-- Inventory Transfer Items
CREATE POLICY "inventory_transfer_items_select_policy" ON public.inventory_transfer_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.inventory_transfers t
            WHERE t.id = inventory_transfer_items.transfer_id
              AND (public.is_super_admin() OR t.client_id = public.get_current_client_id())
        )
    );
CREATE POLICY "inventory_transfer_items_insert_policy" ON public.inventory_transfer_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.inventory_transfers t
            WHERE t.id = inventory_transfer_items.transfer_id
              AND (public.is_super_admin() OR t.client_id = public.get_current_client_id())
        )
    );

-- ============================================================================
-- 12. Atomic Inventory RPC Procedures (Concurrency-safe Stock Mutations)
-- ============================================================================

-- A. Record Opening Stock
CREATE OR REPLACE FUNCTION public.record_stock_opening(
    p_client_id UUID,
    p_product_id UUID,
    p_warehouse_id UUID,
    p_quantity NUMERIC,
    p_unit_cost NUMERIC DEFAULT 0.0000,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_stock NUMERIC;
BEGIN
    -- 1. Insert Stock Ledger Transaction
    INSERT INTO public.inventory_transactions (
        client_id,
        product_id,
        warehouse_id,
        transaction_type,
        quantity,
        unit_cost,
        reference_type,
        notes,
        created_by
    ) VALUES (
        p_client_id,
        p_product_id,
        p_warehouse_id,
        'opening',
        p_quantity,
        p_unit_cost,
        'manual_opening',
        COALESCE(p_notes, 'رصيد افتتاحي للمخزون'),
        p_created_by
    );

    -- 2. Upsert warehouse balance
    INSERT INTO public.inventory_balances (
        client_id,
        product_id,
        warehouse_id,
        quantity,
        updated_at
    ) VALUES (
        p_client_id,
        p_product_id,
        p_warehouse_id,
        p_quantity,
        NOW()
    )
    ON CONFLICT (client_id, product_id, warehouse_id)
    DO UPDATE SET 
        quantity = public.inventory_balances.quantity + EXCLUDED.quantity,
        updated_at = NOW();

    -- 3. Update product total current_stock
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_stock
    FROM public.inventory_balances
    WHERE client_id = p_client_id AND product_id = p_product_id;

    UPDATE public.products
    SET current_stock = v_total_stock,
        cost_price = CASE WHEN p_unit_cost > 0 THEN p_unit_cost ELSE cost_price END,
        updated_at = NOW()
    WHERE id = p_product_id AND client_id = p_client_id;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'warehouse_id', p_warehouse_id,
        'quantity_added', p_quantity,
        'new_total_stock', v_total_stock
    );
END;
$$;

-- B. Record Stock Adjustment (In or Out)
CREATE OR REPLACE FUNCTION public.record_stock_adjustment(
    p_client_id UUID,
    p_product_id UUID,
    p_warehouse_id UUID,
    p_adjustment_type TEXT, -- 'adjustment_in' or 'adjustment_out'
    p_quantity NUMERIC,     -- absolute positive number
    p_unit_cost NUMERIC DEFAULT 0.0000,
    p_reason TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_signed_qty NUMERIC;
    v_total_stock NUMERIC;
    v_current_wh_stock NUMERIC := 0;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'يجب أن تكون الكمية أكبر من الصفر';
    END IF;

    IF p_adjustment_type NOT IN ('adjustment_in', 'adjustment_out') THEN
        RAISE EXCEPTION 'نوع التسوية غير صالح: %', p_adjustment_type;
    END IF;

    -- Compute signed delta
    IF p_adjustment_type = 'adjustment_in' THEN
        v_signed_qty := p_quantity;
    ELSE
        v_signed_qty := -p_quantity;
    END IF;

    -- 1. Insert Stock Ledger Transaction
    INSERT INTO public.inventory_transactions (
        client_id,
        product_id,
        warehouse_id,
        transaction_type,
        quantity,
        unit_cost,
        reference_type,
        notes,
        created_by
    ) VALUES (
        p_client_id,
        p_product_id,
        p_warehouse_id,
        p_adjustment_type,
        v_signed_qty,
        p_unit_cost,
        COALESCE(p_reason, 'manual_adjustment'),
        p_notes,
        p_created_by
    );

    -- 2. Upsert warehouse balance
    INSERT INTO public.inventory_balances (
        client_id,
        product_id,
        warehouse_id,
        quantity,
        updated_at
    ) VALUES (
        p_client_id,
        p_product_id,
        p_warehouse_id,
        v_signed_qty,
        NOW()
    )
    ON CONFLICT (client_id, product_id, warehouse_id)
    DO UPDATE SET 
        quantity = public.inventory_balances.quantity + EXCLUDED.quantity,
        updated_at = NOW();

    -- 3. Update product total current_stock
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_stock
    FROM public.inventory_balances
    WHERE client_id = p_client_id AND product_id = p_product_id;

    UPDATE public.products
    SET current_stock = v_total_stock,
        updated_at = NOW()
    WHERE id = p_product_id AND client_id = p_client_id;

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'warehouse_id', p_warehouse_id,
        'delta', v_signed_qty,
        'new_total_stock', v_total_stock
    );
END;
$$;

-- C. Execute Inter-Warehouse Inventory Transfer
CREATE OR REPLACE FUNCTION public.execute_inventory_transfer(
    p_client_id UUID,
    p_from_warehouse_id UUID,
    p_to_warehouse_id UUID,
    p_items JSONB, -- Array of { "product_id": "...", "quantity": 10, "unit_cost": 5 }
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer_id UUID;
    v_transfer_number TEXT;
    v_item RECORD;
    v_item_product_id UUID;
    v_item_qty NUMERIC;
    v_item_cost NUMERIC;
    v_from_wh_qty NUMERIC;
    v_to_wh_qty NUMERIC;
    v_total_stock NUMERIC;
BEGIN
    IF p_from_warehouse_id = p_to_warehouse_id THEN
        RAISE EXCEPTION 'لا يمكن التحويل لنفس المستودع';
    END IF;

    -- Generate Transfer Number: TRF-YYYYMMDD-XXXX
    v_transfer_number := 'TRF-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 1. Create Transfer Record
    INSERT INTO public.inventory_transfers (
        client_id,
        transfer_number,
        from_warehouse_id,
        to_warehouse_id,
        status,
        notes,
        created_by
    ) VALUES (
        p_client_id,
        v_transfer_number,
        p_from_warehouse_id,
        p_to_warehouse_id,
        'completed',
        p_notes,
        p_created_by
    )
    RETURNING id INTO v_transfer_id;

    -- 2. Process Transfer Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC)
    LOOP
        v_item_product_id := v_item.product_id;
        v_item_qty := v_item.quantity;
        v_item_cost := COALESCE(v_item.unit_cost, 0);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'كمية التحويل يجب أن تكون أكبر من الصفر للصنف %', v_item_product_id;
        END IF;

        -- Record Item
        INSERT INTO public.inventory_transfer_items (
            transfer_id,
            product_id,
            quantity,
            unit_cost
        ) VALUES (
            v_transfer_id,
            v_item_product_id,
            v_item_qty,
            v_item_cost
        );

        -- Ledger: transfer_out from source warehouse
        INSERT INTO public.inventory_transactions (
            client_id,
            product_id,
            warehouse_id,
            transaction_type,
            quantity,
            unit_cost,
            reference_type,
            reference_id,
            notes,
            created_by
        ) VALUES (
            p_client_id,
            v_item_product_id,
            p_from_warehouse_id,
            'transfer_out',
            -v_item_qty,
            v_item_cost,
            'inventory_transfer',
            v_transfer_number,
            'تحويل صادر إلى المستودع الهدف',
            p_created_by
        );

        -- Ledger: transfer_in to destination warehouse
        INSERT INTO public.inventory_transactions (
            client_id,
            product_id,
            warehouse_id,
            transaction_type,
            quantity,
            unit_cost,
            reference_type,
            reference_id,
            notes,
            created_by
        ) VALUES (
            p_client_id,
            v_item_product_id,
            p_to_warehouse_id,
            'transfer_in',
            v_item_qty,
            v_item_cost,
            'inventory_transfer',
            v_transfer_number,
            'تحويل وارد من المستودع المصدر',
            p_created_by
        );

        -- Deduct from source warehouse balance
        INSERT INTO public.inventory_balances (
            client_id,
            product_id,
            warehouse_id,
            quantity,
            updated_at
        ) VALUES (
            p_client_id,
            v_item_product_id,
            p_from_warehouse_id,
            -v_item_qty,
            NOW()
        )
        ON CONFLICT (client_id, product_id, warehouse_id)
        DO UPDATE SET 
            quantity = public.inventory_balances.quantity - EXCLUDED.quantity,
            updated_at = NOW();

        -- Add to target warehouse balance
        INSERT INTO public.inventory_balances (
            client_id,
            product_id,
            warehouse_id,
            quantity,
            updated_at
        ) VALUES (
            p_client_id,
            v_item_product_id,
            p_to_warehouse_id,
            v_item_qty,
            NOW()
        )
        ON CONFLICT (client_id, product_id, warehouse_id)
        DO UPDATE SET 
            quantity = public.inventory_balances.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- Total current_stock remains consistent
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_stock
        FROM public.inventory_balances
        WHERE client_id = p_client_id AND product_id = v_item_product_id;

        UPDATE public.products
        SET current_stock = v_total_stock,
            updated_at = NOW()
        WHERE id = v_item_product_id AND client_id = p_client_id;

    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_transfer_id,
        'transfer_number', v_transfer_number
    );
END;
$$;
