import type { NextApiRequest, NextApiResponse } from 'next'
import { TtlCache } from '@/lib/ttlCache'
import { createAuthContext } from '@/lib/authContext'

const TTL_300S_MS = 300_000
const aiInterviewerCache = new TtlCache<any[]>({ ttlMs: TTL_300S_MS, maxEntries: 500 })
const evaluationCriteriaCache = new TtlCache<any[]>({ ttlMs: TTL_300S_MS, maxEntries: 1000 })
const questionsCache = new TtlCache<any[]>({ ttlMs: TTL_300S_MS, maxEntries: 2000 })
const jobOpeningCache = new TtlCache<any>({ ttlMs: TTL_300S_MS, maxEntries: 2000 })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const ctx = createAuthContext(req)
  const authUserId = await ctx.getAuthUserId()
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const interview_id = String(req.query.interview_id || '')
  if (!interview_id) return res.status(400).json({ error: 'MISSING_INTERVIEW_ID' })

  const supa = ctx.supa
  // profile 與 interview 可並行取得（request-scope cache：profile 只查一次，整個 handler 重用）
  const [me, interviewRes] = await Promise.all([
    ctx.getProfile(),
    supa
      .from('interviews')
      .select(`
        id,
        company_id,
        job_opening_id,
        start_time,
        end_time,
        status,
        profiles_id,
        candidate_email
      `)
      .eq('id', interview_id)
      .single(),
  ])

  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })
  const interviewBase = interviewRes.data as any
  if (interviewRes.error || !interviewBase) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  const jobOpening = await jobOpeningCache.getOrSet(`job_opening:${String(interviewBase.job_opening_id)}:with_company:true`, async () => {
    const { data } = await supa
      .from('job_opening')
      .select(`
        id,
        job_title,
        use_ai_generate_question,
        result_notification_method,
        evaluation_policy,
        company:company_id (
          id,
          company_name,
          ideal_candidate_profile
        )
      `)
      .eq('id', interviewBase.job_opening_id)
      .maybeSingle()
    return data || null
  })

  const interview = { ...interviewBase, job_opening: jobOpening }

  // 檢查權限：如果是 jobSeeker，只能查看自己的 interview
  if (me.role === 'jobSeeker') {
    if (interview.profiles_id !== me.id) {
      // 檢查 email 是否匹配
      if (me.email?.toLowerCase() !== interview.candidate_email?.toLowerCase()) {
        return res.status(403).json({ error: 'FORBIDDEN' })
      }
    }

    // Gate 1: 必須完成 MFA
    if (!me.mfa_totp_enabled_at) {
      return res.status(403).json({
        error: 'MFA_REQUIRED',
        message: '開始面試前需要完成 Authenticator 認證。'
      })
    }

    // Gate 2: quota 必須剩餘 >= 1
    // 只在「尚未開始 session（或狀態仍 waitToStart）」時才檢查 quota，避免面試進行中重複 hit usage
    if (interview.status === 'waitToStart') {
      const { data: usage } = await supa
        .from('job_seeker_usage')
        .select('used_count, free_quota')
        .eq('profile_id', me.id)
        .maybeSingle()

      // 完成 MFA 後理論上已初始化；若缺失視為 0/3
      const used = usage?.used_count ?? 0
      const quota = usage?.free_quota ?? 3
      if (used >= quota) {
        return res.status(403).json({
          error: 'FREE_QUOTA_EXCEEDED',
          message: '免費使用次數已用完，請升級方案以繼續使用。'
        })
      }
    }
    
    // 自動授予該公司的 viewer 身份（如果還沒有）
    // 不阻擋主流程（best-effort）；並避免覆蓋既有更高權限角色
    void (async () => {
      try {
        const { error } = await supa
          .from('company_members')
          .upsert(
            { company_id: interview.company_id, profile_id: me.id, company_role: 'viewer' },
            { onConflict: 'company_id,profile_id', ignoreDuplicates: true }
          )
        if (error) console.error('Failed to grant viewer role:', error)
      } catch (err: unknown) {
        console.error('Failed to grant viewer role:', err)
      }
    })()
  } else {
    // recruiter需要檢查是否為同公司成員
    const { data: scope } = await supa
      .from('company_members')
      .select('profile_id')
      .eq('company_id', interview.company_id)
      .eq('profile_id', me.id)
      .maybeSingle()
    if (!scope) return res.status(403).json({ error: 'FORBIDDEN' })
  }

  const getAiInterviewers = async () => {
    const key = `company:${String(interview.company_id)}:limit1:created_at_asc`
    return aiInterviewerCache.getOrSet(key, async () => {
      const { data } = await supa
        .from('ai_interviewer')
        .select('id, name, model_name, model_config')
        .eq('company_id', interview.company_id)
        .limit(1)
        .order('created_at', { ascending: true })
      return data || []
    })
  }

  const getEvaluationCriteria = async () => {
    const key = `job_opening:${String(interview.job_opening_id)}`
    return evaluationCriteriaCache.getOrSet(key, async () => {
      const { data } = await supa
        .from('evaluation_criteria')
        .select('id, key, display_name, weight, max_score, scoring_logic, addition_rules, deduction_rules, sort_order')
        .eq('job_opening_id', interview.job_opening_id)
        .order('sort_order', { ascending: true })
      return data || []
    })
  }

  const getQuestionsMerged = async () => {
    const key = `job_opening:${String(interview.job_opening_id)}:active:true:merged_bank:true`
    return questionsCache.getOrSet(key, async () => {
      const { data: questions } = await supa
        .from('job_opening_questions')
        .select('id, detail, sort_order, question_bank_id')
        .eq('job_opening_id', interview.job_opening_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (!questions || questions.length === 0) return []

      const questionBankIds = Array.from(
        new Set(questions.map((q: any) => q.question_bank_id).filter((id: any) => id != null))
      )

      if (questionBankIds.length === 0) return questions

      const { data: questionBanks } = await supa.from('question_bank').select('id, detail').in('id', questionBankIds)

      const bankMap = new Map<any, any>()
      if (questionBanks) {
        questionBanks.forEach((bank: any) => bankMap.set(bank.id, bank.detail))
      }

      const merged = questions.map((q: any) => {
        if (!q.question_bank_id || !bankMap.has(q.question_bank_id)) return q

        const bankDetail = bankMap.get(q.question_bank_id)

        // 解析 job_opening_questions 的 detail
        let joqQuestions: string[] = []
        if (q.detail) {
          if (typeof q.detail === 'string') {
            try {
              const parsed = JSON.parse(q.detail)
              if (parsed && Array.isArray(parsed.questions)) joqQuestions = parsed.questions
              else joqQuestions = [q.detail]
            } catch {
              joqQuestions = [q.detail]
            }
          } else if (typeof q.detail === 'object') {
            if (Array.isArray(q.detail.questions)) joqQuestions = q.detail.questions
            else {
              const text = q.detail.question || q.detail.text || q.detail.content || ''
              if (text) joqQuestions = [text]
            }
          }
        }

        // 解析 question_bank 的 detail
        let bankQuestions: string[] = []
        if (bankDetail) {
          if (typeof bankDetail === 'string') {
            try {
              const parsed = JSON.parse(bankDetail)
              if (parsed && Array.isArray(parsed.questions)) bankQuestions = parsed.questions
              else bankQuestions = [bankDetail]
            } catch {
              bankQuestions = [bankDetail]
            }
          } else if (typeof bankDetail === 'object') {
            if (Array.isArray(bankDetail.questions)) bankQuestions = bankDetail.questions
            else {
              const text = bankDetail.question || bankDetail.text || bankDetail.content || ''
              if (text) bankQuestions = [text]
            }
          }
        }

        const mergedQuestions = [...bankQuestions, ...joqQuestions].filter(
          (qq: string) => qq && qq.trim().length > 0
        )

        return {
          ...q,
          detail: { questions: mergedQuestions },
        }
      })

      return merged
    })
  }

  // quota / 權限通過後再抓其餘資料；這些查詢彼此可並行（並加入短 TTL cache）
  const [aiInterviewers, questions, criteria] = await Promise.all([
    getAiInterviewers(),
    getQuestionsMerged(),
    getEvaluationCriteria(),
  ])

  return res.status(200).json({
    interview,
    ai_interviewer: aiInterviewers?.[0] || null,
    questions: questions || [],
    evaluation_criteria: criteria || [],
  })
}

