import { useState, useEffect, useCallback, useRef } from 'react'
import { getVoiceLanguageCode } from '@/utils/voiceLanguage'
import settingsStore from '@/features/stores/settings'
import toastStore from '@/features/stores/toast'
import { useTranslation } from 'react-i18next'
import { useSilenceDetection } from './useSilenceDetection'

/**
 * 面試模式專用的語音識別 hook
 * 基於首頁的語音識別功能，但針對面試場景進行優化
 */
export const useInterviewVoiceRecognition = (
  onAnswerReceived: (text: string) => void,
  isWaitingForAnswer: boolean,
  isAIResponding: boolean,
  language: string = 'zh-TW'
) => {
  const { t } = useTranslation()
  const selectLanguage = settingsStore((s) => s.selectLanguage)
  const noSpeechTimeout = settingsStore((s) => s.noSpeechTimeout)

  // ----- 狀態管理 -----
  const [userMessage, setUserMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const isListeningRef = useRef(false)

  // ----- 語音識別相關 -----
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')
  const speechDetectedRef = useRef<boolean>(false)
  const recognitionStartTimeRef = useRef<number>(0)
  const initialSpeechCheckTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 使用 ref 來避免閉包問題
  const stopListeningRef = useRef<() => Promise<void>>()
  const startListeningRef = useRef<() => Promise<void>>()
  const isWaitingForAnswerRef = useRef(isWaitingForAnswer)
  const isAIRespondingRef = useRef(isAIResponding)

  // 穩定的無音檢測回調函數
  const onSilenceDetected = useCallback((text: string) => {
    // 在無音檢測中不直接發送，只是停止語音識別
    console.log('面試模式：無音檢測觸發，準備停止語音識別')
  }, [])

  // ----- 無音檢測 hook 使用 -----
  const {
    silenceTimeoutRemaining,
    clearSilenceDetection,
    startSilenceDetection,
    updateSpeechTimestamp,
    isSpeechEnded,
  } = useSilenceDetection({
    onTextDetected: onSilenceDetected,
    transcriptRef,
    setUserMessage,
    speechDetectedRef,
  })

  // ----- 初始語音檢測計時器清除函數 -----
  const clearInitialSpeechCheckTimer = useCallback(() => {
    if (initialSpeechCheckTimerRef.current) {
      clearTimeout(initialSpeechCheckTimerRef.current)
      initialSpeechCheckTimerRef.current = null
    }
  }, [])

  // ----- 語音識別停止處理 -----
  const stopListening = useCallback(async () => {
    // 清除各種計時器
    clearSilenceDetection()
    clearInitialSpeechCheckTimer()

    // 更新監聽狀態
    isListeningRef.current = false
    setIsListening(false)

    if (!recognition) return

    // 停止語音識別
    try {
      recognition.stop()
    } catch (error) {
      console.error('Error stopping recognition:', error)
    }

    // 如果有轉錄文本，則發送答案
    const trimmedTranscriptRef = transcriptRef.current.trim()
    if (trimmedTranscriptRef && isWaitingForAnswer && !isAIResponding) {
      onAnswerReceived(trimmedTranscriptRef)
      setUserMessage('')
    }
  }, [
    clearSilenceDetection,
    clearInitialSpeechCheckTimer,
    recognition,
    isWaitingForAnswer,
    isAIResponding,
    onAnswerReceived,
  ])

  // ----- 麥克風權限確認 -----
  const checkMicrophonePermission = useCallback(async (): Promise<boolean> => {
    // Firefox 的情況顯示錯誤訊息並結束
    if (navigator.userAgent.toLowerCase().includes('firefox')) {
      toastStore.getState().addToast({
        message: t('Toasts.FirefoxNotSupported'),
        type: 'error',
        tag: 'microphone-permission-error-firefox',
      })
      return false
    }

    try {
      // 直接調用 getUserMedia，顯示瀏覽器的原生許可模態框
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (error) {
      // 用戶明確拒絕或其他錯誤的情況
      console.error('Microphone permission error:', error)
      toastStore.getState().addToast({
        message: t('Toasts.MicrophonePermissionDenied'),
        type: 'error',
        tag: 'microphone-permission-error',
      })
      return false
    }
  }, [t])

  // ----- 語音識別開始處理 -----
  const startListening = useCallback(async () => {
    // 檢查是否正在等待回答
    if (!isWaitingForAnswer || isAIResponding) {
      console.log('面試模式：不在等待回答狀態，無法開始語音識別')
      return
    }

    const hasPermission = await checkMicrophonePermission()
    if (!hasPermission) return

    if (!recognition) return

    // 如果已經開始識別，先停止再重新開始
    if (isListeningRef.current) {
      try {
        recognition.stop()
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (err) {
        console.log('Recognition was not running, proceeding to start', err)
      }
    }

    // 重置轉錄
    transcriptRef.current = ''
    setUserMessage('')

    try {
      recognition.start()
      console.log('面試模式：語音識別開始成功')
      isListeningRef.current = true
      setIsListening(true)
    } catch (error) {
      console.error('Error starting recognition:', error)

      // InvalidStateError 的情況，視為已經開始
      if (error instanceof DOMException && error.name === 'InvalidStateError') {
        console.log('Recognition is already running, skipping retry')
        isListeningRef.current = true
        setIsListening(true)

        // 手動執行與 onstart 事件處理器相同的處理
        console.log('面試模式：語音識別開始（手動觸發）')
        recognitionStartTimeRef.current = Date.now()
        speechDetectedRef.current = false

        // 開始無音檢測
        startSilenceDetection(stopListening)
      } else {
        // 其他錯誤的情況才重試
        setTimeout(() => {
          try {
            if (recognition) {
              try {
                recognition.stop()
                setTimeout(() => {
                  recognition.start()
                  console.log('面試模式：語音識別重試開始')
                  isListeningRef.current = true
                  setIsListening(true)
                }, 100)
              } catch (stopError) {
                try {
                  recognition.start()
                  console.log('面試模式：語音識別重試開始（未停止）')
                  isListeningRef.current = true
                  setIsListening(true)
                } catch (startError) {
                  console.error('Failed to start recognition on retry:', startError)
                  isListeningRef.current = false
                  setIsListening(false)
                }
              }
            }
          } catch (retryError) {
            console.error('Failed to start recognition on retry:', retryError)
            isListeningRef.current = false
            setIsListening(false)
            return
          }
        }, 300)
      }
    }
  }, [recognition, checkMicrophonePermission, isWaitingForAnswer, isAIResponding])

  // ----- 語音識別切換處理 -----
  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening()
    } else {
      startListening()
    }
  }, [startListening, stopListening])

  // 更新 ref 的值
  useEffect(() => {
    stopListeningRef.current = stopListening
    startListeningRef.current = startListening
    isWaitingForAnswerRef.current = isWaitingForAnswer
    isAIRespondingRef.current = isAIResponding
  }, [stopListening, startListening, isWaitingForAnswer, isAIResponding])

  // ----- 語音識別對象的初始化和事件處理器設定 -----
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.error('Speech Recognition API is not supported in this browser')
      toastStore.getState().addToast({
        message: t('Toasts.SpeechRecognitionNotSupported'),
        type: 'error',
        tag: 'speech-recognition-not-supported',
      })
      return
    }

    const newRecognition = new SpeechRecognition()
    newRecognition.lang = language // 使用傳入的語言參數
    newRecognition.continuous = true
    newRecognition.interimResults = true

    // ----- 事件處理器的設定 -----

    // 語音識別開始時
    newRecognition.onstart = () => {
      console.log('面試模式：語音識別開始')
      recognitionStartTimeRef.current = Date.now()
      speechDetectedRef.current = false

      // 初始語音檢測計時器設定
      if (noSpeechTimeout > 0) {
        initialSpeechCheckTimerRef.current = setTimeout(() => {
          if (!speechDetectedRef.current && isListeningRef.current) {
            console.log(
              `⏱️ 面試模式：${noSpeechTimeout}秒間語音未檢測到。停止語音識別。`
            )
            stopListeningRef.current?.()
          }
        }, noSpeechTimeout * 1000)
      }

      // 開始無音檢測
      startSilenceDetection(stopListeningRef.current!)
    }

    // 語音輸入檢測時
    newRecognition.onspeechstart = () => {
      console.log('面試模式：檢測到語音輸入（onspeechstart）')
      updateSpeechTimestamp()
    }

    // 音量級別追蹤用變數
    let lastTranscriptLength = 0

    // 語音識別結果獲得時
    newRecognition.onresult = (event) => {
      if (!isListeningRef.current) return

      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')

      // 檢查是否有意義的變化
      const isSignificantChange =
        transcript.trim().length > lastTranscriptLength
      lastTranscriptLength = transcript.trim().length

      if (isSignificantChange) {
        console.log('面試模式：檢測到有意義的語音（轉錄變更有）')
        updateSpeechTimestamp()
        speechDetectedRef.current = true
      } else {
        console.log('面試模式：忽略背景噪音（轉錄無變更）')
      }

      transcriptRef.current = transcript
      setUserMessage(transcript)
    }

    // 語音輸入結束時
    newRecognition.onspeechend = () => {
      console.log('面試模式：語音輸入結束（onspeechend）。無音檢測計時器運行中。')
    }

    // 語音識別結束時
    newRecognition.onend = () => {
      console.log('面試模式：語音識別結束')
      clearSilenceDetection()
      clearInitialSpeechCheckTimer()

      // 如果 isListeningRef.current 為 true 則重新開始
      if (isListeningRef.current && isWaitingForAnswerRef.current && !isAIRespondingRef.current) {
        console.log('面試模式：重新開始語音識別...')
        setTimeout(() => {
          startListeningRef.current?.()
        }, 1000)
      }
    }

    // 語音識別錯誤時
    newRecognition.onerror = (event) => {
      console.error('面試模式：語音識別錯誤:', event.error)

      // no-speech 錯誤的情況
      if (event.error === 'no-speech' && isListeningRef.current) {
        console.log('面試模式：未檢測到語音，自動重新開始識別...')

        // 稍微延遲後重新開始
        setTimeout(() => {
          if (
            isListeningRef.current &&
            isWaitingForAnswerRef.current &&
            !isAIRespondingRef.current
          ) {
            try {
              try {
                newRecognition.stop()
                setTimeout(() => {
                  newRecognition.start()
                  console.log('面試模式：無語音超時後自動重新開始識別')
                }, 100)
              } catch (stopError) {
                newRecognition.start()
                console.log('面試模式：未停止直接重新開始識別')
              }
            } catch (restartError) {
              console.error('面試模式：無語音後重新開始失敗:', restartError)
              isListeningRef.current = false
              setIsListening(false)
            }
          } else {
            console.log('面試模式：跳過語音識別重新開始（不在等待回答狀態）')
          }
        }, 2000)
      } else {
        // 其他錯誤的情況執行通常的結束處理
        clearSilenceDetection()
        clearInitialSpeechCheckTimer()
        stopListeningRef.current?.()
      }
    }

    setRecognition(newRecognition)

    // 清理函數
    return () => {
      try {
        if (newRecognition) {
          newRecognition.onstart = null
          newRecognition.onspeechstart = null
          newRecognition.onresult = null
          newRecognition.onspeechend = null
          newRecognition.onend = null
          newRecognition.onerror = null
          newRecognition.abort()
        }
      } catch (error) {
        console.error('Error cleaning up speech recognition:', error)
      }
      clearSilenceDetection()
      clearInitialSpeechCheckTimer()
    }
  }, [
    language,
    t,
    clearSilenceDetection,
    clearInitialSpeechCheckTimer,
    startSilenceDetection,
    updateSpeechTimestamp,
    noSpeechTimeout,
  ])

  return {
    userMessage,
    isListening,
    silenceTimeoutRemaining,
    toggleListening,
    startListening,
    stopListening,
  }
}

