/**
 * 面試結果顯示測試
 * 在 VSCode PowerShell 終端執行：npm run dev
 * 然後在瀏覽器中測試面試功能
 */

// 測試面試結果傳遞
export function testInterviewResultFlow() {
  console.log('=== 面試結果流程測試 ===')
  
  // 模擬評分結果
  const mockInterviewResult = {
    candidateId: 'test-candidate-001',
    interviewDate: new Date(),
    totalQuestions: 3,
    answeredQuestions: 3,
    answerScores: [
      {
        answerId: 'a1',
        questionId: 'q1',
        questionText: '請介紹一下你自己',
        answerText: '我是張三，有5年開發經驗...',
        timestamp: new Date(),
        scores: {
          contentCompleteness: 8,
          logicalClarity: 7,
          professionalDepth: 6,
          communicationSkills: 8,
          personalTraits: 7
        },
        totalScore: 7.2,
        deductions: {
          contentCompleteness: [],
          logicalClarity: ['條理不清 (-2分)'],
          communicationSkills: []
        },
        additions: {
          professionalDepth: ['正確回答專業問題 (+2.5分)'],
          personalTraits: ['展現向上心 (+2.5分)']
        },
        aiFeedback: '很好的自我介紹'
      }
    ],
    finalScores: {
      contentCompleteness: 8,
      logicalClarity: 7,
      professionalDepth: 6,
      communicationSkills: 8,
      personalTraits: 7
    },
    totalScore: 7.2,
    isPassed: true,
    passingCriteria: {
      contentCompleteness: 7,
      logicalClarity: 7,
      professionalDepth: 6,
      communicationSkills: 7,
      personalTraits: 6
    },
    summary: {
      strengths: ['內容完整性表現優秀 (8.0分)', '溝通表達表現優秀 (8.0分)'],
      weaknesses: ['邏輯清晰度需要改進 (7.0分)'],
      recommendations: ['建議加強邏輯清晰度的訓練']
    }
  }
  
  console.log('模擬面試結果:', mockInterviewResult)
  console.log('是否合格:', mockInterviewResult.isPassed ? '✅ 合格' : '❌ 不合格')
  console.log('總分:', mockInterviewResult.totalScore)
  console.log('優勢:', mockInterviewResult.summary.strengths)
  console.log('需要改進:', mockInterviewResult.summary.weaknesses)
  
  console.log('\n=== 測試完成 ===')
  console.log('請在瀏覽器中測試面試功能，確認結果頁面能正確顯示評分信息')
}

// 如果直接執行此文件，運行測試
if (typeof window === 'undefined') {
  testInterviewResultFlow()
}

