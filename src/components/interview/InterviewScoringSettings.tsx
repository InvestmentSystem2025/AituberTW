import React, { useState } from 'react'
import { ScoringCriteria, DEFAULT_SCORING_CRITERIA } from '@/types/interviewScoring'

interface InterviewScoringSettingsProps {
  isOpen: boolean
  onClose: () => void
  onSave: (criteria: ScoringCriteria) => void
  initialCriteria?: ScoringCriteria
}

export const InterviewScoringSettings: React.FC<InterviewScoringSettingsProps> = ({
  isOpen,
  onClose,
  onSave,
  initialCriteria = DEFAULT_SCORING_CRITERIA
}) => {
  const [criteria, setCriteria] = useState<ScoringCriteria>(initialCriteria)

  const handleCriteriaChange = (key: keyof ScoringCriteria, value: number) => {
    setCriteria(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min(10, value))
    }))
  }

  const handleSave = () => {
    onSave(criteria)
    onClose()
  }

  const handleReset = () => {
    setCriteria(DEFAULT_SCORING_CRITERIA)
  }

  if (!isOpen) return null

  const criteriaLabels = {
    contentCompleteness: '內容完整性',
    logicalClarity: '邏輯清晰度',
    professionalDepth: '專業深度',
    communicationSkills: '溝通表達',
    personalTraits: '個人特質'
  }

  const criteriaDescriptions = {
    contentCompleteness: '回答是否涵蓋問題要點，避免答非所問',
    logicalClarity: '回答是否有條理、邏輯是否清楚',
    professionalDepth: '對相關領域的理解程度和專業知識',
    communicationSkills: '語言表達是否清晰、流暢',
    personalTraits: '展現的個性、價值觀和個人特質'
  }

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-80">
      <div className="bg-white rounded-lg p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">面試評分標準設定</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">評分說明</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• 每個評分維度滿分為10分，最低0分</p>
            <p>• 設定合格標準：面試者各項分數都需達到或超過設定標準才算合格</p>
            <p>• 內容完整性和邏輯清晰度採用扣分制（滿分10分）</p>
            <p>• 專業深度和個人特質採用加分制（從0分開始）</p>
            <p>• 溝通表達採用扣分制（滿分10分）</p>
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(criteriaLabels).map(([key, label]) => (
            <div key={key} className="border border-gray-200 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    {label}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {criteriaDescriptions[key as keyof typeof criteriaDescriptions]}
                  </p>
                </div>
                <div className="ml-4">
                  <div className="text-2xl font-bold text-blue-600">
                    {criteria[key as keyof ScoringCriteria]}
                  </div>
                  <div className="text-xs text-gray-500 text-center">合格標準</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600 w-16">0分</span>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={criteria[key as keyof ScoringCriteria]}
                    onChange={(e) => handleCriteriaChange(key as keyof ScoringCriteria, parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-sm text-gray-600 w-16 text-right">10分</span>
                </div>

                <div className="flex justify-between text-xs text-gray-500">
                  <span>不合格</span>
                  <span>合格</span>
                </div>
              </div>

              {/* 評分規則說明 */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-700">
                  {key === 'contentCompleteness' && (
                    <div>
                      <strong>扣分規則：</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>答非所問：-2分</li>
                        <li>回答不完整：-1分</li>
                      </ul>
                    </div>
                  )}
                  {key === 'logicalClarity' && (
                    <div>
                      <strong>扣分規則：</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>條理不清：-2分</li>
                        <li>邏輯錯誤：-2分</li>
                      </ul>
                    </div>
                  )}
                  {key === 'professionalDepth' && (
                    <div>
                      <strong>加分規則：</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>正確回答專業問題：+2.5分</li>
                        <li>展現深度理解：+1分</li>
                      </ul>
                    </div>
                  )}
                  {key === 'communicationSkills' && (
                    <div>
                      <strong>扣分規則：</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>表達不清晰：-2分</li>
                        <li>表達不流暢：-2分</li>
                      </ul>
                    </div>
                  )}
                  {key === 'personalTraits' && (
                    <div>
                      <strong>加分規則：</strong>
                      <ul className="mt-1 ml-4 list-disc">
                        <li>向上心、求知慾：+2.5分</li>
                        <li>持續學習：+2.5分</li>
                        <li>活潑外向：+2.5分</li>
                        <li>堅強抗壓：+2.5分</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-between mt-8">
          <button
            onClick={handleReset}
            className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
          >
            重置為預設值
          </button>
          <div className="flex gap-4">
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
              保存設定
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  )
}
