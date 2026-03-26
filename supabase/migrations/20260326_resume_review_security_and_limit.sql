-- Resume review security hardening:
-- 1) invitation guard with max 3 invitations per company/job/candidate
-- 2) normalize candidate_email at DB boundary
-- 3) add lookup index for guard/query performance

CREATE INDEX IF NOT EXISTS idx_resume_review_requests_company_job_candidate
  ON public.resume_review_requests(company_id, job_opening_id, lower(candidate_email));

CREATE OR REPLACE FUNCTION public.fn_resume_review_request_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_lock_key text;
BEGIN
  NEW.candidate_email := lower(btrim(coalesce(NEW.candidate_email, '')));
  IF NEW.candidate_email = '' THEN
    RAISE EXCEPTION 'INVALID_CANDIDATE_EMAIL';
  END IF;

  -- Serialize same target tuple inserts to prevent race bypass.
  v_lock_key := concat_ws(':', NEW.company_id::text, NEW.job_opening_id::text, NEW.candidate_email);
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  SELECT count(*)::integer INTO v_count
  FROM public.resume_review_requests r
  WHERE r.company_id = NEW.company_id
    AND r.job_opening_id = NEW.job_opening_id
    AND lower(r.candidate_email) = NEW.candidate_email;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'INVITATION_LIMIT_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resume_review_request_guard ON public.resume_review_requests;
CREATE TRIGGER trg_resume_review_request_guard
BEFORE INSERT ON public.resume_review_requests
FOR EACH ROW
EXECUTE FUNCTION public.fn_resume_review_request_guard();
