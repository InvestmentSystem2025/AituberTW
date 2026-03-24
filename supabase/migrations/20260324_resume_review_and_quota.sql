-- Resume review + hiring capacity + company interview quota
-- Generated at 2026-03-24

BEGIN;

-- ---------------------------
-- job_opening capacity fields
-- ---------------------------
ALTER TABLE public.job_opening
  ADD COLUMN IF NOT EXISTS target_hires integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hired_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_opening_target_hires_chk'
  ) THEN
    ALTER TABLE public.job_opening
      ADD CONSTRAINT job_opening_target_hires_chk CHECK (target_hires >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_opening_hired_count_chk'
  ) THEN
    ALTER TABLE public.job_opening
      ADD CONSTRAINT job_opening_hired_count_chk CHECK (hired_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_opening_hired_lte_target_chk'
  ) THEN
    ALTER TABLE public.job_opening
      ADD CONSTRAINT job_opening_hired_lte_target_chk CHECK (hired_count <= target_hires);
  END IF;
END $$;

-- ---------------------------
-- Resume review schema
-- ---------------------------
CREATE TABLE IF NOT EXISTS public.resume_review_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES public.job_opening(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('MUST', 'PLUS', 'NG')),
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_opening_id, name)
);

CREATE TABLE IF NOT EXISTS public.resume_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES public.job_opening(id) ON DELETE CASCADE,
  candidate_email TEXT NOT NULL,
  invitation_token TEXT NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  invited_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('invited', 'opened', 'submitted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resume_review_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id UUID NOT NULL UNIQUE REFERENCES public.resume_review_requests(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES public.job_opening(id) ON DELETE CASCADE,
  candidate_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  candidate_email TEXT NOT NULL,
  criteria_results JSONB NOT NULL,
  fit_score NUMERIC(5,2) NOT NULL CHECK (fit_score >= 0 AND fit_score <= 100),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------
-- company interview quota
-- ---------------------------
CREATE TABLE IF NOT EXISTS public.company_interview_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.company(id) ON DELETE CASCADE,
  used_count INTEGER NOT NULL DEFAULT 0,
  free_quota INTEGER NOT NULL DEFAULT 3,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_interview_quota_used_count_chk'
  ) THEN
    ALTER TABLE public.company_interview_quota
      ADD CONSTRAINT company_interview_quota_used_count_chk CHECK (used_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_interview_quota_free_quota_chk'
  ) THEN
    ALTER TABLE public.company_interview_quota
      ADD CONSTRAINT company_interview_quota_free_quota_chk CHECK (free_quota >= 0);
  END IF;
END $$;

INSERT INTO public.company_interview_quota(company_id, used_count, free_quota, updated_at)
SELECT c.id, 0, 3, now()
FROM public.company c
ON CONFLICT (company_id) DO NOTHING;

