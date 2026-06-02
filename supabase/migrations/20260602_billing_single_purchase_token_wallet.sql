-- Switch one-time purchases from "interview credits" to purchased TOKEN wallet.
-- Existing table names are kept for compatibility; new TOKEN columns drive the
-- new flow. Legacy credit columns remain only for old data / rollback reads.

ALTER TABLE public.credit_packages
  ADD COLUMN IF NOT EXISTS token_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.one_time_purchases
  ADD COLUMN IF NOT EXISTS token_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.company_interview_credit_balance
  ADD COLUMN IF NOT EXISTS purchased_tokens_remaining BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_packages_token_amount_chk'
  ) THEN
    ALTER TABLE public.credit_packages
      ADD CONSTRAINT credit_packages_token_amount_chk CHECK (token_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'one_time_purchases_token_amount_chk'
  ) THEN
    ALTER TABLE public.one_time_purchases
      ADD CONSTRAINT one_time_purchases_token_amount_chk CHECK (token_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_interview_credit_balance_tokens_chk'
  ) THEN
    ALTER TABLE public.company_interview_credit_balance
      ADD CONSTRAINT company_interview_credit_balance_tokens_chk CHECK (purchased_tokens_remaining >= 0);
  END IF;
END $$;

ALTER TABLE public.interview_billing_allocations
  DROP CONSTRAINT IF EXISTS interview_billing_allocations_source_chk;

ALTER TABLE public.interview_billing_allocations
  ADD CONSTRAINT interview_billing_allocations_source_chk
  CHECK (source IN ('free_quota', 'subscription', 'admin_entitlement', 'purchased_credit', 'purchased_token'));

UPDATE public.billing_runtime_settings
SET free_interview_token_cap = 50000,
    updated_at = now()
WHERE id = 'default';

