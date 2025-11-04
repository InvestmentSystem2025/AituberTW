-- Supabase 初始化 SQL（統合版：共通セットアップ + 面試システム DDL（RLSなし））

-- 建立 auth schema（存在しなければ）
create schema if not exists auth;

-- 設定資料庫搜尋路徑與時區
ALTER DATABASE postgres SET search_path TO '$user', public, auth, storage, extensions;
ALTER DATABASE postgres SET timezone TO 'Asia/Taipei';

-- 建立基本角色（PostgreSQL 15 無 IF NOT EXISTS，改用 DO 檢查）
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOINHERIT;
  END IF;
END $$;

-- 常用 extension（至少 pgcrypto）
create extension if not exists pgcrypto with schema public;
create extension if not exists "uuid-ossp" with schema public;

-- 基本 schema 權限
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- =========================
-- 面試システム 専用 DDL
-- =========================

-- ENUM 型別
CREATE TYPE public.result_notification_method_type AS ENUM ('immediate','later');
CREATE TYPE public.interview_status_type           AS ENUM ('waitToStart','completed','lateButComplete','noShow','cancelled');
CREATE TYPE public.review_type_type                AS ENUM ('AI','HUMAN','MIXED');
CREATE TYPE public.interview_result_type           AS ENUM ('hired','rejected','onHold');
CREATE TYPE public.question_source_type            AS ENUM ('AI','USER');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('jobSeeker','recruiter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- company
CREATE TABLE public.company (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_phone_number TEXT,
  company_address TEXT,
  company_profile TEXT,
  ideal_candidate_profile TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- company_members
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_role TEXT NOT NULL DEFAULT 'recruiter' CHECK (company_role IN ('admin','recruiter','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, profile_id)
);

-- ai_interviewer
CREATE TABLE public.ai_interviewer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL DEFAULT 'yuki.vrm',
  model_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- job_opening
CREATE TABLE public.job_opening (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  use_ai_generate_question BOOLEAN NOT NULL DEFAULT false,
  result_notification_method public.result_notification_method_type NOT NULL DEFAULT 'immediate',
  evaluation_policy JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_opening_evaluation_policy_chk CHECK (
    evaluation_policy IS NULL
    OR (
      jsonb_typeof(evaluation_policy) = 'object'
      AND (evaluation_policy ? 'overall_threshold')
      AND ((evaluation_policy->>'overall_threshold') ~ '^[0-9]+(\.[0-9]+)?$')
      AND (((evaluation_policy->>'overall_threshold')::numeric) BETWEEN 0 AND 100)
    )
  )
);

-- evaluation_criteria
CREATE TABLE public.evaluation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES public.job_opening(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  weight NUMERIC NOT NULL CHECK (weight >= 0 AND weight <= 1),
  max_score INTEGER NOT NULL DEFAULT 10 CHECK (max_score > 0),
  scoring_logic TEXT NOT NULL DEFAULT 'deduction' CHECK (scoring_logic IN ('addition', 'deduction')),
  addition_rules JSONB,
  deduction_rules JSONB,
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_opening_id, key),
  CONSTRAINT evaluation_criteria_rules_check CHECK (
    (scoring_logic = 'addition' AND addition_rules IS NOT NULL) OR
    (scoring_logic = 'deduction' AND deduction_rules IS NOT NULL)
  )
);

-- question_bank
CREATE TABLE public.question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.company(id) ON DELETE SET NULL,
  name TEXT,
  source public.question_source_type NOT NULL,
  detail JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- job_opening_questions
CREATE TABLE public.job_opening_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  job_opening_id UUID NOT NULL REFERENCES public.job_opening(id) ON DELETE CASCADE,
  question_bank_id UUID REFERENCES public.question_bank(id) ON DELETE SET NULL,
  detail JSONB NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- interviews
CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  profiles_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  candidate_email TEXT,
  job_opening_id UUID NOT NULL REFERENCES public.job_opening(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status public.interview_status_type NOT NULL DEFAULT 'waitToStart',
  invited_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT interviews_profiles_xor_email_chk CHECK (
    (profiles_id IS NOT NULL) <> (candidate_email IS NOT NULL)
  ),
  CONSTRAINT interviews_time_range_chk CHECK (
    end_time IS NULL OR end_time > start_time
  )
);

-- interview_sessions
CREATE TABLE public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  interviews_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  interview_transcript JSONB,
  ai_evaluations JSONB,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  video_path TEXT,
  interview_result public.interview_result_type,
  total_score NUMERIC,
  result_reason TEXT,
  review_type public.review_type_type NOT NULL DEFAULT 'AI',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interviews_id),
  CONSTRAINT interview_sessions_total_score_chk CHECK (
    total_score IS NULL OR (total_score >= 0 AND total_score <= 100)
  )
);

-- Functions & Triggers

