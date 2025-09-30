/**
 * 面試評分系統核心邏輯
 */

import { 
  ScoringCriteria, 
  AnswerScore, 
  InterviewResult, 
  DEFAULT_SCORING_CRITERIA,
  SCORING_RULES,
  ScoreLevel,
  getScoreLevel,
  SCORE_LEVEL_DESCRIPTIONS
} from '@/types/interviewScoring'

/**
 * 評分引擎類
 */
export class InterviewScoringEngine {
  private passingCriteria: ScoringCriteria
  private answerScores: AnswerScore[] = []

  constructor(passingCriteria: ScoringCriteria = DEFAULT_SCORING_CRITERIA) {
    this.passingCriteria = passingCriteria
  }

  /**
   * 評分單次回答
   */
  scoreAnswer(
    answerId: string,
    questionId: string,
    questionText: string,
    answerText: string,
    aiFeedback: string
  ): AnswerScore {
    const scores = this.calculateScores(questionText, answerText, aiFeedback)
    const totalScore = this.calculateTotalScore(scores)
    
    const answerScore: AnswerScore = {
      answerId,
      questionId,
      questionText,
      answerText,
      timestamp: new Date(),
      scores,
      totalScore,
      deductions: this.extractDeductions(answerText, aiFeedback),
      additions: this.extractAdditions(answerText, aiFeedback),
      aiFeedback
    }

    this.answerScores.push(answerScore)
    this.logScoreResult(answerScore)
    
    return answerScore
  }

  /**
   * 計算各項分數
   */
  private calculateScores(questionText: string, answerText: string, aiFeedback: string): ScoringCriteria {
    const scores: ScoringCriteria = {
      contentCompleteness: 10,
      logicalClarity: 10,
      professionalDepth: 0,
      communicationSkills: 10,
      personalTraits: 0
    }

    // 內容完整性評分 (扣分制)
    if (this.isOffTopic(questionText, answerText)) {
      scores.contentCompleteness -= SCORING_RULES.DEDUCTION_SYSTEM.contentCompleteness.offTopic
    }
    if (this.isIncomplete(answerText)) {
      scores.contentCompleteness -= SCORING_RULES.DEDUCTION_SYSTEM.contentCompleteness.incomplete
    }

    // 邏輯清晰度評分 (扣分制)
    if (this.isUnclear(answerText)) {
      scores.logicalClarity -= SCORING_RULES.DEDUCTION_SYSTEM.logicalClarity.unclear
    }
    if (this.isIllogical(answerText)) {
      scores.logicalClarity -= SCORING_RULES.DEDUCTION_SYSTEM.logicalClarity.illogical
    }

    // 專業深度評分 (加分制)
    if (this.hasCorrectProfessionalAnswer(questionText, answerText)) {
      scores.professionalDepth += SCORING_RULES.ADDITION_SYSTEM.professionalDepth.correctAnswer
    }
    if (this.hasDeepUnderstanding(answerText)) {
      scores.professionalDepth += SCORING_RULES.ADDITION_SYSTEM.professionalDepth.deepUnderstanding
    }

    // 溝通表達評分 (扣分制)
    if (this.isUnclearCommunication(answerText)) {
      scores.communicationSkills -= SCORING_RULES.DEDUCTION_SYSTEM.communicationSkills.unclear
    }
    if (this.isNotFluid(answerText)) {
      scores.communicationSkills -= SCORING_RULES.DEDUCTION_SYSTEM.communicationSkills.notFluid
    }

    // 個人特質評分 (加分制)
    if (this.hasUpwardMotivation(answerText)) {
      scores.personalTraits += SCORING_RULES.ADDITION_SYSTEM.personalTraits.upwardMotivation
    }
    if (this.hasContinuousLearning(answerText)) {
      scores.personalTraits += SCORING_RULES.ADDITION_SYSTEM.personalTraits.continuousLearning
    }
    if (this.hasOutgoingPersonality(answerText)) {
      scores.personalTraits += SCORING_RULES.ADDITION_SYSTEM.personalTraits.outgoingPersonality
    }
    if (this.hasResilience(answerText)) {
      scores.personalTraits += SCORING_RULES.ADDITION_SYSTEM.personalTraits.resilience
    }

    // 確保分數在合理範圍內
    scores.contentCompleteness = Math.max(0, Math.min(10, scores.contentCompleteness))
    scores.logicalClarity = Math.max(0, Math.min(10, scores.logicalClarity))
    scores.professionalDepth = Math.max(0, Math.min(10, scores.professionalDepth))
    scores.communicationSkills = Math.max(0, Math.min(10, scores.communicationSkills))
    scores.personalTraits = Math.max(0, Math.min(10, scores.personalTraits))

    return scores
  }

