-- Resume review security hardening:
-- Enforce company-level total limit:
--   Each company can create at most 3 resume_review_requests (invitation attempts) in total.
--
-- IMPORTANT:
-- Trigger `trg_resume_review_request_guard` already calls `public.fn_resume_review_request_guard()`,
-- so this migration only needs to replace that function logic.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_resume_review_request_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_lock_key text;
BEGIN
  -- Normalize candidate email at DB boundary (still required by other validations / flows).
  NEW.candidate_email := lower(btrim(coalesce(NEW.candidate_email, '')));
  IF NEW.candidate_email = '' THEN
    RAISE EXCEPTION 'INVALID_CANDIDATE_EMAIL';
  END IF;

  -- Serialize inserts within the same company to prevent race conditions bypassing the 3 limit.
  v_lock_key := NEW.company_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  -- Company-level total count (ignore job_opening_id and candidate_email).
  SELECT count(*)::integer INTO v_count
  FROM public.resume_review_requests r
  WHERE r.company_id = NEW.company_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'INVITATION_LIMIT_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