-- interviews.candidate_email を常に小文字化
CREATE OR REPLACE FUNCTION public.fn_normalize_candidate_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.candidate_email IS NOT NULL THEN
    NEW.candidate_email := lower(NEW.candidate_email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_candidate_email ON public.interviews;
CREATE TRIGGER trg_normalize_candidate_email
BEFORE INSERT OR UPDATE ON public.interviews
FOR EACH ROW
EXECUTE FUNCTION public.fn_normalize_candidate_email();

-- job_opening 作成時に evaluation_criteria デフォルト5件自動投入
CREATE OR REPLACE FUNCTION public.fn_insert_default_evaluation_criteria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.evaluation_criteria
    (company_id, job_opening_id, key, display_name, weight, max_score, scoring_logic, deduction_rules, addition_rules, sort_order)
  VALUES
    (NEW.company_id, NEW.id, 'content_integrity',   '內容完整性',   0.20, 10, 'deduction', '["答非所問-2分", "回答不完整-1分"]'::jsonb, NULL, 1),
    (NEW.company_id, NEW.id, 'logical_clarity',     '邏輯清晰度',   0.20, 10, 'deduction', '["條理不清-2分", "邏輯錯誤-1分"]'::jsonb, NULL, 2),
    (NEW.company_id, NEW.id, 'professional_depth',  '專業深度',     0.20, 10, 'addition',  NULL, '["正確回答專業問題+2.5分", "展現深度理解+1分"]'::jsonb, 3),
    (NEW.company_id, NEW.id, 'communication',       '溝通表達',     0.20, 10, 'deduction', '["表達不清晰-1分", "表達不流暢-1分"]'::jsonb, NULL, 4),
    (NEW.company_id, NEW.id, 'personal_attributes', '個人特質',     0.20, 10, 'addition',  NULL, '["向上心求知慾+2.5分", "持續學習+2.5分", "活潑外向+2.5分", "堅強抗壓+2.5分"]'::jsonb, 5);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_opening_default_criteria ON public.job_opening;
CREATE TRIGGER trg_job_opening_default_criteria
AFTER INSERT ON public.job_opening
FOR EACH ROW
EXECUTE FUNCTION public.fn_insert_default_evaluation_criteria();

-- Indexes

-- interviews.candidate_email の lower 表現インデックス
CREATE INDEX idx_interviews_candidate_email_lower
  ON public.interviews (lower(candidate_email));

-- 外部キー/主要検索の補助インデックス
CREATE INDEX idx_company_members_company_id     ON public.company_members (company_id);
CREATE INDEX idx_company_members_profile_id     ON public.company_members (profile_id);

CREATE INDEX idx_ai_interviewer_company_id      ON public.ai_interviewer (company_id);

CREATE INDEX idx_job_opening_company_id         ON public.job_opening (company_id);

CREATE INDEX idx_eval_criteria_company_id       ON public.evaluation_criteria (company_id);
CREATE INDEX idx_eval_criteria_job_opening_id   ON public.evaluation_criteria (job_opening_id);

CREATE INDEX idx_question_bank_company_id       ON public.question_bank (company_id);

CREATE INDEX idx_joq_company_id                 ON public.job_opening_questions (company_id);
CREATE INDEX idx_joq_job_opening_id             ON public.job_opening_questions (job_opening_id);
CREATE INDEX idx_joq_question_bank_id           ON public.job_opening_questions (question_bank_id);

CREATE INDEX idx_interviews_company_id          ON public.interviews (company_id);
CREATE INDEX idx_interviews_job_opening_id      ON public.interviews (job_opening_id);
CREATE INDEX idx_interviews_profiles_id         ON public.interviews (profiles_id);

CREATE INDEX idx_interview_sessions_company_id  ON public.interview_sessions (company_id);

-- =========================
-- RLS & Policies（最小限・安全）
-- =========================

-- 全テーブル RLS ON
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interviewer        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_opening           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_criteria   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_opening_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_sessions    ENABLE ROW LEVEL SECURITY;

-- 権限付与（RLS 下での操作を有効化）。列レベル制御は行わず、ポリシーで制限。
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.company TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_interviewer TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_opening TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.evaluation_criteria TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.question_bank TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_opening_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.interviews TO authenticated;
GRANT SELECT ON public.interview_sessions TO authenticated; -- video_path は参照のみ許可（更新不可）

-- ============
-- profiles
-- ============

-- Helper function to get user role without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role(user_auth_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE auth_id = user_auth_id
  LIMIT 1;
  RETURN COALESCE(v_role, 'jobSeeker');
END;
$$;

-- Helper function to get user profile id without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_profile_id(user_auth_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE auth_id = user_auth_id
  LIMIT 1;
  RETURN v_profile_id;
END;
$$;

-- Helper function to get user's company IDs (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_company_ids(user_auth_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_profile_id UUID;
  v_company_ids UUID[];
BEGIN
  -- 獲取用戶的 profile_id
  v_profile_id := public.get_user_profile_id(user_auth_id);
  IF v_profile_id IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;
  
  -- 獲取用戶所屬的公司 ID 列表（使用 SECURITY DEFINER 繞過 RLS）
  SELECT ARRAY_AGG(company_id) INTO v_company_ids
  FROM public.company_members
  WHERE profile_id = v_profile_id;
  
  RETURN COALESCE(v_company_ids, ARRAY[]::UUID[]);
END;
$$;

-- Helper function to check if user is a member of a company (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_company_member(user_auth_id UUID, p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_profile_id UUID;
  v_is_member BOOLEAN := FALSE;
BEGIN
  -- 獲取用戶的 profile_id
  v_profile_id := public.get_user_profile_id(user_auth_id);
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- 檢查是否為該公司的成員（使用 SECURITY DEFINER 繞過 RLS）
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND profile_id = v_profile_id
  ) INTO v_is_member;
  
  RETURN v_is_member;
END;
$$;

-- Helper function to check if user is a viewer of a company (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_company_viewer(user_auth_id UUID, p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
DECLARE
  v_profile_id UUID;
  v_is_viewer BOOLEAN := FALSE;
BEGIN
  -- 獲取用戶的 profile_id
  v_profile_id := public.get_user_profile_id(user_auth_id);
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- 檢查是否為該公司的 viewer（使用 SECURITY DEFINER 繞過 RLS）
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = p_company_id
      AND profile_id = v_profile_id
      AND company_role = 'viewer'
  ) INTO v_is_viewer;
  
  RETURN v_is_viewer;
END;
$$;

-- 每個用戶只能查詢和更新自己的 profile
-- 查看其他用戶的 profiles 應該通過後端 API（service_role）來實現
CREATE POLICY profiles_select_self
ON public.profiles
FOR SELECT
TO authenticated
USING (auth_id = auth.uid());

CREATE POLICY profiles_update_self
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth_id = auth.uid())
WITH CHECK (auth_id = auth.uid());

-- 允許觸發器函數創建 profile
-- SECURITY DEFINER 函數會以函數擁有者權限執行，但仍需要策略允許插入
-- 此策略允許在註冊時由觸發器創建 profile（觸發器會設置正確的 auth_id）
CREATE POLICY profiles_insert_trigger
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth_id IS NOT NULL);

-- ============
-- company
-- ============

-- recruiter: 自社 company のみ参照/更新可（使用安全函數避免遞歸）
CREATE POLICY company_recruiter_select_own
ON public.company
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY company_recruiter_update_own
ON public.company
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  id = ANY(public.get_user_company_ids(auth.uid()))
);

-- ============
-- company_members
-- ============

-- recruiter: 自社 company のみ参照/作成/更新可（使用安全函數避免遞歸）
CREATE POLICY company_members_recruiter_select
ON public.company_members
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY company_members_recruiter_insert
ON public.company_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY company_members_recruiter_update
ON public.company_members
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- viewer/jobSeeker: 可以讀取自己的 company_members 記錄
CREATE POLICY company_members_viewer_select_self
ON public.company_members
FOR SELECT
TO authenticated
USING (
  profile_id = public.get_user_profile_id(auth.uid())
);

-- ============
-- ai_interviewer
-- ============

CREATE POLICY ai_interviewer_recruiter_select
ON public.ai_interviewer
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY ai_interviewer_recruiter_insert
ON public.ai_interviewer
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY ai_interviewer_recruiter_update
ON public.ai_interviewer
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- ============
-- job_opening
-- ============

CREATE POLICY job_opening_recruiter_select
ON public.job_opening
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY job_opening_recruiter_insert
ON public.job_opening
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY job_opening_recruiter_update
ON public.job_opening
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- ====================
-- evaluation_criteria
-- ====================

CREATE POLICY evaluation_criteria_recruiter_select
ON public.evaluation_criteria
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY evaluation_criteria_recruiter_insert
ON public.evaluation_criteria
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY evaluation_criteria_recruiter_update
ON public.evaluation_criteria
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- ============
-- question_bank
-- ============

CREATE POLICY question_bank_recruiter_select
ON public.question_bank
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY question_bank_recruiter_insert
ON public.question_bank
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY question_bank_recruiter_update
ON public.question_bank
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- ======================
-- job_opening_questions
-- ======================

CREATE POLICY joq_recruiter_select
ON public.job_opening_questions
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY joq_recruiter_insert
ON public.job_opening_questions
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY joq_recruiter_update
ON public.job_opening_questions
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- ============
-- interviews
-- ============

-- recruiter: 自社分のみ参照/作成/更新可
CREATE POLICY interviews_recruiter_select
ON public.interviews
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY interviews_recruiter_insert
ON public.interviews
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

CREATE POLICY interviews_recruiter_update
ON public.interviews
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
)
WITH CHECK (
  company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- jobSeeker: 自分の面接のみ参照可
CREATE POLICY interviews_jobseeker_select_self
ON public.interviews
FOR SELECT
TO authenticated
USING (
  profiles_id = public.get_user_profile_id(auth.uid())
);

-- ==================
-- interview_sessions
-- ==================

-- recruiter: 自社分のみ参照可（更新は付与しない。video_path は参照限定）
CREATE POLICY interview_sessions_recruiter_select
ON public.interview_sessions
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) = 'recruiter'
  AND company_id = ANY(public.get_user_company_ids(auth.uid()))
);