  /**
   * 計算總分
   */
  private calculateTotalScore(scores: ScoringCriteria): number {
    return (
      scores.contentCompleteness +
      scores.logicalClarity +
      scores.professionalDepth +
      scores.communicationSkills +
      scores.personalTraits
    ) / 5
  }

  /**
   * 提取扣分原因
   */
  private extractDeductions(answerText: string, aiFeedback: string): {
    contentCompleteness: string[]
    logicalClarity: string[]
    communicationSkills: string[]
  } {
    const deductions = {
      contentCompleteness: [] as string[],
      logicalClarity: [] as string[],
      communicationSkills: [] as string[]
    }

    // 內容完整性扣分
    if (this.isOffTopic('', answerText)) {
      deductions.contentCompleteness.push('答非所問 (-2分)')
    }
    if (this.isIncomplete(answerText)) {
      deductions.contentCompleteness.push('回答不完整 (-1分)')
    }

    // 邏輯清晰度扣分
    if (this.isUnclear(answerText)) {
      deductions.logicalClarity.push('條理不清 (-2分)')
    }
    if (this.isIllogical(answerText)) {
      deductions.logicalClarity.push('邏輯錯誤 (-2分)')
    }

    // 溝通表達扣分
    if (this.isUnclearCommunication(answerText)) {
      deductions.communicationSkills.push('表達不清晰 (-2分)')
    }
    if (this.isNotFluid(answerText)) {
      deductions.communicationSkills.push('表達不流暢 (-2分)')
    }

    return deductions
  }

  /**
   * 提取加分原因
   */
  private extractAdditions(answerText: string, aiFeedback: string): {
    professionalDepth: string[]
    personalTraits: string[]
  } {
    const additions = {
      professionalDepth: [] as string[],
      personalTraits: [] as string[]
    }

    // 專業深度加分
    if (this.hasCorrectProfessionalAnswer('', answerText)) {
      additions.professionalDepth.push('正確回答專業問題 (+2.5分)')
    }
    if (this.hasDeepUnderstanding(answerText)) {
      additions.professionalDepth.push('展現深度理解 (+1分)')
    }

    // 個人特質加分
    if (this.hasUpwardMotivation(answerText)) {
      additions.personalTraits.push('展現向上心和求知慾 (+2.5分)')
    }
    if (this.hasContinuousLearning(answerText)) {
      additions.personalTraits.push('持續學習和成長 (+2.5分)')
    }
    if (this.hasOutgoingPersonality(answerText)) {
      additions.personalTraits.push('活潑外向 (+2.5分)')
    }
    if (this.hasResilience(answerText)) {
      additions.personalTraits.push('堅強抗壓 (+2.5分)')
    }

    return additions
  }

  /**
   * 評分判斷方法
   */
  private isOffTopic(questionText: string, answerText: string): boolean {
    // 簡單的關鍵詞匹配判斷
    const questionKeywords = this.extractKeywords(questionText)
    const answerKeywords = this.extractKeywords(answerText)
    
    // 如果回答中沒有包含問題的關鍵詞，可能偏題
    const hasRelevantKeywords = questionKeywords.some(keyword => 
      answerKeywords.some(answerKeyword => 
        answerKeyword.includes(keyword) || keyword.includes(answerKeyword)
      )
    )
    
    return !hasRelevantKeywords && answerText.length > 20
  }

  private isIncomplete(answerText: string): boolean {
    return answerText.length < 20 || answerText.split('。').length < 2
  }

  private isUnclear(answerText: string): boolean {
    // 檢查是否有邏輯連接詞
    const logicalConnectors = ['因為', '所以', '因此', '然而', '但是', '而且', '另外', '首先', '其次', '最後']
    return !logicalConnectors.some(connector => answerText.includes(connector))
  }

  private isIllogical(answerText: string): boolean {
    // 檢查是否有矛盾表達
    const contradictions = ['不是', '沒有', '不會', '不能']
    const affirmations = ['是', '有', '會', '能']
    
    return contradictions.some(contradiction => 
      answerText.includes(contradiction) && 
      affirmations.some(affirmation => answerText.includes(affirmation))
    )
  }

