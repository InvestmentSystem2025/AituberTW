-- Company-level resume review invitation quota.
-- Default: each company can create 3 resume review invitations in total.
-- Internal/test companies can be raised by updating company_resume_review_quota.free_quota.

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_resume_review_quota (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.company(id) ON DELETE CASCADE,
  free_quota INTEGER NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_resume_review_quota_free_quota_chk'
  ) THEN
    ALTER TABLE public.company_resume_review_quota
      ADD CONSTRAINT company_resume_review_quota_free_quota_chk CHECK (free_quota >= 0);
  END IF;
END $$;

INSERT INTO public.company_resume_review_quota(company_id, free_quota, updated_at)
SELECT c.id, 3, now()
FROM public.company c
ON CONFLICT (company_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_company_resume_review_quota_company
  ON public.company_resume_review_quota(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_resume_review_quota TO service_role;

CREATE OR REPLACE FUNCTION public.fn_init_company_resume_review_quota()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.company_resume_review_quota(company_id, free_quota, updated_at)
  VALUES (NEW.id, 3, now())
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_init_resume_review_quota ON public.company;
CREATE TRIGGER trg_company_init_resume_review_quota
AFTER INSERT ON public.company
FOR EACH ROW
EXECUTE FUNCTION public.fn_init_company_resume_review_quota();

CREATE OR REPLACE FUNCTION public.fn_resume_review_request_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_free_quota integer;
BEGIN
  NEW.candidate_email := lower(btrim(coalesce(NEW.candidate_email, '')));
  IF NEW.candidate_email = '' THEN
    RAISE EXCEPTION 'INVALID_CANDIDATE_EMAIL';
  END IF;

  -- Serialize inserts within the same company to prevent concurrent requests bypassing the quota.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.company_id::text));

  INSERT INTO public.company_resume_review_quota(company_id, free_quota, updated_at)
  VALUES (NEW.company_id, 3, now())
  ON CONFLICT (company_id) DO NOTHING;

  SELECT q.free_quota
    INTO v_free_quota
  FROM public.company_resume_review_quota q
  WHERE q.company_id = NEW.company_id
  FOR UPDATE;

  SELECT count(*)::integer
    INTO v_count
  FROM public.resume_review_requests r
  WHERE r.company_id = NEW.company_id;

  IF v_count >= v_free_quota THEN
    RAISE EXCEPTION 'INVITATION_LIMIT_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
