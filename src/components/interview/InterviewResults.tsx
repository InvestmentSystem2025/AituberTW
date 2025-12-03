import React from 'react'
import { InterviewResult, AnswerScore, ScoreLevel, getScoreLevel, SCORE_LEVEL_DESCRIPTIONS, SCORE_LEVEL_COLORS, PersonalitySummary } from '@/types/interviewScoring'

interface Answer {
  question: {
    id: string
    text: string
    category: string
    difficulty: string
  }
  answer: string
  timestamp: Date
}

interface InterviewResultsProps {
  answers?: Answer[]
  interviewResult?: InterviewResult
  personalitySummary?: PersonalitySummary
  onRestart: () => void
  onExit: () => void
}

export const InterviewResults: React.FC<InterviewResultsProps> = ({
  answers = [],
  interviewResult,
  personalitySummary,
  onRestart,
  onExit,
}) => {
  // 如果有評分結果，使用評分結果；否則使用傳統答案
  const hasScoringResult = !!interviewResult
  const totalQuestions = hasScoringResult ? interviewResult.totalQuestions : answers.length
  const completedAnswers = hasScoringResult ? interviewResult.answeredQuestions : answers.filter(
    (answer) => answer.answer.trim().length > 0
  ).length

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-600 bg-green-100'
      case 'medium':
        return 'text-yellow-600 bg-yellow-100'
      case 'hard':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getDifficultyText = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return '簡單'
      case 'medium':
        return '中等'
      case 'hard':
        return '困難'
      default:
        return '未知'
    }
  }

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-70">
      <div className="bg-white rounded-lg p-8 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 標題和統計 */}
        <div className="mb-8">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">面試結果</h1>
            {hasScoringResult && (
              <div className={`inline-flex items-center px-8 py-4 rounded-lg text-2xl font-bold ${
                interviewResult.isPassed 
                  ? 'bg-green-100 text-green-800 border-2 border-green-300' 
                  : 'bg-red-100 text-red-800 border-2 border-red-300'
              }`}>
                {interviewResult.isPassed ? '🎉 恭喜錄取！' : '❌ 未錄取'}
              </div>
            )}
          </div>
          
          {/* 評分結果統計 */}
          {hasScoringResult && (
            <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">評分總覽</h2>
                <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                  interviewResult.isPassed 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {interviewResult.isPassed ? '✅ 合格' : '❌ 不合格'}
                </div>
              </div>
              
              <div className={`grid gap-4 mb-4 ${Object.keys(interviewResult.finalScores).length <= 5 ? 'grid-cols-5' : 'grid-cols-3'}`}>
                {Object.entries(interviewResult.finalScores).map(([key, score]) => {
                  const level = getScoreLevel(score)
                  
                  // 嘗試從 answerScores 中查找評估項目的顯示名稱
                  // 或者使用預設名稱映射
                  const criteriaNames: Record<string, string> = {
                    contentCompleteness: '內容完整性',
                    logicalClarity: '邏輯清晰度',
                    professionalDepth: '專業深度',
                    communicationSkills: '溝通表達',
                    personalTraits: '個人特質'
                  }
                  
                  // 查找是否存在於 answerScores 中（可能包含更多信息）
                  let displayName = criteriaNames[key] || key
                  
                  // 如果 key 看起來像是 DB key（下劃線分隔），嘗試查找更友好的名稱
                  // 但由於我們現在已經使用 criteria.key，應該直接顯示即可
                  // 如果有需要，可以從其他地方獲取顯示名稱
                  
                  return (
                    <div key={key} className="text-center">
                      <div className={`text-lg font-bold ${SCORE_LEVEL_COLORS[level].split(' ')[0]}`}>
                        {score.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {displayName}
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-full ${SCORE_LEVEL_COLORS[level]}`}>
                        {SCORE_LEVEL_DESCRIPTIONS[level]}
                      </div>
                    </div>
                  )
                })}
              </div>
              
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {interviewResult.totalScore.toFixed(1)}/10
                </div>
                <div className="text-sm text-gray-600">總平均分數</div>
              </div>
            </div>
          )}

          {/* 人格分析結果 */}
          {personalitySummary && (
            <div className="mb-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">人格分析</h2>
              <div className="space-y-2 text-sm text-gray-700">
                {personalitySummary.extraversion && (
                  <div>
                    <span className="font-medium">外向傾向：</span>
                    <span>{personalitySummary.extraversion}</span>
                  </div>
                )}
                {personalitySummary.conscientiousness && (
                  <div>
                    <span className="font-medium">盡責程度：</span>
                    <span>{personalitySummary.conscientiousness}</span>
                  </div>
                )}
                {personalitySummary.detail_attentiveness && (
                  <div>
                    <span className="font-medium">細心程度：</span>
                    <span>{personalitySummary.detail_attentiveness}</span>
                  </div>
                )}
                {personalitySummary.summaryText && (
                  <div>
                    <span className="font-medium">整體總結：</span>
                    <span>{personalitySummary.summaryText}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">
                {totalQuestions}
              </div>
              <div className="text-sm text-gray-600">總問題數</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">
                {completedAnswers}
              </div>
              <div className="text-sm text-gray-600">已回答</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">
                {totalQuestions > 0
                  ? Math.round((completedAnswers / totalQuestions) * 100)
                  : 0}
                %
              </div>
              <div className="text-sm text-gray-600">完成率</div>
            </div>
          </div>
        </div>

        {/* 回答詳情 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">回答詳情</h2>
          <div className="space-y-6">
            {hasScoringResult ? (
              // 顯示評分結果
              interviewResult.answerScores.map((scoreResult, index) => (
                <div
                  key={`${scoreResult.answerId}-${index}-${scoreResult.timestamp.getTime()}`}
                  className="border border-gray-200 rounded-lg p-6"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-600">
                          問題 {index + 1}
                        </span>
                        <span className="text-xs text-gray-500">
                          {scoreResult.timestamp.toLocaleString('zh-TW')}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        {scoreResult.questionText}
                      </h3>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <div className="text-sm text-gray-600 mb-2">您的回答：</div>
                    <div className="text-gray-800 whitespace-pre-wrap">
                      {scoreResult.answerText}
                    </div>
                  </div>

                  {/* 評分詳情 */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-blue-800 mb-3">📊 評分詳情</div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {Object.entries(scoreResult.scores).map(([key, score]) => {
                        // 嘗試查找評估項目的顯示名稱
                        const criteriaNames: Record<string, string> = {
                          contentCompleteness: '內容完整性',
                          logicalClarity: '邏輯清晰度',
                          professionalDepth: '專業深度',
                          communicationSkills: '溝通表達',
                          personalTraits: '個人特質'
                        }
                        const displayName = criteriaNames[key] || key
                        
                        return (
                          <div key={key} className="flex justify-between">
                            <span>{displayName}:</span>
                            <span className="font-medium">{score.toFixed(1)}/10</span>
                          </div>
                        )
                      })}
                      <div className="flex justify-between col-span-2 border-t pt-2">
                        <span className="font-medium">總分:</span>
                        <span className="font-bold text-blue-600">{scoreResult.totalScore.toFixed(1)}/10</span>
                      </div>
                    </div>
                    
                    {/* 扣分和加分原因 */}
                    {(() => {
                      const allDeductions: string[] = []
                      Object.entries(scoreResult.deductions).forEach(([key, reasons]) => {
                        if (Array.isArray(reasons) && reasons.length > 0) {
                          allDeductions.push(...reasons)
                        }
                      })
                      
                      if (allDeductions.length > 0) {
                        return (
                          <div className="mt-3 pt-3 border-t">
                            <div className="text-xs text-red-600 font-medium mb-1">扣分原因:</div>
                            <div className="text-xs text-red-600">
                              {allDeductions.join(', ')}
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                    
                    {(() => {
                      const allAdditions: string[] = []
                      Object.entries(scoreResult.additions).forEach(([key, reasons]) => {
                        if (Array.isArray(reasons) && reasons.length > 0) {
                          allAdditions.push(...reasons)
                        }
                      })
                      
                      if (allAdditions.length > 0) {
                        return (
                          <div className="mt-2">
                            <div className="text-xs text-green-600 font-medium mb-1">加分原因:</div>
                            <div className="text-xs text-green-600">
                              {allAdditions.join(', ')}
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>
              ))
            ) : (
              // 顯示傳統答案
              answers.map((answer, index) => (
                <div
                  key={answer.question.id}
                  className="border border-gray-200 rounded-lg p-6"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-600">
                          問題 {index + 1}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(answer.question.difficulty)}`}
                        >
                          {getDifficultyText(answer.question.difficulty)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {answer.question.category}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">
                        {answer.question.text}
                      </h3>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 mb-2">您的回答：</div>
                    {answer.answer.trim() ? (
                      <div className="text-gray-800 whitespace-pre-wrap">
                        {answer.answer}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">未回答</div>
                    )}
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    回答時間: {answer.timestamp.toLocaleString('zh-TW')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 總結和建議 */}
        {hasScoringResult && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">總結和建議</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 優勢 */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-green-800 mb-3">✅ 優勢</h3>
                <ul className="text-sm text-green-700 space-y-1">
                  {interviewResult.summary.strengths.length > 0 ? (
                    interviewResult.summary.strengths.map((strength, index) => (
                      <li key={index} className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>{strength}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">暫無明顯優勢</li>
                  )}
                </ul>
              </div>

              {/* 需要改進 */}
              <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-orange-800 mb-3">⚠️ 需要改進</h3>
                <ul className="text-sm text-orange-700 space-y-1">
                  {interviewResult.summary.weaknesses.length > 0 ? (
                    interviewResult.summary.weaknesses.map((weakness, index) => (
                      <li key={index} className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>{weakness}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">表現良好</li>
                  )}
                </ul>
              </div>

              {/* 建議 */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-blue-800 mb-3">💡 建議</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  {interviewResult.summary.recommendations.length > 0 ? (
                    interviewResult.summary.recommendations.map((recommendation, index) => (
                      <li key={index} className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>{recommendation}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500">繼續保持現有表現</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={onRestart}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            🔄 重新開始面試
          </button>
          <button
            onClick={onExit}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            ❌ 結束面試
          </button>
        </div>
      </div>
    </div>
  )
}
