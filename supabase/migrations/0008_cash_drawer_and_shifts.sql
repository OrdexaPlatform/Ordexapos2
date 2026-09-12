-- ============================================================================
-- Migration: 0008_cash_drawer_and_shifts.sql
-- Description: Phase 10 — Cash Drawer & Shifts Engine
--              (Cash Registers, Shift Sequences, Shifts, Cash Movements,
--              Strict Shift Guard for POS Sales, Atomic Open/Close/Movement RPCs,
--              Z-Report Financial Aggregations, and Client Isolation RLS).
-- ============================================================================

-- ============================================================================
-- 1. Cash Registers Table (Physical or Logical POS Terminals / Drawers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cash_registers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT,
    status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed', 'maintenance')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cash_registers_client_name_key UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cash_registers_client ON public.cash_registers(client_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_warehouse ON public.cash_registers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_status ON public.cash_registers(status);

-- ============================================================================
-- 2. Client Shift Sequences (Atomic, Collision-Free Shift Numbers e.g. SH-000001)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_shift_sequences (
    client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
    prefix TEXT NOT NULL DEFAULT 'SH-',
    last_number BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_sequences_client ON public.client_shift_sequences(client_id);

-- Helper Function: Get next shift number atomically
CREATE OR REPLACE FUNCTION public.get_next_shift_number(p_client_id UUID DEFAULT NULL)
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
    v_shift_str TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً';
    END IF;

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
            RAISE EXCEPTION 'غير مصرح لك بالحصول على تسلسل ورديات لمنشأة أخرى';
        END IF;
    END IF;

    -- Lock sequence row atomically FOR UPDATE
    SELECT prefix, last_number
    INTO v_prefix, v_next_num
    FROM public.client_shift_sequences
    WHERE client_id = v_target_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_prefix := 'SH-';
        v_next_num := 1;
        INSERT INTO public.client_shift_sequences (client_id, prefix, last_number, updated_at)
        VALUES (v_target_client_id, v_prefix, v_next_num, NOW())
        ON CONFLICT (client_id) DO NOTHING;

        SELECT prefix, last_number
        INTO v_prefix, v_next_num
        FROM public.client_shift_sequences
        WHERE client_id = v_target_client_id
        FOR UPDATE;
    ELSE
        v_next_num := v_next_num + 1;
        UPDATE public.client_shift_sequences
        SET last_number = v_next_num,
            updated_at = NOW()
        WHERE client_id = v_target_client_id;
    END IF;

    v_shift_str := v_prefix || LPAD(v_next_num::TEXT, 6, '0');
    RETURN v_shift_str;
END;
$$;

-- ============================================================================
-- 3. Shifts Table (Cashier Sessions & Cash Drawer Records)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    register_id UUID REFERENCES public.cash_registers(id) ON DELETE SET NULL,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    shift_number TEXT NOT NULL,
    opened_by UUID NOT NULL REFERENCES public.client_users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opening_cash NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (opening_cash >= 0),
    closed_by UUID REFERENCES public.client_users(id) ON DELETE RESTRICT,
    closed_at TIMESTAMPTZ,
    closing_cash_actual NUMERIC(15, 4) CHECK (closing_cash_actual IS NULL OR closing_cash_actual >= 0),
    closing_cash_expected NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
    cash_difference NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
    total_sales_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_sales_amount >= 0),
    total_cash_sales NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_cash_sales >= 0),
    total_card_sales NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_card_sales >= 0),
    total_other_sales NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_other_sales >= 0),
    total_refunds_amount NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_refunds_amount >= 0),
    total_cash_in NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_cash_in >= 0),
    total_cash_out NUMERIC(15, 4) NOT NULL DEFAULT 0.0000 CHECK (total_cash_out >= 0),
    orders_count INT NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'audited')),
    opening_notes TEXT,
    closing_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shifts_client_shift_number_key UNIQUE (client_id, shift_number)
);

CREATE INDEX IF NOT EXISTS idx_shifts_client ON public.shifts(client_id);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_by ON public.shifts(opened_by);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON public.shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON public.shifts(opened_at);
CREATE INDEX IF NOT EXISTS idx_shifts_warehouse ON public.shifts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shifts_register ON public.shifts(register_id);

-- Enforce maximum of ONE open shift per cashier in the same client
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_single_open_user 
ON public.shifts(client_id, opened_by) 
WHERE status = 'open';

-- Enforce maximum of ONE open shift per cash register in the same client
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_single_open_register 
ON public.shifts(client_id, register_id) 
WHERE status = 'open' AND register_id IS NOT NULL;

