-- Add MINUS label for resume review standards (deduction when matched; does not alone fail review)

BEGIN;

ALTER TABLE public.resume_review_standards
  DROP CONSTRAINT IF EXISTS resume_review_standards_label_check;

ALTER TABLE public.resume_review_standards
  ADD CONSTRAINT resume_review_standards_label_check
  CHECK (label IN ('MUST', 'PLUS', 'MINUS', 'NG'));

COMMIT;