  private hasCorrectProfessionalAnswer(questionText: string, answerText: string): boolean {
    // 檢查是否包含專業術語或具體技術
    const professionalTerms = ['框架', '技術', '方法', '工具', '平台', '系統', '架構', '設計', '開發', '實現']
    return professionalTerms.some(term => answerText.includes(term))
  }

  private hasDeepUnderstanding(answerText: string): boolean {
    // 檢查是否有深入的分析或解釋
    const deepIndicators = ['分析', '理解', '原理', '機制', '原因', '影響', '優缺點', '比較']
    return deepIndicators.some(indicator => answerText.includes(indicator))
  }

  private isUnclearCommunication(answerText: string): boolean {
    // 檢查表達是否清晰
    const unclearIndicators = ['嗯', '啊', '那個', '這個', '就是', '然後']
    const unclearCount = unclearIndicators.reduce((count, indicator) => 
      count + (answerText.split(indicator).length - 1), 0
    )
    return unclearCount > 3
  }

  private isNotFluid(answerText: string): boolean {
    // 檢查表達是否流暢
    return answerText.split('，').length < 3 || answerText.split('。').length < 2
  }

  private hasUpwardMotivation(answerText: string): boolean {
    const motivationKeywords = ['學習', '成長', '進步', '提升', '發展', '挑戰', '目標', '夢想', '追求']
    return motivationKeywords.some(keyword => answerText.includes(keyword))
  }

  private hasContinuousLearning(answerText: string): boolean {
    const learningKeywords = ['讀書', '上課', '培訓', '學習', '研究', '探索', '了解', '掌握', '技能']
    return learningKeywords.some(keyword => answerText.includes(keyword))
  }

  private hasOutgoingPersonality(answerText: string): boolean {
    const outgoingKeywords = ['活潑', '外向', '積極', '主動', '熱情', '開朗', '友善', '合作']
    return outgoingKeywords.some(keyword => answerText.includes(keyword))
  }

  private hasResilience(answerText: string): boolean {
    const resilienceKeywords = ['堅持', '努力', '克服', '挑戰', '困難', '挫折', '壓力', '堅強', '毅力']
    return resilienceKeywords.some(keyword => answerText.includes(keyword))
  }

  private extractKeywords(text: string): string[] {
    // 簡單的關鍵詞提取
    return text.split(/[，。！？\s]+/).filter(word => word.length > 1)
  }

  /**
   * 記錄評分結果到控制台
   */
  private logScoreResult(answerScore: AnswerScore): void {
    console.log('=== 面試評分結果 ===')
    console.log(`問題: ${answerScore.questionText}`)
    console.log(`回答: ${answerScore.answerText}`)
    console.log('--- 各項評分 ---')
    console.log(`內容完整性: ${answerScore.scores.contentCompleteness}/10`)
    console.log(`邏輯清晰度: ${answerScore.scores.logicalClarity}/10`)
    console.log(`專業深度: ${answerScore.scores.professionalDepth}/10`)
    console.log(`溝通表達: ${answerScore.scores.communicationSkills}/10`)
    console.log(`個人特質: ${answerScore.scores.personalTraits}/10`)
    console.log(`總分: ${answerScore.totalScore.toFixed(1)}/10`)
    
    // 扣分原因
    if (answerScore.deductions.contentCompleteness.length > 0) {
      console.log('扣分原因 (內容完整性):', answerScore.deductions.contentCompleteness)
    }
    if (answerScore.deductions.logicalClarity.length > 0) {
      console.log('扣分原因 (邏輯清晰度):', answerScore.deductions.logicalClarity)
    }
    if (answerScore.deductions.communicationSkills.length > 0) {
      console.log('扣分原因 (溝通表達):', answerScore.deductions.communicationSkills)
    }
    
    // 加分原因
    if (answerScore.additions.professionalDepth.length > 0) {
      console.log('加分原因 (專業深度):', answerScore.additions.professionalDepth)
    }
    if (answerScore.additions.personalTraits.length > 0) {
      console.log('加分原因 (個人特質):', answerScore.additions.personalTraits)
    }
    
    console.log('==================')
  }

