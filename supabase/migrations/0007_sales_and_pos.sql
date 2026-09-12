-- ============================================================================
-- Migration: 0007_sales_and_pos.sql
-- Description: Phase 9 — POS & Sales Engine (Sales, Sale Items, Payments,
--              Atomic Counter, Complete Sale RPC with Stock Decrement,
--              Atomic Void Sale RPC with Stock Reversal, and RLS Policies).
-- Status: Created and ready for manual execution.
-- ============================================================================

-- 1. Client Invoice Sequences (Atomic, collision-free per-client invoice numbers)
CREATE TABLE IF NOT EXISTS public.client_invoice_sequences (
    client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
    prefix TEXT NOT NULL DEFAULT 'INV-',
    last_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for sequences
CREATE INDEX IF NOT EXISTS idx_invoice_sequences_client ON public.client_invoice_sequences(client_id);

-- Helper Function: Get next invoice number atomically with client isolation
CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_client_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super_admin BOOLEAN;
    v_target_client_id UUID;
    v_prefix TEXT;
    v_next_num BIGINT;
    v_invoice_str TEXT;
BEGIN
    -- 1. Must be authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً';
    END IF;

    -- 2. Resolve client ID with Client Isolation
    v_is_super_admin := public.is_super_admin();

    IF v_is_super_admin THEN
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب للمشرف العام';
        END IF;
        v_target_client_id := p_client_id;
    ELSE
        SELECT client_id INTO v_target_client_id
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_target_client_id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له أو حسابه غير نشط';
        END IF;

        IF p_client_id IS NOT NULL AND p_client_id != v_target_client_id THEN
            RAISE EXCEPTION 'غير مصرح لك بالحصول على تسلسل فواتير لمنشأة أخرى';
        END IF;
    END IF;

    -- 3. Lock sequence row atomically (FOR UPDATE) - collision-free
    SELECT prefix, last_number
    INTO v_prefix, v_next_num
    FROM public.client_invoice_sequences
    WHERE client_id = v_target_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_prefix := 'INV-';
        v_next_num := 1;
        INSERT INTO public.client_invoice_sequences (client_id, prefix, last_number, updated_at)
        VALUES (v_target_client_id, v_prefix, v_next_num, NOW())
        ON CONFLICT (client_id) DO NOTHING;

        -- Re-lock row after upsert
        SELECT prefix, last_number
        INTO v_prefix, v_next_num
        FROM public.client_invoice_sequences
        WHERE client_id = v_target_client_id
        FOR UPDATE;
    ELSE
        v_next_num := v_next_num + 1;
        UPDATE public.client_invoice_sequences
        SET last_number = v_next_num,
            updated_at = NOW()
        WHERE client_id = v_target_client_id;
    END IF;

    -- Format to e.g. INV-000001
    v_invoice_str := v_prefix || LPAD(v_next_num::TEXT, 6, '0');
    RETURN v_invoice_str;
END;
$$;

-- 2. Sales Table
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    customer_id UUID, -- Foundation for future Customers module
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (subtotal >= 0),
    discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (discount_amount >= 0),
    tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_amount >= 0),
    total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_amount >= 0),
    paid_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (paid_amount >= 0),
    change_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (change_amount >= 0),
    payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'partial', 'unpaid')),
    sale_status TEXT NOT NULL DEFAULT 'completed' CHECK (sale_status IN ('draft', 'completed', 'voided', 'returned', 'partially_returned')),
    notes TEXT,
    created_by UUID REFERENCES public.client_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sales_client_invoice_key UNIQUE (client_id, invoice_number)
);

