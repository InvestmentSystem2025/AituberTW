BEGIN;

-- Billing foundation for NewebPay periodic subscriptions, MPG one-time
-- interview credit purchases, admin entitlements, webhook idempotency, and
-- company-level token budgets.

CREATE TABLE IF NOT EXISTS public.app_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'system_admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'system_admin',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.app_admins
  ALTER COLUMN email DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_admins_role_chk') THEN
    ALTER TABLE public.app_admins
      ADD CONSTRAINT app_admins_role_chk CHECK (role IN ('billing_admin', 'system_admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_admins_profile_active
  ON public.app_admins(profile_id, is_active);

CREATE INDEX IF NOT EXISTS idx_app_admins_role_active
  ON public.app_admins(role, is_active);

CREATE TABLE IF NOT EXISTS public.billing_runtime_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  free_interview_token_cap INTEGER NOT NULL DEFAULT 50000,
  default_estimated_interview_tokens INTEGER NOT NULL DEFAULT 12000,
  security_alert_notify_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_runtime_settings_id_chk CHECK (id = 'default'),
  CONSTRAINT billing_runtime_settings_free_cap_chk CHECK (free_interview_token_cap > 0),
  CONSTRAINT billing_runtime_settings_default_estimate_chk CHECK (default_estimated_interview_tokens > 0)
);

INSERT INTO public.billing_runtime_settings(id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_twd INTEGER NOT NULL,
  monthly_token_limit INTEGER NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'M',
  period_point_strategy TEXT NOT NULL DEFAULT 'fixed_day',
  fixed_period_point TEXT,
  period_times TEXT NOT NULL DEFAULT 'NE',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_plans_price_chk CHECK (price_twd > 0),
  CONSTRAINT billing_plans_monthly_token_limit_chk CHECK (monthly_token_limit > 0),
  CONSTRAINT billing_plans_period_type_chk CHECK (period_type IN ('D', 'W', 'M', 'Y')),
  CONSTRAINT billing_plans_period_point_strategy_chk CHECK (period_point_strategy IN ('fixed_day', 'signup_day')),
  CONSTRAINT billing_plans_period_times_chk CHECK (period_times = 'NE' OR period_times ~ '^[0-9]{1,2}$'),
  CONSTRAINT billing_plans_fixed_period_point_chk CHECK (
    fixed_period_point IS NULL OR fixed_period_point ~ '^[0-9]{2,4}$'
  )
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'newebpay_periodic',
  status TEXT NOT NULL DEFAULT 'pending',
  merchant_order_no TEXT UNIQUE,
  period_no TEXT,
  period_amt INTEGER,
  period_type TEXT,
  period_point TEXT,
  period_times TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  monthly_token_limit INTEGER,
  monthly_token_used INTEGER NOT NULL DEFAULT 0,
  token_period_start TIMESTAMPTZ,
  token_period_end TIMESTAMPTZ,
  failed_payment_count INTEGER NOT NULL DEFAULT 0,
  card_mask TEXT,
  card_status TEXT NOT NULL DEFAULT 'unknown',
  card_expiry TEXT,
  payment_method_required_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  raw_latest_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_source_chk CHECK (source IN ('newebpay_periodic', 'migrated')),
  CONSTRAINT subscriptions_status_chk CHECK (status IN (
    'pending',
    'active',
    'failed',
    'past_due',
    'payment_failed',
    'suspended_by_user',
    'suspended_by_admin',
    'admin_revoked',
    'manual_granted',
    'cancel_at_period_end',
    'canceled',
    'card_update_required',
    'expired'
  )),
  CONSTRAINT subscriptions_period_amt_chk CHECK (period_amt IS NULL OR period_amt > 0),
  CONSTRAINT subscriptions_monthly_token_limit_chk CHECK (monthly_token_limit IS NULL OR monthly_token_limit > 0),
  CONSTRAINT subscriptions_monthly_token_used_chk CHECK (monthly_token_used >= 0),
  CONSTRAINT subscriptions_failed_payment_count_chk CHECK (failed_payment_count >= 0),
  CONSTRAINT subscriptions_card_status_chk CHECK (card_status IN ('unknown', 'active', 'card_not_allowed'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_status
  ON public.subscriptions(company_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_period_no
  ON public.subscriptions(period_no);

CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end
  ON public.subscriptions(current_period_end DESC);

CREATE TABLE IF NOT EXISTS public.admin_billing_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.billing_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  monthly_token_limit_override INTEGER,
  monthly_token_used INTEGER NOT NULL DEFAULT 0,
  token_period_start TIMESTAMPTZ,
  token_period_end TIMESTAMPTZ,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_reason TEXT NOT NULL,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_reason TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_billing_entitlements_status_chk CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT admin_billing_entitlements_date_chk CHECK (ends_at > starts_at),
  CONSTRAINT admin_billing_entitlements_token_limit_chk CHECK (
    monthly_token_limit_override IS NULL OR monthly_token_limit_override > 0
  ),
  CONSTRAINT admin_billing_entitlements_token_used_chk CHECK (monthly_token_used >= 0),
  CONSTRAINT admin_billing_entitlements_reason_chk CHECK (length(btrim(granted_reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_billing_entitlements_company_status_end
  ON public.admin_billing_entitlements(company_id, status, ends_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  merchant_order_no TEXT,
  period_no TEXT,
  order_no TEXT,
  trade_no TEXT,
  auth_amt INTEGER,
  auth_code TEXT,
  respond_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  alert_flag TEXT,
  message TEXT,
  auth_date TIMESTAMPTZ,
  already_times INTEGER,
  total_times TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_payments_status_chk CHECK (status IN ('pending', 'paid', 'failed', 'canceled')),
  CONSTRAINT subscription_payments_alert_flag_chk CHECK (
    alert_flag IS NULL OR alert_flag IN ('inconsistent_state')
  ),
  CONSTRAINT subscription_payments_auth_amt_chk CHECK (auth_amt IS NULL OR auth_amt > 0),
  CONSTRAINT subscription_payments_already_times_chk CHECK (already_times IS NULL OR already_times >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_payments_trade_no
  ON public.subscription_payments(trade_no)
  WHERE trade_no IS NOT NULL AND trade_no <> '';

CREATE INDEX IF NOT EXISTS idx_subscription_payments_period_order
  ON public.subscription_payments(period_no, order_no);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_company_created
  ON public.subscription_payments(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_twd INTEGER NOT NULL,
  interview_count INTEGER NOT NULL,
  per_interview_token_cap INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_packages_price_chk CHECK (price_twd > 0),
  CONSTRAINT credit_packages_interview_count_chk CHECK (interview_count > 0),
  CONSTRAINT credit_packages_token_cap_chk CHECK (per_interview_token_cap > 0)
);

CREATE TABLE IF NOT EXISTS public.company_interview_credit_balance (
  company_id UUID PRIMARY KEY REFERENCES public.company(id) ON DELETE CASCADE,
  purchased_credits_remaining INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_interview_credit_balance_remaining_chk CHECK (purchased_credits_remaining >= 0)
);

INSERT INTO public.company_interview_credit_balance(company_id)
SELECT id FROM public.company
ON CONFLICT (company_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.one_time_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  recruiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.credit_packages(id) ON DELETE SET NULL,
  merchant_order_no TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  interview_count INTEGER NOT NULL,
  per_interview_token_cap INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  trade_no TEXT,
  payment_type TEXT,
  respond_code TEXT,
  message TEXT,
  card_mask TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_time_purchases_amount_chk CHECK (amount > 0),
  CONSTRAINT one_time_purchases_interview_count_chk CHECK (interview_count > 0),
  CONSTRAINT one_time_purchases_token_cap_chk CHECK (per_interview_token_cap > 0),
  CONSTRAINT one_time_purchases_status_chk CHECK (status IN ('pending', 'paid', 'failed', 'canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_time_purchases_trade_no
  ON public.one_time_purchases(trade_no)
  WHERE trade_no IS NOT NULL AND trade_no <> '';

CREATE INDEX IF NOT EXISTS idx_one_time_purchases_company_created
  ON public.one_time_purchases(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.interview_billing_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL UNIQUE REFERENCES public.interviews(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  one_time_purchase_id UUID REFERENCES public.one_time_purchases(id) ON DELETE SET NULL,
  token_cap INTEGER NOT NULL,
  token_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT interview_billing_allocations_source_chk CHECK (source IN ('free_quota', 'subscription', 'purchased_credit')),
  CONSTRAINT interview_billing_allocations_token_cap_chk CHECK (token_cap > 0),
  CONSTRAINT interview_billing_allocations_token_used_chk CHECK (token_used >= 0)
);

CREATE INDEX IF NOT EXISTS idx_interview_billing_allocations_company_created
  ON public.interview_billing_allocations(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.company_ai_token_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  admin_entitlement_id UUID REFERENCES public.admin_billing_entitlements(id) ON DELETE SET NULL,
  interview_id UUID REFERENCES public.interviews(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL,
  model TEXT,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  reserved_tokens INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  status TEXT NOT NULL DEFAULT 'reserved',
  cost_estimate NUMERIC(14,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_ai_token_usage_estimated_chk CHECK (estimated_tokens >= 0),
  CONSTRAINT company_ai_token_usage_reserved_chk CHECK (reserved_tokens >= 0),
  CONSTRAINT company_ai_token_usage_input_chk CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CONSTRAINT company_ai_token_usage_output_chk CHECK (output_tokens IS NULL OR output_tokens >= 0),
  CONSTRAINT company_ai_token_usage_total_chk CHECK (total_tokens IS NULL OR total_tokens >= 0),
  CONSTRAINT company_ai_token_usage_status_chk CHECK (status IN ('reserved', 'finalized', 'released', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_company_ai_token_usage_company_created
  ON public.company_ai_token_usage_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_ai_token_usage_subscription_created
  ON public.company_ai_token_usage_logs(subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.newebpay_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'newebpay',
  event_type TEXT NOT NULL,
  company_id UUID REFERENCES public.company(id) ON DELETE SET NULL,
  merchant_order_no TEXT,
  period_no TEXT,
  order_no TEXT,
  trade_no TEXT,
  already_times INTEGER,
  respond_code TEXT,
  unique_key TEXT NOT NULL UNIQUE,
  raw_encrypted_payload TEXT,
  raw_decrypted_payload JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT newebpay_webhook_events_provider_chk CHECK (provider = 'newebpay'),
  CONSTRAINT newebpay_webhook_events_type_chk CHECK (event_type IN (
    'initial_auth',
    'period_auth',
    'cau',
    'mpg_one_time_purchase'
  )),
  CONSTRAINT newebpay_webhook_events_status_chk CHECK (status IN (
    'received',
    'processed',
    'failed',
    'security_alert',
    'ignored'
  )),
  CONSTRAINT newebpay_webhook_events_already_times_chk CHECK (already_times IS NULL OR already_times >= 0)
);

CREATE INDEX IF NOT EXISTS idx_newebpay_webhook_events_status_created
  ON public.newebpay_webhook_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newebpay_webhook_events_company_created
  ON public.newebpay_webhook_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newebpay_webhook_events_order_created
  ON public.newebpay_webhook_events(merchant_order_no, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.company(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  webhook_event_id UUID REFERENCES public.newebpay_webhook_events(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  raw_payload JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_alerts_type_chk CHECK (type IN (
    'unexpected_payment_after_cancel',
    'security_alert',
    'webhook_processing_failed',
    'newebpay_inconsistent_state'
  )),
  CONSTRAINT billing_alerts_severity_chk CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_billing_alerts_company_created
  ON public.billing_alerts(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_alerts_type_resolved
  ON public.billing_alerts(type, resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_billing_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.company(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  before_value JSONB,
  after_value JSONB,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_billing_audit_logs_reason_chk CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_billing_audit_logs_company_created
  ON public.admin_billing_audit_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_billing_audit_logs_admin_created
  ON public.admin_billing_audit_logs(admin_user_id, created_at DESC);

-- Keep existing free company rows covered.
CREATE OR REPLACE FUNCTION public.fn_init_company_billing_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.company_interview_credit_balance(company_id)
  VALUES (NEW.id)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_init_billing_rows ON public.company;
CREATE TRIGGER trg_company_init_billing_rows
AFTER INSERT ON public.company
FOR EACH ROW
EXECUTE FUNCTION public.fn_init_company_billing_rows();

-- Atomic purchased-credit add used by MPG webhook processing.
CREATE OR REPLACE FUNCTION public.add_company_interview_credits(
  p_company_id UUID,
  p_credits INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance public.company_interview_credit_balance%ROWTYPE;
BEGIN
  IF p_company_id IS NULL OR p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  INSERT INTO public.company_interview_credit_balance(company_id, purchased_credits_remaining, updated_at)
  VALUES (p_company_id, 0, now())
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE public.company_interview_credit_balance
  SET purchased_credits_remaining = purchased_credits_remaining + p_credits,
      updated_at = now()
  WHERE company_id = p_company_id
  RETURNING * INTO v_balance;

  RETURN jsonb_build_object(
    'company_id', v_balance.company_id,
    'purchased_credits_remaining', v_balance.purchased_credits_remaining
  );
END;
$$;

-- Reserve company-level paid token budget atomically. The caller may pass a
-- specific subscription/admin entitlement; otherwise the most relevant active
-- source is selected. Free/purchased-credit per-interview caps are tracked via
-- interview_billing_allocations, not this function.
CREATE OR REPLACE FUNCTION public.reserve_company_billing_tokens(
  p_company_id UUID,
  p_request_id TEXT,
  p_request_type TEXT,
  p_model TEXT,
  p_estimated_tokens INTEGER,
  p_subscription_id UUID DEFAULT NULL,
  p_admin_entitlement_id UUID DEFAULT NULL,
  p_interview_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_entitlement public.admin_billing_entitlements%ROWTYPE;
  v_use_subscription boolean := false;
  v_use_entitlement boolean := false;
  v_limit integer;
  v_used integer;
  v_end timestamptz;
BEGIN
  IF p_company_id IS NULL OR p_request_id IS NULL OR btrim(p_request_id) = ''
     OR p_request_type IS NULL OR btrim(p_request_type) = ''
     OR p_estimated_tokens IS NULL OR p_estimated_tokens <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  IF EXISTS (SELECT 1 FROM public.company_ai_token_usage_logs WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST_ID';
  END IF;

  IF p_subscription_id IS NOT NULL THEN
    SELECT * INTO v_subscription
    FROM public.subscriptions
    WHERE id = p_subscription_id AND company_id = p_company_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_subscription
    FROM public.subscriptions
    WHERE company_id = p_company_id
      AND status IN ('active', 'past_due', 'payment_failed', 'cancel_at_period_end', 'card_update_required')
    ORDER BY current_period_end DESC NULLS LAST, created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF p_admin_entitlement_id IS NOT NULL THEN
    SELECT * INTO v_entitlement
    FROM public.admin_billing_entitlements
    WHERE id = p_admin_entitlement_id AND company_id = p_company_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_entitlement
    FROM public.admin_billing_entitlements
    WHERE company_id = p_company_id
      AND status = 'active'
      AND starts_at <= now()
      AND ends_at > now()
    ORDER BY ends_at DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_subscription.id IS NOT NULL
     AND v_subscription.status NOT IN ('suspended_by_user', 'suspended_by_admin', 'admin_revoked', 'failed', 'canceled', 'expired')
     AND COALESCE(v_subscription.current_period_end, '-infinity'::timestamptz) > now()
     AND v_subscription.monthly_token_limit IS NOT NULL THEN
    v_use_subscription := true;
  END IF;

  IF v_entitlement.id IS NOT NULL
     AND v_entitlement.status = 'active'
     AND v_entitlement.starts_at <= now()
     AND v_entitlement.ends_at > now()
     AND v_entitlement.monthly_token_limit_override IS NOT NULL THEN
    v_use_entitlement := true;
  END IF;

  IF NOT v_use_subscription AND NOT v_use_entitlement THEN
    RAISE EXCEPTION 'NO_ACTIVE_ENTITLEMENT';
  END IF;

  -- Pick the source with the later entitlement end. This implements:
  -- entitlement_end = max(subscription.current_period_end, active_admin_billing_entitlement.ends_at)
  IF v_use_entitlement AND (
       NOT v_use_subscription OR v_entitlement.ends_at > COALESCE(v_subscription.current_period_end, '-infinity'::timestamptz)
     ) THEN
    v_limit := v_entitlement.monthly_token_limit_override;
    v_used := v_entitlement.monthly_token_used;
    v_end := v_entitlement.ends_at;

    IF v_used + p_estimated_tokens > v_limit THEN
      RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
    END IF;

    UPDATE public.admin_billing_entitlements
    SET monthly_token_used = monthly_token_used + p_estimated_tokens,
        token_period_start = COALESCE(token_period_start, now()),
        token_period_end = ends_at,
        updated_at = now()
    WHERE id = v_entitlement.id;

    INSERT INTO public.company_ai_token_usage_logs(
      company_id, admin_entitlement_id, interview_id, request_id, request_type,
      model, estimated_tokens, reserved_tokens, status
    )
    VALUES (
      p_company_id, v_entitlement.id, p_interview_id, p_request_id, p_request_type,
      p_model, p_estimated_tokens, p_estimated_tokens, 'reserved'
    );

    RETURN jsonb_build_object(
      'source', 'admin_entitlement',
      'admin_entitlement_id', v_entitlement.id,
      'token_limit', v_limit,
      'token_used', v_used + p_estimated_tokens,
      'entitlement_end', v_end
    );
  END IF;

  v_limit := v_subscription.monthly_token_limit;
  v_used := v_subscription.monthly_token_used;
  v_end := v_subscription.current_period_end;

  IF v_used + p_estimated_tokens > v_limit THEN
    RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
  END IF;

  UPDATE public.subscriptions
  SET monthly_token_used = monthly_token_used + p_estimated_tokens,
      token_period_start = COALESCE(token_period_start, now()),
      token_period_end = current_period_end,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.company_ai_token_usage_logs(
    company_id, subscription_id, interview_id, request_id, request_type,
    model, estimated_tokens, reserved_tokens, status
  )
  VALUES (
    p_company_id, v_subscription.id, p_interview_id, p_request_id, p_request_type,
    p_model, p_estimated_tokens, p_estimated_tokens, 'reserved'
  );

  RETURN jsonb_build_object(
    'source', 'subscription',
    'subscription_id', v_subscription.id,
    'token_limit', v_limit,
    'token_used', v_used + p_estimated_tokens,
    'entitlement_end', v_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_company_billing_tokens(
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

  IF v_log.status <> 'reserved' THEN
    RAISE EXCEPTION 'TOKEN_LOG_NOT_RESERVED';
  END IF;

  v_total := p_input_tokens + p_output_tokens;
  v_delta := v_total - v_log.reserved_tokens;

  -- If actual usage is greater than the estimate, we allow the completed
  -- request to finish and apply the overage here. The next reserve call will
  -- be blocked if the company is now over monthly_token_limit. We do not abort
  -- an already completed AI response in finalize.
  IF v_delta <> 0 AND v_log.subscription_id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET monthly_token_used = GREATEST(0, monthly_token_used + v_delta),
        updated_at = now()
    WHERE id = v_log.subscription_id;
  ELSIF v_delta <> 0 AND v_log.admin_entitlement_id IS NOT NULL THEN
    UPDATE public.admin_billing_entitlements
    SET monthly_token_used = GREATEST(0, monthly_token_used + v_delta),
        updated_at = now()
    WHERE id = v_log.admin_entitlement_id;
  END IF;

  UPDATE public.company_ai_token_usage_logs
  SET input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = v_total,
      status = 'finalized',
      updated_at = now()
  WHERE id = v_log.id
  RETURNING * INTO v_log;

  IF v_log.interview_id IS NOT NULL THEN
    UPDATE public.interview_billing_allocations
    SET token_used = token_used + v_total,
        updated_at = now()
    WHERE interview_id = v_log.interview_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_log.request_id,
    'total_tokens', v_total,
    'delta_tokens', v_delta
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_company_billing_tokens(
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

  IF v_log.subscription_id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET monthly_token_used = GREATEST(0, monthly_token_used - v_log.reserved_tokens),
        updated_at = now()
    WHERE id = v_log.subscription_id;
  ELSIF v_log.admin_entitlement_id IS NOT NULL THEN
    UPDATE public.admin_billing_entitlements
    SET monthly_token_used = GREATEST(0, monthly_token_used - v_log.reserved_tokens),
        updated_at = now()
    WHERE id = v_log.admin_entitlement_id;
  END IF;

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

  IF v_allocation.source NOT IN ('free_quota', 'purchased_credit') THEN
    RAISE EXCEPTION 'INTERVIEW_ALLOCATION_NOT_CAPPED';
  END IF;

  IF v_allocation.token_used + p_estimated_tokens > v_allocation.token_cap THEN
    RAISE EXCEPTION 'TOKEN_LIMIT_EXCEEDED';
  END IF;

  UPDATE public.interview_billing_allocations
  SET token_used = token_used + p_estimated_tokens,
      updated_at = now()
  WHERE id = v_allocation.id
  RETURNING * INTO v_allocation;

  INSERT INTO public.company_ai_token_usage_logs(
    company_id, interview_id, request_id, request_type, model,
    estimated_tokens, reserved_tokens, status
  )
  VALUES (
    p_company_id, p_interview_id, p_request_id, p_request_type, p_model,
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

  v_total := p_input_tokens + p_output_tokens;
  v_delta := v_total - v_log.reserved_tokens;

  -- If actual usage is greater than the estimate, we allow this completed
  -- request and apply the overage here. The next reserve call will be blocked
  -- if token_used is now over token_cap. This is intentional for streaming AI
  -- responses where reliable usage is only known at finish time.
  UPDATE public.interview_billing_allocations
  SET token_used = GREATEST(0, token_used + v_delta),
      updated_at = now()
  WHERE interview_id = v_log.interview_id;

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

  UPDATE public.interview_billing_allocations
  SET token_used = GREATEST(0, token_used - v_log.reserved_tokens),
      updated_at = now()
  WHERE interview_id = v_log.interview_id;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_runtime_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_billing_entitlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_packages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_interview_credit_balance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_time_purchases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_billing_allocations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_ai_token_usage_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newebpay_webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_billing_audit_logs TO service_role;

GRANT EXECUTE ON FUNCTION public.add_company_interview_credits(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_company_billing_tokens(UUID, TEXT, TEXT, TEXT, INTEGER, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_company_billing_tokens(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_company_billing_tokens(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_interview_allocation_tokens(UUID, UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_interview_allocation_tokens(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_interview_allocation_tokens(TEXT, TEXT) TO service_role;

COMMIT;
