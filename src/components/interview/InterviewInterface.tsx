import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { InterviewModelViewer } from '@/components/interview/InterviewModelViewer'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { getInterviewAIResponseStream } from '@/features/chat/interviewAIChat'
import { Message } from '@/features/messages/messages'
import { useInterviewVoiceRecognition } from '@/hooks/useInterviewVoiceRecognition'
import { InterviewScoringEngine } from '@/features/interview/interviewScoring'
import { InterviewScoringSettings } from '@/components/interview/InterviewScoringSettings'
import { ResponseTimeAnalysis } from '@/components/interview/ResponseTimeAnalysis'
import { ScoringCriteria, AnswerScore, DEFAULT_SCORING_CRITERIA, InterviewResult, getScoreLevel, SCORE_LEVEL_DESCRIPTIONS } from '@/types/interviewScoring'
import { useInterviewRecording } from '@/hooks/useInterviewRecording'
import { supabase } from '@/lib/supabaseClient'
import toastStore from '@/features/stores/toast'
import { responseTimeTracker } from '@/utils/responseTimeTracker'
import { speakCharacter } from '@/features/messages/speakCharacter'
import { generateMessageId } from '@/utils/messageUtils'
import { PERSONALITY_QUESTION_LIST } from '@/features/chat/interviewPromptTemplates'

interface ChatMessage {
  id: string
  type: 'ai' | 'user'
  content: string
  timestamp: Date
  aiFeedback?: string
  aiAdditionsDetail?: string
  aiDeductionsDetail?: string
  // 本題各項目的 delta（AnswerScore.scores）
  aiScoreDeltas?: Record<string, number>
  // 本題加/扣分事件（結構化，方便統計）
  aiScoreEvents?: {
    deductions?: any
    additions?: any
  }
  // 每次 AI 回覆後的「當前累積分數快照」（依評分項目 key）
  aiCurrentScores?: Record<string, number>
  // （選用）人格判斷結果，只會在最後一則 AI 回覆上出現
  personality?: any
}

interface InterviewConfig {
  interview: any
  ai_interviewer: any
  questions: any[]
  evaluation_criteria: any[]
}

interface InterviewInterfaceProps {
  onInterviewComplete: (result?: any) => void
  enableRecording?: boolean
  initialGreeting?: string  // 預先生成的 AI 問候語
  interviewConfig?: InterviewConfig | null
  interviewId?: string
  resultNotificationMethod?: 'immediate' | 'later'
   // 使用者偏好面試語言（來自 profiles.preferred_language，例如 zh-TW / en-US / ja-JP）
  preferredLanguage?: string
}

