import React, { useState, useRef, useEffect, useCallback } from 'react'
import { InterviewModelViewer } from '@/components/interview/InterviewModelViewer'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { getInterviewAIResponse, getInterviewAIResponseStream } from '@/features/chat/interviewAIChat'
import { Message } from '@/features/messages/messages'
import { useInterviewVoiceRecognition } from '@/hooks/useInterviewVoiceRecognition'
import { InterviewScoringEngine } from '@/features/interview/interviewScoring'
import { InterviewScoringSettings } from '@/components/interview/InterviewScoringSettings'
import { ScoringCriteria, AnswerScore, DEFAULT_SCORING_CRITERIA } from '@/types/interviewScoring'
import { useInterviewRecording } from '@/hooks/useInterviewRecording'

// 直接在組件內定義面試問題
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

// AI面試官的提示詞
const INTERVIEW_PROMPT = `你是一位專業的AI面試官，負責進行面試。請遵循以下規則：

1. 保持專業、友善的語調
2. 根據面試者的回答給予適當的回饋
3. 如果面試者的回答太簡短，可以追問更多細節
4. 如果面試者的回答偏離主題，可以溫和地引導回正題
5. 保持面試的專業性和結構性

當前面試階段：{currentStage}
面試者回答：{userAnswer}

請根據面試者的回答給予適當的回饋，然後提出下一個問題或結束面試。`

interface ChatMessage {
  id: string
  type: 'ai' | 'user'
  content: string
  timestamp: Date
}

interface InterviewInterfaceProps {
  onInterviewComplete: (result?: any) => void
  enableRecording?: boolean
}

