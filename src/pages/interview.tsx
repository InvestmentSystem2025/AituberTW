import { useEffect, useState } from 'react'
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

const Interview = () => {
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
        <InterviewInterface
          onInterviewComplete={(result) => {
            interviewFlow.completeInterview(result)
          }}
          enableRecording={enableRecording}
          initialGreeting={resumeData.aiGreeting || undefined}
        />
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
