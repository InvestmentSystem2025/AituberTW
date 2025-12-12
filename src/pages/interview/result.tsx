import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { InterviewResults } from '@/components/interview/InterviewResults'
import { InterviewResult, DEFAULT_SCORING_CRITERIA, PersonalitySummary } from '@/types/interviewScoring'
import { supabase } from '@/lib/supabaseClient'

type TranscriptItem = {
  role: string
  content: string
  timestamp: string
  aiFeedback?: string
  additions_detail?: string
  deductions_detail?: string
  current_scores?: any
  personality?: any
}

type SessionRow = {
  id: string
  interviews_id: string
  ai_evaluations: Array<{ key: string; score: number; evidence?: string }>
  interview_transcript?: TranscriptItem[]
  interview_result?: 'hired' | 'rejected' | 'pending' | 'cancelByUser' | 'onHold'
  created_at?: string
}

export default function InterviewResultPage() {
  const router = useRouter()
  const interviewId = router.query.id as string | undefined
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!interviewId) return
      setLoading(true)
      setError(null)
      try {
        // 先取得目前使用者的 access token
        const { data: authData } = await supabase.auth.getSession()
        const authSession = authData.session
        if (!authSession) throw new Error('Not authenticated')

        // 改為呼叫後端 API，由 service client 讀取 session（避免前端直接被 RLS 卡住）
        const resp = await fetch(`/api/interviews/get-session?interview_id=${encodeURIComponent(interviewId)}`, {
          headers: {
            Authorization: `Bearer ${authSession.access_token}`,
          },
        })

        if (!resp.ok) {
          let body: any = null
          try {
            body = await resp.json()
          } catch {}
          throw new Error(body?.error || `HTTP ${resp.status}`)
        }

        const body = await resp.json()
        if (mounted) setSession(body.session || null)
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Load failed')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [interviewId])

  const interviewResult: InterviewResult | undefined = useMemo(() => {
    if (!session) return undefined
    if (session.interview_result === 'cancelByUser') return undefined
    const finalScores: Record<string, number> = {}
    const evals = Array.isArray(session.ai_evaluations) ? session.ai_evaluations : []
    evals.forEach((e) => {
      if (e && typeof e.key === 'string') finalScores[e.key] = Number(e.score) || 0
    })
    const values = Object.values(finalScores)
    const totalScore = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    const result: InterviewResult = {
      candidateId: 'unknown',
      interviewDate: session.created_at ? new Date(session.created_at) : new Date(),
      totalQuestions: Array.isArray(session.interview_transcript) ? session.interview_transcript.filter(x => x.role === 'user').length : 0,
      answeredQuestions: Array.isArray(session.interview_transcript) ? session.interview_transcript.filter(x => x.role === 'user' && (x.content || '').trim().length > 0).length : 0,
      answerScores: [],
      finalScores: finalScores as any,
      totalScore,
      isPassed: session.interview_result === 'hired',
      passingCriteria: DEFAULT_SCORING_CRITERIA,
      summary: { strengths: [], weaknesses: [], recommendations: [] },
    }
    return result
  }, [session])

  const personalitySummary: PersonalitySummary | undefined = useMemo(() => {
    if (!session || !Array.isArray(session.interview_transcript)) return undefined
    // 從最後一則有 personality 的 AI 訊息中取出人格總結
    const reversed = [...session.interview_transcript].reverse()
    const lastAiWithPersonality = reversed.find(item => item && item.role === 'ai' && item.personality)
    return (lastAiWithPersonality?.personality || undefined) as PersonalitySummary | undefined
  }, [session])

  if (!interviewId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">缺少參數 id</div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-700">載入中...</div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">讀取失敗：{error || '找不到資料'}</div>
    )
  }

  // 面試者提早結束的專用畫面：不顯示錄取／未錄取紅字
  if (session.interview_result === 'cancelByUser') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-4 text-center">面試者提早結束</h1>
          <p className="text-gray-700 text-sm leading-relaxed mb-6">
            你已在面試過程中主動結束本次 AI 面試，因此本場面試不會產生正式的錄取／未錄取判定。
            你先前的作答與對話內容仍會保留，做為招募方日後參考之用。
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => router.push('/me?tab=interviews')}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              回到面試列表
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
            >
              回首頁
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <InterviewResults
      answers={[]}
      interviewResult={interviewResult}
      personalitySummary={personalitySummary}
      onRestart={() => router.push('/interview')}
      onExit={() => router.push('/me?tab=interviews')}
    />
  )
}


