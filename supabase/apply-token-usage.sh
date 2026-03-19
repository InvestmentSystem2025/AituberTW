#!/bin/sh
# =============================================================================
# apply-token-usage.sh
#
# 為「已存在」的 Docker DB volume 手動套用 token_usage 相關表格與 RPC 函數。
#
# ⚠️  全新環境（volume 不存在）不需執行此腳本，init.sql 會自動建立。
#     僅在 DB volume 已存在、需要補加新 schema 時使用。
#
# 使用方式（在專案根目錄執行）：
#   sh supabase/apply-token-usage.sh
#
# 或指定 compose 檔案（GCP）：
#   COMPOSE_FILE=docker-compose.gcp.yml sh supabase/apply-token-usage.sh
# =============================================================================

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "[apply-token-usage] 使用 $COMPOSE_FILE"
echo "[apply-token-usage] 開始套用 token_usage schema..."

docker compose -f "$COMPOSE_FILE" exec -T supabase-db psql -U postgres -d postgres << 'ENDSQL'

-- token_usage_logs
CREATE TABLE IF NOT EXISTS public.token_usage_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id    text        NOT NULL UNIQUE,
  input_tokens  integer     NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer     NOT NULL CHECK (output_tokens >= 0),
  total_tokens  integer     NOT NULL CHECK (total_tokens >= 0),
  is_free       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_logs_created_at ON public.token_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user_created ON public.token_usage_logs(user_id, created_at DESC);

ALTER TABLE public.token_usage_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage_logs' AND policyname='token_usage_logs_service_only') THEN
    CREATE POLICY token_usage_logs_service_only ON public.token_usage_logs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- token_usage_daily
CREATE TABLE IF NOT EXISTS public.token_usage_daily (
  id                 bigserial   PRIMARY KEY,
  date               date        NOT NULL,
  user_id            uuid,
  free_tokens        bigint      NOT NULL DEFAULT 0,
  paid_input_tokens  bigint      NOT NULL DEFAULT 0,
  paid_output_tokens bigint      NOT NULL DEFAULT 0,
  total_tokens       bigint      NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_usage_daily_global ON public.token_usage_daily(date) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_usage_daily_user ON public.token_usage_daily(date, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_token_usage_daily_date ON public.token_usage_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_daily_user_date ON public.token_usage_daily(user_id, date DESC);

ALTER TABLE public.token_usage_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage_daily' AND policyname='token_usage_daily_service_only') THEN
    CREATE POLICY token_usage_daily_service_only ON public.token_usage_daily FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- token_usage_monthly
CREATE TABLE IF NOT EXISTS public.token_usage_monthly (
  id                  bigserial     PRIMARY KEY,
  month               text          NOT NULL,
  user_id             uuid,
  free_tokens         bigint        NOT NULL DEFAULT 0,
  paid_input_tokens   bigint        NOT NULL DEFAULT 0,
  paid_output_tokens  bigint        NOT NULL DEFAULT 0,
  total_tokens        bigint        NOT NULL DEFAULT 0,
  estimated_cost_twd  numeric(14,4) NOT NULL DEFAULT 0,
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_usage_monthly_global ON public.token_usage_monthly(month) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_token_usage_monthly_user ON public.token_usage_monthly(month, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_token_usage_monthly_month ON public.token_usage_monthly(month DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_monthly_user_month ON public.token_usage_monthly(user_id, month DESC);

ALTER TABLE public.token_usage_monthly ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='token_usage_monthly' AND policyname='token_usage_monthly_service_only') THEN
    CREATE POLICY token_usage_monthly_service_only ON public.token_usage_monthly FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- RPC: upsert_token_usage_daily
CREATE OR REPLACE FUNCTION public.upsert_token_usage_daily(
  p_date date, p_user_id uuid, p_free_tokens bigint,
  p_paid_input_tokens bigint, p_paid_output_tokens bigint, p_total_tokens bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_user_id IS NULL THEN
    INSERT INTO public.token_usage_daily (date, user_id, free_tokens, paid_input_tokens, paid_output_tokens, total_tokens, updated_at)
    VALUES (p_date, NULL, p_free_tokens, p_paid_input_tokens, p_paid_output_tokens, p_total_tokens, now())
    ON CONFLICT (date) WHERE user_id IS NULL
    DO UPDATE SET free_tokens=EXCLUDED.free_tokens, paid_input_tokens=EXCLUDED.paid_input_tokens,
      paid_output_tokens=EXCLUDED.paid_output_tokens, total_tokens=EXCLUDED.total_tokens, updated_at=now();
  ELSE
    INSERT INTO public.token_usage_daily (date, user_id, free_tokens, paid_input_tokens, paid_output_tokens, total_tokens, updated_at)
    VALUES (p_date, p_user_id, p_free_tokens, p_paid_input_tokens, p_paid_output_tokens, p_total_tokens, now())
    ON CONFLICT (date, user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET free_tokens=EXCLUDED.free_tokens, paid_input_tokens=EXCLUDED.paid_input_tokens,
      paid_output_tokens=EXCLUDED.paid_output_tokens, total_tokens=EXCLUDED.total_tokens, updated_at=now();
  END IF;
END; $$;

-- RPC: upsert_token_usage_monthly
CREATE OR REPLACE FUNCTION public.upsert_token_usage_monthly(
  p_month text, p_user_id uuid, p_free_tokens bigint,
  p_paid_input_tokens bigint, p_paid_output_tokens bigint,
  p_total_tokens bigint, p_estimated_cost_twd numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_user_id IS NULL THEN
    INSERT INTO public.token_usage_monthly (month, user_id, free_tokens, paid_input_tokens, paid_output_tokens, total_tokens, estimated_cost_twd, updated_at)
    VALUES (p_month, NULL, p_free_tokens, p_paid_input_tokens, p_paid_output_tokens, p_total_tokens, p_estimated_cost_twd, now())
    ON CONFLICT (month) WHERE user_id IS NULL
    DO UPDATE SET free_tokens=EXCLUDED.free_tokens, paid_input_tokens=EXCLUDED.paid_input_tokens,
      paid_output_tokens=EXCLUDED.paid_output_tokens, total_tokens=EXCLUDED.total_tokens,
      estimated_cost_twd=EXCLUDED.estimated_cost_twd, updated_at=now();
  ELSE
    INSERT INTO public.token_usage_monthly (month, user_id, free_tokens, paid_input_tokens, paid_output_tokens, total_tokens, estimated_cost_twd, updated_at)
    VALUES (p_month, p_user_id, p_free_tokens, p_paid_input_tokens, p_paid_output_tokens, p_total_tokens, p_estimated_cost_twd, now())
    ON CONFLICT (month, user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET free_tokens=EXCLUDED.free_tokens, paid_input_tokens=EXCLUDED.paid_input_tokens,
      paid_output_tokens=EXCLUDED.paid_output_tokens, total_tokens=EXCLUDED.total_tokens,
      estimated_cost_twd=EXCLUDED.estimated_cost_twd, updated_at=now();
  END IF;
END; $$;

SELECT 'token_usage schema applied successfully.' AS result;

ENDSQL

echo "[apply-token-usage] 完成！"