-- Indexes for Sales
CREATE INDEX IF NOT EXISTS idx_sales_client ON public.sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_warehouse ON public.sales(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(sale_status);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON public.sales(created_by);

-- 3. Sale Items Table (Snapshot-based item records)
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_name_snapshot TEXT NOT NULL,
    sku_snapshot TEXT NOT NULL,
    barcode_snapshot TEXT,
    quantity NUMERIC(15, 3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15, 4) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (discount_amount >= 0),
    tax_rate NUMERIC(6, 3) NOT NULL DEFAULT 0.000 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (tax_amount >= 0),
    line_total NUMERIC(15, 4) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Sale Items
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_client ON public.sale_items(client_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items(product_id);

-- 4. Sale Payments Table (Multiple payments foundation)
CREATE TABLE IF NOT EXISTS public.sale_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'wallet', 'other')),
    amount NUMERIC(15, 4) NOT NULL CHECK (amount > 0),
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Sale Payments
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_client ON public.sale_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_method ON public.sale_payments(payment_method);

-- ============================================================================
-- 5. Atomic Complete Sale RPC (Strict Security, Client Isolation & Price Integrity)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_sale(
    p_client_id UUID,
    p_warehouse_id UUID,
    p_items JSONB,
    p_payments JSONB,
    p_discount_amount NUMERIC DEFAULT 0,
    p_customer_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super_admin BOOLEAN := FALSE;
    v_client_user RECORD;
    v_effective_client_id UUID;
    v_effective_created_by UUID;
    v_can_edit_price BOOLEAN := FALSE;
    
    v_invoice_number TEXT;
    v_sale_id UUID;
    v_item RECORD;
    v_stock_lock RECORD;
    v_payment RECORD;
    v_product RECORD;
    v_current_stock NUMERIC(15, 3);
    
    v_custom_price NUMERIC(15, 4);
    v_item_subtotal NUMERIC(15, 4);
    v_item_disc NUMERIC(15, 4);
    v_item_taxable NUMERIC(15, 4);
    v_item_tax_rate NUMERIC(6, 3);
    v_item_tax NUMERIC(15, 4);
    v_item_line_total NUMERIC(15, 4);
    
    v_total_subtotal NUMERIC(15, 4) := 0;
    v_total_line_discounts NUMERIC(15, 4) := 0;
    v_total_tax NUMERIC(15, 4) := 0;
    v_net_items_subtotal NUMERIC(15, 4) := 0;
    v_inv_discount NUMERIC(15, 4) := 0;
    v_final_total NUMERIC(15, 4) := 0;
    v_total_paid NUMERIC(15, 4) := 0;
    v_change_amount NUMERIC(15, 4) := 0;
    v_payment_status TEXT := 'paid';
BEGIN
    -- 1. Authentication Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً لإتمام البيع';
    END IF;

    v_is_super_admin := public.is_super_admin();

    -- 2. Client Resolution & User Permission Validation
    IF NOT v_is_super_admin THEN
        -- Resolve authenticated client user
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له أو حسابه غير نشط في النظام';
        END IF;

        -- Enforce strict client isolation (never trust p_client_id from frontend)
        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح لك بإتمام البيع لمنشأة أخرى';
        END IF;

        -- Operator identity is extracted from authenticated mapping (never trust p_created_by)
        v_effective_created_by := v_client_user.id;

        -- Check POS / Sales creation permission
        IF NOT (
            v_client_user.role IN ('owner', 'admin', 'manager', 'cashier')
            OR v_client_user.custom_permissions ? 'pos.create'
            OR v_client_user.custom_permissions ? 'sales.create'
            OR v_client_user.custom_permissions ? 'pos.*'
            OR v_client_user.custom_permissions ? 'sales.*'
            OR v_client_user.custom_permissions ? '*'
        ) THEN
            RAISE EXCEPTION 'ليس لديك صلاحية إتمام عمليات البيع (pos.create)';
        END IF;

        -- Check permission to edit price during checkout (pos.edit_price)
        v_can_edit_price := (
            v_client_user.role IN ('owner', 'admin', 'manager')
            OR v_client_user.custom_permissions ? 'pos.edit_price'
            OR v_client_user.custom_permissions ? 'pos.*'
            OR v_client_user.custom_permissions ? '*'
        );
    ELSE
        -- Super Admin flow
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب لإتمام البيع';
        END IF;
        v_effective_client_id := p_client_id;
        -- Use client user if linked, or provided creator
        SELECT id INTO v_effective_created_by
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND client_id = p_client_id AND status = 'active'
        LIMIT 1;
        IF v_effective_created_by IS NULL THEN
            v_effective_created_by := p_created_by;
        END IF;
        v_can_edit_price := TRUE;
    END IF;

    -- 3. Verify Warehouse belongs to the resolved client and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.warehouses 
        WHERE id = p_warehouse_id AND client_id = v_effective_client_id AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'المستودع المحدد غير موجود أو غير نشط أو لا يتبع هذه المنشأة';
    END IF;

    -- 4. Verify Items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'سلة المبيعات فارغة، يرجى إضافة صنف واحد على الأقل';
    END IF;

    -- 5. Verify Payments array and calculate total paid
    IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
        RAISE EXCEPTION 'يجب تحديد طريقة دفع واحدة على الأقل ومبلغ الدفع';
    END IF;

    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS x(
        payment_method TEXT,
        amount NUMERIC,
        reference TEXT
    ) LOOP
        IF v_payment.amount <= 0 THEN
            RAISE EXCEPTION 'مبلغ الدفع يجب أن يكون أكبر من الصفر';
        END IF;
        IF v_payment.payment_method NOT IN ('cash', 'card', 'bank_transfer', 'wallet', 'other') THEN
            RAISE EXCEPTION 'طريقة الدفع غير صالحة: %', v_payment.payment_method;
        END IF;
        v_total_paid := v_total_paid + v_payment.amount;
    END LOOP;

    -- 6. STOCK CONCURRENCY & DEADLOCK-FREE LOCKING PASS
    -- Aggregate total requested quantity per product across duplicate cart rows
    -- and order by product_id to ensure consistent locking order (preventing deadlocks).
    FOR v_stock_lock IN
        SELECT 
            (x->>'product_id')::UUID AS prod_id,
            SUM((x->>'quantity')::NUMERIC) AS req_qty
        FROM jsonb_array_elements(p_items) AS x
        GROUP BY 1
        ORDER BY 1
    LOOP
        IF v_stock_lock.prod_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنتج مفقود في أحد أصناف السلة';
        END IF;

        IF v_stock_lock.req_qty <= 0 THEN
            RAISE EXCEPTION 'كمية الصنف يجب أن تكون أكبر من الصفر';
        END IF;

        -- Lock product row FOR UPDATE
        SELECT * INTO v_product 
        FROM public.products 
        WHERE id = v_stock_lock.prod_id AND client_id = v_effective_client_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المنتج المحدد غير موجود في سجل المنشأة';
        END IF;

        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'المنتج (%) غير نشط حالياً ولا يمكن بيعه', v_product.name;
        END IF;

        -- If product tracks stock, lock inventory_balances FOR UPDATE and verify sufficiency
        IF v_product.track_stock THEN
            SELECT quantity INTO v_current_stock
            FROM public.inventory_balances
            WHERE client_id = v_effective_client_id 
              AND product_id = v_stock_lock.prod_id 
              AND warehouse_id = p_warehouse_id
            FOR UPDATE;

            IF v_current_stock IS NULL OR v_current_stock < v_stock_lock.req_qty THEN
                RAISE EXCEPTION 'لا يتوفر رصيد مخزني كافٍ للصنف (%): الرصيد المتاح حالياً (%) والمطلوب (%)',
                    v_product.name, COALESCE(v_current_stock, 0), v_stock_lock.req_qty;
            END IF;
        END IF;
    END LOOP;

    -- 7. SERVER-SIDE PRICE INTEGRITY, TAX & DISCOUNT CALCULATIONS
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_price NUMERIC,
        discount_amount NUMERIC
    ) LOOP
        -- Fetch product details (already locked)
        SELECT * INTO v_product 
        FROM public.products 
        WHERE id = v_item.product_id AND client_id = v_effective_client_id;

        -- Price Integrity Check:
        -- Standard users (e.g. Cashier) cannot override product selling_price without pos.edit_price permission.
        IF NOT v_can_edit_price THEN
            IF v_item.unit_price IS NOT NULL AND ROUND(v_item.unit_price, 4) != ROUND(v_product.selling_price, 4) THEN
                RAISE EXCEPTION 'غير مصرح لك بتعديل سعر بيع الصنف (%). السعر الرسمي: % (الصلاحية المطلوبة: pos.edit_price)',
                    v_product.name, v_product.selling_price;
            END IF;
            v_custom_price := v_product.selling_price;
        ELSE
            v_custom_price := COALESCE(v_item.unit_price, v_product.selling_price);
        END IF;

        IF v_custom_price < 0 THEN
            RAISE EXCEPTION 'سعر بيع الصنف لا يمكن أن يكون سالباً';
        END IF;

        -- Subtotal for this line
        v_item_subtotal := v_item.quantity * v_custom_price;

        -- Line Discount Validation: cannot be negative and cannot exceed item subtotal
        v_item_disc := COALESCE(v_item.discount_amount, 0);
        IF v_item_disc < 0 THEN
            RAISE EXCEPTION 'قيمة خصم الصنف لا يمكن أن تكون سالبة';
        END IF;
        IF v_item_disc > v_item_subtotal THEN
            v_item_disc := v_item_subtotal;
        END IF;

        -- Tax Calculation: single source of truth is products.tax_rate
        v_item_taxable := v_item_subtotal - v_item_disc;
        v_item_tax_rate := COALESCE(v_product.tax_rate, 0);
        IF v_item_tax_rate < 0 THEN
            v_item_tax_rate := 0;
        END IF;
        v_item_tax := ROUND(v_item_taxable * (v_item_tax_rate / 100.0), 4);
        v_item_line_total := v_item_taxable + v_item_tax;

        v_total_subtotal := v_total_subtotal + v_item_subtotal;
        v_total_line_discounts := v_total_line_discounts + v_item_disc;
        v_total_tax := v_total_tax + v_item_tax;
    END LOOP;

    -- Invoice-Level Discount Validation: cannot exceed net items subtotal
    v_net_items_subtotal := v_total_subtotal - v_total_line_discounts;
    v_inv_discount := COALESCE(p_discount_amount, 0);
    IF v_inv_discount < 0 THEN
        RAISE EXCEPTION 'قيمة خصم الفاتورة لا يمكن أن تكون سالبة';
    END IF;
    IF v_inv_discount > v_net_items_subtotal THEN
        v_inv_discount := v_net_items_subtotal;
    END IF;

    -- Final Invoice Total
    v_final_total := (v_net_items_subtotal - v_inv_discount) + v_total_tax;
    IF v_final_total < 0 THEN
        v_final_total := 0;
    END IF;

    -- Payment status and change calculation
    IF v_total_paid >= v_final_total THEN
        v_payment_status := 'paid';
        v_change_amount := v_total_paid - v_final_total;
    ELSE
        v_payment_status := 'partial';
        v_change_amount := 0;
    END IF;

    -- 8. Generate Next Unique Invoice Number (using the client isolation sequence generator)
    v_invoice_number := public.get_next_invoice_number(v_effective_client_id);
    v_sale_id := uuid_generate_v4();

    -- 9. Insert Sale Record
    INSERT INTO public.sales (
        id,
        client_id,
        invoice_number,
        sale_date,
        customer_id,
        warehouse_id,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        paid_amount,
        change_amount,
        payment_status,
        sale_status,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_sale_id,
        v_effective_client_id,
        v_invoice_number,
        NOW(),
        p_customer_id,
        p_warehouse_id,
        v_total_subtotal,
        (v_total_line_discounts + v_inv_discount),
        v_total_tax,
        v_final_total,
        LEAST(v_total_paid, v_final_total),
        v_change_amount,
        v_payment_status,
        'completed',
        p_notes,
        v_effective_created_by,
        NOW(),
        NOW()
    );

    -- 10. Insert Sale Items, Decrement Inventory Balances, and Record Ledger Transactions
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_price NUMERIC,
        discount_amount NUMERIC
    ) LOOP
        SELECT * INTO v_product 
        FROM public.products 
        WHERE id = v_item.product_id AND client_id = v_effective_client_id;

        IF NOT v_can_edit_price THEN
            v_custom_price := v_product.selling_price;
        ELSE
            v_custom_price := COALESCE(v_item.unit_price, v_product.selling_price);
        END IF;

        v_item_subtotal := v_item.quantity * v_custom_price;
        v_item_disc := COALESCE(v_item.discount_amount, 0);
        IF v_item_disc > v_item_subtotal THEN
            v_item_disc := v_item_subtotal;
        END IF;
        v_item_taxable := v_item_subtotal - v_item_disc;
        v_item_tax_rate := COALESCE(v_product.tax_rate, 0);
        IF v_item_tax_rate < 0 THEN v_item_tax_rate := 0; END IF;
        v_item_tax := ROUND(v_item_taxable * (v_item_tax_rate / 100.0), 4);
        v_item_line_total := v_item_taxable + v_item_tax;

        -- Insert Sale Item snapshot
        INSERT INTO public.sale_items (
            id,
            sale_id,
            client_id,
            product_id,
            product_name_snapshot,
            sku_snapshot,
            barcode_snapshot,
            quantity,
            unit_price,
            discount_amount,
            tax_rate,
            tax_amount,
            line_total,
            created_at
        ) VALUES (
            uuid_generate_v4(),
            v_sale_id,
            v_effective_client_id,
            v_item.product_id,
            v_product.name,
            v_product.sku,
            v_product.barcode,
            v_item.quantity,
            v_custom_price,
            v_item_disc,
            v_item_tax_rate,
            v_item_tax,
            v_item_line_total,
            NOW()
        );

        -- If product tracks stock, deduct from warehouse balance and record transaction
        IF v_product.track_stock THEN
            -- Deduct warehouse balance
            UPDATE public.inventory_balances
            SET quantity = quantity - v_item.quantity,
                updated_at = NOW()
            WHERE client_id = v_effective_client_id 
              AND product_id = v_item.product_id 
              AND warehouse_id = p_warehouse_id;

            -- Deduct global product current_stock
            UPDATE public.products
            SET current_stock = current_stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND client_id = v_effective_client_id;

            -- Record immutable ledger transaction
            INSERT INTO public.inventory_transactions (
                id,
                client_id,
                product_id,
                warehouse_id,
                transaction_type,
                quantity,
                unit_cost,
                reference_type,
                reference_id,
                notes,
                created_by,
                created_at
            ) VALUES (
                uuid_generate_v4(),
                v_effective_client_id,
                v_item.product_id,
                p_warehouse_id,
                'sale',
                -v_item.quantity,
                v_product.cost_price,
                'sale',
                v_invoice_number,
                'فاتورة مبيعات رقم ' || v_invoice_number,
                v_effective_created_by,
                NOW()
            );
        END IF;
    END LOOP;

    -- 11. Insert Sale Payments
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS x(
        payment_method TEXT,
        amount NUMERIC,
        reference TEXT
    ) LOOP
        INSERT INTO public.sale_payments (
            id,
            sale_id,
            client_id,
            payment_method,
            amount,
            reference,
            created_at
        ) VALUES (
            uuid_generate_v4(),
            v_sale_id,
            v_effective_client_id,
            v_payment.payment_method,
            v_payment.amount,
            v_payment.reference,
            NOW()
        );
    END LOOP;

    -- 12. Return completed sale result
    RETURN jsonb_build_object(
        'success', TRUE,
        'sale_id', v_sale_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_total_subtotal,
        'discount_amount', (v_total_line_discounts + v_inv_discount),
        'tax_amount', v_total_tax,
        'total_amount', v_final_total,
        'paid_amount', LEAST(v_total_paid, v_final_total),
        'change_amount', v_change_amount,
        'payment_status', v_payment_status,
        'sale_date', NOW()
    );