-- jobSeeker: 自分の面接回のみ参照可
CREATE POLICY interview_sessions_jobseeker_select_self
ON public.interview_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.interviews i
    WHERE i.id = public.interview_sessions.interviews_id
      AND i.profiles_id = public.get_user_profile_id(auth.uid())
  )
);

-- viewer: 可以讀取自己作為面試者的 interview_sessions（通過 is_company_viewer 函數避免 RLS 遞歸）
CREATE POLICY interview_sessions_viewer_select
ON public.interview_sessions
FOR SELECT
TO authenticated
USING (
  public.is_company_viewer(auth.uid(), company_id)
  AND EXISTS (
    SELECT 1 FROM public.interviews i
    WHERE i.id = public.interview_sessions.interviews_id
      AND (
        i.profiles_id = public.get_user_profile_id(auth.uid())
        OR i.candidate_email = (SELECT email FROM public.profiles WHERE auth_id = auth.uid())
      )
  )
);

-- =========================
-- System Functions & Triggers（自動ひも付け・ユーティリティ）
-- =========================

-- 1) auth.users への INSERT 時に profiles を自動作成
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 從 user_metadata 中讀取 role
  v_role := NEW.raw_user_meta_data->>'role';
  
  -- 如果 role 不在 user_metadata 中，嘗試從 raw_app_meta_data 中讀取
  IF v_role IS NULL THEN
    v_role := NEW.raw_app_meta_data->>'role';
  END IF;
  
  -- 使用 SECURITY DEFINER 權限直接插入，繞過 RLS
  INSERT INTO public.profiles (auth_id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(v_role, 'jobSeeker'))
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 記錄錯誤但不中斷註冊流程
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 確保函數擁有者（通常是 postgres）有足夠權限
-- 在 Supabase 中，postgres 超級用戶應該能夠繞過 RLS
ALTER FUNCTION public.handle_new_auth_user() OWNER TO postgres;

