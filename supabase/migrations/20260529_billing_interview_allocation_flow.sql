BEGIN;

ALTER TABLE public.one_time_purchases
  ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'one_time_purchases_credits_used_chk'
  ) THEN
    ALTER TABLE public.one_time_purchases
      ADD CONSTRAINT one_time_purchases_credits_used_chk
      CHECK (credits_used >= 0 AND credits_used <= interview_count);
  END IF;
END $$;

ALTER TABLE public.interview_billing_allocations
  ADD COLUMN IF NOT EXISTS admin_entitlement_id UUID
  REFERENCES public.admin_billing_entitlements(id) ON DELETE SET NULL;

ALTER TABLE public.interview_billing_allocations
  DROP CONSTRAINT IF EXISTS interview_billing_allocations_source_chk;

ALTER TABLE public.interview_billing_allocations
  ADD CONSTRAINT interview_billing_allocations_source_chk
  CHECK (source IN ('free_quota', 'subscription', 'admin_entitlement', 'purchased_credit'));

CREATE INDEX IF NOT EXISTS idx_interview_billing_allocations_admin_entitlement
  ON public.interview_billing_allocations(admin_entitlement_id, created_at DESC)
  WHERE admin_entitlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_one_time_purchases_credit_ledger
  ON public.one_time_purchases(company_id, status, created_at ASC)
  WHERE status = 'paid';

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
  v_credit_balance public.company_interview_credit_balance%ROWTYPE;
  v_purchase public.one_time_purchases%ROWTYPE;
  v_allocation_id uuid;
  v_billing_source text;
  v_token_cap integer;
  v_estimated_tokens integer;
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
  v_estimated_tokens := v_settings.default_estimated_interview_tokens;

  INSERT INTO public.company_interview_quota(company_id, used_count, free_quota, updated_at)
  VALUES (p_company_id, 0, 3, now())
  ON CONFLICT (company_id) DO NOTHING;

  SELECT * INTO v_quota
  FROM public.company_interview_quota
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_quota.used_count < v_quota.free_quota THEN
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
      AND monthly_token_used + v_estimated_tokens <= monthly_token_limit
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
      AND monthly_token_used + v_estimated_tokens <= monthly_token_limit_override
    ORDER BY ends_at DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_admin_entitlement.id IS NOT NULL
       AND (
         v_subscription.id IS NULL OR
         v_admin_entitlement.ends_at > COALESCE(v_subscription.current_period_end, '-infinity'::timestamptz)
       ) THEN
      v_billing_source := 'admin_entitlement';
      v_token_cap := v_admin_entitlement.monthly_token_limit_override;
    ELSIF v_subscription.id IS NOT NULL THEN
      v_billing_source := 'subscription';
      v_token_cap := v_subscription.monthly_token_limit;
    ELSE
      INSERT INTO public.company_interview_credit_balance(company_id, purchased_credits_remaining, updated_at)
      VALUES (p_company_id, 0, now())
      ON CONFLICT (company_id) DO NOTHING;

      SELECT * INTO v_credit_balance
      FROM public.company_interview_credit_balance
      WHERE company_id = p_company_id
      FOR UPDATE;

      IF v_credit_balance.purchased_credits_remaining <= 0 THEN
        RAISE EXCEPTION 'BILLING_REQUIRED';
      END IF;

      SELECT * INTO v_purchase
      FROM public.one_time_purchases
      WHERE company_id = p_company_id
        AND status = 'paid'
        AND credits_used < interview_count
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE;

      IF v_purchase.id IS NULL THEN
        RAISE EXCEPTION 'PURCHASED_CREDIT_LEDGER_MISMATCH';
      END IF;

      UPDATE public.one_time_purchases
      SET credits_used = credits_used + 1,
          updated_at = now()
      WHERE id = v_purchase.id
      RETURNING * INTO v_purchase;

      UPDATE public.company_interview_credit_balance
      SET purchased_credits_remaining = purchased_credits_remaining - 1,
          updated_at = now()
      WHERE company_id = p_company_id
      RETURNING * INTO v_credit_balance;

      v_billing_source := 'purchased_credit';
      v_token_cap := v_purchase.per_interview_token_cap;
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
    CASE WHEN v_billing_source = 'purchased_credit' THEN v_purchase.id ELSE NULL END,
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
    'one_time_purchase_id', CASE WHEN v_billing_source = 'purchased_credit' THEN v_purchase.id ELSE NULL END,
    'token_cap', v_token_cap
  );
END;
$$;

ALTER FUNCTION public.create_interview_with_quota(
  uuid, uuid, timestamptz, timestamptz, uuid, text, public.review_type_type, uuid
) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_interview_with_quota(
  uuid, uuid, timestamptz, timestamptz, uuid, text, public.review_type_type, uuid
) TO service_role;

COMMIT;
