import React, { useState } from 'react'

interface InterviewSettingsProps {
  isOpen: boolean
  onClose: () => void
  onSave: (settings: InterviewSettingsData) => void
}

export interface InterviewSettingsData {
  questionCount: number
  timePerQuestion: number
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  categories: string[]
  enableTimer: boolean
  enablePersonDetection: boolean
}

const DEFAULT_SETTINGS: InterviewSettingsData = {
  questionCount: 5,
  timePerQuestion: 180,
  difficulty: 'mixed',
  categories: ['基本資訊', '動機', '問題解決', '自我評估', '溝通能力'],
  enableTimer: true,
  enablePersonDetection: true,
}

const AVAILABLE_CATEGORIES = [
  '基本資訊',
  '動機',
  '問題解決',
  '自我評估',
  '溝通能力',
  '技術能力',
  '團隊合作',
  '領導力',
  '創新思維',
  '壓力管理',
]

export const InterviewSettings: React.FC<InterviewSettingsProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [settings, setSettings] =
    useState<InterviewSettingsData>(DEFAULT_SETTINGS)

  const handleCategoryToggle = (category: string) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }))
  }

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
          {/* 問題數量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              問題數量
            </label>
            <select
              value={settings.questionCount}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  questionCount: parseInt(e.target.value),
                }))
              }
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={3}>3 題</option>
              <option value={5}>5 題</option>
              <option value={8}>8 題</option>
              <option value={10}>10 題</option>
            </select>
          </div>

          {/* 每題時間 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              每題回答時間（秒）
            </label>
            <select
              value={settings.timePerQuestion}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  timePerQuestion: parseInt(e.target.value),
                }))
              }
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={60}>1 分鐘</option>
              <option value={120}>2 分鐘</option>
              <option value={180}>3 分鐘</option>
              <option value={300}>5 分鐘</option>
            </select>
          </div>

          {/* 難度設置 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              問題難度
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'easy', label: '簡單' },
                { value: 'medium', label: '中等' },
                { value: 'hard', label: '困難' },
                { value: 'mixed', label: '混合' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      difficulty: value as any,
                    }))
                  }
                  className={`p-3 rounded-lg border transition-colors ${
                    settings.difficulty === value
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 問題類別 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              問題類別
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryToggle(category)}
                  className={`p-3 rounded-lg border transition-colors text-sm ${
                    settings.categories.includes(category)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* 功能開關 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                啟用計時器
              </label>
              <button
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    enableTimer: !prev.enableTimer,
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enableTimer ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enableTimer ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

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