END;
$$;

-- ============================================================================
-- 6. Atomic Void Sale RPC (Permission Engine, Concurrency, & Activity Audit)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.void_sale(
    p_client_id UUID,
    p_sale_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_voided_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super_admin BOOLEAN := FALSE;
    v_client_user RECORD;
    v_effective_client_id UUID;
    v_effective_voided_by UUID;
    v_can_void BOOLEAN := FALSE;
    v_sale RECORD;
    v_item RECORD;
    v_product RECORD;
BEGIN
    -- 1. Authentication Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً لإلغاء الفاتورة';
    END IF;

    v_is_super_admin := public.is_super_admin();

    -- 2. Client Resolution & User Permission Validation
    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له أو حسابه غير نشط في النظام';
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح لك بالوصول إلى بيانات منشأة أخرى';
        END IF;

        -- Verify sales.void permission
        v_can_void := (
            v_client_user.role IN ('owner', 'admin', 'manager')
            OR v_client_user.custom_permissions ? 'sales.void'
            OR v_client_user.custom_permissions ? 'sales.*'
            OR v_client_user.custom_permissions ? '*'
        );

        IF NOT v_can_void THEN
            RAISE EXCEPTION 'ليس لديك صلاحية إلغاء الفواتير (sales.void)';
        END IF;

        v_effective_voided_by := v_client_user.id;
    ELSE
        -- Super Admin flow
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب لإلغاء الفاتورة';
        END IF;
        v_effective_client_id := p_client_id;
        SELECT id INTO v_effective_voided_by
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND client_id = p_client_id AND status = 'active'
        LIMIT 1;
        IF v_effective_voided_by IS NULL THEN
            v_effective_voided_by := p_voided_by;
        END IF;
    END IF;

    -- 3. Fetch and lock sale row (FOR UPDATE)
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id AND client_id = v_effective_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات المحددة غير موجودة';
    END IF;

    IF v_sale.sale_status = 'voided' THEN
        RAISE EXCEPTION 'هذه الفاتورة ملغاة مسبقاً ولا يمكن إلغاؤها مرة أخرى';
    END IF;

    IF v_sale.sale_status != 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء فاتورة بحالة غير مكتملة (%)', v_sale.sale_status;
    END IF;

    -- 4. Mark sale as voided (NEVER delete invoice record)
    UPDATE public.sales
    SET sale_status = 'voided',
        notes = CASE 
            WHEN notes IS NULL OR notes = '' THEN '[ملغاة]: ' || COALESCE(p_reason, 'تم الإلغاء')
            ELSE notes || E'\n[ملغاة]: ' || COALESCE(p_reason, 'تم الإلغاء')
        END,
        updated_at = NOW()
    WHERE id = p_sale_id AND client_id = v_effective_client_id;

    -- 5. Reverse inventory for all tracked items within the same atomic transaction
    FOR v_item IN 
        SELECT * FROM public.sale_items 
        WHERE sale_id = p_sale_id AND client_id = v_effective_client_id 
    LOOP
        SELECT * INTO v_product 
        FROM public.products 
        WHERE id = v_item.product_id AND client_id = v_effective_client_id;

        IF FOUND AND v_product.track_stock THEN
            -- Add back to warehouse balance
            UPDATE public.inventory_balances
            SET quantity = quantity + v_item.quantity,
                updated_at = NOW()
            WHERE client_id = v_effective_client_id 
              AND product_id = v_item.product_id 
              AND warehouse_id = v_sale.warehouse_id;

            -- Add back to global product stock
            UPDATE public.products
            SET current_stock = current_stock + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND client_id = v_effective_client_id;

            -- Record reverse ledger transaction
            INSERT INTO public.inventory_transactions (
                id,
                client_id,
                product_id,
                warehouse_id,
                transaction_type,
                quantity,
                unit_cost,
                reference_type,
                reference_id,
                notes,
                created_by,
                created_at
            ) VALUES (
                uuid_generate_v4(),
                v_effective_client_id,
                v_item.product_id,
                v_sale.warehouse_id,
                'sale_return',
                v_item.quantity,
                v_product.cost_price,
                'void_sale',
                v_sale.invoice_number,
                'إلغاء فاتورة المبيعات رقم ' || v_sale.invoice_number || ' - ' || COALESCE(p_reason, 'إلغاء'),
                v_effective_voided_by,
                NOW()
            );
        END IF;
    END LOOP;

    -- 6. Atomically record in activity_logs
    INSERT INTO public.activity_logs (
        id,
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        uuid_generate_v4(),
        CASE WHEN v_is_super_admin AND v_client_user.id IS NULL THEN 'super_admin' ELSE 'client_user' END,
        COALESCE(v_effective_voided_by, auth.uid()),
        'sale_voided',
        'sale',
        p_sale_id,
        jsonb_build_object(
            'invoice_number', v_sale.invoice_number,
            'total_amount', v_sale.total_amount,
            'reason', COALESCE(p_reason, 'إلغاء الفاتورة')
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'sale_id', p_sale_id,
        'invoice_number', v_sale.invoice_number,
        'message', 'تم إلغاء الفاتورة بنجاح وإرجاع المخزون'
    );
END;
$$;

-- ============================================================================
-- 7. Row Level Security (RLS) & Client Isolation
-- ============================================================================
ALTER TABLE public.client_invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

-- Sequences Policies
DROP POLICY IF EXISTS invoice_sequences_super_admin_all ON public.client_invoice_sequences;
CREATE POLICY invoice_sequences_super_admin_all ON public.client_invoice_sequences
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS invoice_sequences_client_select ON public.client_invoice_sequences;
CREATE POLICY invoice_sequences_client_select ON public.client_invoice_sequences
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS invoice_sequences_client_insert ON public.client_invoice_sequences;
CREATE POLICY invoice_sequences_client_insert ON public.client_invoice_sequences
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS invoice_sequences_client_update ON public.client_invoice_sequences;
CREATE POLICY invoice_sequences_client_update ON public.client_invoice_sequences
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Sales Policies
DROP POLICY IF EXISTS sales_super_admin_all ON public.sales;
CREATE POLICY sales_super_admin_all ON public.sales
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS sales_client_select ON public.sales;
CREATE POLICY sales_client_select ON public.sales
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS sales_client_insert ON public.sales;
CREATE POLICY sales_client_insert ON public.sales
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS sales_client_update ON public.sales;
CREATE POLICY sales_client_update ON public.sales
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Sale Items Policies
DROP POLICY IF EXISTS sale_items_super_admin_all ON public.sale_items;
CREATE POLICY sale_items_super_admin_all ON public.sale_items
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS sale_items_client_select ON public.sale_items;
CREATE POLICY sale_items_client_select ON public.sale_items
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS sale_items_client_insert ON public.sale_items;
CREATE POLICY sale_items_client_insert ON public.sale_items
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS sale_items_client_update ON public.sale_items;
CREATE POLICY sale_items_client_update ON public.sale_items
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Sale Payments Policies
DROP POLICY IF EXISTS sale_payments_super_admin_all ON public.sale_payments;
CREATE POLICY sale_payments_super_admin_all ON public.sale_payments
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS sale_payments_client_select ON public.sale_payments;
CREATE POLICY sale_payments_client_select ON public.sale_payments
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS sale_payments_client_insert ON public.sale_payments;
CREATE POLICY sale_payments_client_insert ON public.sale_payments
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS sale_payments_client_update ON public.sale_payments;
CREATE POLICY sale_payments_client_update ON public.sale_payments
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());
