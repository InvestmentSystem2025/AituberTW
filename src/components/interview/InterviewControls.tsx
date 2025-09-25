import React, { useState } from 'react'
import { useInterviewFlow } from './hooks/useInterviewFlow'
import { InterviewSettings, InterviewSettingsData } from './InterviewSettings'

interface InterviewControlsProps {
  className?: string
}

export const InterviewControls: React.FC<InterviewControlsProps> = ({
  className = '',
}) => {
  const interviewFlow = useInterviewFlow()
  const [showSettings, setShowSettings] = useState(false)

  const handleSettingsSave = (settings: InterviewSettingsData) => {
    console.log('面試設置已保存:', settings)
    // 這裡可以將設置保存到 store 或 localStorage
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 面試狀態指示器 */}
      <div className="bg-black/70 text-white px-4 py-3 rounded-lg">
        <div className="text-lg font-semibold mb-2">面試狀態</div>
        <div className="text-sm">
          {interviewFlow.interviewStatus === 'waiting' && '等待開始...'}
          {interviewFlow.interviewStatus === 'detecting' && '檢測人員中...'}
          {interviewFlow.interviewStatus === 'ready' && '準備就緒，請保持位置'}
          {interviewFlow.interviewStatus === 'interviewing' && '面試進行中'}
        </div>
        {interviewFlow.isPersonDetected && (
          <div className="text-xs mt-1 text-green-400">
            檢測信心度: {(interviewFlow.detectionConfidence * 100).toFixed(1)}%
          </div>
        )}
      </div>

      {/* 控制按鈕 */}
      <div className="space-y-2">
        <button
          onClick={interviewFlow.startInterviewManually}
          className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
        >
          手動開始面試
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
        >
          面試設置
        </button>
        <button
          onClick={interviewFlow.resetInterview}
          className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          重置面試
        </button>
      </div>

      {/* 面試進度指示器 */}
      {interviewFlow.interviewStarted && (
        <div className="bg-green-500/20 border border-green-500 text-green-400 px-4 py-3 rounded-lg">
          <div className="text-sm font-medium">面試已開始</div>
          <div className="text-xs mt-1">AI 助手正在等待您的回應</div>
        </div>
      )}

      {/* 面試設置彈窗 */}
      <InterviewSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={handleSettingsSave}
      />
    </div>
  )
}
