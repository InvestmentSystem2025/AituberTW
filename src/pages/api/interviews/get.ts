import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient, getAuthUserIdFromRequest } from '@/lib/supabaseServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const authUserId = await getAuthUserIdFromRequest(req)
  if (!authUserId) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const interview_id = String(req.query.interview_id || '')
  if (!interview_id) return res.status(400).json({ error: 'MISSING_INTERVIEW_ID' })

  const supa = getServiceClient()
  const { data: me } = await supa.from('profiles').select('id').eq('auth_id', authUserId).single()
  if (!me) return res.status(400).json({ error: 'PROFILE_NOT_FOUND' })

  // 獲取interview基本信息
  const { data: interview, error: ivError } = await supa
    .from('interviews')
    .select(`
      id,
      company_id,
      job_opening_id,
      start_time,
      end_time,
      status,
      profiles_id,
      candidate_email,
      job_opening:job_opening_id (
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
      )
    `)
    .eq('id', interview_id)
    .single()

  if (ivError || !interview) return res.status(404).json({ error: 'INTERVIEW_NOT_FOUND' })

  // 檢查權限：如果是jobSeeker，只能查看自己的interview
  const { data: profile } = await supa.from('profiles').select('role').eq('auth_id', authUserId).single()
  if (profile?.role === 'jobSeeker') {
    if (interview.profiles_id !== me.id) {
      // 檢查email是否匹配
      const { data: userProfile } = await supa.from('profiles').select('email').eq('auth_id', authUserId).single()
      if (userProfile?.email?.toLowerCase() !== interview.candidate_email?.toLowerCase()) {
        return res.status(403).json({ error: 'FORBIDDEN' })
      }
    }
    
    // 自動授予該公司的 viewer 身份（如果還沒有）
    const { data: existingMember } = await supa
      .from('company_members')
      .select('id, company_role')
      .eq('company_id', interview.company_id)
      .eq('profile_id', me.id)
      .maybeSingle()
    
    if (!existingMember) {
      // 使用 service client 繞過 RLS 插入 viewer 身份
      const { error: insertError } = await supa
        .from('company_members')
        .insert({
          company_id: interview.company_id,
          profile_id: me.id,
          company_role: 'viewer',
        })
      
      if (insertError) {
        console.error('Failed to grant viewer role:', insertError)
        // 不阻擋繼續執行，只是記錄錯誤
      }
    }
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

  // 獲取該job_opening的AI面試官列表（取第一個）
  const { data: aiInterviewers } = await supa
    .from('ai_interviewer')
    .select('id, name, model_name, model_config')
    .eq('company_id', interview.company_id)
    .limit(1)
    .order('created_at', { ascending: true })

  // 獲取該job_opening的題目（包含 question_bank_id）
  const { data: questions } = await supa
    .from('job_opening_questions')
    .select('id, detail, sort_order, question_bank_id')
    .eq('job_opening_id', interview.job_opening_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // 合併 question_bank 的問題到 job_opening_questions
  if (questions && questions.length > 0) {
    const questionBankIds = questions
      .map((q: any) => q.question_bank_id)
      .filter((id: any) => id != null)
    
    if (questionBankIds.length > 0) {
      // 批量查詢所有相關的 question_bank
      const { data: questionBanks } = await supa
        .from('question_bank')
        .select('id, detail')
        .in('id', questionBankIds)
      
      // 建立 question_bank_id -> detail 的映射
      const bankMap = new Map()
      if (questionBanks) {
        questionBanks.forEach((bank: any) => {
          bankMap.set(bank.id, bank.detail)
        })
      }

      // 對每個 job_opening_questions 合併對應的 question_bank 問題
      questions.forEach((q: any) => {
        if (q.question_bank_id && bankMap.has(q.question_bank_id)) {
          const bankDetail = bankMap.get(q.question_bank_id)
          
          // 解析 job_opening_questions 的 detail
          let joqQuestions: string[] = []
          if (q.detail) {
            if (typeof q.detail === 'string') {
              try {
                const parsed = JSON.parse(q.detail)
                if (parsed && Array.isArray(parsed.questions)) {
                  joqQuestions = parsed.questions
                } else {
                  joqQuestions = [q.detail] // 如果解析後不是 questions 陣列，當作單一問題
                }
              } catch {
                joqQuestions = [q.detail] // JSON 解析失敗，當作單一問題字串
              }
            } else if (typeof q.detail === 'object') {
              if (Array.isArray(q.detail.questions)) {
                joqQuestions = q.detail.questions
              } else {
                // 嘗試從物件中提取問題
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
                if (parsed && Array.isArray(parsed.questions)) {
                  bankQuestions = parsed.questions
                } else {
                  bankQuestions = [bankDetail] // 如果解析後不是 questions 陣列，當作單一問題
                }
              } catch {
                bankQuestions = [bankDetail] // JSON 解析失敗，當作單一問題字串
              }
            } else if (typeof bankDetail === 'object') {
              if (Array.isArray(bankDetail.questions)) {
                bankQuestions = bankDetail.questions
              } else {
                // 嘗試從物件中提取問題
                const text = bankDetail.question || bankDetail.text || bankDetail.content || ''
                if (text) bankQuestions = [text]
              }
            }
          }

          // 合併問題：先 question_bank 的問題，再 job_opening_questions 的問題（共通題庫優先）
          const mergedQuestions = [...bankQuestions, ...joqQuestions].filter((q: string) => q && q.trim().length > 0)
          
          // 更新 detail
          q.detail = {
            questions: mergedQuestions
          }
        }
      })
    }
  }

  // 獲取evaluation_criteria
  const { data: criteria } = await supa
    .from('evaluation_criteria')
    .select('id, key, display_name, weight, max_score, scoring_logic, addition_rules, deduction_rules, sort_order')
    .eq('job_opening_id', interview.job_opening_id)
    .order('sort_order', { ascending: true })

  return res.status(200).json({
    interview,
    ai_interviewer: aiInterviewers?.[0] || null,
    questions: questions || [],
    evaluation_criteria: criteria || [],
  })
}