-- 授予 postgres 用戶對 profiles 表的完整權限（觸發器需要）
GRANT ALL ON public.profiles TO postgres;

-- 既存トリガがあれば削除して再作成
DROP TRIGGER IF EXISTS trg_on_auth_user_create_profile ON auth.users;
CREATE TRIGGER trg_on_auth_user_create_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- 2) profiles 作成時に、その email（小文字一致）の interviews を profiles_id にひも付け
CREATE OR REPLACE FUNCTION public.link_interviews_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.interviews
  SET profiles_id = NEW.id,
      candidate_email = NULL
  WHERE candidate_email IS NOT NULL
    AND lower(candidate_email) = lower(NEW.email);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_link_interviews ON public.profiles;
CREATE TRIGGER trg_profiles_link_interviews
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.link_interviews_on_signup();

-- 3) 評価スコア集計用（Stub）
CREATE OR REPLACE FUNCTION public.evaluate_interview_total(p_interviews_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_job_opening_id uuid;
  v_policy jsonb;
  v_overall_threshold numeric := 0;
  v_weighted_sum numeric := 0;
  v_total numeric := 0;
  v_fail boolean := false;
  v_ai_evals jsonb := '[]'::jsonb;
  v_reason text := '';
  r RECORD;
  v_score numeric;
  v_norm numeric;
  v_min_map jsonb;
BEGIN
  SELECT i.company_id, i.job_opening_id
    INTO v_company_id, v_job_opening_id
  FROM public.interviews i
  WHERE i.id = p_interviews_id;

  IF v_job_opening_id IS NULL THEN
    RAISE EXCEPTION 'Interview not found: %', p_interviews_id;
  END IF;

  SELECT evaluation_policy INTO v_policy FROM public.job_opening WHERE id = v_job_opening_id;
  IF v_policy ? 'overall_threshold' THEN
    v_overall_threshold := NULLIF((v_policy->>'overall_threshold')::numeric, NULL);
  END IF;
  IF v_overall_threshold IS NULL THEN v_overall_threshold := 0; END IF;

  SELECT ai_evaluations INTO v_ai_evals FROM public.interview_sessions WHERE interviews_id = p_interviews_id;
  IF v_ai_evals IS NULL THEN v_ai_evals := '[]'::jsonb; END IF;

  FOR r IN (
    SELECT key, weight, max_score
    FROM public.evaluation_criteria
    WHERE job_opening_id = v_job_opening_id
    ORDER BY sort_order
  ) LOOP
    v_score := COALESCE(
      (SELECT (e->>'score')::numeric FROM jsonb_array_elements(v_ai_evals) e WHERE e->>'key' = r.key LIMIT 1),
      0
    );
    IF r.max_score IS NULL OR r.max_score <= 0 THEN
      v_norm := 0;
    ELSE
      v_norm := v_score / r.max_score;
    END IF;
    IF v_norm < 0 THEN v_norm := 0; END IF;
    v_weighted_sum := v_weighted_sum + (v_norm * r.weight);

    IF v_policy ? 'per_criteria_minimums' THEN
      v_min_map := v_policy->'per_criteria_minimums';
      IF v_min_map ? r.key THEN
        IF v_norm < ((v_min_map->>r.key)::numeric) THEN
          v_fail := true;
          v_reason := COALESCE(v_reason,'') || format('%s below minimum; ', r.key);
        END IF;
      END IF;
    END IF;
  END LOOP;

  v_total := round(v_weighted_sum * 100, 2);

  IF v_policy ? 'must_meet' THEN
    FOR r IN SELECT jsonb_array_elements_text(v_policy->'must_meet') AS key LOOP
      v_norm := COALESCE(
        (SELECT ((e->>'score')::numeric) / NULLIF(ec.max_score,0)
         FROM jsonb_array_elements(v_ai_evals) e
         JOIN public.evaluation_criteria ec
           ON ec.job_opening_id = v_job_opening_id AND ec.key = r.key
         WHERE e->>'key' = r.key LIMIT 1), 0);
      IF v_norm <= 0 THEN
        v_fail := true;
        v_reason := COALESCE(v_reason,'') || format('%s missing; ', r.key);
      END IF;
    END LOOP;
  END IF;

  UPDATE public.interview_sessions
  SET total_score = v_total,
      interview_result = CASE WHEN v_fail THEN 'rejected'::public.interview_result_type
                              WHEN v_total >= v_overall_threshold THEN 'hired'::public.interview_result_type
                              ELSE 'rejected'::public.interview_result_type END,
      result_reason = CASE WHEN v_fail THEN 'per_criteria_minimums/must_meet not satisfied'
                           WHEN v_total >= v_overall_threshold THEN 'passed threshold'
                           ELSE 'below threshold' END,
      review_type = COALESCE(review_type, 'AI'::public.review_type_type)
  WHERE interviews_id = p_interviews_id;

  RETURN v_total;
END;
$$;

-- =========================
-- ToS（サインアップ前同意）テーブル
-- =========================

-- アプリ開発者（管理者）白名單。ここに登録された email のみが ToS 編集可能。
CREATE TABLE IF NOT EXISTS public.app_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE
);

