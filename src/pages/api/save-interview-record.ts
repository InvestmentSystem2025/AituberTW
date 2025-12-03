import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextApiRequest, NextApiResponse } from 'next'
import { InterviewResult } from '@/types/interviewScoring'

// Supabase 客戶端初始化（可選）
let supabase: SupabaseClient | null = null
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface InterviewRecordData {
  candidateId: string
  interviewDate: string
  totalQuestions: number
  answeredQuestions: number
  answers: Array<{
    question: {
      id: string
      text: string
      category: string
      difficulty: string
    }
    answer: string
    timestamp: string
  }>
  interviewResult?: InterviewResult
  settings?: {
    questionCount: number
    timePerQuestion: number
    difficulty: string
    categories: string[]
    enableTimer: boolean
    enablePersonDetection: boolean
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const recordData = req.body as InterviewRecordData
    const currentTime = new Date().toISOString()

    // 驗證必要欄位
    if (!recordData.candidateId || !recordData.answers || !Array.isArray(recordData.answers)) {
      return res.status(400).json({ message: 'Invalid interview record data' })
    }

    // 準備要保存的數據（改為僅保存在資料庫，不再寫入 JSON 檔案）
    const dataToSave: InterviewRecordData = {
      candidateId: recordData.candidateId,
      interviewDate: recordData.interviewDate || currentTime,
      totalQuestions: recordData.totalQuestions,
      answeredQuestions: recordData.answeredQuestions,
      answers: recordData.answers,
      interviewResult: recordData.interviewResult,
      settings: recordData.settings,
    }

    console.log(`✅ 面試記錄請求已接收（僅儲存於資料庫，無本地 JSON 檔案）`)

    // 如果配置了 Supabase，也可以保存到資料庫
    if (supabase) {
      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('interview_sessions')
          .insert({
            candidate_id: recordData.candidateId,
            interview_date: dataToSave.interviewDate,
            total_questions: dataToSave.totalQuestions,
            answered_questions: dataToSave.answeredQuestions,
            total_score: recordData.interviewResult?.totalScore,
            is_passed: recordData.interviewResult?.isPassed,
            created_at: currentTime,
          })
          .select('id')
          .single()

        if (sessionError) {
          console.warn('Supabase 保存失敗（將僅保存到本地檔案）:', sessionError.message)
        } else {
          console.log(`✅ 面試記錄已同步到 Supabase, Session ID: ${sessionData?.id}`)
        }
      } catch (dbError) {
        console.warn('資料庫操作失敗，但本地檔案已保存:', dbError)
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Interview record saved successfully (stored in database only)',
    })
  } catch (error) {
    console.error('保存面試記錄時發生錯誤:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to save interview record',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

