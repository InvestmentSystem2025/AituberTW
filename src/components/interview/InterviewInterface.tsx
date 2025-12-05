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

/**
 * 備用的預設面試問題列表
 * 注意：如果 interviewConfig 中有提供問題（從資料庫），則會優先使用資料庫的問題
 * 只有在沒有資料庫問題時才會使用此備用列表
 * 
 * 面試時的 prompt 模板是從 @/features/chat/interviewPromptTemplates.ts 的 
 * INTERVIEW_PROMPT_TEMPLATES.SYSTEM_PROMPT 使用的，不會使用此處定義的問題作為 prompt
 */
const INTERVIEW_QUESTIONS = [
  {
    id: 'greeting',
    question: '你好，我是今天負責你面試的美女AI面試官。歡迎參加我們的面試！首先請你做個自我介紹。',
    category: 'greeting',
  },
  {
    id: 'self_intro',
    question: '很好，謝謝你的自我介紹。接下來請告訴我，你為什麼想要加入我們公司？',
    category: 'motivation',
  },
  {
    id: 'company_interest',
    question: '你對我們公司的產品或服務有什麼了解嗎？',
    category: 'company_knowledge',
  },
  {
    id: 'experience',
    question: '請分享一個你在過去工作中遇到的最大挑戰，以及你是如何解決的？',
    category: 'experience',
  },
  {
    id: 'skills',
    question: '你認為自己最大的優勢是什麼？請具體說明。',
    category: 'skills',
  },
  {
    id: 'teamwork',
    question: '請描述一次你與團隊合作的經驗，你在其中扮演什麼角色？',
    category: 'teamwork',
  },
  {
    id: 'future_goals',
    question: '你對未來3-5年的職業規劃是什麼？',
    category: 'career_goals',
  },
  {
    id: 'questions',
    question: '最後，你有什麼問題想要問我們公司的嗎？',
    category: 'candidate_questions',
  },
  {
    id: 'closing',
    question: '謝謝你的回答！我們的面試到此結束。我們會在3-5個工作天內通知你結果。祝你今天愉快！',
    category: 'closing',
  },
]

interface ChatMessage {
  id: string
  type: 'ai' | 'user'
  content: string
  timestamp: Date
  aiFeedback?: string
  aiAdditionsDetail?: string
  aiDeductionsDetail?: string
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
}

