import React, { useState, useEffect, useRef } from 'react'
import { InterviewResult, AnswerScore, ScoreLevel, getScoreLevel, SCORE_LEVEL_DESCRIPTIONS, SCORE_LEVEL_COLORS } from '@/types/interviewScoring'

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
  onRestart: () => void
  onExit: () => void
}

export const InterviewResults: React.FC<InterviewResultsProps> = ({
  answers = [],
  interviewResult,
  onRestart,
  onExit,
}) => {
  // 保存狀態
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const hasAutoSavedRef = useRef(false) // 使用 ref 追蹤是否已自動保存

  // 如果有評分結果，使用評分結果；否則使用傳統答案
  const hasScoringResult = !!interviewResult
  const totalQuestions = hasScoringResult ? interviewResult.totalQuestions : answers.length
  const completedAnswers = hasScoringResult ? interviewResult.answeredQuestions : answers.filter(
    (answer) => answer.answer.trim().length > 0
  ).length

  // 保存面試記錄
  const handleSaveRecord = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    setSaveMessage('')

    try {
      const recordData = {
        candidateId: `candidate-${Date.now()}`, // 可以改為實際的候選人ID
        interviewDate: new Date().toISOString(),
        totalQuestions,
        answeredQuestions: completedAnswers,
        answers: answers.map(a => ({
          question: a.question,
          answer: a.answer,
          timestamp: a.timestamp.toISOString(),
        })),
        interviewResult: interviewResult ? {
          ...interviewResult,
          interviewDate: interviewResult.interviewDate.toISOString(),
          answerScores: interviewResult.answerScores.map(score => ({
            ...score,
            timestamp: score.timestamp.toISOString(),
          })),
        } : undefined,
      }

      const response = await fetch('/api/save-interview-record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordData),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSaveStatus('success')
        setSaveMessage(`✅ 面試記錄已保存: ${result.fileName}`)
        console.log('面試記錄保存成功:', result)
      } else {
        throw new Error(result.message || '保存失敗')
      }
    } catch (error) {
      console.error('保存面試記錄失敗:', error)
      setSaveStatus('error')
      setSaveMessage(`❌ 保存失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      setIsSaving(false)
      // 3秒後清除訊息
      setTimeout(() => {
        setSaveStatus('idle')
        setSaveMessage('')
      }, 3000)
    }
  }

  // 自動保存功能 - 組件載入時自動保存一次
  useEffect(() => {
    // 使用 ref 確保即使在 React Strict Mode 下也只執行一次
    if (!hasAutoSavedRef.current && (answers.length > 0 || interviewResult)) {
      console.log('📝 自動保存面試記錄...')
      hasAutoSavedRef.current = true
      handleSaveRecord()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在組件首次載入時執行

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
              
              <div className="grid grid-cols-5 gap-4 mb-4">
                {Object.entries(interviewResult.finalScores).map(([key, score]) => {
                  const level = getScoreLevel(score)
                  const criteriaNames = {
                    contentCompleteness: '內容完整性',
                    logicalClarity: '邏輯清晰度',
                    professionalDepth: '專業深度',
                    communicationSkills: '溝通表達',
                    personalTraits: '個人特質'
                  }
                  
                  return (
                    <div key={key} className="text-center">
                      <div className={`text-lg font-bold ${SCORE_LEVEL_COLORS[level].split(' ')[0]}`}>
                        {score.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {criteriaNames[key as keyof typeof criteriaNames]}
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
                      <div className="flex justify-between col-span-2 border-t pt-2">
                        <span className="font-medium">總分:</span>
                        <span className="font-bold text-blue-600">{scoreResult.totalScore.toFixed(1)}/10</span>
                      </div>
                    </div>
                    
                    {/* 扣分和加分原因 */}
                    {(scoreResult.deductions.contentCompleteness.length > 0 || 
                      scoreResult.deductions.logicalClarity.length > 0 || 
                      scoreResult.deductions.communicationSkills.length > 0) && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-red-600 font-medium mb-1">扣分原因:</div>
                        <div className="text-xs text-red-600">
                          {[
                            ...scoreResult.deductions.contentCompleteness,
                            ...scoreResult.deductions.logicalClarity,
                            ...scoreResult.deductions.communicationSkills
                          ].join(', ')}
                        </div>
                      </div>
                    )}
                    
                    {(scoreResult.additions.professionalDepth.length > 0 || 
                      scoreResult.additions.personalTraits.length > 0) && (
                      <div className="mt-2">
                        <div className="text-xs text-green-600 font-medium mb-1">加分原因:</div>
                        <div className="text-xs text-green-600">
                          {[
                            ...scoreResult.additions.professionalDepth,
                            ...scoreResult.additions.personalTraits
                          ].join(', ')}
                        </div>
                      </div>
                    )}
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

        {/* 保存狀態提示 */}
        {saveMessage && (
          <div className={`mb-4 p-4 rounded-lg text-center font-medium ${
            saveStatus === 'success' 
              ? 'bg-green-100 text-green-800 border border-green-300' 
              : saveStatus === 'error'
              ? 'bg-red-100 text-red-800 border border-red-300'
              : ''
          }`}>
            {saveMessage}
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={handleSaveRecord}
            disabled={isSaving}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isSaving
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isSaving ? '保存中...' : '💾 保存面試記錄'}
          </button>
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
