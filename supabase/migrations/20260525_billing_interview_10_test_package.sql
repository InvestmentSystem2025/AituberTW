BEGIN;

INSERT INTO public.credit_packages (
  code,
  name,
  price_twd,
  interview_count,
  per_interview_token_cap,
  is_active,
  updated_at
)
VALUES (
  'interview_10_test',
  '面接追加10回',
  10,
  10,
  200000,
  true,
  now()
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    price_twd = EXCLUDED.price_twd,
    interview_count = EXCLUDED.interview_count,
    per_interview_token_cap = EXCLUDED.per_interview_token_cap,
    is_active = EXCLUDED.is_active,
    updated_at = now();

COMMIT;
