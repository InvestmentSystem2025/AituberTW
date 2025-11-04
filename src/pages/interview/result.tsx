import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { InterviewResults } from '@/components/interview/InterviewResults'
import { InterviewResult, DEFAULT_SCORING_CRITERIA } from '@/types/interviewScoring'
import { supabase } from '@/lib/supabaseClient'

type SessionRow = {
  id: string
  interviews_id: string
  ai_evaluations: Array<{ key: string; score: number; evidence?: string }>
  interview_transcript?: Array<{ role: string; content: string; timestamp: string }>
  interview_result?: 'hired' | 'rejected' | 'pending'
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
        // 使用 Supabase client 直接查詢，自動處理認證
        const { data: { session: authSession } } = await supabase.auth.getSession()
        if (!authSession) throw new Error('Not authenticated')
        
        const { data: sessionRow, error: sessionError } = await supabase
          .from('interview_sessions')
          .select('*')
          .eq('interviews_id', interviewId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        if (sessionError) throw new Error(sessionError.message)
        if (mounted) setSession(sessionRow || null)
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

  return (
    <InterviewResults
      answers={[]}
      interviewResult={interviewResult}
      onRestart={() => router.push('/interview')}
      onExit={() => router.push('/')}
    />
  )
}


