-- 履歷審查邀請：招募方備註（僅內部顯示，不寄給候選人）
ALTER TABLE public.resume_review_requests
  ADD COLUMN IF NOT EXISTS remarks TEXT;
