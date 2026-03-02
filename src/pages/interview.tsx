import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'
import { Form } from '@/components/form'
import MessageReceiver from '@/components/messageReceiver'
import { Introduction } from '@/components/introduction'
import { Menu } from '@/components/menu'
import { Meta } from '@/components/meta'
import ModalImage from '@/components/modalImage'
import VrmViewer from '@/components/vrmViewer'
import Live2DViewer from '@/components/live2DViewer'
import { Toasts } from '@/components/toasts'
import { WebSocketManager } from '@/components/websocketManager'
import CharacterPresetMenu from '@/components/characterPresetMenu'
import ImageOverlay from '@/components/ImageOverlay'
import dynamic from 'next/dynamic'
const PersonDetection = dynamic(
  () =>
    import('@/components/interview/PersonDetection').then(
      (m) => m.PersonDetection
    ),
  { ssr: false }
)
import { InterviewControls } from '@/components/interview/InterviewControls'
// import { InterviewQuestions } from '@/components/interview/InterviewQuestions'
import { InterviewResults } from '@/components/interview/InterviewResults'
import { InterviewInterface } from '@/components/interview/InterviewInterface'
import { ResumeUpload } from '@/components/interview/ResumeUpload'
import { useInterviewFlow } from '@/components/interview/hooks/useInterviewFlow'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import '@/lib/i18n'
import { buildUrl } from '@/utils/buildUrl'
import { YoutubeManager } from '@/components/youtubeManager'
import toastStore from '@/features/stores/toast'
import { ResumeInfo } from '@/lib/mcpClient'
import { supabase } from '@/lib/supabaseClient'

interface InterviewConfig {
  interview: any
  ai_interviewer: any
  questions: any[]
  evaluation_criteria: any[]
}