-- email 小文字正規化
CREATE OR REPLACE FUNCTION public.fn_normalize_admin_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_admin_email ON public.app_admins;
CREATE TRIGGER trg_normalize_admin_email
BEFORE INSERT OR UPDATE ON public.app_admins
FOR EACH ROW
EXECUTE FUNCTION public.fn_normalize_admin_email();

CREATE INDEX IF NOT EXISTS idx_app_admins_email_lower ON public.app_admins (lower(email));

-- 1) 利用規約本文と版管理
CREATE TABLE IF NOT EXISTS public.terms_of_service (
  version TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 初回セットアップ時の初期 ToS 自動投入（既存が無い場合のみ）
DO $TOS$
DECLARE
  v_exists BOOLEAN;
  v_version TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.terms_of_service) INTO v_exists;
  IF NOT v_exists THEN
    INSERT INTO public.terms_of_service(version, body, published_at)
    VALUES (
      v_version,
      $$
📄 AI面試系統使用條款（繁體中文 / Japanese）

---

一、前言 / 序文

本使用條款（以下稱「本條款」）係由使用者與本公司就「AI 面試平台」（以下稱「本服務」）之使用所訂立之法律契約。

使用者註冊帳號或實際使用本服務，即視為同意本條款之全部內容。

本服務由臺灣地區公司依法設立與營運，並受中華民國法律之規範。

日本語版條文僅為理解輔助，若有歧異，以中文版本為準。

---

二、定義 / 定義

1. 「本公司」：指提供本服務之營運單位。
2. 「本服務」：指本公司提供之 AI 面試系統及相關附屬服務。
3. 「使用者」：指所有使用本服務之個人或法人。
4. 「招募方（recruiter）」：指以企業或人事身分使用本服務進行徵才活動之使用者。
5. 「求職者（jobSeeker）」：指透過本服務參與面試之應徵者。
6. 「AI 面試官」：指由本公司或招募方設定之 AI 模型。
7. 「面試資料」：指於面試過程中所產生之影音、文字、評分及其他相關紀錄。

（日文訳）

1. 「当社」：本サービスを提供する運営会社。
2. 「本サービス」：当社が提供するAI面接システムおよび関連サービス。
3. 「ユーザー」：本サービスを利用するすべての個人または法人。
4. 「採用者（recruiter）」：企業または人事担当者として本サービスを利用するユーザー。
5. 「応募者（jobSeeker）」：本サービスを通じて面接を受ける求職者。
6. 「AI面接官」：当社または採用者が設定したAIモデル。
7. 「面接データ」：面接中に生成される映像・音声・テキスト・評価などの記録。

---

三、條款適用 / 適用範囲

1. 本條款適用於使用者註冊、登入、瀏覽及所有與本服務相關之行為。
2. 本公司得隨時修改本條款，並於服務頁面公告後生效。使用者繼續使用即視為同意。

（日文訳）

1. 本規約は、ユーザーの登録・ログイン・閲覧その他本サービスに関するすべての行為に適用します。
2. 当社は本規約を変更でき、変更後はサービス画面上の公示をもって効力を生じます。

---

四、帳號註冊 / アカウント登録

1. 使用者須提供正確且有效之資料進行註冊。
2. 招募方註冊時須填寫公司資訊及職務用途。
3. 求職者可透過招募方邀請信註冊帳號，或於面試邀請後再補註冊。
4. 若以電子郵件建立面試邀請，則求職者完成註冊後，系統將自動關聯其帳號與面試紀錄。
5. 使用者應確保帳號資料為最新、正確。

（日文訳）

1. ユーザーは正確かつ有効な情報を登録するものとします。
2. 採用者は会社情報と利用目的を登録する必要があります。
3. 応募者は採用者からの面接招待メールを通じてアカウントを作成できます。
4. メールで作成された面接予約は、応募者がサインアップ後に自動で紐付けされます。
5. ユーザーは常に正確な登録情報を保持する責任を負います。

---

五、服務內容 / サービス内容

1. 本服務提供下列功能：
    
    a. AI 面試官設定與管理
    
    b. 招募職缺建立與評分標準設定
    
    c. 面試題目（AI 生成或人工建立）之管理
    
    d. 面試排程、錄影、AI 自動評分與結果通知
    
    e. 求職者個人頁面與結果查詢
    
2. 本公司僅提供 AI 評估結果作為參考資訊，最終錄用決策由招募方自行負責。
3. 本公司不保證 AI 評估之完整性、準確性與公正性。

（日文訳）

1. 本サービスは以下を提供します：
    
    a. AI面接官の設定・管理
    
    b. 職種登録と採点基準設定
    
    c. 質問（AI生成または手動作成）の管理
    
    d. 面接スケジュール、録画、AI自動採点、結果通知
    
    e. 応募者の個人ページと結果閲覧
    
2. AI評価は参考情報であり、最終判断は採用者の責任によります。
3. 当社はAIの評価結果の完全性・正確性・公平性を保証しません。

---

六、禁止行為 / 禁止事項

1. 違反法令或善良風俗之行為
2. 登錄虛假資料、冒用他人身分
3. 未經授權之錄影、轉載、洩漏面試資料
4. 操縱或竄改評分結果
5. 干擾系統運作、侵入伺服器或散播惡意程式
6. 任何可能損害本公司或他人權益之行為

（日文訳）

1. 法令または公序良俗に反する行為
2. 虚偽情報の登録、他人のなりすまし
3. 許可なく面接データを録画・転載・開示する行為
4. 採点結果の改ざん
5. システムへの不正アクセスや妨害
6. 当社または他者の権利を侵害する行為

---

七、面試資料之處理 / 面接データの取扱い

1. 面試資料僅供招募與評估使用。
2. 本公司得於匿名化後，用於 AI 模型精進與服務改善。
3. 招募方應告知求職者資料保存期間與使用範圍。
4. 求職者得依個資法申請查閱、更正或刪除其個人資料。

（日文訳）

1. 面接データは採用・評価目的のみに使用します。
2. 当社は匿名化したデータをAI改善のために利用する場合があります。
3. 採用者は応募者に保存期間・利用範囲を明示する義務があります。
4. 応募者は個人情報保護法に基づき、自己データの開示・訂正・削除を請求できます。

---

八、智慧財產權 / 知的財産権

本服務及相關內容之著作權、商標權、程式碼等智慧財產權，均屬本公司或合法權利人所有。

未經同意，不得擅自重製、修改、轉載或散布。

（日文訳）

本サービスおよびその構成要素の著作権・商標権・プログラム等の知的財産権は、当社または正当な権利者に帰属します。無断使用を禁止します。

---

九、免責事項 / 免責

1. 本公司不保證 AI 評估結果之正確、公平與一致性。
2. 因使用本服務或依據其結果所生之任何損害，本公司概不負責。
3. 因不可抗力（自然災害、通訊中斷等）致服務中斷者，本公司不負賠償責任。

（日文訳）

1. 当社はAI評価結果の正確性・公平性を保証しません。
2. 本サービス利用または結果に基づく損害について当社は一切責任を負いません。
3. 不可抗力（災害・通信障害等）による損害にも責任を負いません。

---

十、帳號終止 / アカウント停止

若使用者違反本條款或有不當行為，本公司得不經預告即停止或刪除帳號。

（日文訳）

ユーザーが本規約に違反した場合、当社は事前通知なしにアカウントを停止または削除できます。

---

十一、服務變更與中止 / サービス変更・中止

本公司得因營運需要隨時變更、中斷或終止本服務，並不負任何損害賠償責任。

（日文訳）

当社は業務上の理由により、本サービスを変更・中断・終了することができ、これによる損害について責任を負いません。

---

十二、個人資料保護 / 個人情報保護

1. 本公司依「個人資料保護法」及相關規範管理使用者資料。
2. 面試影像、音訊、文字與評分結果等資料將以安全方式儲存，不會未經授權對外提供。
3. 使用 Supabase Auth 及 Storage 服務者，並同意其服務條款。

（日文訳）

1. 当社は台湾個人資料保護法および関連法令に従い個人情報を管理します。
2. 面接映像・音声・テキスト・採点結果等は安全に保存され、無断提供は行いません。
3. Supabase Auth および Storage の利用に同意するものとします。

---

十三、準據法與管轄 / 準拠法と管轄

1. 本條款以中華民國法律為準據法。
2. 因本服務所生爭議，以臺灣臺北地方法院為第一審管轄法院。

（日文訳）

1. 本規約は中華民国法（台湾法）を準拠法とします。
2. 紛争は台湾台北地方法院を第一審専属的合意管轄裁判所とします。

---

十四、施行日 / 施行日

本條款自 2025 年 ◯ 月 ◯ 日起生效。

本公司得視情況更新版本，並於網站公告後即時生效。

（日文訳）

本規約は2025年◯月◯日より施行します。

当社は必要に応じて内容を改訂し、ウェブ上の告知をもって効力を発生させます。
$$,
      now()
    );
  END IF;