-- ---------------------------
-- indexes
-- ---------------------------
CREATE INDEX IF NOT EXISTS idx_resume_review_requests_company_job_status_created
  ON public.resume_review_requests(company_id, job_opening_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_review_results_company_job_created
  ON public.resume_review_results(company_id, job_opening_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_opening_company_capacity
  ON public.job_opening(company_id, target_hires, hired_count);

CREATE INDEX IF NOT EXISTS idx_company_interview_quota_company
  ON public.company_interview_quota(company_id);

-- ---------------------------
-- RPC: consume company interview quota
-- ---------------------------
CREATE OR REPLACE FUNCTION public.consume_company_interview_quota(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_quota public.company_interview_quota%ROWTYPE;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  INSERT INTO public.company_interview_quota(company_id, used_count, free_quota, updated_at)
  VALUES (p_company_id, 0, 3, now())
  ON CONFLICT (company_id) DO NOTHING;

  SELECT *
    INTO v_quota
  FROM public.company_interview_quota
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUOTA_NOT_FOUND';
  END IF;

  IF v_quota.used_count >= v_quota.free_quota THEN
    RAISE EXCEPTION 'INTERVIEW_QUOTA_EXCEEDED';
  END IF;

  UPDATE public.company_interview_quota
  SET used_count = used_count + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE company_id = p_company_id
  RETURNING * INTO v_quota;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', v_quota.company_id,
    'used_count', v_quota.used_count,
    'free_quota', v_quota.free_quota
  );
END;
$$;

ALTER FUNCTION public.consume_company_interview_quota(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.consume_company_interview_quota(uuid) TO service_role;

-- ---------------------------
-- RPC: set interview result and hired_count atomically
-- ---------------------------
CREATE OR REPLACE FUNCTION public.set_interview_result_with_capacity(
  p_interviews_id uuid,
  p_interview_result public.interview_result_type
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_interview public.interviews%ROWTYPE;
  v_session public.interview_sessions%ROWTYPE;
  v_job public.job_opening%ROWTYPE;
  v_prev_result public.interview_result_type;
BEGIN
  IF p_interviews_id IS NULL OR p_interview_result IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  SELECT *
    INTO v_interview
  FROM public.interviews
  WHERE id = p_interviews_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTERVIEW_NOT_FOUND';
  END IF;

  SELECT *
    INTO v_session
  FROM public.interview_sessions
  WHERE interviews_id = p_interviews_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  SELECT *
    INTO v_job
  FROM public.job_opening
  WHERE id = v_interview.job_opening_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_OPENING_NOT_FOUND';
  END IF;

  v_prev_result := v_session.interview_result;

  IF v_prev_result IS DISTINCT FROM p_interview_result THEN
    IF v_prev_result = 'hired'::public.interview_result_type
       AND p_interview_result <> 'hired'::public.interview_result_type THEN
      UPDATE public.job_opening
      SET hired_count = GREATEST(hired_count - 1, 0)
      WHERE id = v_job.id;
    ELSIF v_prev_result <> 'hired'::public.interview_result_type
       AND p_interview_result = 'hired'::public.interview_result_type THEN
      IF v_job.hired_count >= v_job.target_hires THEN
        RAISE EXCEPTION 'CAPACITY_REACHED';
      END IF;

      UPDATE public.job_opening
      SET hired_count = hired_count + 1
      WHERE id = v_job.id;
    END IF;
  END IF;

  UPDATE public.interview_sessions
  SET interview_result = p_interview_result
  WHERE id = v_session.id;

  SELECT * INTO v_job FROM public.job_opening WHERE id = v_job.id LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'hired_count', v_job.hired_count,
    'target_hires', v_job.target_hires
  );
END;
$$;

ALTER FUNCTION public.set_interview_result_with_capacity(uuid, public.interview_result_type) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.set_interview_result_with_capacity(uuid, public.interview_result_type) TO service_role;

-- ---------------------------
-- RPC: create interview with capacity/quota/candidate checks atomically
-- ---------------------------
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
BEGIN
  IF p_company_id IS NULL
     OR p_job_opening_id IS NULL
     OR p_start_time IS NULL
     OR p_created_by_profile_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_FIELDS';
  END IF;

  IF (p_profiles_id IS NOT NULL AND p_candidate_email IS NOT NULL)
     OR (p_profiles_id IS NULL AND (p_candidate_email IS NULL OR btrim(p_candidate_email) = '')) THEN
    RAISE EXCEPTION 'XOR_PROFILE_EMAIL';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.profile_id = p_created_by_profile_id
  )
  INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT *
    INTO v_job
  FROM public.job_opening
  WHERE id = p_job_opening_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_OPENING_NOT_FOUND';
  END IF;

  IF v_job.hired_count >= v_job.target_hires THEN
    RAISE EXCEPTION 'CAPACITY_REACHED';
  END IF;

  IF p_profiles_id IS NOT NULL THEN
    SELECT *
      INTO v_candidate_profile
    FROM public.profiles
    WHERE id = p_profiles_id
    LIMIT 1;

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

    SELECT *
      INTO v_candidate_profile
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

  INSERT INTO public.interviews(
    company_id,
    job_opening_id,
    start_time,
    end_time,
    profiles_id,
    candidate_email,
    review_type
  )
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

  PERFORM public.consume_company_interview_quota(p_company_id);

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_interview.id,
    'company_id', v_interview.company_id,
    'job_opening_id', v_interview.job_opening_id,
    'start_time', v_interview.start_time,
    'profiles_id', v_interview.profiles_id,
    'candidate_email', v_interview.candidate_email
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
