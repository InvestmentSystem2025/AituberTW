/**
 * 面試評分系統測試腳本
 * 在 VSCode PowerShell 終端執行：npm run test:scoring
 */

import { InterviewScoringEngine } from './interviewScoring'
import { DEFAULT_SCORING_CRITERIA } from '@/types/interviewScoring'

// 測試評分系統
export function testInterviewScoring() {
  console.log('=== 面試評分系統測試 ===')
  
  const scoringEngine = new InterviewScoringEngine(DEFAULT_SCORING_CRITERIA)
  
  // 測試案例1：優秀回答
  console.log('\n--- 測試案例1：優秀回答 ---')
  const excellentAnswer = scoringEngine.scoreAnswer(
    'q1',
    'q1',
    '請介紹一下你自己',
    '您好，我是張三，擁有5年的軟體開發經驗。我專精於前端開發，熟悉React、Vue等框架，也具備後端開發能力。我熱愛學習新技術，平時會閱讀技術書籍和參加線上課程來提升自己。我性格開朗外向，善於團隊合作，遇到困難時會堅持不懈地尋找解決方案。',
    '很好的自我介紹，展現了專業能力和個人特質。'
  )
  
  // 測試案例2：一般回答
  console.log('\n--- 測試案例2：一般回答 ---')
  const averageAnswer = scoringEngine.scoreAnswer(
    'q2',
    'q2',
    '你為什麼想要加入我們公司？',
    '嗯，因為你們公司很有名，然後我覺得工作環境應該不錯，所以想來試試看。',
    '回答較為簡短，建議提供更具體的動機。'
  )
  
  // 測試案例3：偏題回答
  console.log('\n--- 測試案例3：偏題回答 ---')
  const offTopicAnswer = scoringEngine.scoreAnswer(
    'q3',
    'q3',
    '請分享一個你解決技術問題的經驗',
    '我昨天去了一家新餐廳，食物很好吃，服務也很棒。我推薦大家去試試看。',
    '回答完全偏離了問題主題。'
  )
  
  // 生成最終結果
  console.log('\n--- 最終面試結果 ---')
  const finalResult = scoringEngine.generateFinalResult('test-candidate-001')
  
  console.log('總分:', finalResult.totalScore.toFixed(1))
  console.log('是否合格:', finalResult.isPassed ? '✅ 合格' : '❌ 不合格')
  console.log('優勢:', finalResult.summary.strengths)
  console.log('需要改進:', finalResult.summary.weaknesses)
  console.log('建議:', finalResult.summary.recommendations)
  
  console.log('\n=== 測試完成 ===')
}

// 如果直接執行此文件，運行測試
if (typeof window === 'undefined') {
  testInterviewScoring()
}