export const InterviewInterface: React.FC<InterviewInterfaceProps> = ({
  onInterviewComplete,
  enableRecording = false,
  initialGreeting,
  interviewConfig,
  interviewId,
  resultNotificationMethod = 'immediate',
  preferredLanguage = 'zh-TW',
}) => {
  const DEBUG_INTERVIEW = process.env.NEXT_PUBLIC_DEBUG_INTERVIEW === '1'
  const modelType = settingsStore((s) => s.modelType)
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesRef = useRef<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false)
  const [isAIResponding, setIsAIResponding] = useState(false)
  const [interviewCompletionStatus, setInterviewCompletionStatus] = useState<'incomplete' | 'complete'>('incomplete')
  const [interviewLanguage, setInterviewLanguage] = useState(preferredLanguage) // 面試專用語言設定
  const [showLocalVideo, setShowLocalVideo] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  const greetingShownRef = useRef(false)
  const mediaStreamRef = useRef<MediaStream | null>(null) // 保存攝像機 stream 引用
  
  // 針對首句問候語做內容淨化，避免模型產生不友善/不合語境的句子
  const sanitizeGreeting = useCallback((text: string | undefined | null): string => {
    const fallback = '你好，我是今天的 AI 面試官，很高興見到你！開始前請你先做個簡短的自我介紹。'
    if (!text || typeof text !== 'string') return fallback
    let t = text
    // 移除不必要的評語或系統化用語
    t = t.replace(/不符合預期的打招呼[^。！？]*[。！？]?/g, '')
    t = t.replace(/請面試者自我介紹，請分析原因[^。！？]*[。！？]?/g, '')
    // 若清理後過短，回退成預設友善問候
    t = t.trim()
    if (t.length < 6) return fallback
    return t
  }, [])
  
  // 初始化時顯示預先生成的問候語
  useEffect(() => {
    if (initialGreeting && messages.length === 0 && !greetingShownRef.current) {
      const greetingMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: sanitizeGreeting(initialGreeting),
        timestamp: new Date(),
      }
      setMessages([greetingMessage])
      greetingShownRef.current = true
    }
  }, [initialGreeting, messages.length, sanitizeGreeting])

  // 始終保留最新的 messages，用於避免閉包拿到舊的對話內容（例如 setTimeout 之後才呼叫的 saveInterviewSession）
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 從配置中獲取問題，如果沒有則使用默認問題
  const interviewQuestions = interviewConfig?.questions || []

  // 處理資料庫問題列表
  let processedQuestions: Array<{ id: string; question: string; category: string }> = []
  
  if (interviewQuestions.length > 0) {
    processedQuestions = interviewQuestions.flatMap((q: any, idx: number) => {
      // 處理 detail 字段，可能是字串、物件或陣列
      const d = q?.detail
      
      // 如果 detail 是物件且包含 questions 陣列（合併後的格式）
      if (d && typeof d === 'object' && Array.isArray(d.questions)) {
        // 返回多個問題，每個問題都對應到同一個 job_opening_question
        return d.questions.map((questionText: string, subIdx: number) => ({
          id: q.id ? `${q.id}-${subIdx}` : `q-${idx}-${subIdx}`,
          question: (typeof questionText === 'string' && questionText.trim()) || `問題 ${idx + 1}-${subIdx + 1}`,
          category: d.category || d.type || 'general',
        })).filter((item: any) => item.question && item.question.trim().length > 0)
      }
      
      // 否則按原邏輯處理（單一問題）
      let questionText = ''
      if (typeof d === 'string') {
        questionText = d
      } else if (Array.isArray(d)) {
        const first = d.find((x) => typeof x === 'string' && x.trim().length > 0)
        questionText = first || d.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean).join('\n')
      } else if (d && typeof d === 'object') {
        questionText = d.question || d.text || d.content || d.title || ''
        if (!questionText && typeof d.prompt === 'string') questionText = d.prompt
        if (!questionText) {
          const v = Object.values(d).find((v) => typeof v === 'string' && v.trim().length > 0)
          if (typeof v === 'string') questionText = v
        }
      }

      const category = (d && typeof d === 'object' ? (d.category || d.type) : 'general') || 'general'
      return [{
        id: q.id || `q-${idx}`,
        question: (questionText && questionText.trim()) || `問題 ${idx + 1}`,
        category,
      }].filter((item) => item.question && item.question.trim().length > 0)
    })
  }

  // 題目以 DB 回傳為準（不再使用硬編碼 INTERVIEW_QUESTIONS fallback）
  // 若 DB 沒有題目，則以空陣列進行（AI 仍可自行動態生成問題）
  const formattedQuestions = processedQuestions

  // 系統控題用的「完整題序列」：自我介紹 -> 人格題 -> DB 題庫
  const INTRO_QUESTION =
    '你好，我是今天的AI面試官，很高興見到你！首先請你做個簡短的自我介紹。'
  const questionSequence: Array<{ id: string; question: string; category: string }> = [
    { id: 'intro', question: INTRO_QUESTION, category: 'intro' },
    ...PERSONALITY_QUESTION_LIST.map((q, idx) => ({
      id: `personality-${idx + 1}`,
      question: q,
      category: 'personality',
    })),
    ...formattedQuestions,
  ].filter((q) => typeof q.question === 'string' && q.question.trim().length > 0)

  // 若 DB 題目為空，提示管理者/測試者（避免誤以為有使用預設題目）
  useEffect(() => {
    if (interviewConfig && Array.isArray(interviewConfig.questions) && interviewConfig.questions.length === 0) {
      toastStore.getState().addToast({
        message: '此職缺未設定題目（DB questions 為空），將由 AI 動態生成問題',
        type: 'info',
        tag: 'interview-no-db-questions',
      })
    }
  }, [interviewConfig])

  // 獲取evaluation_criteria並轉換為評分系統需要的格式
  const evaluationCriteria = interviewConfig?.evaluation_criteria || []
  
  // 評分系統狀態 - 使用evaluation_criteria初始化
  const [scoringEngine] = useState(() => {
    if (evaluationCriteria.length > 0) {
      // 建立 passingCriteria（使用 criteria key 作為 key）
      const criteria: ScoringCriteria = {}
      evaluationCriteria.forEach((c: any) => {
        criteria[c.key] = c.max_score || 10
      })
      
      // 建立 evaluationCriteria 資訊
      const criteriaInfo = evaluationCriteria.map((c: any) => ({
        key: c.key,
        display_name: c.display_name,
        scoring_logic: c.scoring_logic || 'deduction',
        max_score: c.max_score || 10
      }))
      
      return new InterviewScoringEngine(criteria, criteriaInfo)
    }
    return new InterviewScoringEngine(DEFAULT_SCORING_CRITERIA)
  })

  // 各評分項目的「當前累積分數」，會隨著每題答案的加減分往上/往下調整
  const [currentScores, setCurrentScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    if (evaluationCriteria.length > 0) {
      evaluationCriteria.forEach((c: any) => {
        const key = c.key
        const max = c.max_score || 10
        const logic = c.scoring_logic || 'deduction'
        // 扣分制：從滿分開始；加分制/綜合制：從 0 分開始
        initial[key] = (logic === 'addition' || logic === 'composite') ? 0 : max
      })
    }
    return initial
  })

  const [answerScores, setAnswerScores] = useState<AnswerScore[]>([])
  const [showScoringSettings, setShowScoringSettings] = useState(false)
  const [showResponseTimeAnalysis, setShowResponseTimeAnalysis] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState<string>('')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)
  // 系統控題：追問階段不推進題號
  const [isFollowUpPhase, setIsFollowUpPhase] = useState(false)
  const [followUpCount, setFollowUpCount] = useState(0)
  const MAX_FOLLOWUPS = 2
  
  // 面試開始時間記錄
  const interviewStartTimeRef = useRef<number>(Date.now())
  const tokensInputRef = useRef<number>(0)
  const tokensOutputRef = useRef<number>(0)
  
  // TTS 排隊管理器：用於處理分段 TTS
  const ttsQueueRef = useRef<{
    sentenceBuffer: string
    currentEmotion: string
    sessionId: string
    isProcessing: boolean
  }>({
    sentenceBuffer: '',
    currentEmotion: 'neutral',
    sessionId: '',
    isProcessing: false,
  })
  
  /**
   * 清理文本中的標籤（移除所有 [...] 格式的標籤）
   * 包括完整的標籤（如 [CONTENT_START]）和不完整的標籤（如 [CONTENT_START）
   */
  const cleanTagsFromText = useCallback((text: string): string => {
    let cleaned = text
    
    // 移除完整的標籤 [TAG]
    cleaned = cleaned.replace(/\[[^\]]+\]/g, '')
    
    // 移除不完整的標籤（只有 [ 但沒有 ]）
    // 從右到左處理，找到最後一個 [ 並移除它之後的所有內容
    const lastBracketIndex = cleaned.lastIndexOf('[')
    if (lastBracketIndex !== -1) {
      // 檢查是否在這個 [ 之後有 ]
      const afterBracket = cleaned.substring(lastBracketIndex + 1)
      if (!afterBracket.includes(']')) {
        // 如果沒有 ]，移除從 [ 開始到結尾的所有內容
        cleaned = cleaned.substring(0, lastBracketIndex)
      }
    }
    
    return cleaned.trim()
  }, [])
  
  /**
   * 處理 TTS 分段播放：當遇到標點符號時，提取完整句子並發送 TTS 請求
   */
  const processTTSQueue = useCallback((text: string, emotion: string) => {
    const queue = ttsQueueRef.current
    
    // 更新情感標籤
    if (emotion) {
      queue.currentEmotion = emotion
    }
    
    // 如果這是新的回應，初始化 sessionId
    if (!queue.sessionId) {
      queue.sessionId = generateMessageId()
    }
    
    // 將新文本添加到緩衝區
    queue.sentenceBuffer += text
    
    // 標點符號正則表達式（中文、英文、日文等）
    // 每次創建新的正則表達式實例，避免狀態問題
    const punctuationRegex = /[。！？.!?；;：:，,、]/g
    
    // 查找標點符號
    let lastIndex = 0
    const matches: Array<{ index: number; punctuation: string }> = []
    
    // 收集所有匹配的標點符號
    let match: RegExpMatchArray | null
    while ((match = punctuationRegex.exec(queue.sentenceBuffer)) !== null) {
      const matchIndex = match.index
      if (matchIndex !== undefined) {
        matches.push({
          index: matchIndex,
          punctuation: match[0],
        })
      }
    }
    
    // 按順序處理每個完整的句子
    for (const match of matches) {
      // 提取完整句子（從上次位置到標點符號位置+1）
      let sentence = queue.sentenceBuffer.substring(lastIndex, match.index + match.punctuation.length).trim()
      
      // 清理標籤：移除所有 [...] 格式的標籤
      sentence = cleanTagsFromText(sentence)
      
      if (sentence.length > 0) {
        // 發送 TTS 請求（使用 speakCharacter，它已經有排隊機制）
        speakCharacter(
          queue.sessionId,
          {
            message: sentence,
            emotion: queue.currentEmotion as any,
          },
          () => {
            // onStart callback
          },
          () => {
            // onComplete callback - 當一個句子播放完成後，處理下一個
            queue.isProcessing = false
          }
        )
      }
      
      lastIndex = match.index + match.punctuation.length
    }
    
    // 移除已處理的句子，保留未完成的句子
    queue.sentenceBuffer = queue.sentenceBuffer.substring(lastIndex)
  }, [cleanTagsFromText])
  
  /**
   * 處理串流結束後的剩餘文本
   */
  const flushTTSQueue = useCallback(() => {
    const queue = ttsQueueRef.current
    if (queue.sentenceBuffer.trim().length > 0) {
      // 清理標籤：移除所有 [...] 格式的標籤
      let remainingText = cleanTagsFromText(queue.sentenceBuffer.trim())
      
      if (remainingText.length > 0) {
        // 發送剩餘的文本
        speakCharacter(
          queue.sessionId,
          {
            message: remainingText,
            emotion: queue.currentEmotion as any,
          }
        )
      }
      queue.sentenceBuffer = ''
    }
    // 重置 sessionId，準備下一個回應
    queue.sessionId = ''
  }, [cleanTagsFromText])
  
  // 錄製功能
  const recording = useInterviewRecording({ enableRecording })
  
  // 使用 ref 儲存錄製控制，避免依賴問題
  const recordingRef = useRef(recording)
  recordingRef.current = recording
  
  // 使用 ref 來避免閉包問題
  const handleUserAnswerRef = useRef<(answer: string) => void>()

  // 停止並釋放攝像機資源（需要在 processAIResponse 之前定義）
  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      // 停止所有 tracks（video 和 audio）
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop()
        console.log('🛑 已停止攝像機 track:', track.kind)
      })
      mediaStreamRef.current = null
    }
    if (videoRef.current) {
      try {
        // 清空並暫停影片，避免仍占用裝置
        videoRef.current.srcObject = null as any
        videoRef.current.pause()
        // 觸發一次載入以釋放影像資源
        videoRef.current.load()
      } catch {}
    }
  }, [])

  // 根據單題評分結果更新「當前累積分數」
  const applyScoreResultToCurrentScores = useCallback(
    (prev: Record<string, number>, scoreResult: AnswerScore): Record<string, number> => {
      const next: Record<string, number> = { ...prev }

      if (evaluationCriteria.length === 0 || !scoreResult?.scores) {
        return next
      }

      evaluationCriteria.forEach((c: any) => {
        const key = c.key
        const max = c.max_score || 10
        const logic = c.scoring_logic || 'deduction'
        const singleScore = typeof scoreResult.scores[key] === 'number'
          ? scoreResult.scores[key]
          : (logic === 'addition' || logic === 'composite' ? 0 : max)

        let delta = 0
        if (logic === 'addition' || logic === 'composite') {
          // 加分制/綜合制：單題分數視為本題「加減分總和」
          delta = singleScore
        } else {
          // 扣分制：單題分數是以滿分為基準的「本題評分後分數」，與滿分差值為本題扣分量
          delta = singleScore - max // <= 0
        }

        const currentBase = typeof next[key] === 'number'
          ? next[key]
          : (logic === 'addition' || logic === 'composite' ? 0 : max)

        const updated = currentBase + delta
        next[key] = Math.max(0, Math.min(max, updated))
      })

      return next
    },
    [evaluationCriteria]
  )

  // 保存面試session到資料庫
  const saveInterviewSession = useCallback(async (
    finalResult: InterviewResult,
    options?: { userCancelled?: boolean }
  ): Promise<'hired' | 'rejected' | 'pending' | 'cancelByUser' | undefined> => {
    if (!interviewId) return

    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return

      // 轉換評分結果為DB格式的ai_evaluations（含整場面試該項目的證據敘述）
      const aiEvaluations = evaluationCriteria.map((criteria: any) => {
        const key = criteria.key
        const displayName = criteria.display_name || key
        const maxScore = criteria.max_score || 10
        const finalScore = Math.max(0, Math.min(maxScore, finalResult?.finalScores?.[key] || 0))

        // 彙總整場面試的加/扣分原因（依 DB key 匹配）
        const allAdditions: string[] = []
        const allDeductions: string[] = []
        if (Array.isArray(finalResult?.answerScores)) {
          finalResult.answerScores.forEach((s) => {
            // additions/deductions 皆為 Record<string, string[]>
            const adds = (s.additions && s.additions[key]) || []
            const deds = (s.deductions && s.deductions[key]) || []
            if (Array.isArray(adds) && adds.length) allAdditions.push(...adds)
            if (Array.isArray(deds) && deds.length) allDeductions.push(...deds)
          })
        }

        // 去重
        const uniqueAdds = Array.from(new Set(allAdditions))
        const uniqueDeds = Array.from(new Set(allDeductions))

        // 分數等級描述
        const level = getScoreLevel(finalScore)
        const levelText = SCORE_LEVEL_DESCRIPTIONS[level]

        // 組裝 evidence 敘述
        const parts: string[] = []
        parts.push(`${displayName}表現${levelText} (${finalScore.toFixed(1)}分)`) // 主句
        if (uniqueAdds.length > 0) parts.push(`加分：${uniqueAdds.join('、')}`)
        if (uniqueDeds.length > 0) parts.push(`扣分：${uniqueDeds.join('、')}`)

        const evidence = parts.join('；')

        return {
          key,
          score: Math.round(finalScore * 10) / 10,
          evidence,
        }
      })

      // 準備transcript（使用 messagesRef，確保拿到的是最新的完整對話，而不是舊閉包中的內容）
      const transcript = (messagesRef.current || []).map(msg => ({
        role: msg.type,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        aiFeedback: msg.type === 'ai' ? (msg.aiFeedback || '') : '',
        additions_detail: msg.type === 'ai' ? (msg.aiAdditionsDetail || '') : '',
        deductions_detail: msg.type === 'ai' ? (msg.aiDeductionsDetail || '') : '',
        // 本題 delta 與事件（方便後續統計/回放）
        score_deltas: msg.type === 'ai' ? (msg.aiScoreDeltas || null) : null,
        score_events: msg.type === 'ai' ? (msg.aiScoreEvents || null) : null,
        // 每次 AI 回覆後的「當前累積分數」，方便在結果頁或後端分析時還原當下的分數狀態
        current_scores: msg.type === 'ai' ? (msg.aiCurrentScores || null) : null,
        // 人格判斷結果（只會在最後一則 AI 回覆中非空）
        personality: msg.type === 'ai' ? (msg.personality || null) : null,
      }))

      // 計算duration
      const durationSeconds = Math.floor((Date.now() - interviewStartTimeRef.current) / 1000)

      const response = await fetch('/api/interviews/save-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          interviews_id: interviewId,
          interview_transcript: transcript,
          ai_evaluations: aiEvaluations,
          duration_seconds: durationSeconds,
          tokens_input: tokensInputRef.current,
          tokens_output: tokensOutputRef.current,
          is_cancelled_by_user: options?.userCancelled === true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Save interview session error:', error)
        toastStore.getState().addToast({
          message: '保存面試記錄時發生錯誤',
          type: 'error',
        })
        return undefined
      }

      // 儲存成功後，直接使用 API 回傳的 session.interview_result
      try {
        const body = await response.json()
        const interviewResultFromDb = body?.session?.interview_result as string | undefined
        if (interviewResultFromDb === 'hired') return 'hired'
        if (interviewResultFromDb === 'rejected') return 'rejected'
        if (interviewResultFromDb === 'cancelByUser') return 'cancelByUser'
        if (interviewResultFromDb) return 'pending'
      } catch {}

      // 後備：讀取最新 session 以取得 DB 決策（interview_result）
      try {
        const check = await fetch(`/api/interviews/get-session?interview_id=${encodeURIComponent(interviewId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (check.ok) {
          const data = await check.json()
          const interviewResultFromDb = data?.session?.interview_result as string | undefined
          if (interviewResultFromDb === 'hired') return 'hired'
          if (interviewResultFromDb === 'rejected') return 'rejected'
          if (interviewResultFromDb === 'cancelByUser') return 'cancelByUser'
          return 'pending'
        }
      } catch (e) {
        console.warn('Fetch interview session result failed:', e)
      }
      return undefined
    } catch (error) {
      console.error('Save interview session exception:', error)
    }
  }, [interviewId, evaluationCriteria])

  // 滾動到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
    }, 100)
  }, [])

  // 添加AI訊息
  const addAIMessage = useCallback((content: string, aiFeedback?: string, aiAdditionsDetail?: string, aiDeductionsDetail?: string) => {
    // 最終保險閘：顯示前剝離任意評分區塊
    const cleaned = content.replace(/\[SCORE_START\]([\s\S]*?)\[SCORE_END\]/g, '').trim()
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: cleaned,
      timestamp: new Date(),
      aiFeedback,
      aiAdditionsDetail,
      aiDeductionsDetail,
    }
    setMessages((prev) => [...prev, newMessage])
    scrollToBottom()
  }, [scrollToBottom])

  // 添加用戶訊息
  const addUserMessage = useCallback((content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, newMessage])
    scrollToBottom()
  }, [scrollToBottom])

  // 處理AI面試官的回應
  const processAIResponse = useCallback(async (userAnswer: string) => {
    if (isAIResponding) return
    
    setIsAIResponding(true)
    setIsWaitingForAnswer(false)
    
    // 獲取 AI 服務配置
    const aiService = settingsStore.getState().selectAIService
    const aiModel = settingsStore.getState().selectAIModel
    
    // 開始追蹤回應時間
    const trackingId = responseTimeTracker.startTracking(
      userAnswer,
      aiService,
      aiModel,
      messages.length,
      currentQuestionIndex,
      questionSequence[currentQuestionIndex]?.category
    )
    
    try {
      // 將對話轉換為Message格式
      const conversationMessages: Message[] = messages.map(msg => ({
        role: msg.type === 'ai' ? 'assistant' : 'user',
        content: msg.content
      }))
      
      // 添加用戶的最新回答
      conversationMessages.push({
        role: 'user',
        content: userAnswer
      })
      
      // 準備問題列表供 AI 使用
      // 仍提供 DB 題庫給 prompt 作為背景資訊，但「下一題」完全由前端控制
      const questionsList = formattedQuestions.map(q => q.question)
      const currentQ = questionSequence[currentQuestionIndex]
      const currentQuestionText = currentQ?.question || ''
      const isLastQuestion = currentQuestionIndex >= questionSequence.length - 1
      const nextQuestionText = (!isLastQuestion && questionSequence[currentQuestionIndex + 1]?.question)
        ? String(questionSequence[currentQuestionIndex + 1]?.question || '')
        : ''
      
      // 🔍 DEBUG: Client-side log（幫助偵錯）
      if (DEBUG_INTERVIEW) {
        console.log('📋 即將發送問題列表到 AI:', questionsList)
        console.log('🎯 系統指定當前題目:', {
          index: currentQuestionIndex,
          text: currentQuestionText,
          isFollowUpPhase,
          followUpCount,
          isLastQuestion
        })
        console.log('📊 當前對話歷史:', conversationMessages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 50) : '...'}`))
        console.log('📊 當前對話歷史長度:', conversationMessages.length)
      }
      
      // 調用AI API獲取串流回應
      const stream = await getInterviewAIResponseStream(
        conversationMessages, 
        currentQuestionIndex + 1,
        questionsList,
        evaluationCriteria,
        trackingId, // 傳遞追蹤 ID
        interviewLanguage, // 面試偏好語言（決定 AI 回覆語言）
        currentQuestionText,
        nextQuestionText,
        isFollowUpPhase,
        followUpCount,
        MAX_FOLLOWUPS,
        isLastQuestion
      )
      
      // 創建一個新的 AI 消息用於實時更新
      const streamingMessageId = `ai-streaming-${Date.now()}`
      let streamingContent = ''
      let finalEmotion = 'neutral'
      let finalScoreResult: AnswerScore | null = null
      
      // 初始化 TTS 隊列（新的回應）
      ttsQueueRef.current.sessionId = generateMessageId()
      ttsQueueRef.current.sentenceBuffer = ''
      ttsQueueRef.current.currentEmotion = 'neutral'
      
      // 添加初始空消息
      const initialMessage: ChatMessage = {
        id: streamingMessageId,
        type: 'ai',
        content: '',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, initialMessage])
      
      // 讀取串流
      const reader = stream.getReader()
      // bufferRaw 用於累積「顯示用」文字（但仍可能因為 chunk 拆分而殘留破碎標記）
      let buffer = ''
      let rawBuffer = '' // 用於累積原始內容（包含元數據）
      let didHandleMetadata = false // 避免重複解析/重複累加 tokens/重複 console log

      // 強化版：移除因為模型漏字元/串流拆分導致的破碎標記（例如：CONTENT_END]、[CONTENT_EN...）
      const sanitizeInterviewVisibleText = (text: string): string => {
        if (!text) return ''
        let t = text
        // 先移除完整 block（避免內容內殘留 JSON）
        t = t.replace(/\[INTERVIEW_METADATA_START\][\s\S]*?\[INTERVIEW_METADATA_END\]/g, '')
        t = t.replace(/\[SCORE_START\][\s\S]*?\[SCORE_END\]/g, '')
        // 移除完整 emotion / content 標記
        t = t.replace(/\[EMOTION_START\][\s\S]*?\[EMOTION_END\]/g, '')
        t = t.replace(/\[CONTENT_START\]|\[CONTENT_END\]/g, '')
        // 移除「破碎標記」的常見變體（缺 '[' 或缺 ']'）
        t = t.replace(/\[?\s*CONTENT_START\s*\]?/g, '')
        t = t.replace(/\[?\s*CONTENT_END\s*\]?/g, '')
        t = t.replace(/\[?\s*EMOTION_START\s*\]?/g, '')
        t = t.replace(/\[?\s*EMOTION_END\s*\]?/g, '')
        t = t.replace(/\[?\s*SCORE_START\s*\]?/g, '')
        t = t.replace(/\[?\s*SCORE_END\s*\]?/g, '')
        t = t.replace(/\[?\s*INTERVIEW_METADATA_START\s*\]?/g, '')
        t = t.replace(/\[?\s*INTERVIEW_METADATA_END\s*\]?/g, '')
        return t
      }
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          // ReadableStream<string> 返回的 value 已經是字符串（已經過 processTextChunk 處理）
          // 但我們需要累積原始內容來檢查元數據
          rawBuffer += value
          
          // 檢查是否包含元數據標記
          const metadataRegex = /\[INTERVIEW_METADATA_START\]([\s\S]*?)\[INTERVIEW_METADATA_END\]/
          const metadataMatch = rawBuffer.match(metadataRegex)
          
          if (metadataMatch && !didHandleMetadata) {
            // 解析元數據
            try {
              const metadata = JSON.parse(metadataMatch[1])
              if (metadata.type === 'metadata') {
                finalEmotion = metadata.emotion || 'neutral'
                // 更新 TTS 隊列的情感標籤
                ttsQueueRef.current.currentEmotion = finalEmotion

                // token usage（若串流端有提供則累加到整場 session）
                const t = metadata.tokens
                if (t && typeof t === 'object') {
                  const ti = Number((t as any).tokens_input)
                  const to = Number((t as any).tokens_output)
                  if (Number.isFinite(ti) && ti >= 0) tokensInputRef.current += Math.floor(ti)
                  if (Number.isFinite(to) && to >= 0) tokensOutputRef.current += Math.floor(to)
                }
                // 為了方便檢驗：每題回答結束後印一次 token（本次 + 累計）
                console.log('[Interview] 回答完成 token', {
                  questionIndex: currentQuestionIndex + 1,
                  questionId: metadata?.scoreResult?.questionId,
                  tokens_this_answer: t || null,
                  tokens_session_total: {
                    tokens_input: tokensInputRef.current,
                    tokens_output: tokensOutputRef.current,
                    tokens_total: (tokensInputRef.current || 0) + (tokensOutputRef.current || 0),
                  },
                })
                // 處理 scoreResult，將 timestamp 轉換回 Date 對象
                if (metadata.scoreResult) {
                  const scoreResult = metadata.scoreResult
                  // 如果 timestamp 是字符串，轉換為 Date
                  if (scoreResult.timestamp && typeof scoreResult.timestamp === 'string') {
                    scoreResult.timestamp = new Date(scoreResult.timestamp)
                  } else if (!scoreResult.timestamp || !(scoreResult.timestamp instanceof Date)) {
                    scoreResult.timestamp = new Date()
                  }
                  finalScoreResult = scoreResult
                } else {
                  finalScoreResult = null
                }
                // 從 rawBuffer 中移除元數據標記，避免後續 chunk 重複 match
                rawBuffer = rawBuffer.replace(metadataRegex, '')
                didHandleMetadata = true
              }
            } catch (e) {
              console.error('解析元數據失敗:', e)
            }
          }
          
          // value 已經經過 processTextChunk 處理，應該只包含 CONTENT 標籤內的內容
          // 但為了安全起見，我們還是移除任何可能遺漏的標籤和元數據標記
          let displayChunk = value
            .replace(/\[INTERVIEW_METADATA_START\]([\s\S]*?)\[INTERVIEW_METADATA_END\]/g, '')
            .replace(/\[CONTENT_START\]/g, '')
            .replace(/\[CONTENT_END\]/g, '')
            .replace(/\[EMOTION_START\]([\s\S]*?)\[EMOTION_END\]/g, '')
            .replace(/\[SCORE_START\]([\s\S]*?)\[SCORE_END\]/g, '')
          
          // 累積已經清理過的內容（仍需對「整段累積文字」做一次 sanitize，才能抓到跨 chunk 拼起來的破碎標記）
          buffer += displayChunk
          const nextVisible = sanitizeInterviewVisibleText(buffer)
          
          if (nextVisible !== streamingContent) {
            // 計算新增的文本（以 sanitize 後的可見文字為準）
            const newText = nextVisible.substring(streamingContent.length)
            streamingContent = nextVisible
            
            // 更新消息內容
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId
                  ? { ...msg, content: streamingContent }
                  : msg
              )
            )
            scrollToBottom()
            
            // 處理 TTS 分段播放：當有新文本時，檢查是否有標點符號
            if (newText.length > 0) {
              // 使用當前的 emotion（如果已經從元數據中獲取，否則使用隊列中的 emotion）
              const currentEmotion = finalEmotion || ttsQueueRef.current.currentEmotion
              processTTSQueue(newText, currentEmotion)
            }
          }
        }
        
        // 串流結束後，處理剩餘的 TTS 文本
        flushTTSQueue()
        
        // 記錄 API 調用結束時間
        responseTimeTracker.recordApiCallEnd(trackingId)
        
        // 完成追蹤並記錄指標
        responseTimeTracker.completeTracking(trackingId, streamingContent)
        
        // 記錄本回合 AI 決策（用於控制題號與追問狀態）
        let decidedAction: 'followup' | 'next' | 'end' | null = null

        // 更新最終消息，包含評分信息
        if (finalScoreResult) {
          const scoreResult = finalScoreResult
          // 先更新「當前累積分數」，並保留這次更新後的快照
          let updatedScoresSnapshot: Record<string, number> | undefined
          setCurrentScores((prev) => {
            const next = applyScoreResultToCurrentScores(prev, scoreResult)
            updatedScoresSnapshot = next

            // 🔍 Console log：顯示「套用本題 delta 後的當前分數」+「本題 delta」+「加/扣分事件」
            // 這段只會在「每題回答完成」時觸發一次（避免重複三次的問題）
            try {
              const fmt = (v: number) => {
                const n = Number(v) || 0
                return Number.isFinite(n) ? n.toFixed(2) : '0.00'
              }
              const fmtDelta = (v: number) => {
                const n = Number(v) || 0
                if (!Number.isFinite(n) || n === 0) return '0.00'
                return `${n > 0 ? '+' : ''}${n.toFixed(2)}`
              }

              const criteriaList = Array.isArray(evaluationCriteria) ? evaluationCriteria : []
              const orderedKeys = criteriaList.length > 0
                ? criteriaList.map((c: any) => c.key).filter((k: any) => typeof k === 'string')
                : Array.from(new Set([
                    ...Object.keys(prev || {}),
                    ...Object.keys(scoreResult?.scores || {}),
                    ...Object.keys(next || {}),
                  ]))

              console.group(`📊 本題評分：${scoreResult.questionId || ''}`.trim())
              console.log('題目：', scoreResult.questionText)
              console.log('本題 delta（scores）：', scoreResult.scores)

              orderedKeys.forEach((key: string) => {
                const c = criteriaList.find((x: any) => x && x.key === key)
                const displayName = (c && (c.display_name || c.key)) ? String(c.display_name || c.key) : key
                const max = (c && typeof c.max_score === 'number') ? c.max_score : 10
                const logic = (c && typeof c.scoring_logic === 'string') ? c.scoring_logic : 'deduction'
                const base = (logic === 'addition' || logic === 'composite') ? 0 : max
                const prevScore = (prev && typeof (prev as any)[key] === 'number') ? Number((prev as any)[key]) : base
                const delta = scoreResult?.scores && typeof (scoreResult.scores as any)[key] === 'number'
                  ? Number((scoreResult.scores as any)[key])
                  : 0
                const nextScore = (next && typeof (next as any)[key] === 'number') ? Number((next as any)[key]) : base

                console.log(`${displayName} (${key})：${fmt(prevScore)}  ${fmtDelta(delta)}  =>  ${fmt(nextScore)}`)

                const dItems = (scoreResult as any)?.deductionItems?.[key]
                const aItems = (scoreResult as any)?.additionItems?.[key]
                if (Array.isArray(dItems) && dItems.length > 0) {
                  console.log(`  扣分事件：`, dItems.map((it: any) => ({
                    points: Number(it?.points) || 0,
                    detail: String(it?.detail || ''),
                  })))
                }
                if (Array.isArray(aItems) && aItems.length > 0) {
                  console.log(`  加分事件：`, aItems.map((it: any) => ({
                    points: Number(it?.points) || 0,
                    detail: String(it?.detail || ''),
                  })))
                }
                // fallback：若沒有事件結構，仍顯示舊字串原因
                if ((!Array.isArray(dItems) || dItems.length === 0) && scoreResult?.deductions?.[key]?.length) {
                  console.log('  扣分原因：', scoreResult.deductions[key])
                }
                if ((!Array.isArray(aItems) || aItems.length === 0) && scoreResult?.additions?.[key]?.length) {
                  console.log('  加分原因：', scoreResult.additions[key])
                }
              })

              console.groupEnd()
            } catch (e) {
              console.warn('評分 console log 失敗（可忽略）:', e)
            }
            return next
          })

          // 將本題評分結果、人格判斷與當前累積分數寫入訊息與評分紀錄
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMessageId
                ? {
                    ...msg,
                    content: streamingContent,
                    aiFeedback: finalScoreResult?.aiFeedback,
                    aiAdditionsDetail: finalScoreResult?.additionsDetail,
                    aiDeductionsDetail: finalScoreResult?.deductionsDetail,
                    aiScoreDeltas: (finalScoreResult?.scores || undefined) as any,
                    aiScoreEvents: {
                      deductions: (finalScoreResult as any)?.deductionItems || null,
                      additions: (finalScoreResult as any)?.additionItems || null,
                    },
                    aiCurrentScores: updatedScoresSnapshot,
                    personality: finalScoreResult?.personality,
                  }
                : msg
            )
          )
          
          // 處理評分結果（供結果頁與統計使用）
          setAnswerScores(prev => [...prev, finalScoreResult!])
          scoringEngine.addScoredAnswer(finalScoreResult)

          // 依 nextAction 控制題號推進（避免 AI 自己亂出題）
          const rawAction = (finalScoreResult.nextAction || 'next') as 'followup' | 'next' | 'end'
          // 避免無限追問：達到上限後強制進下一題
          const action: 'followup' | 'next' | 'end' =
            (rawAction === 'followup' && followUpCount >= MAX_FOLLOWUPS) ? 'next' : rawAction
          decidedAction = action

          if (action === 'followup') {
            setIsFollowUpPhase(true)
            setFollowUpCount((c) => Math.min(MAX_FOLLOWUPS, c + 1))
          } else if (action === 'next') {
            setIsFollowUpPhase(false)
            setFollowUpCount(0)

            const nextIdx = currentQuestionIndex + 1
            const nextQ = questionSequence[nextIdx]
            if (nextQ && typeof nextQ.question === 'string' && nextQ.question.trim().length > 0) {
              // 題庫有下一題：推進題號（題號仍用於追蹤/記錄）
              setCurrentQuestionIndex(nextIdx)
              // 不再由系統插入下一題，改為要求 AI 在 CONTENT 內逐字輸出 nextQuestionText
            } else {
              // 題庫已無下一題：不要用題號/題庫狀態自動結束面試
              // 面試是否結束一律由 AI 回覆內容（endKeywords）判斷
            }
          } else {
            // end
            setIsFollowUpPhase(false)
            setFollowUpCount(0)
          }
        }
        
        // 檢查是否為面試結束的回應
        const endKeywords = ['面試到此結束', '面試結束', '感謝你的參與', '我們的面試', '後續流程']
        const isInterviewEnding = endKeywords.some((keyword) => streamingContent.includes(keyword))
        
        if (isInterviewEnding) {
          // 標記本場面試已由 AI 正常結束
          setInterviewCompletionStatus('complete')
          // 先等待 3 秒讓 AI 最後的回覆完全顯示，再停止錄製
          setTimeout(() => {
            recording.stopRecording()
          }, 3000)

          // 總共等待 6 秒後完成儲存與資源釋放（但不自動跳轉結果頁，改由使用者按「結束面試」按鈕）
          setTimeout(async () => {
            const finalResult = scoringEngine.generateFinalResult('candidate-001')
            // 保存到資料庫並讀取DB決策，確保結果頁可以看到最新資料（包含 personality）
            if (interviewId) {
              const outcome = await saveInterviewSession(finalResult)
              if (outcome) {
                // 以 DB 的 interview_result 為準統一顯示
                finalResult.isPassed = outcome === 'hired'
              }
            }
            // 停止攝像機與麥克風
            try { stopListening() } catch {}
            stopCamera()
            setShowLocalVideo(false)
            // 此處不自動導向結果頁，方便開發時在 F12 中檢查請求與回應
          }, 6000) // 給更多時間：3秒顯示 + 3秒處理錄製與儲存
        } else {
          // 非 end：保持可輸入（next 題目已由 AI 在 CONTENT 內問出）
          setIsWaitingForAnswer(true)
        }
      } catch (streamError) {
        console.error('讀取串流錯誤:', streamError)
        throw streamError
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      console.error('AI回應錯誤:', error)
      addAIMessage('抱歉，我遇到了一些技術問題。請稍後再試。')
      setIsWaitingForAnswer(true)
    } finally {
      setIsAIResponding(false)
    }
  }, [
    isAIResponding,
    messages,
    addAIMessage,
    onInterviewComplete,
    scoringEngine,
    currentQuestionIndex,
    recording,
    interviewId,
    saveInterviewSession,
    formattedQuestions,
    questionSequence,
    isFollowUpPhase,
    followUpCount,
    MAX_FOLLOWUPS,
    stopCamera,
  ])

  // 處理用戶回答
  const handleUserAnswer = useCallback((answer: string) => {
    if (!answer.trim() || !isWaitingForAnswer || isAIResponding) return
    
    addUserMessage(answer)
    
    // 立即處理AI回應
    processAIResponse(answer)
  }, [isWaitingForAnswer, isAIResponding, addUserMessage, processAIResponse])

  // 更新 ref 的值
  useEffect(() => {
    handleUserAnswerRef.current = handleUserAnswer
  }, [handleUserAnswer])

  // 初始化鏡頭
  const initializeCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      })
      mediaStreamRef.current = stream // 保存 stream 引用
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (error) {
      console.error('鏡頭初始化失敗:', error)
    }
  }, [])

  // 開始面試
  const startInterview = useCallback(async () => {
    interviewStartTimeRef.current = Date.now()
    tokensInputRef.current = 0
    tokensOutputRef.current = 0
    
    // 如果啟用錄製，開始錄製
    if (enableRecording) {
      setTimeout(() => {
        recording.startRecording()
      }, 1000) // 延遲 1 秒開始錄製，確保畫面已完全載入
    }

    // 如果有預先生成的問候語，直接使用
    if (initialGreeting) {
      setCurrentQuestionIndex(0)
      setCurrentQuestionId(questionSequence[0]?.id || 'intro')
      setIsFollowUpPhase(false)
      setFollowUpCount(0)
      setIsWaitingForAnswer(true)
      // 若問候語沒有引導自我介紹，保底補上一句第一題（避免使用者不知道要回答什麼）
      const g = sanitizeGreeting(initialGreeting)
      if (!g.includes('自我介紹')) {
        addAIMessage(INTRO_QUESTION)
      }
      return
    }

    // 沒有 initialGreeting：由系統直接送出第一題（避免模型自行連續提問/題號不同步）
    if (messages.length === 0) {
      setCurrentQuestionIndex(0)
      setCurrentQuestionId(questionSequence[0]?.id || 'intro')
      setIsFollowUpPhase(false)
      setFollowUpCount(0)
      addAIMessage(INTRO_QUESTION)
      setIsWaitingForAnswer(true)
      return
    }

    console.log('⚠️ 跳過系統開場：messages.length =', messages.length)
  }, [initialGreeting, addAIMessage, enableRecording, recording, messages.length, questionSequence, sanitizeGreeting])

  // 語音識別功能
  const {
    userMessage: voiceMessage,
    isListening,
    silenceTimeoutRemaining,
    toggleListening,
    startListening,
    stopListening,
  } = useInterviewVoiceRecognition(
    (answer: string) => handleUserAnswerRef.current?.(answer),
    isWaitingForAnswer,
    isAIResponding,
    interviewLanguage
  )

  // 初始化面試（只執行一次）
  useEffect(() => {
    if (!isInitializedRef.current) {
      // 初始化鏡頭
      initializeCamera()
      
      // 開始面試流程（延遲一小段時間確保組件完全初始化）
      setTimeout(() => {
        startInterview()
      }, 100)
      
      // 標記為已初始化
      isInitializedRef.current = true
    }
  }, [initializeCamera, startInterview])

  // 組件卸載時的清理（使用獨立的 effect）
  useEffect(() => {
    return () => {
      // 停止錄製
      if (recordingRef.current.isRecording) {
        recordingRef.current.stopRecording()
      }
      // 停止語音聆聽/麥克風
      try { stopListening() } catch {}
      // 停止攝像機
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => {
          track.stop()
        })
        mediaStreamRef.current = null
      }
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null as any
          videoRef.current.pause()
          videoRef.current.load()
        } catch {}
      }
    }
  }, []) // 空依賴，只在組件真正卸載時執行

  // 發送文字訊息
  const sendMessage = () => {
    if (userInput.trim()) {
      handleUserAnswer(userInput)
      setUserInput('')
    }
  }

  // 處理鍵盤事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="h-[100svh] flex bg-gray-100">
      {/* 左側：面試者視訊 (1/3) */}
      {showLocalVideo ? (
        <div className="w-1/3 bg-black relative">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-2 rounded-lg text-sm">
            面試者
          </div>
        </div>
      ) : (
        <div className="w-1/3 bg-black relative flex items-center justify-center">
          <div className="text-white/70 text-sm">攝像機已關閉</div>
        </div>
      )}

      {/* 中間：對話記錄 (1/3) */}
      <div className="w-1/3 flex flex-col bg-white">
        {/* 對話標題 */}
        <div className="bg-blue-500 text-white px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="font-bold">面試對話記錄</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowResponseTimeAnalysis(true)}
                className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors"
              >
                📊 回應時間分析
              </button>
              <label className="text-sm">語音語言:</label>
              <select
                value={interviewLanguage}
                onChange={(e) => setInterviewLanguage(e.target.value)}
                className="px-2 py-1 rounded text-black text-sm"
              >
                <option value="zh-TW">繁體中文</option>
                <option value="zh-CN">簡體中文</option>
                <option value="ja-JP">日本語</option>
                <option value="en-US">English</option>
                <option value="ko-KR">한국어</option>
                <option value="vi-VN">Tiếng Việt</option>
                <option value="fr-FR">Français</option>
                <option value="es-ES">Español</option>
                <option value="pt-PT">Português</option>
                <option value="de-DE">Deutsch</option>
                <option value="ru-RU">Русский</option>
                <option value="it-IT">Italiano</option>
                <option value="ar-SA">العربية</option>
                <option value="hi-IN">हिन्दी</option>
                <option value="pl-PL">Polski</option>
                <option value="th-TH">ไทย</option>
              </select>
            </div>
          </div>
        </div>

        {/* 對話內容 */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {messages.map((message, index) => {
            return (
              <div key={message.id}>
                <div
                  className={`flex ${
                    message.type === 'ai' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-lg ${
                      message.type === 'ai'
                        ? 'bg-blue-100 text-blue-900'
                        : 'bg-green-100 text-green-900'
                    }`}
                  >
                    <div className="text-sm font-medium mb-1">
                      {message.type === 'ai' ? 'AI面試官' : '面試者'}
                    </div>
                    <div className="text-sm">{message.content}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 輸入區域 */}
        <div className="border-t p-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={toggleListening}
              disabled={!isWaitingForAnswer || isAIResponding}
              className={`px-4 py-2 rounded-lg text-white font-medium ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600'
                  : isWaitingForAnswer && !isAIResponding
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {isListening ? '停止語音輸入' : '開始語音輸入'}
            </button>
            <button
              onClick={async () => {
                const isCancelledByUser = interviewCompletionStatus !== 'complete'

                // 等待 2 秒再停止錄製（給最後的對話時間錄製）
                setTimeout(() => {
                  recording.stopRecording()
                }, 2000)
                
                // 總共等待 5 秒後顯示結果 / 儲存記錄
                setTimeout(async () => {
                  const finalResult = scoringEngine.generateFinalResult('candidate-001')
                  // 保存到資料庫並讀取DB決策
                  if (interviewId) {
                    const outcome = await saveInterviewSession(finalResult, isCancelledByUser ? { userCancelled: true } : undefined)
                    // 只有在非「面試者提早結束」情況下，才依 DB 結果更新 isPassed
                    if (outcome && !isCancelledByUser) {
                      finalResult.isPassed = outcome === 'hired'
                    }
                  }
                  // 停止攝像機與麥克風
                  try { stopListening() } catch {}
                  stopCamera()
                  setShowLocalVideo(false)
                  if (interviewId) {
                    if (resultNotificationMethod === 'later') {
                      // 後續通知：不顯示面試結果頁，直接回到個人頁（面試列表）
                      window.location.replace('/me?tab=interviews')
                    } else {
                      // 即時通知：在新分頁打開結果頁面（立即執行，避免被彈出視窗阻擋器阻擋）
                      const resultUrl = `/interview/result?id=${encodeURIComponent(interviewId)}`
                      const newWindow = window.open(resultUrl, '_blank')
                      if (newWindow) {
                        newWindow.focus() // 確保新分頁獲得焦點
                        // 將當前頁面完整重新載入到首頁（像 F5 一樣），確保組件完全卸載並釋放攝影機資源
                        setTimeout(() => {
                          console.log('準備完整重新載入到首頁')
                          window.location.replace('/')
                        }, 1000) // 增加延遲時間，確保新分頁已打開
                      } else {
                        // 如果被阻擋，則在當前頁面完整重新載入結果頁面（像 F5 一樣）
                        console.warn('新分頁被阻擋，改為在當前頁面完整重新載入結果')
                        console.log('準備完整重新載入到:', resultUrl)
                        // 使用 replace 強制完整重新載入，繞過 Next.js 路由
                        window.location.replace(resultUrl)
                      }
                    }
                  } else {
                    onInterviewComplete(finalResult)
                  }
                }, 5000)
              }}
              className="px-4 py-2 rounded-lg text-white font-medium bg-gray-500 hover:bg-gray-600"
            >
              結束面試
            </button>
            
            {/* 錄製狀態指示 */}
            {recording.isRecording && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white rounded-lg text-sm">
                <span className="animate-pulse">●</span>
                錄製中
              </div>
            )}
            
            {recording.recordingError && (
              <div className="text-xs text-red-500 mt-1">
                {recording.recordingError}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                isAIResponding 
                  ? "AI面試官正在思考中..." 
                  : isWaitingForAnswer 
                  ? "請輸入您的回答..." 
                  : "請等待AI面試官的問題..."
              }
              disabled={!isWaitingForAnswer || isAIResponding}
              className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isWaitingForAnswer && !isAIResponding
                  ? 'border-gray-300' 
                  : 'border-gray-200 bg-gray-100 cursor-not-allowed'
              }`}
            />
            <button
              onClick={sendMessage}
              disabled={!userInput.trim() || !isWaitingForAnswer || isAIResponding}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg font-medium"
            >
              發送
            </button>
          </div>
          {/* 語音輸入狀態顯示 */}
          {isListening && (
            <div className="mt-2 text-sm text-green-600 text-center">
              🎤 正在聆聽您的回答...
              {silenceTimeoutRemaining && silenceTimeoutRemaining > 0 && (
                <div className="text-xs text-gray-500">
                  無音檢測倒數: {silenceTimeoutRemaining.toFixed(1)}秒
                </div>
              )}
            </div>
          )}
          {voiceMessage && isListening && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
              <div className="font-medium">語音轉錄:</div>
              <div>{voiceMessage}</div>
            </div>
          )}
          {isAIResponding && (
            <div className="mt-2 text-sm text-orange-600 text-center">
              AI面試官正在思考中，請稍候...
            </div>
          )}
          {isWaitingForAnswer && !isAIResponding && !isListening && (
            <div className="mt-2 text-sm text-blue-600 text-center">
              請回答AI面試官的問題（可使用語音或文字輸入）
            </div>
          )}
        </div>
      </div>

      {/* 右側：AI面試官模型 (1/3) */}
      <div className="w-1/3 bg-orange-100/50 relative overflow-hidden">
        <InterviewModelViewer modelType={modelType} />
        <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-2 rounded-lg text-sm z-10">
          AI面試官
        </div>
      </div>

      {/* 評分設定彈窗 */}
      <InterviewScoringSettings
        isOpen={showScoringSettings}
        onClose={() => setShowScoringSettings(false)}
        onSave={(criteria) => {
          scoringEngine.updatePassingCriteria(criteria)
          setShowScoringSettings(false)
        }}
      />

      {/* 回應時間分析彈窗 */}
      <ResponseTimeAnalysis
        isOpen={showResponseTimeAnalysis}
        onClose={() => setShowResponseTimeAnalysis(false)}
      />
    </div>
  )
}