export const InterviewInterface: React.FC<InterviewInterfaceProps> = ({
  onInterviewComplete,
  enableRecording = false,
  initialGreeting,
  interviewConfig,
  interviewId,
  resultNotificationMethod = 'immediate',
}) => {
  const modelType = settingsStore((s) => s.modelType)
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesRef = useRef<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false)
  const [isAIResponding, setIsAIResponding] = useState(false)
  const [interviewLanguage, setInterviewLanguage] = useState('zh-TW') // 面試專用語言設定
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

  // 如果處理後的問題列表為空，則使用預設問題
  const formattedQuestions = processedQuestions.length > 0 ? processedQuestions : INTERVIEW_QUESTIONS

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
  
  // 面試開始時間記錄
  const interviewStartTimeRef = useRef<number>(Date.now())
  
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
  const saveInterviewSession = useCallback(async (finalResult: InterviewResult): Promise<'hired' | 'rejected' | 'pending' | undefined> => {
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
      formattedQuestions[currentQuestionIndex]?.category
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
      const questionsList = formattedQuestions.map(q => q.question)
      
      // 🔍 DEBUG: Client-side log（幫助偵錯）
      console.log('📋 即將發送問題列表到 AI:', questionsList)
      console.log('📊 當前對話歷史:', conversationMessages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 50) : '...'}`))
      console.log('📊 當前對話歷史長度:', conversationMessages.length)
      
      // 調用AI API獲取串流回應
      const stream = await getInterviewAIResponseStream(
        conversationMessages, 
        currentQuestionIndex + 1,
        questionsList,
        evaluationCriteria,
        trackingId // 傳遞追蹤 ID
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
      let buffer = ''
      let rawBuffer = '' // 用於累積原始內容（包含元數據）
      
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
          
          if (metadataMatch) {
            // 解析元數據
            try {
              const metadata = JSON.parse(metadataMatch[1])
              if (metadata.type === 'metadata') {
                finalEmotion = metadata.emotion || 'neutral'
                // 更新 TTS 隊列的情感標籤
                ttsQueueRef.current.currentEmotion = finalEmotion
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
                // 從 rawBuffer 中移除元數據標記（但 value 已經不包含元數據了）
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
          
          // 累積已經清理過的內容
          buffer += displayChunk
          
          if (buffer !== streamingContent) {
            // 計算新增的文本
            const newText = buffer.substring(streamingContent.length)
            streamingContent = buffer
            
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
        
        // 更新最終消息，包含評分信息
        if (finalScoreResult) {
          // 先更新「當前累積分數」，並保留這次更新後的快照
          let updatedScoresSnapshot: Record<string, number> | undefined
          setCurrentScores((prev) => {
            const next = applyScoreResultToCurrentScores(prev, finalScoreResult!)
            updatedScoresSnapshot = next
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
                    aiCurrentScores: updatedScoresSnapshot,
                    personality: finalScoreResult?.personality,
                  }
                : msg
            )
          )
          
          // 處理評分結果（供結果頁與統計使用）
          setAnswerScores(prev => [...prev, finalScoreResult!])
          scoringEngine.addScoredAnswer(finalScoreResult)
          setCurrentQuestionIndex(prev => prev + 1)
        }
        
        // 檢查是否為面試結束的回應
        const endKeywords = ['面試到此結束', '面試結束', '感謝你的參與', '我們的面試', '後續流程']
        const isInterviewEnding = endKeywords.some(keyword => streamingContent.includes(keyword))
        
        if (isInterviewEnding) {
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
  }, [isAIResponding, messages, addAIMessage, onInterviewComplete, scoringEngine, currentQuestionIndex, recording, interviewId, saveInterviewSession, formattedQuestions, stopCamera])

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
    
    // 如果啟用錄製，開始錄製
    if (enableRecording) {
      setTimeout(() => {
        recording.startRecording()
      }, 1000) // 延遲 1 秒開始錄製，確保畫面已完全載入
    }

    // 如果有預先生成的問候語，直接使用
    if (initialGreeting) {
      setCurrentQuestionIndex(0)
      setCurrentQuestionId(formattedQuestions[0]?.id || 'custom-greeting')
      setIsWaitingForAnswer(true)
      return
    }

    // 如果沒有 initialGreeting，觸發 AI 產生第一句話（打招呼和自我介紹）
    // 此時 messages 應該是空的，所以 AI 會根據 prompt 產生打招呼
    console.log('🚀 開始面試：initialGreeting =', initialGreeting, 'messages.length =', messages.length)
    
    if (messages.length === 0 && !initialGreeting) {
      console.log('✅ 觸發 AI 產生第一句話（打招呼）')
      setIsWaitingForAnswer(false) // 先不允許用戶輸入，等 AI 回應
      setIsAIResponding(true)
      
      try {
        const questionsList = formattedQuestions.length > 0 
          ? formattedQuestions.map(q => q.question)
          : []
        
        console.log('📋 問題列表 (將傳給 AI):', questionsList)
        console.log('📊 對話歷史長度:', 0)
        console.log('📊 evaluationCriteria 數量:', evaluationCriteria.length)
        
        // 調用 AI 產生第一句話（空對話歷史，AI 應該會產生打招呼）
        const stream = await getInterviewAIResponseStream(
          [], // 空的對話歷史，觸發打招呼
          0,  // questionIndex = 0（還未開始問問題）
          questionsList,
          evaluationCriteria
        )
        
        // 創建一個新的 AI 消息用於實時更新
        const streamingMessageId = `ai-streaming-${Date.now()}`
        let streamingContent = ''
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
        // buffer：純文字（已移除標籤與元數據），用於實際顯示
        let buffer = ''
        // rawBuffer：原始串流內容（包含元數據），只用來偵測與解析 [INTERVIEW_METADATA_*] 區塊
        let rawBuffer = ''
        
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            // ReadableStream<string> 返回的 value 已經是字符串
            // 先累積到 rawBuffer，用於解析元數據
            rawBuffer += value
            
            // 檢查是否包含元數據標記
            const metadataRegex = /\[INTERVIEW_METADATA_START\]([\s\S]*?)\[INTERVIEW_METADATA_END\]/
            const metadataMatch = rawBuffer.match(metadataRegex)
            
            if (metadataMatch) {
              // 解析元數據
              try {
                const metadata = JSON.parse(metadataMatch[1])
                if (metadata.type === 'metadata') {
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
                  // 移除元數據標記
                  rawBuffer = rawBuffer.replace(metadataRegex, '')
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
            
            // 累積已經清理過的內容
            buffer += displayChunk
            
            if (buffer !== streamingContent) {
              // 計算新增的文本
              const newText = buffer.substring(streamingContent.length)
              streamingContent = buffer
              
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
              // 注意：這裡需要從元數據中獲取 emotion，如果還沒有則使用 neutral
              if (newText.length > 0) {
                processTTSQueue(newText, 'neutral') // 初始問候語使用 neutral
              }
            }
          }
          
          console.log('✅ AI 回應:', streamingContent.substring(0, 100) + '...')
          
          // 串流結束後，處理剩餘的 TTS 文本
          flushTTSQueue()
          
          if (streamingContent.trim()) {
            // 更新最終消息，包含評分信息
            if (finalScoreResult) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === streamingMessageId
                    ? {
                        ...msg,
                        content: streamingContent,
                        aiFeedback: finalScoreResult?.aiFeedback,
                        aiAdditionsDetail: finalScoreResult?.additionsDetail,
                        aiDeductionsDetail: finalScoreResult?.deductionsDetail,
                      }
                    : msg
                )
              )
            }
            setIsWaitingForAnswer(true)
          } else {
            // 如果沒有回應，使用預設問候語
            console.warn('⚠️ AI 沒有返回回應，使用預設問候語')
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId
                  ? { ...msg, content: '你好，我是今天的AI面試官，很高興見到你！首先請你做個簡短的自我介紹。' }
                  : msg
              )
            )
            setIsWaitingForAnswer(true)
          }
        } catch (streamError) {
          console.error('讀取串流錯誤:', streamError)
          // 如果失敗，使用預設問候語
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMessageId
                ? { ...msg, content: '你好，我是今天的AI面試官，很高興見到你！首先請你做個簡短的自我介紹。' }
                : msg
            )
          )
          setIsWaitingForAnswer(true)
        } finally {
          reader.releaseLock()
        }
      } catch (error) {
        console.error('❌ AI回應錯誤:', error)
        // 如果失敗，使用預設問候語
        addAIMessage('你好，我是今天的AI面試官，很高興見到你！首先請你做個簡短的自我介紹。')
        setIsWaitingForAnswer(true)
      } finally {
        setIsAIResponding(false)
      }
    } else {
      console.log('⚠️ 跳過 AI 打招呼：initialGreeting =', initialGreeting, 'messages.length =', messages.length)
    }
  }, [initialGreeting, formattedQuestions, addAIMessage, enableRecording, recording, messages.length, evaluationCriteria])

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
                onClick={() => setShowScoringSettings(true)}
                className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-sm transition-colors"
              >
                評分設定
              </button>
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
            // 查找對應的評分結果
            const scoreResult = answerScores.find(score => 
              score.questionText === message.content || 
              (message.type === 'user' && answerScores[index - 1])
            )
            
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
                
                  {/* 顯示評分結果 */}
                {scoreResult && message.type === 'ai' && (
                  <div className="mt-2 ml-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="text-sm font-medium text-yellow-800 mb-2">📊 評分結果</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(scoreResult.scores).map(([key, score]) => {
                        // 查找評估項目的顯示名稱
                        const criteria = evaluationCriteria.find((c: any) => c.key === key)
                        const displayName = criteria?.display_name || key
                        const maxScore = criteria?.max_score || 10
                        
                        return (
                          <div key={key} className="flex justify-between">
                            <span>{displayName}:</span>
                            <span className="font-medium">{score.toFixed(1)}/{maxScore}</span>
                          </div>
                        )
                      })}
                      <div className="flex justify-between col-span-2 border-t pt-1">
                        <span className="font-medium">總分:</span>
                        <span className="font-bold text-blue-600">{scoreResult.totalScore.toFixed(1)}/10</span>
                      </div>
                    </div>
                  </div>
                )}
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
                // 等待 2 秒再停止錄製（給最後的對話時間錄製）
                setTimeout(() => {
                  recording.stopRecording()
                }, 2000)
                
                // 總共等待 5 秒後顯示結果
                setTimeout(async () => {
                  const finalResult = scoringEngine.generateFinalResult('candidate-001')
                  // 保存到資料庫並讀取DB決策
                  if (interviewId) {
                    const outcome = await saveInterviewSession(finalResult)
                    if (outcome) {
                      finalResult.isPassed = outcome === 'hired'
                    }
                  }
                  // 停止攝像機
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