export const InterviewInterface: React.FC<InterviewInterfaceProps> = ({
  onInterviewComplete,
  enableRecording = false,
}) => {
  const modelType = settingsStore((s) => s.modelType)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isWaitingForAnswer, setIsWaitingForAnswer] = useState(false)
  const [isAIResponding, setIsAIResponding] = useState(false)
  const [interviewLanguage, setInterviewLanguage] = useState('zh-TW') // 面試專用語言設定
  const videoRef = useRef<HTMLVideoElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  
  // 評分系統狀態
  const [scoringEngine] = useState(() => new InterviewScoringEngine(DEFAULT_SCORING_CRITERIA))
  const [answerScores, setAnswerScores] = useState<AnswerScore[]>([])
  const [showScoringSettings, setShowScoringSettings] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState<string>('')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)
  
  // 錄製功能
  const recording = useInterviewRecording({ enableRecording })
  
  // 使用 ref 儲存錄製控制，避免依賴問題
  const recordingRef = useRef(recording)
  recordingRef.current = recording
  
  // 使用 ref 來避免閉包問題
  const handleUserAnswerRef = useRef<(answer: string) => void>()

  // 滾動到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
    }, 100)
  }, [])

  // 添加AI訊息
  const addAIMessage = useCallback((content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content,
      timestamp: new Date(),
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
      
      // 調用AI API獲取回應，傳遞當前問題編號
      const aiResponse = await getInterviewAIResponse(conversationMessages, currentQuestionIndex + 1)
      
      if (aiResponse.text) {
        addAIMessage(aiResponse.text)
        
        // 情感標籤已包含在 aiResponse.emotion 中
        // 表情會在 TTS 播放時（model.speak()）自動應用，不需要在這裡手動設置
        if (aiResponse.emotion) {
          console.log(`🎭 面試AI情感標籤: ${aiResponse.emotion}（將在TTS播放時應用）`)
        }
        
        // 處理評分結果
        if (aiResponse.scoreResult) {
          setAnswerScores(prev => [...prev, aiResponse.scoreResult!])
          // 直接將已評分的結果添加到評分引擎
          scoringEngine.addScoredAnswer(aiResponse.scoreResult)
          // 增加問題索引
          setCurrentQuestionIndex(prev => prev + 1)
        }
        
        // 檢查是否為面試結束的回應
        const endKeywords = ['面試到此結束', '面試結束', '感謝你的參與', '我們的面試', '後續流程']
        const isInterviewEnding = endKeywords.some(keyword => aiResponse.text.includes(keyword))
        
        if (isInterviewEnding) {
          console.log('🎯 檢測到面試結束信號，準備生成最終結果...')
          console.log('🔍 當前錄製狀態:', recording.isRecording)
          
          // 先等待 3 秒讓 AI 最後的回覆完全顯示，再停止錄製
          setTimeout(() => {
            console.log('📹 準備停止錄製（AI 回覆已完整顯示）...')
            recording.stopRecording()
            console.log('📹 stopRecording() 已調用，等待處理完成...')
          }, 3000)
          
          // 總共等待 6 秒後再顯示結果頁面
          setTimeout(() => {
            const finalResult = scoringEngine.generateFinalResult('candidate-001')
            console.log('📊 最終面試結果:', finalResult)
            onInterviewComplete(finalResult)
          }, 6000) // 給更多時間：3秒顯示 + 3秒處理錄製
        } else {
          setIsWaitingForAnswer(true)
        }
      }
    } catch (error) {
      console.error('AI回應錯誤:', error)
      addAIMessage('抱歉，我遇到了一些技術問題。請稍後再試。')
      setIsWaitingForAnswer(true)
    } finally {
      setIsAIResponding(false)
    }
  }, [isAIResponding, messages, addAIMessage, onInterviewComplete, modelType])

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
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (error) {
      console.error('鏡頭初始化失敗:', error)
    }
  }, [])

  // 開始面試
  const startInterview = useCallback(async () => {
    const firstQuestion = INTERVIEW_QUESTIONS[0]
    setCurrentQuestionId(firstQuestion.id)
    setCurrentQuestionIndex(0)
    addAIMessage(firstQuestion.question)
    setIsWaitingForAnswer(true)
    
    // 初始表情會在首次 TTS 播放時自動應用（根據 AI 回應中的情感標籤）
    console.log('🎬 面試開始，等待 TTS 播放時應用表情')
    
    // 如果啟用錄製，開始錄製
    console.log('🎥 檢查錄製設定:', { enableRecording })
    if (enableRecording) {
      console.log('🎬 準備開始錄製...')
      setTimeout(() => {
        recording.startRecording()
      }, 1000) // 延遲 1 秒開始錄製，確保畫面已完全載入
    } else {
      console.log('⏸️ 錄製功能未啟用')
    }
  }, [addAIMessage, enableRecording, recording, modelType])

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
      console.log('🎬 InterviewInterface 組件初始化')
      // 初始化鏡頭
      initializeCamera()
      
      // 開始面試流程
      startInterview()
      
      // 標記為已初始化
      isInitializedRef.current = true
    }
  }, [initializeCamera, startInterview])

  // 組件卸載時的清理（使用獨立的 effect）
  useEffect(() => {
    return () => {
      console.log('🧹 InterviewInterface 組件真正卸載，檢查錄製狀態...')
      if (recordingRef.current.isRecording) {
        console.log('⚠️ 組件卸載時錄製仍在進行，強制停止錄製')
        recordingRef.current.stopRecording()
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
                      <div className="flex justify-between">
                        <span>內容完整性:</span>
                        <span className="font-medium">{scoreResult.scores.contentCompleteness}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>邏輯清晰度:</span>
                        <span className="font-medium">{scoreResult.scores.logicalClarity}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>專業深度:</span>
                        <span className="font-medium">{scoreResult.scores.professionalDepth}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>溝通表達:</span>
                        <span className="font-medium">{scoreResult.scores.communicationSkills}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>個人特質:</span>
                        <span className="font-medium">{scoreResult.scores.personalTraits}/10</span>
                      </div>
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
              onClick={() => {
                console.log('🎯 手動結束面試，準備生成最終結果...')
                console.log('🔍 當前錄製狀態:', recording.isRecording)
                
                // 等待 2 秒再停止錄製（給最後的對話時間錄製）
                setTimeout(() => {
                  console.log('📹 準備停止錄製...')
                  recording.stopRecording()
                  console.log('📹 stopRecording() 已調用，等待處理完成...')
                }, 2000)
                
                // 總共等待 5 秒後顯示結果
                setTimeout(() => {
                  const finalResult = scoringEngine.generateFinalResult('candidate-001')
                  console.log('📊 最終面試結果:', finalResult)
                  onInterviewComplete(finalResult)
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
    </div>
  )
}