  /**
   * 生成最終面試結果
   */
  generateFinalResult(candidateId: string): InterviewResult {
    console.log('🔍 生成最終結果 - 評分記錄數量:', this.answerScores.length)
    console.log('🔍 評分記錄詳情:', this.answerScores.map(score => ({
      questionText: score.questionText,
      totalScore: score.totalScore,
      scores: score.scores
    })))
    
    const totalQuestions = this.answerScores.length
    const answeredQuestions = this.answerScores.filter(score => score.answerText.trim().length > 0).length
    
    // 計算平均分數
    const finalScores: ScoringCriteria = {
      contentCompleteness: this.calculateAverageScore('contentCompleteness'),
      logicalClarity: this.calculateAverageScore('logicalClarity'),
      professionalDepth: this.calculateAverageScore('professionalDepth'),
      communicationSkills: this.calculateAverageScore('communicationSkills'),
      personalTraits: this.calculateAverageScore('personalTraits')
    }
    
    console.log('🔍 計算出的最終分數:', finalScores)
    
    const totalScore = this.calculateTotalScore(finalScores)
    
    // 判斷是否合格
    const isPassed = this.isPassed(finalScores)
    
    // 生成總結
    const summary = this.generateSummary(finalScores)
    
    return {
      candidateId,
      interviewDate: new Date(),
      totalQuestions,
      answeredQuestions,
      answerScores: this.answerScores,
      finalScores,
      totalScore,
      isPassed,
      passingCriteria: this.passingCriteria,
      summary
    }
  }

  private calculateAverageScore(criteria: keyof ScoringCriteria): number {
    if (this.answerScores.length === 0) return 0
    
    // 個人特質和專業深度使用累加制，其他使用平均制
    if (criteria === 'personalTraits' || criteria === 'professionalDepth') {
      const total = this.answerScores.reduce((sum, score) => sum + score.scores[criteria], 0)
      return Math.min(total, 10) // 最高不超過10分
    } else {
      const total = this.answerScores.reduce((sum, score) => sum + score.scores[criteria], 0)
      return total / this.answerScores.length
    }
  }

  private isPassed(finalScores: ScoringCriteria): boolean {
    return (
      finalScores.contentCompleteness >= this.passingCriteria.contentCompleteness &&
      finalScores.logicalClarity >= this.passingCriteria.logicalClarity &&
      finalScores.professionalDepth >= this.passingCriteria.professionalDepth &&
      finalScores.communicationSkills >= this.passingCriteria.communicationSkills &&
      finalScores.personalTraits >= this.passingCriteria.personalTraits
    )
  }

  private generateSummary(finalScores: ScoringCriteria): {
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  } {
    const strengths: string[] = []
    const weaknesses: string[] = []
    const recommendations: string[] = []

    // 分析各項分數
    Object.entries(finalScores).forEach(([criteria, score]) => {
      const level = getScoreLevel(score)
      const criteriaName = this.getCriteriaName(criteria as keyof ScoringCriteria)
      
      if (level === ScoreLevel.EXCELLENT || level === ScoreLevel.GOOD) {
        strengths.push(`${criteriaName}表現優秀 (${score.toFixed(1)}分)`)
      } else if (level === ScoreLevel.POOR || level === ScoreLevel.VERY_POOR) {
        weaknesses.push(`${criteriaName}需要改進 (${score.toFixed(1)}分)`)
        recommendations.push(`建議加強${criteriaName}的訓練`)
      }
    })

    return { strengths, weaknesses, recommendations }
  }

  private getCriteriaName(criteria: keyof ScoringCriteria): string {
    const names = {
      contentCompleteness: '內容完整性',
      logicalClarity: '邏輯清晰度',
      professionalDepth: '專業深度',
      communicationSkills: '溝通表達',
      personalTraits: '個人特質'
    }
    return names[criteria]
  }

  /**
   * 更新合格標準
   */
  updatePassingCriteria(criteria: ScoringCriteria): void {
    this.passingCriteria = criteria
  }

  /**
   * 獲取所有評分記錄
   */
  getAnswerScores(): AnswerScore[] {
    return [...this.answerScores]
  }

  /**
   * 直接添加已評分的結果（避免重複計算）
   */
  addScoredAnswer(answerScore: AnswerScore): void {
    this.answerScores.push(answerScore)
    // 不重複記錄LOG，因為在 interviewAIChat.ts 中已經記錄過了
  }

  /**
   * 清空評分記錄
   */
  clearScores(): void {
    this.answerScores = []
  }
}