-- ============================================================================
-- 4. Cash Drawer Transactions (Cash In / Cash Out / Safe Drop)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cash_drawer_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('cash_in', 'cash_out', 'drop_to_safe')),
    amount NUMERIC(15, 4) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    performed_by UUID NOT NULL REFERENCES public.client_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawer_tx_client ON public.cash_drawer_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_drawer_tx_shift ON public.cash_drawer_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_drawer_tx_type ON public.cash_drawer_transactions(transaction_type);

-- ============================================================================
-- 5. Link Sales Table to Shifts (Phase 9 to Phase 10 Bridge)
-- ============================================================================
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON public.sales(shift_id);

-- ============================================================================
-- 6. Helper: Ensure Default Cash Register for Warehouse
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_or_create_default_register(
    p_client_id UUID,
    p_warehouse_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_register_id UUID;
    v_warehouse_name TEXT;
BEGIN
    SELECT id INTO v_register_id
    FROM public.cash_registers
    WHERE client_id = p_client_id 
      AND (warehouse_id = p_warehouse_id OR warehouse_id IS NULL)
      AND is_active = true
    ORDER BY warehouse_id NULLS LAST, created_at ASC
    LIMIT 1;

    IF v_register_id IS NULL THEN
        SELECT name INTO v_warehouse_name
        FROM public.warehouses
        WHERE id = p_warehouse_id AND client_id = p_client_id;

        INSERT INTO public.cash_registers (
            client_id,
            warehouse_id,
            name,
            code,
            status,
            is_active
        ) VALUES (
            p_client_id,
            p_warehouse_id,
            COALESCE(v_warehouse_name || ' - كاشير رئيسي', 'نقطة البيع الرئيسية 1'),
            'REG-01',
            'closed',
            true
        )
        ON CONFLICT (client_id, name) DO UPDATE SET updated_at = NOW()
        RETURNING id INTO v_register_id;
    END IF;

    RETURN v_register_id;
END;
$$;

-- ============================================================================
-- 7. Atomic Open Shift RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.open_shift(
    p_client_id UUID,
    p_warehouse_id UUID,
    p_register_id UUID DEFAULT NULL,
    p_opening_cash NUMERIC DEFAULT 0,
    p_opening_notes TEXT DEFAULT NULL
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
    v_register_id UUID;
    v_existing_shift_id UUID;
    v_shift_number TEXT;
    v_shift_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً لفتح الوردية';
    END IF;

    v_is_super_admin := public.is_super_admin();

    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له أو حسابه غير نشط';
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح لك بفتح وردية لمنشأة أخرى';
        END IF;

        -- Verify shift creation permission
        IF NOT (
            v_client_user.role IN ('owner', 'admin', 'manager', 'cashier')
            OR v_client_user.custom_permissions ? 'shifts.create'
            OR v_client_user.custom_permissions ? 'shifts.*'
            OR v_client_user.custom_permissions ? '*'
        ) THEN
            RAISE EXCEPTION 'ليس لديك صلاحية فتح وردية كاشير (shifts.create)';
        END IF;
    ELSE
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب للمشرف العام';
        END IF;
        v_effective_client_id := p_client_id;
    END IF;

    IF p_opening_cash < 0 THEN
        RAISE EXCEPTION 'الرصيد الافتتاحي للوردية لا يمكن أن يكون سالباً';
    END IF;

    IF p_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'يجب تحديد الفرع / المستودع التابع له الصندوق';
    END IF;

    -- Check if cashier already has an open shift in this client
    IF v_client_user.id IS NOT NULL THEN
        SELECT id, shift_number INTO v_existing_shift_id, v_shift_number
        FROM public.shifts
        WHERE client_id = v_effective_client_id 
          AND opened_by = v_client_user.id 
          AND status = 'open'
        LIMIT 1;

        IF v_existing_shift_id IS NOT NULL THEN
            RAISE EXCEPTION 'لديك وردية مفتوحة بالفعل برقم (%). يرجى إغلاقها قبل فتح وردية جديدة.', v_shift_number;
        END IF;
    END IF;

    -- Resolve or create cash register
    IF p_register_id IS NOT NULL THEN
        SELECT id INTO v_register_id
        FROM public.cash_registers
        WHERE id = p_register_id AND client_id = v_effective_client_id AND is_active = true;

        IF v_register_id IS NULL THEN
            RAISE EXCEPTION 'الصندوق / جهاز الكاشير المحدد غير موجود أو غير نشط';
        END IF;
    ELSE
        v_register_id := public.get_or_create_default_register(v_effective_client_id, p_warehouse_id);
    END IF;

    -- Verify the cash register is not already in an open shift
    SELECT id, shift_number INTO v_existing_shift_id, v_shift_number
    FROM public.shifts
    WHERE client_id = v_effective_client_id 
      AND register_id = v_register_id 
      AND status = 'open'
    LIMIT 1;

    IF v_existing_shift_id IS NOT NULL THEN
        RAISE EXCEPTION 'جهاز الكاشير المحدد مرتبط حالياً بوردية مفتوحة أخرى برقم (%).', v_shift_number;
    END IF;

    -- Generate atomic shift number
    v_shift_number := public.get_next_shift_number(v_effective_client_id);
    v_shift_id := uuid_generate_v4();

    -- Insert shift record
    INSERT INTO public.shifts (
        id,
        client_id,
        register_id,
        warehouse_id,
        shift_number,
        opened_by,
        opened_at,
        opening_cash,
        status,
        opening_notes,
        created_at,
        updated_at
    ) VALUES (
        v_shift_id,
        v_effective_client_id,
        v_register_id,
        p_warehouse_id,
        v_shift_number,
        COALESCE(v_client_user.id, auth.uid()),
        NOW(),
        ROUND(p_opening_cash, 4),
        'open',
        p_opening_notes,
        NOW(),
        NOW()
    );

    -- Update cash register status to open
    UPDATE public.cash_registers
    SET status = 'open', updated_at = NOW()
    WHERE id = v_register_id;

    -- Audit Log
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
        COALESCE(v_client_user.id, auth.uid()),
        'shift_opened',
        'shift',
        v_shift_id,
        jsonb_build_object(
            'shift_number', v_shift_number,
            'opening_cash', p_opening_cash,
            'register_id', v_register_id,
            'warehouse_id', p_warehouse_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'shift_id', v_shift_id,
        'shift_number', v_shift_number,
        'opened_at', NOW(),
        'opening_cash', p_opening_cash,
        'register_id', v_register_id,
        'warehouse_id', p_warehouse_id,
        'status', 'open'
    );
END;
$$;

-- ============================================================================
-- 8. Atomic Record Cash Drawer Movement (Cash In / Cash Out)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_cash_drawer_movement(
    p_client_id UUID,
    p_shift_id UUID,
    p_transaction_type TEXT,
    p_amount NUMERIC,
    p_reason TEXT
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
    v_shift RECORD;
    v_movement_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لتسجيل حركة نقدية';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ الحركة النقدية يجب أن يكون أكبر من الصفر';
    END IF;

    IF p_transaction_type NOT IN ('cash_in', 'cash_out', 'drop_to_safe') THEN
        RAISE EXCEPTION 'نوع الحركة النقدية غير صالح (مسموح: cash_in, cash_out, drop_to_safe)';
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'يجب توضيح سبب أو بيان الحركة النقدية';
    END IF;

    v_is_super_admin := public.is_super_admin();

    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له أو حسابه غير نشط';
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح لك بالوصول لبيانات منشأة أخرى';
        END IF;

        -- Verify permission
        IF NOT (
            v_client_user.role IN ('owner', 'admin', 'manager', 'cashier')
            OR v_client_user.custom_permissions ? 'shifts.edit'
            OR v_client_user.custom_permissions ? 'shifts.manage'
            OR v_client_user.custom_permissions ? 'shifts.*'
            OR v_client_user.custom_permissions ? '*'
        ) THEN
            RAISE EXCEPTION 'ليس لديك صلاحية تسجيل حركات نقدية على الدرج (shifts.edit)';
        END IF;
    ELSE
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب للمشرف العام';
        END IF;
        v_effective_client_id := p_client_id;
    END IF;

    -- Lock shift row FOR UPDATE to verify status
    SELECT * INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id AND client_id = v_effective_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية المحددة غير موجودة';
    END IF;

    IF v_shift.status != 'open' THEN
        RAISE EXCEPTION 'لا يمكن تسجيل حركة نقدية على وردية مغلقة';
    END IF;

    v_movement_id := uuid_generate_v4();

    INSERT INTO public.cash_drawer_transactions (
        id,
        client_id,
        shift_id,
        transaction_type,
        amount,
        reason,
        performed_by,
        created_at
    ) VALUES (
        v_movement_id,
        v_effective_client_id,
        p_shift_id,
        p_transaction_type,
        ROUND(p_amount, 4),
        TRIM(p_reason),
        COALESCE(v_client_user.id, auth.uid()),
        NOW()
    );

    -- Update shift cache counters
    IF p_transaction_type = 'cash_in' THEN
        UPDATE public.shifts 
        SET total_cash_in = total_cash_in + ROUND(p_amount, 4), updated_at = NOW()
        WHERE id = p_shift_id;
    ELSE
        UPDATE public.shifts 
        SET total_cash_out = total_cash_out + ROUND(p_amount, 4), updated_at = NOW()
        WHERE id = p_shift_id;
    END IF;

    -- Audit Log
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
        COALESCE(v_client_user.id, auth.uid()),
        'cash_drawer_movement',
        'shift',
        p_shift_id,
        jsonb_build_object(
            'movement_id', v_movement_id,
            'type', p_transaction_type,
            'amount', p_amount,
            'reason', p_reason
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'movement_id', v_movement_id,
        'shift_id', p_shift_id,
        'type', p_transaction_type,
        'amount', p_amount,
        'created_at', NOW()
    );
END;
$$;

-- ============================================================================
-- 9. Atomic Shift Summary Function (Live Actual Aggregations from Source of Truth)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_shift_summary(
    p_client_id UUID,
    p_shift_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift RECORD;
    v_cash_sales NUMERIC(15, 4) := 0;
    v_card_sales NUMERIC(15, 4) := 0;
    v_other_sales NUMERIC(15, 4) := 0;
    v_total_sales NUMERIC(15, 4) := 0;
    v_orders_count INT := 0;
    v_voided_sales NUMERIC(15, 4) := 0;
    v_cash_in NUMERIC(15, 4) := 0;
    v_cash_out NUMERIC(15, 4) := 0;
    v_expected_cash NUMERIC(15, 4) := 0;
BEGIN
    SELECT * INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id AND (p_client_id IS NULL OR client_id = p_client_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية المحددة غير موجودة';
    END IF;

    -- 1. Aggregate Sales amounts and counts for completed sales
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COUNT(id)
    INTO v_total_sales, v_orders_count
    FROM public.sales
    WHERE shift_id = p_shift_id AND sale_status = 'completed';

    -- 2. Aggregate Payment methods from sale_payments for completed sales in this shift
    SELECT 
        COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.payment_method NOT IN ('cash', 'card') THEN sp.amount ELSE 0 END), 0)
    INTO v_cash_sales, v_card_sales, v_other_sales
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.shift_id = p_shift_id AND s.sale_status = 'completed';

    -- 3. Aggregate Voided / Refunded sales in this shift
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_voided_sales
    FROM public.sales
    WHERE shift_id = p_shift_id AND sale_status = 'voided';

    -- 4. Aggregate Cash In / Cash Out drawer transactions
    SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN transaction_type IN ('cash_out', 'drop_to_safe') THEN amount ELSE 0 END), 0)
    INTO v_cash_in, v_cash_out
    FROM public.cash_drawer_transactions
    WHERE shift_id = p_shift_id;

    -- 5. Calculate Expected Cash in drawer:
    -- Expected = Opening Cash + Cash Sales + Cash In - Cash Out
    v_expected_cash := v_shift.opening_cash + v_cash_sales + v_cash_in - v_cash_out;
    IF v_expected_cash < 0 THEN
        v_expected_cash := 0;
    END IF;

    RETURN jsonb_build_object(
        'shift_id', v_shift.id,
        'shift_number', v_shift.shift_number,
        'status', v_shift.status,
        'opened_at', v_shift.opened_at,
        'closed_at', v_shift.closed_at,
        'opening_cash', v_shift.opening_cash,
        'closing_cash_actual', v_shift.closing_cash_actual,
        'total_sales_amount', v_total_sales,
        'total_cash_sales', v_cash_sales,
        'total_card_sales', v_card_sales,
        'total_other_sales', v_other_sales,
        'total_refunds_amount', v_voided_sales,
        'total_cash_in', v_cash_in,
        'total_cash_out', v_cash_out,
        'orders_count', v_orders_count,
        'expected_cash', v_expected_cash,
        'cash_difference', CASE WHEN v_shift.closing_cash_actual IS NOT NULL THEN (v_shift.closing_cash_actual - v_expected_cash) ELSE 0 END
    );
END;
$$;

-- ============================================================================
-- 10. Atomic Close Shift RPC (Server-Side Calculations & Financial Reconciliation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.close_shift(
    p_client_id UUID,
    p_shift_id UUID,
    p_closing_cash_actual NUMERIC,
    p_closing_notes TEXT DEFAULT NULL
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
    v_shift RECORD;
    
    v_total_sales NUMERIC(15, 4) := 0;
    v_cash_sales NUMERIC(15, 4) := 0;
    v_card_sales NUMERIC(15, 4) := 0;
    v_other_sales NUMERIC(15, 4) := 0;
    v_voided_sales NUMERIC(15, 4) := 0;
    v_cash_in NUMERIC(15, 4) := 0;
    v_cash_out NUMERIC(15, 4) := 0;
    v_orders_count INT := 0;
    v_expected_cash NUMERIC(15, 4) := 0;
    v_difference NUMERIC(15, 4) := 0;
    v_actual_cash NUMERIC(15, 4);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لإغلاق الوردية';
    END IF;

    IF p_closing_cash_actual < 0 THEN
        RAISE EXCEPTION 'المبلغ النقدي الفعلي في الدرج لا يمكن أن يكون سالباً';
    END IF;

    v_actual_cash := ROUND(p_closing_cash_actual, 4);
    v_is_super_admin := public.is_super_admin();

    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له أو حسابه غير نشط';
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح لك بإغلاق وردية لمنشأة أخرى';
        END IF;
    ELSE
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب للمشرف العام';
        END IF;
        v_effective_client_id := p_client_id;
    END IF;

    -- Lock shift row FOR UPDATE
    SELECT * INTO v_shift
    FROM public.shifts
    WHERE id = p_shift_id AND client_id = v_effective_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية المحددة غير موجودة';
    END IF;

    -- Strict Rule: Closed shifts cannot be modified or re-closed
    IF v_shift.status = 'closed' THEN
        RAISE EXCEPTION 'هذه الوردية مغلقة بالفعل ولا يمكن تعديلها أو إغلاقها مرة أخرى';
    END IF;

    -- Verify permission: owner, admin, manager, or the cashier who opened this shift
    IF NOT v_is_super_admin THEN
        IF NOT (
            v_client_user.role IN ('owner', 'admin', 'manager')
            OR v_shift.opened_by = v_client_user.id
            OR v_client_user.custom_permissions ? 'shifts.edit'
            OR v_client_user.custom_permissions ? 'shifts.manage'
            OR v_client_user.custom_permissions ? '*'
        ) THEN
            RAISE EXCEPTION 'ليس لديك صلاحية إغلاق هذه الوردية (مصرح للكاشير صاحب الوردية أو المدراء فقط)';
        END IF;
    END IF;

    -- SERVER-SIDE SOURCE OF TRUTH CALCULATIONS (Never trust frontend numbers)
    -- 1. Completed sales & order count
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COUNT(id)
    INTO v_total_sales, v_orders_count
    FROM public.sales
    WHERE shift_id = p_shift_id AND sale_status = 'completed';

    -- 2. Payment methods from completed sales
    SELECT 
        COALESCE(SUM(CASE WHEN sp.payment_method = 'cash' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.payment_method = 'card' THEN sp.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sp.payment_method NOT IN ('cash', 'card') THEN sp.amount ELSE 0 END), 0)
    INTO v_cash_sales, v_card_sales, v_other_sales
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.shift_id = p_shift_id AND s.sale_status = 'completed';

    -- 3. Voided / Refunded sales
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_voided_sales
    FROM public.sales
    WHERE shift_id = p_shift_id AND sale_status = 'voided';

    -- 4. Cash In & Cash Out movements
    SELECT 
        COALESCE(SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN transaction_type IN ('cash_out', 'drop_to_safe') THEN amount ELSE 0 END), 0)
    INTO v_cash_in, v_cash_out
    FROM public.cash_drawer_transactions
    WHERE shift_id = p_shift_id;

    -- 5. Expected cash & difference reconciliation
    v_expected_cash := v_shift.opening_cash + v_cash_sales + v_cash_in - v_cash_out;
    IF v_expected_cash < 0 THEN v_expected_cash := 0; END IF;
    v_difference := v_actual_cash - v_expected_cash;

    -- Update shift record to closed
    UPDATE public.shifts
    SET status = 'closed',
        closed_by = COALESCE(v_client_user.id, auth.uid()),
        closed_at = NOW(),
        closing_cash_actual = v_actual_cash,
        closing_cash_expected = v_expected_cash,
        cash_difference = v_difference,
        total_sales_amount = v_total_sales,
        total_cash_sales = v_cash_sales,
        total_card_sales = v_card_sales,
        total_other_sales = v_other_sales,
        total_refunds_amount = v_voided_sales,
        total_cash_in = v_cash_in,
        total_cash_out = v_cash_out,
        orders_count = v_orders_count,
        closing_notes = p_closing_notes,
        updated_at = NOW()
    WHERE id = p_shift_id;

    -- Update cash register status back to closed
    IF v_shift.register_id IS NOT NULL THEN
        UPDATE public.cash_registers
        SET status = 'closed', updated_at = NOW()
        WHERE id = v_shift.register_id;
    END IF;

    -- Audit Log (Z-Report Generation)
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
        COALESCE(v_client_user.id, auth.uid()),
        'shift_closed',
        'shift',
        p_shift_id,
        jsonb_build_object(
            'shift_number', v_shift.shift_number,
            'closing_cash_actual', v_actual_cash,
            'closing_cash_expected', v_expected_cash,
            'cash_difference', v_difference,
            'total_sales', v_total_sales,
            'orders_count', v_orders_count
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'shift_id', p_shift_id,
        'shift_number', v_shift.shift_number,
        'closed_at', NOW(),
        'closing_cash_actual', v_actual_cash,
        'closing_cash_expected', v_expected_cash,
        'cash_difference', v_difference,
        'total_sales_amount', v_total_sales,
        'total_cash_sales', v_cash_sales,
        'total_card_sales', v_card_sales,
        'total_other_sales', v_other_sales,
        'total_refunds_amount', v_voided_sales,
        'total_cash_in', v_cash_in,
        'total_cash_out', v_cash_out,
        'orders_count', v_orders_count,
        'status', 'closed'
    );
END;
$$;

-- ============================================================================
-- 11. Helper: Get Current Active Shift for Authenticated User
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_active_shift(p_client_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super_admin BOOLEAN := FALSE;
    v_client_user RECORD;
    v_effective_client_id UUID;
    v_shift RECORD;
    v_summary JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    v_is_super_admin := public.is_super_admin();

    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RETURN NULL;
        END IF;

        v_effective_client_id := v_client_user.client_id;
    ELSE
        IF p_client_id IS NULL THEN
            RETURN NULL;
        END IF;
        v_effective_client_id := p_client_id;
    END IF;

    -- Look for open shift by this cashier first
    IF v_client_user.id IS NOT NULL THEN
        SELECT s.*, 
               w.name AS warehouse_name, 
               cr.name AS register_name, 
               u.full_name AS cashier_name
        INTO v_shift
        FROM public.shifts s
        LEFT JOIN public.warehouses w ON w.id = s.warehouse_id
        LEFT JOIN public.cash_registers cr ON cr.id = s.register_id
        LEFT JOIN public.client_users u ON u.id = s.opened_by
        WHERE s.client_id = v_effective_client_id 
          AND s.opened_by = v_client_user.id 
          AND s.status = 'open'
        LIMIT 1;
    END IF;

    -- Fallback: If manager/admin, look for any open shift in the client
    IF v_shift.id IS NULL AND (v_is_super_admin OR v_client_user.role IN ('owner', 'admin', 'manager')) THEN
        SELECT s.*, 
               w.name AS warehouse_name, 
               cr.name AS register_name, 
               u.full_name AS cashier_name
        INTO v_shift
        FROM public.shifts s
        LEFT JOIN public.warehouses w ON w.id = s.warehouse_id
        LEFT JOIN public.cash_registers cr ON cr.id = s.register_id
        LEFT JOIN public.client_users u ON u.id = s.opened_by
        WHERE s.client_id = v_effective_client_id 
          AND s.status = 'open'
        ORDER BY s.opened_at DESC
        LIMIT 1;
    END IF;

    IF v_shift.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Fetch live summary figures
    v_summary := public.get_shift_summary(v_effective_client_id, v_shift.id);

    RETURN jsonb_build_object(
        'id', v_shift.id,
        'client_id', v_shift.client_id,
        'shift_number', v_shift.shift_number,
        'status', v_shift.status,
        'opened_at', v_shift.opened_at,
        'opened_by', v_shift.opened_by,
        'cashier_name', v_shift.cashier_name,
        'register_id', v_shift.register_id,
        'register_name', v_shift.register_name,
        'warehouse_id', v_shift.warehouse_id,
        'warehouse_name', v_shift.warehouse_name,
        'opening_cash', v_shift.opening_cash,
        'opening_notes', v_shift.opening_notes,
        'summary', v_summary
    );
END;
$$;

-- ============================================================================
-- 12. UPDATE COMPLETE_SALE RPC (Mandatory Active Shift Guard & Automatic Shift Linkage)
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
    v_active_shift_id UUID;
    
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
            RAISE EXCEPTION 'غير مصرح لك بإتمام البيع لمنشأة أخرى';
        END IF;

        v_effective_created_by := v_client_user.id;

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

        v_can_edit_price := (
            v_client_user.role IN ('owner', 'admin', 'manager')
            OR v_client_user.custom_permissions ? 'pos.edit_price'
            OR v_client_user.custom_permissions ? 'pos.*'
            OR v_client_user.custom_permissions ? '*'
        );
    ELSE
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب للمشرف العام';
        END IF;
        v_effective_client_id := p_client_id;
        v_effective_created_by := p_created_by;
        v_can_edit_price := TRUE;
    END IF;

    -- ========================================================================
    -- PHASE 10 STRICT RULE: POS Sales require an active open shift
    -- Automatic shift resolution: never rely on client input
    -- ========================================================================
    IF v_client_user.id IS NOT NULL THEN
        SELECT id INTO v_active_shift_id
        FROM public.shifts
        WHERE client_id = v_effective_client_id 
          AND opened_by = v_client_user.id 
          AND status = 'open'
        LIMIT 1;
    END IF;

    -- Fallback: check if there is an active open shift in this warehouse
    IF v_active_shift_id IS NULL THEN
        SELECT id INTO v_active_shift_id
        FROM public.shifts
        WHERE client_id = v_effective_client_id 
          AND warehouse_id = p_warehouse_id 
          AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1;
    END IF;

    -- Strict check: Do not permit sale without an active shift
    IF v_active_shift_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد وردية كاشير مفتوحة حالياً. يرجى فتح الوردية أولاً واستلام عهدة الصندوق قبل بدء البيع.';
    END IF;

    -- 3. Validation of input parameters
    IF p_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'المستودع / الفرع مطلوب لإتمام البيع';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'سلة المشتريات فارغة';
    END IF;

    IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
        RAISE EXCEPTION 'يرجى تحديد طريقة الدفع والمبلغ المستلم';
    END IF;

    -- 4. Validate Payments
    FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS x(
        payment_method TEXT,
        amount NUMERIC,
        reference TEXT
    ) LOOP
        IF v_payment.payment_method NOT IN ('cash', 'card', 'bank_transfer', 'wallet', 'other') THEN
            RAISE EXCEPTION 'طريقة الدفع (%) غير معتمدة في النظام', v_payment.payment_method;
        END IF;

        IF v_payment.amount <= 0 THEN
            RAISE EXCEPTION 'مبلغ الدفع يجب أن يكون أكبر من الصفر';
        END IF;

        v_total_paid := v_total_paid + v_payment.amount;
    END LOOP;

    -- 5. Concurrency Stock Locking
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

    -- 6. Price Integrity, Tax & Discount Calculations
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

        v_item_subtotal := v_item.quantity * v_custom_price;
        v_item_disc := COALESCE(v_item.discount_amount, 0);
        IF v_item_disc < 0 THEN RAISE EXCEPTION 'قيمة خصم الصنف لا يمكن أن تكون سالبة'; END IF;
        IF v_item_disc > v_item_subtotal THEN v_item_disc := v_item_subtotal; END IF;

        v_item_taxable := v_item_subtotal - v_item_disc;
        v_item_tax_rate := COALESCE(v_product.tax_rate, 0);
        IF v_item_tax_rate < 0 THEN v_item_tax_rate := 0; END IF;
        v_item_tax := ROUND(v_item_taxable * (v_item_tax_rate / 100.0), 4);
        v_item_line_total := v_item_taxable + v_item_tax;

        v_total_subtotal := v_total_subtotal + v_item_subtotal;
        v_total_line_discounts := v_total_line_discounts + v_item_disc;
        v_total_tax := v_total_tax + v_item_tax;
    END LOOP;

    v_net_items_subtotal := v_total_subtotal - v_total_line_discounts;
    v_inv_discount := COALESCE(p_discount_amount, 0);
    IF v_inv_discount < 0 THEN RAISE EXCEPTION 'قيمة خصم الفاتورة لا يمكن أن تكون سالبة'; END IF;
    IF v_inv_discount > v_net_items_subtotal THEN v_inv_discount := v_net_items_subtotal; END IF;

    v_final_total := (v_net_items_subtotal - v_inv_discount) + v_total_tax;
    IF v_final_total < 0 THEN v_final_total := 0; END IF;

    IF v_total_paid >= v_final_total THEN
        v_payment_status := 'paid';
        v_change_amount := v_total_paid - v_final_total;
    ELSE
        v_payment_status := 'partial';
        v_change_amount := 0;
    END IF;

    -- 7. Generate Invoice Number & Sale ID
    v_invoice_number := public.get_next_invoice_number(v_effective_client_id);
    v_sale_id := uuid_generate_v4();

    -- 8. Insert Sale Record LINKED TO ACTIVE SHIFT
    INSERT INTO public.sales (
        id,
        client_id,
        shift_id,
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
        v_active_shift_id,
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

    -- 9. Insert Sale Items, Decrement Inventory & Record Ledger
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
        IF v_item_disc > v_item_subtotal THEN v_item_disc := v_item_subtotal; END IF;
        v_item_taxable := v_item_subtotal - v_item_disc;
        v_item_tax_rate := COALESCE(v_product.tax_rate, 0);
        IF v_item_tax_rate < 0 THEN v_item_tax_rate := 0; END IF;
        v_item_tax := ROUND(v_item_taxable * (v_item_tax_rate / 100.0), 4);
        v_item_line_total := v_item_taxable + v_item_tax;

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

        IF v_product.track_stock THEN
            UPDATE public.inventory_balances
            SET quantity = quantity - v_item.quantity,
                updated_at = NOW()
            WHERE client_id = v_effective_client_id
              AND product_id = v_item.product_id
              AND warehouse_id = p_warehouse_id;

            UPDATE public.products
            SET current_stock = COALESCE(current_stock, 0) - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND client_id = v_effective_client_id;

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

    -- 10. Insert Sale Payments
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

    -- 11. Update Active Shift Running Totals
    UPDATE public.shifts
    SET total_sales_amount = total_sales_amount + v_final_total,
        orders_count = orders_count + 1,
        updated_at = NOW()
    WHERE id = v_active_shift_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'sale_id', v_sale_id,
        'shift_id', v_active_shift_id,
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
-- 13. Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_shift_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_transactions ENABLE ROW LEVEL SECURITY;

-- Cash Registers Policies
DROP POLICY IF EXISTS registers_super_admin_all ON public.cash_registers;
CREATE POLICY registers_super_admin_all ON public.cash_registers
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS registers_client_select ON public.cash_registers;
CREATE POLICY registers_client_select ON public.cash_registers
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS registers_client_insert ON public.cash_registers;
CREATE POLICY registers_client_insert ON public.cash_registers
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS registers_client_update ON public.cash_registers;
CREATE POLICY registers_client_update ON public.cash_registers
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Client Shift Sequences Policies
DROP POLICY IF EXISTS shift_sequences_super_admin_all ON public.client_shift_sequences;
CREATE POLICY shift_sequences_super_admin_all ON public.client_shift_sequences
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS shift_sequences_client_select ON public.client_shift_sequences;
CREATE POLICY shift_sequences_client_select ON public.client_shift_sequences
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS shift_sequences_client_insert ON public.client_shift_sequences;
CREATE POLICY shift_sequences_client_insert ON public.client_shift_sequences
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS shift_sequences_client_update ON public.client_shift_sequences;
CREATE POLICY shift_sequences_client_update ON public.client_shift_sequences
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Shifts Policies
DROP POLICY IF EXISTS shifts_super_admin_all ON public.shifts;
CREATE POLICY shifts_super_admin_all ON public.shifts
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS shifts_client_select ON public.shifts;
CREATE POLICY shifts_client_select ON public.shifts
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS shifts_client_insert ON public.shifts;
CREATE POLICY shifts_client_insert ON public.shifts
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS shifts_client_update ON public.shifts;
CREATE POLICY shifts_client_update ON public.shifts
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Prevent non-superadmin users from deleting shifts (Financial audit trail protection)
DROP POLICY IF EXISTS shifts_super_admin_delete ON public.shifts;
CREATE POLICY shifts_super_admin_delete ON public.shifts
    FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- Cash Drawer Transactions Policies
DROP POLICY IF EXISTS drawer_tx_super_admin_all ON public.cash_drawer_transactions;
CREATE POLICY drawer_tx_super_admin_all ON public.cash_drawer_transactions
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS drawer_tx_client_select ON public.cash_drawer_transactions;
CREATE POLICY drawer_tx_client_select ON public.cash_drawer_transactions
    FOR SELECT TO authenticated
    USING (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS drawer_tx_client_insert ON public.cash_drawer_transactions;
CREATE POLICY drawer_tx_client_insert ON public.cash_drawer_transactions
    FOR INSERT TO authenticated
    WITH CHECK (client_id = public.get_current_client_id());

DROP POLICY IF EXISTS drawer_tx_client_update ON public.cash_drawer_transactions;
CREATE POLICY drawer_tx_client_update ON public.cash_drawer_transactions
    FOR UPDATE TO authenticated
    USING (client_id = public.get_current_client_id())
    WITH CHECK (client_id = public.get_current_client_id());

-- Prevent deleting cash movements
DROP POLICY IF EXISTS drawer_tx_super_admin_delete ON public.cash_drawer_transactions;
CREATE POLICY drawer_tx_super_admin_delete ON public.cash_drawer_transactions
    FOR DELETE TO authenticated
    USING (public.is_super_admin());
