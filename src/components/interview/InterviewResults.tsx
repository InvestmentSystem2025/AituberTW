import React, { useEffect, useMemo, useState } from 'react'
import { InterviewResult, AnswerScore, ScoreLevel, getScoreLevel, SCORE_LEVEL_DESCRIPTIONS, SCORE_LEVEL_COLORS, PersonalitySummary } from '@/types/interviewScoring'
import { supabase } from '@/lib/supabaseClient'

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
  interviewId?: string
  onRestart: () => void
  onExit: () => void
}

export const InterviewResults: React.FC<InterviewResultsProps> = ({
  answers = [],
  interviewResult,
  personalitySummary,
  interviewId,
  onRestart,
  onExit,
}) => {
  // 如果有評分結果，使用評分結果；否則使用傳統答案
  const hasScoringResult = !!interviewResult
  const totalQuestions = hasScoringResult ? interviewResult.totalQuestions : answers.length
  const completedAnswers = hasScoringResult ? interviewResult.answeredQuestions : answers.filter(
    (answer) => answer.answer.trim().length > 0
  ).length

  // ======================
  // Jobseeker feedback form
  // ======================
  const ISSUE_OPTIONS = useMemo(
    () => [
      { key: 'audio_mic', label: '聲音/麥克風' },
      { key: 'latency', label: '延遲' },
      { key: 'freeze', label: '卡住' },
      { key: 'weird_questions', label: '題目怪' },
      { key: 'misjudge', label: '誤判' },
      { key: 'ui_unclear', label: 'UI 不清楚' },
      { key: 'repeated_questions', label: '重複詢問同樣問題' },
      { key: 'other', label: '其他' },
    ],
    []
  )

  const [fbLoading, setFbLoading] = useState(false)
  const [fbSaving, setFbSaving] = useState(false)
  const [fbError, setFbError] = useState<string | null>(null)
  const [fbSavedAt, setFbSavedAt] = useState<string | null>(null)

  const [ratings, setRatings] = useState({
    usability: 3,
    speed: 3,
    accuracy: 3,
    satisfaction: 3,
  })
  const [touched, setTouched] = useState({
    usability: false,
    speed: false,
    accuracy: false,
    satisfaction: false,
  })
  const [issueTypes, setIssueTypes] = useState<string[]>([])
  const [issueOtherText, setIssueOtherText] = useState('')
  const [comment, setComment] = useState('')

  useEffect(() => {
    let mounted = true
    const loadFeedback = async () => {
      if (!interviewId) return
      setFbLoading(true)
      setFbError(null)
      try {
        const { data: authData } = await supabase.auth.getSession()
        const authSession = authData.session
        if (!authSession) return

        const resp = await fetch(
          `/api/interviews/feedback/jobseeker?interview_id=${encodeURIComponent(interviewId)}`,
          { headers: { 'x-supabase-token': authSession.access_token } }
        )
        if (!resp.ok) return
        const body = await resp.json()
        const payload = body?.feedback?.payload
        if (!payload || typeof payload !== 'object') return

        if (!mounted) return
        const r = payload.ratings || {}
        setRatings({
          usability: Number(r.usability) || 3,
          speed: Number(r.speed) || 3,
          accuracy: Number(r.accuracy) || 3,
          satisfaction: Number(r.satisfaction) || 3,
        })
        setIssueTypes(Array.isArray(payload.issue_types) ? payload.issue_types : [])
        setIssueOtherText(typeof payload.issue_other_text === 'string' ? payload.issue_other_text : '')
        setComment(typeof payload.comment === 'string' ? payload.comment : '')
        setFbSavedAt(body?.feedback?.updated_at || body?.feedback?.created_at || null)
      } catch (e: any) {
        if (mounted) setFbError(e?.message || '載入回饋失敗')
      } finally {
        if (mounted) setFbLoading(false)
      }
    }
    void loadFeedback()
    return () => { mounted = false }
  }, [interviewId])

  const toggleIssueType = (key: string) => {
    setIssueTypes((prev) => {
      const set = new Set(prev)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      return Array.from(set)
    })
  }

  const submitFeedback = async () => {
    if (!interviewId) return
    setFbSaving(true)
    setFbError(null)
    try {
      const { data: authData } = await supabase.auth.getSession()
      const authSession = authData.session
      if (!authSession) throw new Error('Not authenticated')

      const resp = await fetch('/api/interviews/feedback/jobseeker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-supabase-token': authSession.access_token,
        },
        body: JSON.stringify({
          interview_id: interviewId,
          ratings,
          issue_types: issueTypes,
          issue_other_text: issueOtherText,
          comment,
          touched,
        }),
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(body?.error || '送出失敗')

      setFbSavedAt(body?.feedback?.updated_at || body?.feedback?.created_at || new Date().toISOString())
    } catch (e: any) {
      setFbError(e?.message || '送出回饋失敗')
    } finally {
      setFbSaving(false)
    }
  }

  const renderRating = (label: string, key: keyof typeof ratings) => {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="text-sm text-gray-700">{label}</div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <label key={v} className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
              <input
                type="radio"
                name={`rating-${String(key)}`}
                checked={ratings[key] === v}
                onChange={() => {
                  setRatings((prev) => ({ ...prev, [key]: v }))
                  setTouched((prev) => ({ ...prev, [key]: true }))
                }}
              />
              {v}
            </label>
          ))}
        </div>
      </div>
    )
  }

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
                {personalitySummary.proactivity && (
                  <div>
                    <span className="font-medium">主動性：</span>
                    <span>{personalitySummary.proactivity}</span>
                  </div>
                )}
                {personalitySummary.learning_mindset && (
                  <div>
                    <span className="font-medium">學習與成長心態：</span>
                    <span>{personalitySummary.learning_mindset}</span>
                  </div>
                )}
                {personalitySummary.stress_resilience && (
                  <div>
                    <span className="font-medium">抗壓與情緒穩定：</span>
                    <span>{personalitySummary.stress_resilience}</span>
                  </div>
                )}
                {personalitySummary.collaboration && (
                  <div>
                    <span className="font-medium">合作與溝通方式：</span>
                    <span>{personalitySummary.collaboration}</span>
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
                    <div className="text-sm font-medium text-blue-800 mb-3">📊 評分詳情（本題 delta）</div>
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
                        const s = Number(score) || 0
                        
                        return (
                          <div key={key} className="flex justify-between">
                            <span>{displayName}:</span>
                            <span className="font-medium">{`${s > 0 ? '+' : ''}${s.toFixed(1)}`}</span>
                          </div>
                        )
                      })}
                      <div className="flex justify-between col-span-2 border-t pt-2">
                        <span className="font-medium">本題淨變化:</span>
                        <span className="font-bold text-blue-600">
                          {(() => {
                            const sumDelta = Object.values(scoreResult.scores || {}).reduce((a, b) => a + (Number(b) || 0), 0)
                            return `${sumDelta > 0 ? '+' : ''}${sumDelta.toFixed(1)}`
                          })()}
                        </span>
                      </div>
                    </div>
                    
                    {/* 扣分和加分原因 */}
                    {(() => {
                      const allDeductions: string[] = []

                      // 優先顯示結構化事件
                      const items = (scoreResult as any).deductionItems
                      if (items && typeof items === 'object') {
                        Object.entries(items).forEach(([k, arr]) => {
                          if (!Array.isArray(arr)) return
                          arr.forEach((it: any) => {
                            const p = Number(it?.points) || 0
                            const d = String(it?.detail || '').trim()
                            allDeductions.push(d ? `${d} (-${p}分)` : `(-${p}分)`)
                          })
                        })
                      }

                      // fallback：舊字串原因
                      if (allDeductions.length === 0) {
                        Object.entries(scoreResult.deductions || {}).forEach(([_, reasons]) => {
                          if (Array.isArray(reasons) && reasons.length > 0) allDeductions.push(...reasons)
                        })
                      }
                      
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

                      const items = (scoreResult as any).additionItems
                      if (items && typeof items === 'object') {
                        Object.entries(items).forEach(([k, arr]) => {
                          if (!Array.isArray(arr)) return
                          arr.forEach((it: any) => {
                            const p = Number(it?.points) || 0
                            const d = String(it?.detail || '').trim()
                            allAdditions.push(d ? `${d} (+${p}分)` : `(+${p}分)`)
                          })
                        })
                      }

                      if (allAdditions.length === 0) {
                        Object.entries(scoreResult.additions || {}).forEach(([_, reasons]) => {
                          if (Array.isArray(reasons) && reasons.length > 0) allAdditions.push(...reasons)
                        })
                      }
                      
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

        {/* 回饋（jobseeker） */}
        {interviewId && (
          <div className="mb-8 border border-gray-200 rounded-lg p-6 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">使用者回饋</h2>
            <div className="text-sm text-gray-600 mb-4">
              你的回饋會用於改善題目品質、評分與系統體驗。
            </div>

            {fbError && <div className="text-sm text-red-600 mb-3">{fbError}</div>}
            {fbSavedAt && (
              <div className="text-xs text-green-700 mb-3">
                已提交（最後更新：{new Date(fbSavedAt).toLocaleString('zh-TW')}）
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-2">
              {renderRating('易用性', 'usability')}
              {renderRating('處理速度', 'speed')}
              {renderRating('判定準確度', 'accuracy')}
              {renderRating('滿意度', 'satisfaction')}
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-800 mb-2">遇到的問題類型（可複選）</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {ISSUE_OPTIONS.map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={issueTypes.includes(opt.key)}
                      onChange={() => toggleIssueType(opt.key)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {issueTypes.includes('other') && (
                <div className="mt-2">
                  <input
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="其他（請填寫）"
                    value={issueOtherText}
                    onChange={(e) => setIssueOtherText(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-800 mb-2">意見反饋（自由記述）</div>
              <textarea
                className="w-full min-h-[96px] px-3 py-2 border rounded-lg text-sm"
                placeholder="例如：題目方向、評分理由、UI 操作、希望新增的功能..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              {fbLoading && <div className="text-xs text-gray-500">載入中...</div>}
              <button
                type="button"
                disabled={fbSaving}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  fbSaving ? 'bg-gray-300 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                onClick={submitFeedback}
              >
                {fbSaving ? '送出中...' : '送出回饋'}
              </button>
            </div>
          </div>
        )}

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
