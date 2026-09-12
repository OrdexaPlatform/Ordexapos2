-- ============================================================================
-- Migration: 0009_pos_licensing_integration.sql
-- Description: Phase 11 — POS Licensing Integration
-- 
-- 1. Alter shifts table: add device_id with FK to devices and index
-- 2. Validate POS License RPC (Server-side real-time validation)
-- 3. Register POS Terminal RPC (Atomic capacity enforcement)
-- 4. Deactivate POS Terminal RPC (Atomic seat release)
-- 5. Update open_shift RPC: License + Device verification + device_id binding
-- 6. Update complete_sale RPC: Strict Server-Side License + Terminal check
-- 7. RLS security: Client users can read licenses and devices of their client only
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Database Schema Extensions
-- ----------------------------------------------------------------------------
ALTER TABLE public.shifts 
    ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.devices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_shifts_device ON public.shifts(device_id);

-- ----------------------------------------------------------------------------
-- 2. RPC: validate_pos_license
-- Real-time, server-side licensing check for POS terminals.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_pos_license(
    p_client_id UUID DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL
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
    v_client RECORD;
    v_license RECORD;
    v_device RECORD;
    v_register_id UUID;
    v_days_left INT := 0;
BEGIN
    -- 1. Authentication check
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'UNAUTHENTICATED',
            'message', 'يجب تسجيل الدخول أولاً للتحقق من ترخيص نقطة البيع'
        );
    END IF;

    v_is_super_admin := public.is_super_admin();

    -- 2. Client identification
    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RETURN jsonb_build_object(
                'is_valid', FALSE,
                'error_code', 'USER_INACTIVE',
                'message', 'المستخدم غير مصرح له أو حسابه غير نشط في المنشأة'
            );
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RETURN jsonb_build_object(
                'is_valid', FALSE,
                'error_code', 'CLIENT_MISMATCH',
                'message', 'غير مصرح بفحص ترخيص منشأة أخرى'
            );
        END IF;
    ELSE
        IF p_client_id IS NOT NULL THEN
            v_effective_client_id := p_client_id;
        ELSE
            SELECT id INTO v_effective_client_id FROM public.clients WHERE status = 'active' LIMIT 1;
        END IF;
    END IF;

    IF v_effective_client_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'CLIENT_NOT_FOUND',
            'message', 'لم يتم العثور على بيانات المنشأة'
        );
    END IF;

    -- 3. Check Client Status
    SELECT id, business_name, status
    INTO v_client
    FROM public.clients
    WHERE id = v_effective_client_id;

    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'CLIENT_NOT_FOUND',
            'message', 'المنشأة غير موجودة في النظام'
        );
    END IF;

    IF v_client.status != 'active' THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'CLIENT_' || UPPER(v_client.status),
            'client_status', v_client.status,
            'message', 'حساب المنشأة موقوف أو معلق. يرجى مراجعة إدارة النظام.'
        );
    END IF;

    -- 4. Check Client License
    SELECT id, license_key, license_type, max_devices, activated_devices, expiry_date, status
    INTO v_license
    FROM public.licenses
    WHERE client_id = v_effective_client_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_license.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'NO_LICENSE',
            'client_status', v_client.status,
            'message', 'لا يوجد ترخيص مسجل لهذه المنشأة'
        );
    END IF;

    IF v_license.status != 'active' THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'LICENSE_' || UPPER(v_license.status),
            'client_status', v_client.status,
            'license_status', v_license.status,
            'message', 'ترخيص المنشأة غير نشط (' || v_license.status || '). يرجى مراجعة إدارة النظام.'
        );
    END IF;

    IF v_license.expiry_date < NOW() THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'LICENSE_EXPIRED',
            'client_status', v_client.status,
            'license_status', 'expired',
            'days_left', 0,
            'expiry_date', v_license.expiry_date,
            'message', 'انتهت صلاحية ترخيص النظام للمنشأة. يرجى تجديد الاشتراك لمتابعة استخدام نقطة البيع.'
        );
    END IF;

    v_days_left := GREATEST(0, EXTRACT(DAY FROM (v_license.expiry_date - NOW()))::INT);

    -- 5. Device Verification
    IF p_device_fingerprint IS NULL OR TRIM(p_device_fingerprint) = '' THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'MISSING_FINGERPRINT',
            'client_status', v_client.status,
            'license_status', v_license.status,
            'days_left', v_days_left,
            'message', 'بصمة الجهاز غير محددة'
        );
    END IF;

    SELECT id, client_id, license_id, device_name, status, device_fingerprint
    INTO v_device
    FROM public.devices
    WHERE device_fingerprint = TRIM(p_device_fingerprint)
    LIMIT 1;

    IF v_device.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'DEVICE_NOT_REGISTERED',
            'client_status', v_client.status,
            'license_status', v_license.status,
            'device_status', 'unregistered',
            'days_left', v_days_left,
            'max_devices', v_license.max_devices,
            'activated_devices', v_license.activated_devices,
            'message', 'هذا الجهاز غير مسجل بعد ضمن أجهزة المنشأة المرخصة'
        );
    END IF;

    IF v_device.client_id != v_effective_client_id THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'DEVICE_CLIENT_MISMATCH',
            'message', 'هذا الجهاز مسجل لدى منشأة أخرى ولا يمكن استخدامه هنا'
        );
    END IF;

    IF v_device.status != 'active' THEN
        RETURN jsonb_build_object(
            'is_valid', FALSE,
            'error_code', 'DEVICE_DEACTIVATED',
            'client_status', v_client.status,
            'license_status', v_license.status,
            'device_status', v_device.status,
            'device_id', v_device.id,
            'days_left', v_days_left,
            'message', 'تم إلغاء تفعيل هذا الجهاز من لوحة التحكم'
        );
    END IF;

    -- Update last_seen_at heartbeat silently
    UPDATE public.devices
    SET last_seen_at = NOW()
    WHERE id = v_device.id;

    -- Resolve cash register bound to this device if any
    SELECT id INTO v_register_id
    FROM public.cash_registers
    WHERE client_id = v_effective_client_id 
      AND device_id = v_device.id 
      AND is_active = TRUE
    LIMIT 1;

    RETURN jsonb_build_object(
        'is_valid', TRUE,
        'error_code', NULL,
        'client_status', v_client.status,
        'license_status', v_license.status,
        'license_type', v_license.license_type,
        'expiry_date', v_license.expiry_date,
        'days_left', v_days_left,
        'device_id', v_device.id,
        'device_name', v_device.device_name,
        'device_status', 'active',
        'device_fingerprint', v_device.device_fingerprint,
        'register_id', v_register_id,
        'max_devices', v_license.max_devices,
        'activated_devices', v_license.activated_devices,
        'message', 'الترخيص والجهاز ساريان وجاهزان للبيع'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC: register_pos_terminal
-- Atomic, server-side device registration with strict quota enforcement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_pos_terminal(
    p_client_id UUID DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL,
    p_device_name TEXT DEFAULT NULL,
    p_operating_system TEXT DEFAULT NULL,
    p_app_version TEXT DEFAULT NULL
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
    v_license RECORD;
    v_existing_device RECORD;
    v_active_devices_count INT;
    v_device_id UUID;
    v_clean_fp TEXT;
    v_clean_name TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتسجيل الجهاز';
    END IF;

    v_clean_fp := TRIM(COALESCE(p_device_fingerprint, ''));
    IF v_clean_fp = '' THEN
        RAISE EXCEPTION 'بصمة الجهاز مطلوبة ولا يمكن أن تكون فارغة';
    END IF;

    v_clean_name := TRIM(COALESCE(p_device_name, 'نقطة بيع رئيسية'));

    v_is_super_admin := public.is_super_admin();

    -- Check caller permissions
    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له بتسجيل أجهزة';
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح بتسجيل جهاز لمنشأة أخرى';
        END IF;

        IF NOT (
            v_client_user.role IN ('owner', 'admin', 'manager')
            OR v_client_user.custom_permissions ? 'devices.create'
            OR v_client_user.custom_permissions ? 'devices.*'
            OR v_client_user.custom_permissions ? 'settings.edit'
            OR v_client_user.custom_permissions ? '*'
        ) THEN
            RAISE EXCEPTION 'ليس لديك صلاحية تسجيل أو تفعيل أجهزة الكاشير';
        END IF;
    ELSE
        IF p_client_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنشأة مطلوب للمشرف العام';
        END IF;
        v_effective_client_id := p_client_id;
    END IF;

    -- Verify Client is active
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_effective_client_id AND status = 'active') THEN
        RAISE EXCEPTION 'حساب المنشأة موقوف أو معلق. لا يمكن تسجيل أجهزة جديدة.';
    END IF;

    -- Verify License is active and not expired
    SELECT id, license_key, max_devices, activated_devices, status, expiry_date
    INTO v_license
    FROM public.licenses
    WHERE client_id = v_effective_client_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_license.id IS NULL THEN
        RAISE EXCEPTION 'لا يوجد ترخيص مسجل للمنشأة لربط الجهاز به';
    END IF;

    IF v_license.status != 'active' THEN
        RAISE EXCEPTION 'ترخيص المنشأة غير نشط (%). لا يمكن إضافة أجهزة.', v_license.status;
    END IF;

    IF v_license.expiry_date < NOW() THEN
        RAISE EXCEPTION 'انتهت صلاحية ترخيص المنشأة. يرجى تجديد الاشتراك لإضافة أو تفعيل الأجهزة.';
    END IF;

    -- Check if fingerprint already exists anywhere in the system
    SELECT id, client_id, license_id, status INTO v_existing_device
    FROM public.devices
    WHERE device_fingerprint = v_clean_fp
    LIMIT 1;

    IF v_existing_device.id IS NOT NULL AND v_existing_device.client_id != v_effective_client_id THEN
        RAISE EXCEPTION 'هذا الجهاز مسجل بالفعل لدى منشأة أخرى في النظام ولا يمكن استخدامه هنا';
    END IF;

    -- Count active devices under this license (excluding the device being reactivated if any)
    SELECT COUNT(*) INTO v_active_devices_count
    FROM public.devices
    WHERE license_id = v_license.id 
      AND status = 'active'
      AND (v_existing_device.id IS NULL OR id != v_existing_device.id);

    IF v_active_devices_count >= v_license.max_devices THEN
        RAISE EXCEPTION 'تم استنفاد الحد الأقصى للأجهزة المسموح بها في ترخيصكم (% جهاز). يرجى ترقية الخطة أو تعطيل جهاز آخر أولاً.', v_license.max_devices;
    END IF;

    IF v_existing_device.id IS NOT NULL THEN
        -- Reactivate / update existing device
        v_device_id := v_existing_device.id;
        UPDATE public.devices
        SET device_name = v_clean_name,
            operating_system = COALESCE(p_operating_system, operating_system),
            app_version = COALESCE(p_app_version, app_version),
            status = 'active',
            license_id = v_license.id,
            activated_at = NOW(),
            deactivated_at = NULL,
            last_seen_at = NOW(),
            updated_at = NOW()
        WHERE id = v_device_id;
    ELSE
        -- Insert brand new device
        v_device_id := uuid_generate_v4();
        INSERT INTO public.devices (
            id,
            client_id,
            license_id,
            device_name,
            device_fingerprint,
            operating_system,
            app_version,
            status,
            activated_at,
            last_seen_at
        ) VALUES (
            v_device_id,
            v_effective_client_id,
            v_license.id,
            v_clean_name,
            v_clean_fp,
            p_operating_system,
            p_app_version,
            'active',
            NOW(),
            NOW()
        );
    END IF;

    -- Atomically sync activated_devices counter in licenses
    UPDATE public.licenses
    SET activated_devices = (
        SELECT COUNT(*) FROM public.devices WHERE license_id = v_license.id AND status = 'active'
    ),
    updated_at = NOW()
    WHERE id = v_license.id;

    -- Audit log
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
        'device_activated',
        'device',
        v_device_id,
        jsonb_build_object(
            'device_name', v_clean_name,
            'fingerprint', v_clean_fp,
            'license_id', v_license.id,
            'client_id', v_effective_client_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'device_id', v_device_id,
        'device_name', v_clean_name,
        'device_fingerprint', v_clean_fp,
        'message', 'تم تسجيل وتفعيل الجهاز بنجاح'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC: deactivate_pos_terminal
-- Atomic, server-side device deactivation and seat release.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deactivate_pos_terminal(
    p_client_id UUID DEFAULT NULL,
    p_device_id UUID DEFAULT NULL
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
    v_device RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لإلغاء تفعيل الجهاز';
    END IF;

    IF p_device_id IS NULL THEN
        RAISE EXCEPTION 'معرف الجهاز مطلوب';
    END IF;

    v_is_super_admin := public.is_super_admin();

    IF NOT v_is_super_admin THEN
        SELECT id, client_id, role, status, custom_permissions
        INTO v_client_user
        FROM public.client_users
        WHERE auth_user_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_client_user.id IS NULL THEN
            RAISE EXCEPTION 'المستخدم غير مصرح له بإلغاء تفعيل أجهزة';
        END IF;

        v_effective_client_id := v_client_user.client_id;
        IF p_client_id IS NOT NULL AND p_client_id != v_effective_client_id THEN
            RAISE EXCEPTION 'غير مصرح بإلغاء تفعيل جهاز لمنشأة أخرى';
        END IF;

        IF NOT (
            v_client_user.role IN ('owner', 'admin', 'manager')
            OR v_client_user.custom_permissions ? 'devices.deactivate'
            OR v_client_user.custom_permissions ? 'devices.*'
            OR v_client_user.custom_permissions ? 'settings.edit'
            OR v_client_user.custom_permissions ? '*'
        ) THEN
            RAISE EXCEPTION 'ليس لديك صلاحية إلغاء تفعيل أجهزة الكاشير';
        END IF;
    ELSE
        IF p_client_id IS NULL THEN
            SELECT client_id INTO v_effective_client_id FROM public.devices WHERE id = p_device_id;
        ELSE
            v_effective_client_id := p_client_id;
        END IF;
    END IF;

    -- Fetch device
    SELECT id, client_id, license_id, device_name, device_fingerprint, status
    INTO v_device
    FROM public.devices
    WHERE id = p_device_id AND client_id = v_effective_client_id;

    IF v_device.id IS NULL THEN
        RAISE EXCEPTION 'الجهاز غير موجود أو لا ينتمي لهذه المنشأة';
    END IF;

    IF v_device.status = 'deactivated' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'device_id', v_device.id,
            'message', 'الجهاز معطل بالفعل'
        );
    END IF;

    -- Deactivate device
    UPDATE public.devices
    SET status = 'deactivated',
        deactivated_at = NOW(),
        updated_at = NOW()
    WHERE id = v_device.id;

    -- Re-calculate and update activated_devices in licenses
    IF v_device.license_id IS NOT NULL THEN
        UPDATE public.licenses
        SET activated_devices = (
            SELECT COUNT(*) FROM public.devices WHERE license_id = v_device.license_id AND status = 'active'
        ),
        updated_at = NOW()
        WHERE id = v_device.license_id;
    END IF;

    -- Audit log
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
        'device_deactivated',
        'device',
        v_device.id,
        jsonb_build_object(
            'device_name', v_device.device_name,
            'fingerprint', v_device.device_fingerprint,
            'client_id', v_effective_client_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'device_id', v_device.id,
        'message', 'تم إلغاء تفعيل الجهاز وتحرير مقعد الترخيص بنجاح'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Updated open_shift RPC
-- Verifies Client, License, Device and binds shifts.device_id atomically.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_shift(
    p_client_id UUID,
    p_warehouse_id UUID,
    p_register_id UUID DEFAULT NULL,
    p_opening_cash NUMERIC DEFAULT 0,
    p_opening_notes TEXT DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL
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
    v_client_status TEXT;
    v_license RECORD;
    v_device_id UUID := NULL;
    v_device_status TEXT;
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

    -- ========================================================================
    -- PHASE 11 STRICT ENFORCEMENT: Client & License & Device
    -- ========================================================================
    -- 1. Client status check
    SELECT status INTO v_client_status FROM public.clients WHERE id = v_effective_client_id;
    IF v_client_status IS NULL OR v_client_status != 'active' THEN
        RAISE EXCEPTION 'حساب المنشأة موقوف أو معلق. لا يمكن فتح وردية كاشير.';
    END IF;

    -- 2. Client license check
    SELECT id, status, expiry_date INTO v_license
    FROM public.licenses
    WHERE client_id = v_effective_client_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_license.id IS NULL THEN
        RAISE EXCEPTION 'لا يوجد ترخيص مسجل للمنشأة. يرجى الاشتراك أولاً لفتح الورديات.';
    END IF;

    IF v_license.status != 'active' THEN
        RAISE EXCEPTION 'ترخيص المنشأة غير نشط (حالة الترخيص: %). لا يمكن فتح وردية جديدة.', v_license.status;
    END IF;

    IF v_license.expiry_date < NOW() THEN
        RAISE EXCEPTION 'انتهت صلاحية ترخيص النظام للمنشأة بتاريخ (%). يرجى تجديد الاشتراك لفتح الورديات ومتابعة البيع.', TO_CHAR(v_license.expiry_date, 'YYYY-MM-DD');
    END IF;

    -- 3. Device validation
    IF p_device_fingerprint IS NOT NULL AND TRIM(p_device_fingerprint) != '' THEN
        SELECT id, status INTO v_device_id, v_device_status
        FROM public.devices
        WHERE device_fingerprint = TRIM(p_device_fingerprint) AND client_id = v_effective_client_id
        LIMIT 1;

        IF v_device_id IS NULL THEN
            RAISE EXCEPTION 'هذا الجهاز غير مسجل ضمن أجهزة المنشأة المرخصة. يرجى تسجيل وتفعيل الجهاز أولاً.';
        END IF;

        IF v_device_status != 'active' THEN
            RAISE EXCEPTION 'تم إيقاف تفعيل هذا الجهاز من لوحة التحكم ولا يمكن فتح وردية من خلاله.';
        END IF;

        -- Touch last_seen_at
        UPDATE public.devices SET last_seen_at = NOW() WHERE id = v_device_id;
    ELSE
        -- Fallback: check if register has a linked device
        IF p_register_id IS NOT NULL THEN
            SELECT device_id INTO v_device_id FROM public.cash_registers WHERE id = p_register_id;
            IF v_device_id IS NOT NULL THEN
                SELECT status INTO v_device_status FROM public.devices WHERE id = v_device_id AND client_id = v_effective_client_id;
                IF v_device_status != 'active' THEN
                    RAISE EXCEPTION 'جهاز الكاشير المقترن بهذا الصندوق معطل أو غير مرخص.';
                END IF;
            END IF;
        END IF;

        IF NOT v_is_super_admin AND v_device_id IS NULL THEN
            RAISE EXCEPTION 'يجب تحديد بصمة الجهاز المرخص لفتح الوردية.';
        END IF;
    END IF;

    -- Basic input validation
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

    -- If cash register does not have a device_id linked, link it to this active device
    IF v_device_id IS NOT NULL THEN
        UPDATE public.cash_registers
        SET device_id = COALESCE(device_id, v_device_id),
            updated_at = NOW()
        WHERE id = v_register_id;
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

    -- Insert shift record linked to device_id
    INSERT INTO public.shifts (
        id,
        client_id,
        device_id,
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
        v_device_id,
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
            'warehouse_id', p_warehouse_id,
            'device_id', v_device_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'shift_id', v_shift_id,
        'shift_number', v_shift_number,
        'device_id', v_device_id,
        'opened_at', NOW(),
        'opening_cash', p_opening_cash,
        'register_id', v_register_id,
        'warehouse_id', p_warehouse_id,
        'status', 'open'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Updated complete_sale RPC
-- Verifies Client, License, and Terminal status before permitting any transaction.
-- ----------------------------------------------------------------------------
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
    v_client_status TEXT;
    v_license RECORD;
    v_active_shift_id UUID;
    v_shift_device_id UUID;
    v_shift_device_status TEXT;
    v_invoice_number TEXT;
    v_sale_id UUID;
    v_total_subtotal NUMERIC := 0;
    v_total_line_discounts NUMERIC := 0;
    v_total_tax NUMERIC := 0;
    v_final_total NUMERIC := 0;
    v_total_paid NUMERIC := 0;
    v_change_amount NUMERIC := 0;
    v_payment_status TEXT := 'paid';
    v_inv_discount NUMERIC := COALESCE(p_discount_amount, 0);
    v_item RECORD;
    v_payment RECORD;
    v_product RECORD;
    v_custom_price NUMERIC;
    v_item_subtotal NUMERIC;
    v_item_disc NUMERIC;
    v_item_taxable NUMERIC;
    v_item_tax_rate NUMERIC;
    v_item_tax NUMERIC;
    v_item_line_total NUMERIC;
    v_current_stock NUMERIC;
    v_stock_lock RECORD;
BEGIN
    -- 1. Authentication check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول أولاً لإتمام البيع';
    END IF;

    v_is_super_admin := public.is_super_admin();

    -- 2. Authorization check
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
    -- PHASE 11 STRICT SERVER-SIDE ENFORCEMENT: Client & License
    -- ========================================================================
    -- 1. Client status check
    SELECT status INTO v_client_status FROM public.clients WHERE id = v_effective_client_id;
    IF v_client_status IS NULL OR v_client_status != 'active' THEN
        RAISE EXCEPTION 'حساب المنشأة موقوف أو معلق. تم حظر إتمام عمليات البيع.';
    END IF;

    -- 2. Client license check
    SELECT id, status, expiry_date INTO v_license
    FROM public.licenses
    WHERE client_id = v_effective_client_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_license.id IS NULL THEN
        RAISE EXCEPTION 'لا يوجد ترخيص معتمد للمنشأة لإتمام عمليات البيع.';
    END IF;

    IF v_license.status != 'active' THEN
        RAISE EXCEPTION 'ترخيص المنشأة غير نشط (حالة الترخيص: %). يرجى التواصل مع الإدارة للتفعيل.', v_license.status;
    END IF;

    IF v_license.expiry_date < NOW() THEN
        RAISE EXCEPTION 'انتهت صلاحية ترخيص النظام للمنشأة بتاريخ (%). تم تعليق عمليات البيع الجديدة حتى تجديد الاشتراك.', TO_CHAR(v_license.expiry_date, 'YYYY-MM-DD');
    END IF;

    -- ========================================================================
    -- PHASE 10 & 11: POS Sales require an active open shift + active device
    -- ========================================================================
    IF v_client_user.id IS NOT NULL THEN
        SELECT id, device_id INTO v_active_shift_id, v_shift_device_id
        FROM public.shifts
        WHERE client_id = v_effective_client_id
          AND opened_by = v_client_user.id
          AND status = 'open'
        LIMIT 1;
    END IF;

    -- Fallback: check if there is an active open shift in this warehouse
    IF v_active_shift_id IS NULL THEN
        SELECT id, device_id INTO v_active_shift_id, v_shift_device_id
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

    -- Phase 11: Validate device linked to shift (if any)
    IF v_shift_device_id IS NOT NULL THEN
        SELECT status INTO v_shift_device_status
        FROM public.devices
        WHERE id = v_shift_device_id AND client_id = v_effective_client_id;

        IF v_shift_device_status IS NULL OR v_shift_device_status != 'active' THEN
            RAISE EXCEPTION 'جهاز نقطة البيع المرتبط بهذه الوردية معطل أو ملغى تفعيله. لا يمكن متابعة البيع من هذا الجهاز.';
        END IF;

        -- Update device last seen
        UPDATE public.devices SET last_seen_at = NOW() WHERE id = v_shift_device_id;
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
        SELECT (value->>'product_id')::UUID as product_id
        FROM jsonb_array_elements(p_items)
        ORDER BY 1
    LOOP
        PERFORM 1 
        FROM public.inventory_balances 
        WHERE client_id = v_effective_client_id 
          AND product_id = v_stock_lock.product_id 
          AND warehouse_id = p_warehouse_id 
        FOR UPDATE;
    END LOOP;

    -- 6. Validate and Calculate Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_price NUMERIC,
        discount_amount NUMERIC
    ) LOOP
        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'معرف المنتج مفقود في أحد بنود الفاتورة';
        END IF;
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'كمية المنتج يجب أن تكون أكبر من الصفر';
        END IF;

        SELECT * INTO v_product 
        FROM public.products 
        WHERE id = v_item.product_id AND client_id = v_effective_client_id;

        IF v_product.id IS NULL THEN
            RAISE EXCEPTION 'المنتج غير موجود أو لا يتبع هذه المنشأة';
        END IF;

        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'المنتج (%) غير نشط حالياً ولا يمكن بيعه', v_product.name;
        END IF;

        IF NOT v_can_edit_price THEN
            v_custom_price := v_product.selling_price;
        ELSE
            v_custom_price := COALESCE(v_item.unit_price, v_product.selling_price);
            IF v_custom_price < 0 THEN
                RAISE EXCEPTION 'سعر بيع المنتج (%) لا يمكن أن يكون سالباً', v_product.name;
            END IF;
        END IF;

        IF v_product.track_stock THEN
            SELECT quantity INTO v_current_stock 
            FROM public.inventory_balances 
            WHERE client_id = v_effective_client_id 
              AND product_id = v_item.product_id 
              AND warehouse_id = p_warehouse_id;

            IF v_current_stock IS NULL OR v_current_stock < v_item.quantity THEN
                RAISE EXCEPTION 'الرصيد المتاح غير كافٍ للمنتج (%). الرصيد المتوفر حالياً: %', 
                    v_product.name, COALESCE(v_current_stock, 0);
            END IF;
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

        v_total_subtotal := v_total_subtotal + v_item_subtotal;
        v_total_line_discounts := v_total_line_discounts + v_item_disc;
        v_total_tax := v_total_tax + v_item_tax;
    END LOOP;

    -- Calculate Invoice Grand Total
    IF v_inv_discount > (v_total_subtotal - v_total_line_discounts) THEN
        v_inv_discount := (v_total_subtotal - v_total_line_discounts);
    END IF;

    v_final_total := ROUND((v_total_subtotal - v_total_line_discounts - v_inv_discount + v_total_tax), 4);

    IF v_total_paid < v_final_total THEN
        RAISE EXCEPTION 'المبلغ المستلم (%) أقل من إجمالي الفاتورة المطلوب (%)', v_total_paid, v_final_total;
    END IF;

    v_change_amount := ROUND((v_total_paid - v_final_total), 4);

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

-- ----------------------------------------------------------------------------
-- 7. RLS Policies for Licenses & Devices
-- Allow client users to read their own client's license & devices
-- ----------------------------------------------------------------------------
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client users can read licenses of their business" ON public.licenses;
CREATE POLICY "Client users can read licenses of their business" ON public.licenses
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR client_id = public.get_current_client_id()
    );

DROP POLICY IF EXISTS "Client users can read devices of their business" ON public.devices;
CREATE POLICY "Client users can read devices of their business" ON public.devices
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR client_id = public.get_current_client_id()
    );
