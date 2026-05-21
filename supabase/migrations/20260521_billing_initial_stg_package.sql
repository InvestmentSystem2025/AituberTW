BEGIN;

UPDATE public.billing_runtime_settings
SET free_interview_token_cap = 200000,
    updated_at = now()
WHERE id = 'default';

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
  'interview_10_for_10_twd',
  '面試追加 10 次',
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
