import React, { useState } from 'react'

interface InterviewSettingsProps {
  isOpen: boolean
  onClose: () => void
  onSave: (settings: InterviewSettingsData) => void
}

export interface InterviewSettingsData {
  enablePersonDetection: boolean
  enableRecording: boolean
}

const DEFAULT_SETTINGS: InterviewSettingsData = {
  enablePersonDetection: true,
  enableRecording: false,
}

export const InterviewSettings: React.FC<InterviewSettingsProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  // 從 localStorage 讀取初始設定
  const [settings, setSettings] = useState<InterviewSettingsData>(() => {
    if (typeof window !== 'undefined') {
      const enablePersonDetection = localStorage.getItem('interview_enablePersonDetection')
      const enableRecording = localStorage.getItem('interview_enableRecording')
      
      return {
        enablePersonDetection: enablePersonDetection === 'true' || enablePersonDetection === null,
        enableRecording: enableRecording === 'true',
      }
    }
    return DEFAULT_SETTINGS
  })

  const handleSave = () => {
    onSave(settings)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-80">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">面試設置</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              💡 面試問題由 AI 根據對話動態生成，無需預設問題類別或數量。
            </p>
          </div>

          {/* 功能開關 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                啟用人員檢測
              </label>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    enablePersonDetection: !prev.enablePersonDetection,
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enablePersonDetection ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enablePersonDetection
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  🎥 錄製面試過程
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  將面試過程錄製為 MP4 視頻檔案
                </p>
              </div>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    enableRecording: !prev.enableRecording,
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableRecording ? 'bg-red-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableRecording
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-end gap-4 mt-8">
          <button
            onClick={onClose}
            className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            保存設置
          </button>
        </div>
      </div>
    </div>
  )
}
