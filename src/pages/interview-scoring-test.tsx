import React, { useState } from 'react'
import { InterviewScoringEngine } from '@/features/interview/interviewScoring'
import { AnswerScore, DEFAULT_SCORING_CRITERIA } from '@/types/interviewScoring'
import { generateMessageId } from '@/utils/messageUtils'

const InterviewScoringTest: React.FC = () => {
  const [scoringEngine] = useState(() => new InterviewScoringEngine(DEFAULT_SCORING_CRITERIA))
  const [testScores, setTestScores] = useState<AnswerScore[]>([])
  const [finalResult, setFinalResult] = useState<any>(null)

  // 測試數據模板
  const createTestScore = (
    questionNum: number,
    contentCompleteness: number,
    logicalClarity: number,
    professionalDepth: number,
    communicationSkills: number,
    personalTraits: number
  ): AnswerScore => {
    const totalScore = (contentCompleteness + logicalClarity + professionalDepth + communicationSkills + personalTraits) / 5
    
    return {
      answerId: generateMessageId(),
      questionId: `question-${questionNum}`,
      questionText: `測試問題 ${questionNum}`,
      answerText: `測試回答 ${questionNum}`,
      timestamp: new Date(),
      scores: {
        contentCompleteness,
        logicalClarity,
        professionalDepth,
        communicationSkills,
        personalTraits
      },
      totalScore,
      deductions: {
        contentCompleteness: [],
        logicalClarity: [],
        communicationSkills: []
      },
      additions: {
        professionalDepth: [],
        personalTraits: []
      },
      aiFeedback: `測試回饋 ${questionNum}`
    }
  }

  // 手動輸入分數
  const [manualScores, setManualScores] = useState([
    { questionNum: 1, contentCompleteness: 8, logicalClarity: 9, professionalDepth: 2, communicationSkills: 7, personalTraits: 2 },
    { questionNum: 2, contentCompleteness: 9, logicalClarity: 8, professionalDepth: 2, communicationSkills: 8, personalTraits: 2 },
    { questionNum: 3, contentCompleteness: 7, logicalClarity: 7, professionalDepth: 1, communicationSkills: 6, personalTraits: 1 }
  ])

  const updateManualScore = (questionNum: number, field: string, value: number) => {
    setManualScores(prev => prev.map(score => 
      score.questionNum === questionNum 
        ? { ...score, [field]: value }
        : score
    ))
  }

  const calculateTestResult = () => {
    // 清空之前的結果
    scoringEngine.clearScores()
    
    // 添加測試分數
    const scores = manualScores.map(score => 
      createTestScore(
        score.questionNum,
        score.contentCompleteness,
        score.logicalClarity,
        score.professionalDepth,
        score.communicationSkills,
        score.personalTraits
      )
    )
    
    setTestScores(scores)
    
    // 將分數添加到評分引擎
    scores.forEach(score => {
      scoringEngine.addScoredAnswer(score)
    })
    
    // 生成最終結果
    const result = scoringEngine.generateFinalResult('test-candidate')
    setFinalResult(result)
  }

  const resetTest = () => {
    setTestScores([])
    setFinalResult(null)
    scoringEngine.clearScores()
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">面試評分系統測試頁面</h1>
        
        {/* 說明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">評分規則說明</h2>
          <ul className="text-blue-700 space-y-1">
            <li>• <strong>內容完整性</strong>、<strong>邏輯清晰度</strong>、<strong>溝通表達</strong>：使用平均制 (各項分數總和 ÷ 問題數)</li>
            <li>• <strong>專業深度</strong>、<strong>個人特質</strong>：使用累加制 (各項分數直接相加，最高10分)</li>
            <li>• <strong>總分</strong>：五項分數的平均值</li>
          </ul>
        </div>

        {/* 手動輸入分數 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">手動輸入測試分數</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {manualScores.map((score, index) => (
              <div key={score.questionNum} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3">問題 {score.questionNum}</h3>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-600">內容完整性:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={score.contentCompleteness}
                      onChange={(e) => updateManualScore(score.questionNum, 'contentCompleteness', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-600">邏輯清晰度:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={score.logicalClarity}
                      onChange={(e) => updateManualScore(score.questionNum, 'logicalClarity', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-600">專業深度:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={score.professionalDepth}
                      onChange={(e) => updateManualScore(score.questionNum, 'professionalDepth', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-600">溝通表達:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={score.communicationSkills}
                      onChange={(e) => updateManualScore(score.questionNum, 'communicationSkills', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-600">個人特質:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={score.personalTraits}
                      onChange={(e) => updateManualScore(score.questionNum, 'personalTraits', parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-4 mt-6">
            <button
              onClick={calculateTestResult}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
            >
              計算結果
            </button>
            <button
              onClick={resetTest}
              className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium"
            >
              重置
            </button>
          </div>
        </div>

        {/* 測試結果 */}
        {testScores.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">測試分數詳情</h2>
            
            <div className="space-y-4">
              {testScores.map((score, index) => (
                <div key={score.answerId} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-700 mb-2">問題 {index + 1}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-gray-500">內容完整性</div>
                      <div className="font-medium">{score.scores.contentCompleteness}/10</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">邏輯清晰度</div>
                      <div className="font-medium">{score.scores.logicalClarity}/10</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">專業深度</div>
                      <div className="font-medium">{score.scores.professionalDepth}/10</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">溝通表達</div>
                      <div className="font-medium">{score.scores.communicationSkills}/10</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">個人特質</div>
                      <div className="font-medium">{score.scores.personalTraits}/10</div>
                    </div>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-gray-500">單題總分: </span>
                    <span className="font-bold text-blue-600">{score.totalScore.toFixed(1)}/10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 最終結果 */}
        {finalResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">最終評分結果</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 各項分數 */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">各項分數</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">內容完整性 (平均制):</span>
                    <span className="font-medium">{finalResult.finalScores.contentCompleteness.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">邏輯清晰度 (平均制):</span>
                    <span className="font-medium">{finalResult.finalScores.logicalClarity.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span className="text-blue-700">專業深度 (累加制):</span>
                    <span className="font-medium text-blue-700">{finalResult.finalScores.professionalDepth.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">溝通表達 (平均制):</span>
                    <span className="font-medium">{finalResult.finalScores.communicationSkills.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span className="text-blue-700">個人特質 (累加制):</span>
                    <span className="font-medium text-blue-700">{finalResult.finalScores.personalTraits.toFixed(1)}/10</span>
                  </div>
                </div>
              </div>
              
              {/* 統計信息 */}
              <div>
                <h3 className="font-medium text-gray-700 mb-3">統計信息</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">總問題數:</span>
                    <span className="font-medium">{finalResult.totalQuestions}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">已回答問題:</span>
                    <span className="font-medium">{finalResult.answeredQuestions}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span className="text-green-700">最終總分:</span>
                    <span className="font-bold text-green-700 text-lg">{finalResult.totalScore.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-gray-600">是否合格:</span>
                    <span className={`font-medium ${finalResult.isPassed ? 'text-green-600' : 'text-red-600'}`}>
                      {finalResult.isPassed ? '合格' : '不合格'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 計算說明 */}
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">計算說明</h4>
              <div className="text-sm text-yellow-700 space-y-1">
                <div>• 內容完整性: ({testScores.map(s => s.scores.contentCompleteness).join(' + ')}) ÷ {testScores.length} = {finalResult.finalScores.contentCompleteness.toFixed(1)}</div>
                <div>• 邏輯清晰度: ({testScores.map(s => s.scores.logicalClarity).join(' + ')}) ÷ {testScores.length} = {finalResult.finalScores.logicalClarity.toFixed(1)}</div>
                <div>• 專業深度: {testScores.map(s => s.scores.professionalDepth).join(' + ')} = {finalResult.finalScores.professionalDepth.toFixed(1)} (累加)</div>
                <div>• 溝通表達: ({testScores.map(s => s.scores.communicationSkills).join(' + ')}) ÷ {testScores.length} = {finalResult.finalScores.communicationSkills.toFixed(1)}</div>
                <div>• 個人特質: {testScores.map(s => s.scores.personalTraits).join(' + ')} = {finalResult.finalScores.personalTraits.toFixed(1)} (累加)</div>
                <div>• 最終總分: ({finalResult.finalScores.contentCompleteness.toFixed(1)} + {finalResult.finalScores.logicalClarity.toFixed(1)} + {finalResult.finalScores.professionalDepth.toFixed(1)} + {finalResult.finalScores.communicationSkills.toFixed(1)} + {finalResult.finalScores.personalTraits.toFixed(1)}) ÷ 5 = {finalResult.totalScore.toFixed(1)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default InterviewScoringTest