INSERT INTO public.credit_packages (
  code,
  name,
  price_twd,
  interview_count,
  per_interview_token_cap,
  token_amount,
  is_active,
  updated_at
)
VALUES (
  'token_100k_test',
  '100K TOKEN 方案',
  10,
  1,
  50000,
  100000,
  true,
  now()
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    price_twd = EXCLUDED.price_twd,
    interview_count = EXCLUDED.interview_count,
    per_interview_token_cap = EXCLUDED.per_interview_token_cap,
    token_amount = EXCLUDED.token_amount,
    is_active = EXCLUDED.is_active,
    updated_at = now();

UPDATE public.credit_packages
SET is_active = false,
    updated_at = now()
WHERE code IN ('interview_10_for_10_twd', 'interview_10_test', 'token_2000k_test');

INSERT INTO public.company_interview_credit_balance(company_id, updated_at)
SELECT id, now()
FROM public.company
ON CONFLICT (company_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_interview_sessions_company_tokens
  ON public.interview_sessions(company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.add_company_purchased_tokens(
  p_company_id UUID,
  p_tokens BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance public.company_interview_credit_balance%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  INSERT INTO public.company_interview_credit_balance(
    company_id,
    purchased_tokens_remaining,
    updated_at
  )
  VALUES (p_company_id, 0, now())
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE public.company_interview_credit_balance
  SET purchased_tokens_remaining = purchased_tokens_remaining + p_tokens,
      updated_at = now()
  WHERE company_id = p_company_id
  RETURNING * INTO v_balance;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id,
    'purchased_tokens_remaining', v_balance.purchased_tokens_remaining
  );
END;
$$;

ALTER FUNCTION public.add_company_purchased_tokens(UUID, BIGINT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.add_company_purchased_tokens(UUID, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_company_interview_token_summary(
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_settings public.billing_runtime_settings%ROWTYPE;
  v_historical_max BIGINT := 0;
  v_required BIGINT := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  SELECT * INTO v_settings
  FROM public.billing_runtime_settings
  WHERE id = 'default';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RUNTIME_SETTINGS_NOT_FOUND';
  END IF;

  SELECT COALESCE(MAX(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)), 0)
  INTO v_historical_max
  FROM public.interview_sessions
  WHERE company_id = p_company_id;

  v_required := GREATEST(v_historical_max, v_settings.default_estimated_interview_tokens);

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'historical_max_interview_tokens', v_historical_max,
    'default_estimated_interview_tokens', v_settings.default_estimated_interview_tokens,
    'required_tokens_for_new_interview', v_required,
    'free_interview_token_cap', v_settings.free_interview_token_cap
  );
END;
$$;

ALTER FUNCTION public.get_company_interview_token_summary(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_company_interview_token_summary(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.create_interview_with_quota(
  p_company_id uuid,
  p_job_opening_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_profiles_id uuid,
  p_candidate_email text,
  p_review_type public.review_type_type,
  p_created_by_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_member_exists boolean := false;
  v_job public.job_opening%ROWTYPE;
  v_candidate_profile public.profiles%ROWTYPE;
  v_normalized_email text;
  v_interview public.interviews%ROWTYPE;
  v_quota public.company_interview_quota%ROWTYPE;
  v_settings public.billing_runtime_settings%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_admin_entitlement public.admin_billing_entitlements%ROWTYPE;
  v_token_balance public.company_interview_credit_balance%ROWTYPE;
  v_allocation_id uuid;
  v_billing_source text;
  v_token_cap integer;
  v_required_tokens integer;
BEGIN
  IF p_company_id IS NULL OR p_job_opening_id IS NULL OR p_start_time IS NULL OR p_created_by_profile_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_FIELDS';
  END IF;
  IF (p_profiles_id IS NOT NULL AND p_candidate_email IS NOT NULL)
     OR (p_profiles_id IS NULL AND (p_candidate_email IS NULL OR btrim(p_candidate_email) = '')) THEN
    RAISE EXCEPTION 'XOR_PROFILE_EMAIL';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id AND cm.profile_id = p_created_by_profile_id
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_job
  FROM public.job_opening
  WHERE id = p_job_opening_id AND company_id = p_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_OPENING_NOT_FOUND';
  END IF;
  IF v_job.hired_count >= v_job.target_hires THEN
    RAISE EXCEPTION 'CAPACITY_REACHED';
  END IF;

  IF p_profiles_id IS NOT NULL THEN
    SELECT * INTO v_candidate_profile FROM public.profiles WHERE id = p_profiles_id LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROFILE_ID_NOT_FOUND';
    END IF;
    IF v_candidate_profile.role <> 'jobSeeker' THEN
      RAISE EXCEPTION 'CANDIDATE_NOT_JOBSEEKER';
    END IF;
  ELSE
    v_normalized_email := lower(btrim(coalesce(p_candidate_email, '')));
    IF v_normalized_email = '' THEN
      RAISE EXCEPTION 'MISSING_CANDIDATE_EMAIL';
    END IF;
    SELECT * INTO v_candidate_profile
    FROM public.profiles
    WHERE lower(email) = v_normalized_email
    ORDER BY created_at DESC
    LIMIT 1;
    IF FOUND THEN
      IF v_candidate_profile.role <> 'jobSeeker' THEN
        RAISE EXCEPTION 'CANDIDATE_NOT_JOBSEEKER';
      END IF;
      p_profiles_id := v_candidate_profile.id;
      p_candidate_email := NULL;
    ELSE
      p_profiles_id := NULL;
      p_candidate_email := v_normalized_email;
    END IF;
  END IF;

  SELECT * INTO v_settings
  FROM public.billing_runtime_settings
  WHERE id = 'default';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RUNTIME_SETTINGS_NOT_FOUND';
  END IF;

  SELECT GREATEST(
    COALESCE(MAX(COALESCE(tokens_input, 0) + COALESCE(tokens_output, 0)), 0),
    v_settings.default_estimated_interview_tokens
  )::integer
  INTO v_required_tokens
  FROM public.interview_sessions
  WHERE company_id = p_company_id;

  INSERT INTO public.company_interview_quota(company_id, used_count, free_quota, updated_at)
  VALUES (p_company_id, 0, 3, now())
  ON CONFLICT (company_id) DO NOTHING;

  SELECT * INTO v_quota
  FROM public.company_interview_quota
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_quota.used_count < v_quota.free_quota
     AND v_settings.free_interview_token_cap > v_required_tokens THEN
    v_billing_source := 'free_quota';
    v_token_cap := v_settings.free_interview_token_cap;

    UPDATE public.company_interview_quota
    SET used_count = used_count + 1,
        last_used_at = now(),
        updated_at = now()
    WHERE company_id = p_company_id
    RETURNING * INTO v_quota;
  ELSE
    SELECT * INTO v_subscription
    FROM public.subscriptions
    WHERE company_id = p_company_id
      AND status IN ('active', 'past_due', 'payment_failed', 'cancel_at_period_end', 'card_update_required')
      AND COALESCE(current_period_end, '-infinity'::timestamptz) > now()
      AND monthly_token_limit IS NOT NULL
      AND monthly_token_limit - monthly_token_used > v_required_tokens
      AND LEAST(monthly_token_limit - monthly_token_used, v_settings.free_interview_token_cap) > v_required_tokens
    ORDER BY current_period_end DESC NULLS LAST, created_at DESC
    LIMIT 1
    FOR UPDATE;

    SELECT * INTO v_admin_entitlement
    FROM public.admin_billing_entitlements
    WHERE company_id = p_company_id
      AND status = 'active'
      AND starts_at <= now()
      AND ends_at > now()
      AND monthly_token_limit_override IS NOT NULL
      AND monthly_token_limit_override - monthly_token_used > v_required_tokens
      AND LEAST(monthly_token_limit_override - monthly_token_used, v_settings.free_interview_token_cap) > v_required_tokens
    ORDER BY ends_at DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_admin_entitlement.id IS NOT NULL
       AND (
         v_subscription.id IS NULL OR
         v_admin_entitlement.ends_at > COALESCE(v_subscription.current_period_end, '-infinity'::timestamptz)
       ) THEN
      v_billing_source := 'admin_entitlement';
      v_token_cap := LEAST(
        v_admin_entitlement.monthly_token_limit_override - v_admin_entitlement.monthly_token_used,
        v_settings.free_interview_token_cap
      );
    ELSIF v_subscription.id IS NOT NULL THEN
      v_billing_source := 'subscription';
      v_token_cap := LEAST(
        v_subscription.monthly_token_limit - v_subscription.monthly_token_used,
        v_settings.free_interview_token_cap
      );
    ELSE
      INSERT INTO public.company_interview_credit_balance(
        company_id,
        purchased_tokens_remaining,
        updated_at
      )
      VALUES (p_company_id, 0, now())
      ON CONFLICT (company_id) DO NOTHING;

      SELECT * INTO v_token_balance
      FROM public.company_interview_credit_balance
      WHERE company_id = p_company_id
      FOR UPDATE;

      IF LEAST(v_token_balance.purchased_tokens_remaining, v_settings.free_interview_token_cap) <= v_required_tokens THEN
        RAISE EXCEPTION 'INSUFFICIENT_TOKENS_FOR_INTERVIEW';
      END IF;

      v_billing_source := 'purchased_token';
      v_token_cap := LEAST(v_token_balance.purchased_tokens_remaining, v_settings.free_interview_token_cap)::integer;
    END IF;
  END IF;

  INSERT INTO public.interviews(company_id, job_opening_id, start_time, end_time, profiles_id, candidate_email, review_type)
  VALUES (
    p_company_id,
    p_job_opening_id,
    p_start_time,
    p_end_time,
    p_profiles_id,
    CASE WHEN p_profiles_id IS NULL THEN lower(p_candidate_email) ELSE NULL END,
    COALESCE(p_review_type, 'AI'::public.review_type_type)
  )
  RETURNING * INTO v_interview;

  INSERT INTO public.interview_billing_allocations(
    interview_id,
    company_id,
    source,
    subscription_id,
    admin_entitlement_id,
    one_time_purchase_id,
    token_cap
  )
  VALUES (
    v_interview.id,
    p_company_id,
    v_billing_source,
    CASE WHEN v_billing_source = 'subscription' THEN v_subscription.id ELSE NULL END,
    CASE WHEN v_billing_source = 'admin_entitlement' THEN v_admin_entitlement.id ELSE NULL END,
    NULL,
    v_token_cap
  )
  RETURNING id INTO v_allocation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_interview.id,
    'company_id', v_interview.company_id,
    'job_opening_id', v_interview.job_opening_id,
    'start_time', v_interview.start_time,
    'profiles_id', v_interview.profiles_id,
    'candidate_email', v_interview.candidate_email,
    'billing_source', v_billing_source,
    'billing_allocation_id', v_allocation_id,
    'subscription_id', CASE WHEN v_billing_source = 'subscription' THEN v_subscription.id ELSE NULL END,
    'admin_entitlement_id', CASE WHEN v_billing_source = 'admin_entitlement' THEN v_admin_entitlement.id ELSE NULL END,
    'one_time_purchase_id', NULL,
    'token_cap', v_token_cap,
    'required_tokens', v_required_tokens
  );
END;
$$;

ALTER FUNCTION public.create_interview_with_quota(
  uuid, uuid, timestamptz, timestamptz, uuid, text, public.review_type_type, uuid
) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_interview_with_quota(
  uuid, uuid, timestamptz, timestamptz, uuid, text, public.review_type_type, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_interview_allocation_tokens(
  p_interview_id UUID,
  p_company_id UUID,
  p_request_id TEXT,
  p_request_type TEXT,
  p_model TEXT,
  p_estimated_tokens INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_allocation public.interview_billing_allocations%ROWTYPE;
  v_balance public.company_interview_credit_balance%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_entitlement public.admin_billing_entitlements%ROWTYPE;
BEGIN
  IF p_interview_id IS NULL OR p_company_id IS NULL
     OR p_request_id IS NULL OR btrim(p_request_id) = ''
     OR p_request_type IS NULL OR btrim(p_request_type) = ''
     OR p_estimated_tokens IS NULL OR p_estimated_tokens <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  IF EXISTS (SELECT 1 FROM public.company_ai_token_usage_logs WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST_ID';
  END IF;

  SELECT * INTO v_allocation
  FROM public.interview_billing_allocations
  WHERE interview_id = p_interview_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTERVIEW_ALLOCATION_NOT_FOUND';
  END IF;

  IF v_allocation.source NOT IN ('free_quota', 'subscription', 'admin_entitlement', 'purchased_credit', 'purchased_token') THEN
    RAISE EXCEPTION 'INTERVIEW_ALLOCATION_NOT_CAPPED';
  END IF;

  IF v_allocation.token_used + p_estimated_tokens > v_allocation.token_cap THEN
    RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
  END IF;

  IF v_allocation.source = 'purchased_token' THEN
    SELECT * INTO v_balance
    FROM public.company_interview_credit_balance
    WHERE company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND OR v_balance.purchased_tokens_remaining < p_estimated_tokens THEN
      RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
    END IF;

    UPDATE public.company_interview_credit_balance
    SET purchased_tokens_remaining = purchased_tokens_remaining - p_estimated_tokens,
        updated_at = now()
    WHERE company_id = p_company_id;
  ELSIF v_allocation.source = 'subscription' THEN
    SELECT * INTO v_subscription
    FROM public.subscriptions
    WHERE id = v_allocation.subscription_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_subscription.monthly_token_limit IS NULL
       OR v_subscription.monthly_token_used + p_estimated_tokens > v_subscription.monthly_token_limit THEN
      RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
    END IF;

    UPDATE public.subscriptions
    SET monthly_token_used = monthly_token_used + p_estimated_tokens,
        updated_at = now()
    WHERE id = v_subscription.id;
  ELSIF v_allocation.source = 'admin_entitlement' THEN
    SELECT * INTO v_entitlement
    FROM public.admin_billing_entitlements
    WHERE id = v_allocation.admin_entitlement_id
      AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_entitlement.monthly_token_limit_override IS NULL
       OR v_entitlement.monthly_token_used + p_estimated_tokens > v_entitlement.monthly_token_limit_override THEN
      RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
    END IF;

    UPDATE public.admin_billing_entitlements
    SET monthly_token_used = monthly_token_used + p_estimated_tokens,
        updated_at = now()
    WHERE id = v_entitlement.id;
  END IF;

  UPDATE public.interview_billing_allocations
  SET token_used = token_used + p_estimated_tokens,
      updated_at = now()
  WHERE id = v_allocation.id
  RETURNING * INTO v_allocation;

  INSERT INTO public.company_ai_token_usage_logs(
    company_id, subscription_id, admin_entitlement_id, interview_id, request_id, request_type, model,
    estimated_tokens, reserved_tokens, status
  )
  VALUES (
    p_company_id, v_allocation.subscription_id, v_allocation.admin_entitlement_id, p_interview_id, p_request_id, p_request_type, p_model,
    p_estimated_tokens, p_estimated_tokens, 'reserved'
  );

  RETURN jsonb_build_object(
    'source', v_allocation.source,
    'interview_id', v_allocation.interview_id,
    'token_cap', v_allocation.token_cap,
    'token_used', v_allocation.token_used
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_interview_allocation_tokens(
  p_request_id TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_log public.company_ai_token_usage_logs%ROWTYPE;
  v_allocation public.interview_billing_allocations%ROWTYPE;
  v_total integer;
  v_delta integer;
BEGIN
  IF p_request_id IS NULL OR btrim(p_request_id) = ''
     OR p_input_tokens IS NULL OR p_input_tokens < 0
     OR p_output_tokens IS NULL OR p_output_tokens < 0 THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  SELECT * INTO v_log
  FROM public.company_ai_token_usage_logs
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOKEN_LOG_NOT_FOUND';
  END IF;

  IF v_log.status = 'finalized' THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'total_tokens', v_log.total_tokens);
  END IF;

  IF v_log.status <> 'reserved' OR v_log.interview_id IS NULL THEN
    RAISE EXCEPTION 'TOKEN_LOG_NOT_INTERVIEW_RESERVED';
  END IF;

  SELECT * INTO v_allocation
  FROM public.interview_billing_allocations
  WHERE interview_id = v_log.interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTERVIEW_ALLOCATION_NOT_FOUND';
  END IF;

  v_total := p_input_tokens + p_output_tokens;
  v_delta := v_total - v_log.reserved_tokens;

  IF v_delta <> 0 AND v_allocation.source = 'purchased_token' THEN
    IF v_delta > 0 THEN
      UPDATE public.company_interview_credit_balance
      SET purchased_tokens_remaining = GREATEST(0, purchased_tokens_remaining - v_delta),
          updated_at = now()
      WHERE company_id = v_log.company_id;
    ELSE
      UPDATE public.company_interview_credit_balance
      SET purchased_tokens_remaining = purchased_tokens_remaining + abs(v_delta),
          updated_at = now()
      WHERE company_id = v_log.company_id;
    END IF;
  ELSIF v_delta <> 0 AND v_allocation.source = 'subscription' THEN
    UPDATE public.subscriptions
    SET monthly_token_used = GREATEST(0, monthly_token_used + v_delta),
        updated_at = now()
    WHERE id = v_allocation.subscription_id;
  ELSIF v_delta <> 0 AND v_allocation.source = 'admin_entitlement' THEN
    UPDATE public.admin_billing_entitlements
    SET monthly_token_used = GREATEST(0, monthly_token_used + v_delta),
        updated_at = now()
    WHERE id = v_allocation.admin_entitlement_id;
  END IF;

  UPDATE public.interview_billing_allocations
  SET token_used = GREATEST(0, token_used + v_delta),
      updated_at = now()
  WHERE id = v_allocation.id;

  UPDATE public.company_ai_token_usage_logs
  SET input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = v_total,
      status = 'finalized',
      updated_at = now()
  WHERE id = v_log.id
  RETURNING * INTO v_log;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_log.request_id,
    'total_tokens', v_total,
    'delta_tokens', v_delta
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_interview_allocation_tokens(
  p_request_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_log public.company_ai_token_usage_logs%ROWTYPE;
  v_allocation public.interview_billing_allocations%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR btrim(p_request_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  SELECT * INTO v_log
  FROM public.company_ai_token_usage_logs
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOKEN_LOG_NOT_FOUND';
  END IF;

  IF v_log.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'status', v_log.status);
  END IF;

  IF v_log.interview_id IS NULL THEN
    RAISE EXCEPTION 'TOKEN_LOG_NOT_INTERVIEW_RESERVED';
  END IF;

  SELECT * INTO v_allocation
  FROM public.interview_billing_allocations
  WHERE interview_id = v_log.interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTERVIEW_ALLOCATION_NOT_FOUND';
  END IF;

  IF v_allocation.source = 'purchased_token' THEN
    UPDATE public.company_interview_credit_balance
    SET purchased_tokens_remaining = purchased_tokens_remaining + v_log.reserved_tokens,
        updated_at = now()
    WHERE company_id = v_log.company_id;
  ELSIF v_allocation.source = 'subscription' THEN
    UPDATE public.subscriptions
    SET monthly_token_used = GREATEST(0, monthly_token_used - v_log.reserved_tokens),
        updated_at = now()
    WHERE id = v_allocation.subscription_id;
  ELSIF v_allocation.source = 'admin_entitlement' THEN
    UPDATE public.admin_billing_entitlements
    SET monthly_token_used = GREATEST(0, monthly_token_used - v_log.reserved_tokens),
        updated_at = now()
    WHERE id = v_allocation.admin_entitlement_id;
  END IF;

  UPDATE public.interview_billing_allocations
  SET token_used = GREATEST(0, token_used - v_log.reserved_tokens),
      updated_at = now()
  WHERE id = v_allocation.id;

  UPDATE public.company_ai_token_usage_logs
  SET status = 'released',
      updated_at = now()
  WHERE id = v_log.id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_log.request_id,
    'released_tokens', v_log.reserved_tokens,
    'reason', p_reason
  );
END;
$$;

ALTER FUNCTION public.reserve_interview_allocation_tokens(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) OWNER TO postgres;
ALTER FUNCTION public.finalize_interview_allocation_tokens(TEXT, INTEGER, INTEGER) OWNER TO postgres;
ALTER FUNCTION public.release_interview_allocation_tokens(TEXT, TEXT) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.reserve_interview_allocation_tokens(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_interview_allocation_tokens(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_interview_allocation_tokens(TEXT, TEXT) TO service_role;