END;
$TOS$;

-- 2) 本同意履歴（サインアップ後、profiles と紐付け）
CREATE TABLE IF NOT EXISTS public.profile_tos_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL REFERENCES public.terms_of_service(version) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  UNIQUE (profile_id, terms_version)
);

-- 3) サインアップ前の仮同意（短命・TTL）
CREATE TABLE IF NOT EXISTS public.tos_preconsents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT UNIQUE NOT NULL,
  terms_version TEXT NOT NULL REFERENCES public.terms_of_service(version) ON DELETE RESTRICT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

-- 便利インデックス
CREATE INDEX IF NOT EXISTS idx_profile_tos_acceptances_profile_id ON public.profile_tos_acceptances(profile_id);
CREATE INDEX IF NOT EXISTS idx_tos_preconsents_nonce ON public.tos_preconsents(nonce);
CREATE INDEX IF NOT EXISTS idx_tos_preconsents_expires_at ON public.tos_preconsents(expires_at);

-- =========================
-- ToS 関数
-- =========================

-- 4) 最新版の ToS バージョンを返す
CREATE OR REPLACE FUNCTION public.get_latest_tos_version()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT version
  FROM public.terms_of_service
  ORDER BY published_at DESC, version DESC
  LIMIT 1;
$$;

-- 5) 指定プロフィールが最新版 ToS に同意済みか
CREATE OR REPLACE FUNCTION public.is_profile_tos_accepted(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH latest AS (
    SELECT public.get_latest_tos_version() AS v
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_tos_acceptances a, latest
    WHERE a.profile_id = p_profile_id
      AND a.terms_version = latest.v
  );
$$;

-- 6) 仮同意を作成し nonce を返す
CREATE OR REPLACE FUNCTION public.create_tos_preconsent(p_version text, p_ip text, p_ua text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_latest TEXT;
  v_nonce  TEXT;
BEGIN
  SELECT public.get_latest_tos_version() INTO v_latest;
  IF v_latest IS NULL THEN
    RAISE EXCEPTION 'No published ToS';
  END IF;
  IF p_version IS NULL OR p_version <> v_latest THEN
    RAISE EXCEPTION 'ToS version mismatch. Latest=%', v_latest;
  END IF;

  v_nonce := encode(gen_random_bytes(24), 'base64'); -- base64url 相当は後段で置換
  v_nonce := replace(replace(replace(v_nonce, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.tos_preconsents(nonce, terms_version, ip, user_agent, expires_at)
  VALUES (v_nonce, v_latest, p_ip, p_ua, now() + interval '30 minutes');

  RETURN v_nonce;
END;
$$;

-- 7) nonce を消費し、本同意を記録。冪等：同一 nonce は一度のみ成功。
CREATE OR REPLACE FUNCTION public.claim_tos_preconsent(p_nonce text, p_auth_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_pre   public.tos_preconsents%ROWTYPE;
  v_prof  public.profiles%ROWTYPE;
  v_latest TEXT;
BEGIN
  IF p_nonce IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid nonce or user id';
  END IF;

  SELECT * INTO v_pre
  FROM public.tos_preconsents
  WHERE nonce = p_nonce;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nonce not found';
  END IF;
  IF v_pre.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Nonce already consumed';
  END IF;
  IF v_pre.expires_at <= now() THEN
    RAISE EXCEPTION 'Nonce expired';
  END IF;

  SELECT public.get_latest_tos_version() INTO v_latest;
  IF v_latest IS NULL OR v_pre.terms_version <> v_latest THEN
    RAISE EXCEPTION 'ToS version changed; please re-consent to latest';
  END IF;

  -- auth.users → profiles を取得
  SELECT * INTO v_prof
  FROM public.profiles
  WHERE auth_id = p_auth_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for auth user';
  END IF;

  -- 本同意の upsert（冪等性確保）
  INSERT INTO public.profile_tos_acceptances(profile_id, terms_version, ip, user_agent, accepted_at)
  VALUES (v_prof.id, v_pre.terms_version, v_pre.ip, v_pre.user_agent, now())
  ON CONFLICT (profile_id, terms_version) DO NOTHING;

  -- nonce を消費（再実行は already consumed エラー）
  UPDATE public.tos_preconsents
  SET consumed_at = now()
  WHERE id = v_pre.id;

END;
$$;

-- =========================
-- ToS RLS & Policies
-- =========================

-- RLS ON
ALTER TABLE public.terms_of_service         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_tos_acceptances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tos_preconsents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_admins               ENABLE ROW LEVEL SECURITY;

-- 基本権限（RLS 下での実行を前提）
GRANT SELECT ON public.terms_of_service TO anon, authenticated;
GRANT SELECT ON public.profile_tos_acceptances TO authenticated;
GRANT INSERT ON public.tos_preconsents TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.app_admins TO authenticated; -- 管理者はアプリ内で登録（運用時は service role で操作）

-- tos_preconsents: INSERT 以外禁止
CREATE POLICY tos_preconsents_insert_any
ON public.tos_preconsents
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY tos_preconsents_block_select
ON public.tos_preconsents
FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY tos_preconsents_block_update
ON public.tos_preconsents
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY tos_preconsents_block_delete
ON public.tos_preconsents
FOR DELETE
TO anon, authenticated
USING (false);

-- profile_tos_acceptances: 本人のみ参照
CREATE POLICY profile_tos_acceptances_select_self
ON public.profile_tos_acceptances
FOR SELECT
TO authenticated
USING (
  profile_id = public.get_user_profile_id(auth.uid())
);

-- app_admins: 自分の email のみ参照/削除できる。INSERT はサービス経由想定
CREATE POLICY app_admins_select_self
ON public.app_admins
FOR SELECT
TO authenticated
USING (lower(email) = lower(auth.email()));

CREATE POLICY app_admins_delete_self
ON public.app_admins
FOR DELETE
TO authenticated
USING (lower(email) = lower(auth.email()));

-- 主要テーブルの INSERT/UPDATE に ToS 同意ゲート追加（SELECT は既存の RLS に準拠）
-- company
CREATE POLICY company_gate_tos_insert
ON public.company
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY company_gate_tos_update
ON public.company
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- company_members
CREATE POLICY company_members_gate_tos_insert
ON public.company_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY company_members_gate_tos_update
ON public.company_members
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- ai_interviewer
CREATE POLICY ai_interviewer_gate_tos_insert
ON public.ai_interviewer
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY ai_interviewer_gate_tos_update
ON public.ai_interviewer
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- job_opening
CREATE POLICY job_opening_gate_tos_insert
ON public.job_opening
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY job_opening_gate_tos_update
ON public.job_opening
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- evaluation_criteria
CREATE POLICY evaluation_criteria_gate_tos_insert
ON public.evaluation_criteria
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY evaluation_criteria_gate_tos_update
ON public.evaluation_criteria
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- question_bank
CREATE POLICY question_bank_gate_tos_insert
ON public.question_bank
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY question_bank_gate_tos_update
ON public.question_bank
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- job_opening_questions
CREATE POLICY job_opening_questions_gate_tos_insert
ON public.job_opening_questions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY job_opening_questions_gate_tos_update
ON public.job_opening_questions
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- interviews
CREATE POLICY interviews_gate_tos_insert
ON public.interviews
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

CREATE POLICY interviews_gate_tos_update
ON public.interviews
FOR UPDATE
TO authenticated
USING (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
)
WITH CHECK (
  public.is_profile_tos_accepted(public.get_user_profile_id(auth.uid()))
);

-- interview_sessions（更新禁止のため ToS ゲート不要）

-- =========================
-- Storage 互換（原ファイルより継承）
-- =========================

-- 為 Storage API 提供不加 schema 的 buckets 檢視（兼容不同版本欄位，採用最小子集合）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'buckets'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    EXECUTE 'CREATE VIEW public.buckets AS SELECT id, name, owner, created_at, updated_at FROM storage.buckets';
    GRANT SELECT ON public.buckets TO anon, authenticated, service_role;
  END IF;
END $$;

-- Storage 預設 bucket 的建立交由 docker 的 supabase-bootstrap 透過 API 處理，這裡不再直接寫入資料表

-- 初期管理者シード（環境変数から）
DO $$
DECLARE
  v_email TEXT;
BEGIN
  -- 嘗試從環境變數讀取，如果失敗則使用預設值
  BEGIN
    SELECT current_setting('APP_SEED_ADMIN_EMAIL', true) INTO v_email;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;
  
  -- 如果無法從 current_setting 讀取，嘗試其他方法
  IF v_email IS NULL OR v_email = '' THEN
    -- 使用預設的管理員 email
    v_email := 'super@super.com';
  END IF;
  
  IF v_email IS NOT NULL AND length(v_email) > 3 THEN
    INSERT INTO public.app_admins(email)
    VALUES (v_email)
    ON CONFLICT (email) DO NOTHING;
  END IF;
END $$;

-- 兼容 Realtime（Ecto）: schema_migrations 需要 inserted_at 欄位，且型別為 timestamp without time zone（NaiveDateTime）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  ) THEN
    -- 欄位不存在則新增為 timestamp without time zone
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schema_migrations' AND column_name = 'inserted_at'
    ) THEN
      ALTER TABLE public.schema_migrations
      ADD COLUMN inserted_at timestamp without time zone NOT NULL DEFAULT now();
    ELSE
      -- 若已存在但型別為 timestamptz，轉為 timestamp（以 UTC 儲存）
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schema_migrations' AND column_name = 'inserted_at' AND data_type = 'timestamp with time zone'
      ) THEN
        ALTER TABLE public.schema_migrations
        ALTER COLUMN inserted_at TYPE timestamp without time zone USING inserted_at AT TIME ZONE 'UTC';
      END IF;
    END IF;
  ELSE
    CREATE TABLE public.schema_migrations (
      version BIGINT PRIMARY KEY,
      inserted_at timestamp without time zone NOT NULL DEFAULT now()
    );
  END IF;
END $$;