const Interview = () => {
  const router = useRouter()
  const { interview_id } = router.query
  const webcamStatus = homeStore((s) => s.webcamStatus)
  const captureStatus = homeStore((s) => s.captureStatus)
  const backgroundImageUrl = homeStore((s) => s.backgroundImageUrl)
  const useVideoAsBackground = settingsStore((s) => s.useVideoAsBackground)
  const bgUrl =
    (webcamStatus || captureStatus) && useVideoAsBackground
      ? ''
      : backgroundImageUrl === 'green'
        ? ''
        : `url(${buildUrl(backgroundImageUrl)})`
  const messageReceiverEnabled = settingsStore((s) => s.messageReceiverEnabled)
  const modelType = settingsStore((s) => s.modelType)
  const { t } = useTranslation()

  // 面試流程管理
  const interviewFlow = useInterviewFlow()
  const interviewFlowRef = useRef(interviewFlow)
  useEffect(() => {
    interviewFlowRef.current = interviewFlow
  }, [interviewFlow])
  
  // 履歷資料狀態
  const [resumeData, setResumeData] = useState<{
    info: ResumeInfo | null
    questions: string[]
    aiGreeting: string | null  // AI 預先生成的問候語
  }>({
    info: null,
    questions: [],
    aiGreeting: null,
  })

  // Interview配置狀態
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [restoredSession, setRestoredSession] = useState<any | null>(null)

  // 使用者偏好面試語言（來自 profiles.preferred_language）
  const [preferredInterviewLanguage, setPreferredInterviewLanguage] = useState<'zh-TW' | 'en-US' | 'ja-JP'>('zh-TW')

  // 處理履歷上傳完成
  const handleResumeProcessed = (resumeInfo: ResumeInfo, questions: string[], aiGreeting: string) => {
    setResumeData({
      info: resumeInfo,
      questions,
      aiGreeting,
    })
    
    toastStore.getState().addToast({
      message: '✓ 履歷分析完成！AI 面試官已準備好歡迎您',
      type: 'success',
      tag: 'resume-processed',
    })
  }
  
  // 面試設定（從 localStorage 讀取）
  const [enableRecording, setEnableRecording] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('interview_enableRecording')
      return saved === 'true'
    }
    return false
  })

  // 載入interview配置
  useEffect(() => {
    const loadInterviewConfig = async () => {
      if (!interview_id || typeof interview_id !== 'string') return
      
      setLoadingConfig(true)
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        const authUserId = session.session?.user?.id
        if (!token || !authUserId) {
          toastStore.getState().addToast({
            message: '請先登入',
            type: 'error',
          })
          return
        }

        // 1) 載入面試配置
        const response = await fetch(`/api/interviews/get?interview_id=${interview_id}`, {
          headers: { 'x-supabase-token': token }
        })
        
        if (!response.ok) {
          const error = await response.json()
          toastStore.getState().addToast({
            message: error?.message || `載入面試配置失敗: ${error.error || '未知錯誤'}`,
            type: 'error',
          })
          // 若被 gate 擋下，做導頁（避免停在空白面試頁）
          if (error?.error === 'MFA_REQUIRED') {
            window.location.href = '/mfa/setup'
            return
          }
          if (error?.error === 'FREE_QUOTA_EXCEEDED') {
            window.location.href = '/me?tab=interviews'
            return
          }
          return
        }

        const data = await response.json()
        
        // 1.5) 開始面試扣點（server-side）
        const startResp = await fetch('/api/interviews/start-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-supabase-token': token },
          body: JSON.stringify({ interviews_id: interview_id }),
        })
        if (!startResp.ok) {
          const err = await startResp.json().catch(() => ({}))
          toastStore.getState().addToast({
            message: err?.message || '開始面試失敗',
            type: 'error',
          })
          if (err?.error === 'MFA_REQUIRED') {
            window.location.href = '/mfa/setup'
            return
          }
          if (err?.error === 'FREE_QUOTA_EXCEEDED') {
            window.location.href = '/me?tab=interviews'
            return
          }
          if (err?.error === 'INTERVIEW_NOT_STARTABLE') {
            window.location.href = '/me?tab=interviews'
            return
          }
          return
        }

        // 1.6) 重連/續接：讀取 session，若有進度則直接切到 interviewing
        try {
          const sessResp = await fetch(`/api/interviews/get-session?interview_id=${encodeURIComponent(interview_id)}`, {
            headers: { 'x-supabase-token': token },
          })
          if (sessResp.ok) {
            const sj = await sessResp.json().catch(() => ({}))
            const s = sj?.session || null
            setRestoredSession(s)
            const hasResumeData =
              !!s?.progress_state ||
              (Array.isArray(s?.interview_transcript) && s.interview_transcript.length > 0)
            if (hasResumeData) {
              interviewFlowRef.current.startInterviewManually()
            }
          }
        } catch {
          // ignore
        }

        setInterviewConfig(data)

        // 2) 讀取目前登入使用者的 profiles.preferred_language，作為面試偏好語言
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('preferred_language')
            .eq('auth_id', authUserId)
            .single()

          if (!profileError && profile?.preferred_language) {
            const lang = profile.preferred_language as 'zh-TW' | 'en-US' | 'ja-JP'
            setPreferredInterviewLanguage(lang)
            console.log('[Interview] Loaded preferred interview language from profile:', lang)
          } else {
            console.log('[Interview] No preferred_language found in profile, using default zh-TW')
          }
        } catch (e) {
          console.warn('[Interview] Failed to load preferred_language from profiles:', e)
        }
        
        // 如果有AI面試官配置，更新model設定
        if (data.ai_interviewer?.model_name) {
          const isVrm = data.ai_interviewer.model_name.includes('.vrm') || data.ai_interviewer.model_name.includes('vrm')
          const newModelType = isVrm ? 'vrm' : 'live2d'
          const currentModelType = settingsStore.getState().modelType
          
          // 只在需要時更新model類型，避免不必要的重新渲染
          if (currentModelType !== newModelType) {
            settingsStore.setState({ modelType: newModelType })
          }
          
          // 如果是VRM模型，設置模型路徑
          if (isVrm && data.ai_interviewer.model_name) {
            // 從model_name構造路徑，例如 'yuki.vrm' -> '/vrm/yuki.vrm'
            const vrmPath = data.ai_interviewer.model_name.startsWith('/') 
              ? data.ai_interviewer.model_name 
              : `/vrm/${data.ai_interviewer.model_name}`
            const currentVrmPath = settingsStore.getState().selectedVrmPath
            
            // 只在路徑不同時更新，避免不必要的重新渲染
            if (currentVrmPath !== vrmPath) {
              settingsStore.setState({ selectedVrmPath: vrmPath })
            }
          }
        }
        
        if (data.ai_interviewer?.model_config) {
          // 可以將model_config應用到settings
          const config = data.ai_interviewer.model_config
          if (config.temperature !== undefined) {
            const currentTemp = settingsStore.getState().temperature
            if (currentTemp !== config.temperature) {
              settingsStore.setState({ temperature: config.temperature })
            }
          }
        }
      } catch (error) {
        console.error('Load interview config error:', error)
        toastStore.getState().addToast({
          message: '載入面試配置時發生錯誤',
          type: 'error',
        })
      } finally {
        setLoadingConfig(false)
      }
    }

    loadInterviewConfig()
  }, [interview_id])

  // 監聽 localStorage 變化
  useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('interview_enableRecording')
        setEnableRecording(saved === 'true')
      }
    }

    // 監聽自定義事件（從 InterviewControls 觸發）
    window.addEventListener('interviewSettingsChanged', handleStorageChange)
    
    return () => {
      window.removeEventListener('interviewSettingsChanged', handleStorageChange)
    }
  }, [])

  const characterPresets = [
    {
      key: 'characterPreset1',
      value: settingsStore((s) => s.characterPreset1),
    },
    {
      key: 'characterPreset2',
      value: settingsStore((s) => s.characterPreset2),
    },
    {
      key: 'characterPreset3',
      value: settingsStore((s) => s.characterPreset3),
    },
    {
      key: 'characterPreset4',
      value: settingsStore((s) => s.characterPreset4),
    },
    {
      key: 'characterPreset5',
      value: settingsStore((s) => s.characterPreset5),
    },
  ]

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
        // shiftキーを押しながら数字キーを押すためのマッピング
        const keyMap: { [key: string]: number } = {
          Digit1: 1,
          Digit2: 2,
          Digit3: 3,
          Digit4: 4,
          Digit5: 5,
        }

        const keyNumber = keyMap[event.code]

        if (keyNumber) {
          settingsStore.setState({
            systemPrompt: characterPresets[keyNumber - 1].value,
          })
          toastStore.getState().addToast({
            message: t('Toasts.PresetSwitching', {
              presetName: t(`Characterpreset${keyNumber}`),
            }),
            type: 'info',
            tag: `character-preset-switching`,
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [characterPresets, t])

  const backgroundStyle =
    (webcamStatus || captureStatus) && useVideoAsBackground
      ? {}
      : backgroundImageUrl === 'green'
        ? { backgroundColor: '#00FF00' }
        : { backgroundImage: bgUrl }

  return (
    <div className="h-[100svh] bg-cover" style={backgroundStyle}>
      <Meta />
      <Introduction />

      {/* 面試模式：顯示人員檢測 */}
      {interviewFlow.interviewStatus === 'waiting' ||
      interviewFlow.interviewStatus === 'detecting' ||
      interviewFlow.interviewStatus === 'ready' ? (
        <div className="absolute inset-0 z-50">
          <div className="absolute top-4 left-4 bg-red-500 text-white p-2 rounded z-[60]">
            面試模式已啟動 - 狀態: {interviewFlow.interviewStatus}
          </div>
          <PersonDetection
            onPersonDetected={interviewFlow.handlePersonDetected}
            onDetectionError={interviewFlow.handleDetectionError}
            onStartInterview={interviewFlow.startInterviewManually}
          />

          {/* 履歷上傳組件 */}
          <div className="absolute top-4 right-4 z-[60]" style={{ maxWidth: '420px' }}>
            <ResumeUpload onResumeProcessed={handleResumeProcessed} />
          </div>

          {/* 面試控制面板 */}
          <div className="absolute top-20 left-4 z-[60]">
            <InterviewControls />
          </div>
        </div>
      ) : interviewFlow.interviewStatus === 'interviewing' ? (
        /* 面試進行中：顯示新的面試界面 */
        loadingConfig ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-50">
            <div className="text-lg">載入面試配置中...</div>
          </div>
        ) : (
          <InterviewInterface
            onInterviewComplete={(result) => {
              interviewFlow.completeInterview(result)
            }}
            enableRecording={enableRecording}
            initialGreeting={resumeData.aiGreeting || undefined}
            interviewConfig={interviewConfig}
            interviewId={typeof interview_id === 'string' ? interview_id : undefined}
            restoredSession={restoredSession}
            resultNotificationMethod={
              (interviewConfig?.interview?.job_opening?.result_notification_method as 'immediate' | 'later' | undefined) || 'immediate'
            }
            preferredLanguage={preferredInterviewLanguage}
          />
        )
      ) : interviewFlow.interviewStatus === 'completed' || interviewFlow.showResults ? (
        /* 顯示面試結果 */
        <InterviewResults
          answers={interviewFlow.answers}
          interviewResult={interviewFlow.interviewResult}
          onRestart={interviewFlow.restartInterview}
          onExit={interviewFlow.exitInterview}
        />
      ) : (
        /* 正常模式：顯示原有的組件 */
        <>
          {modelType === 'vrm' ? <VrmViewer /> : <Live2DViewer />}
          <Form />
          <Menu />
          <ModalImage />
          {messageReceiverEnabled && <MessageReceiver />}
          <Toasts />
          <WebSocketManager />
          <YoutubeManager />
          <CharacterPresetMenu />
          <ImageOverlay />
        </>
      )}
    </div>
  )
}

export default Interview
