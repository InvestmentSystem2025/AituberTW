/**
 * 面試評分系統的類型定義
 */

// 評分維度
export interface ScoringCriteria {
  contentCompleteness: number // 內容完整性 (0-10)
  logicalClarity: number      // 邏輯清晰度 (0-10)
  professionalDepth: number   // 專業深度 (0-10)
  communicationSkills: number // 溝通表達 (0-10)
  personalTraits: number      // 個人特質 (0-10)
}

// 單次回答的評分結果
export interface AnswerScore {
  answerId: string
  questionId: string
  questionText: string
  answerText: string
  timestamp: Date
  scores: ScoringCriteria
  totalScore: number
  deductions: {
    contentCompleteness: string[]
    logicalClarity: string[]
    communicationSkills: string[]
  }
  additions: {
    professionalDepth: string[]
    personalTraits: string[]
  }
  aiFeedback: string
}

// 面試評分設定
export interface InterviewScoringSettings {
  passingCriteria: ScoringCriteria
  enableRealTimeScoring: boolean
  enableConsoleLogging: boolean
  enableDetailedFeedback: boolean
}

// 面試最終結果
export interface InterviewResult {
  candidateId: string
  interviewDate: Date
  totalQuestions: number
  answeredQuestions: number
  answerScores: AnswerScore[]
  finalScores: ScoringCriteria
  totalScore: number
  isPassed: boolean
  passingCriteria: ScoringCriteria
  summary: {
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  }
}

// 預設評分標準
export const DEFAULT_SCORING_CRITERIA: ScoringCriteria = {
  contentCompleteness: 5,    // 內容完整性
  logicalClarity: 5,         // 邏輯清晰度
  professionalDepth: 5,      // 專業深度
  communicationSkills: 5,    // 溝通表達
  personalTraits: 5          // 個人特質
}

// 評分規則
export const SCORING_RULES = {
  // 扣分制 (滿分10分)
  DEDUCTION_SYSTEM: {
    contentCompleteness: {
      offTopic: -2,           // 答非所問
      incomplete: -1          // 回答不完整
    },
    logicalClarity: {
      unclear: -2,            // 條理不清
      illogical: -2           // 邏輯錯誤
    },
    communicationSkills: {
      unclear: -2,            // 表達不清晰
      notFluid: -2            // 表達不流暢
    }
  },
  
  // 加分制
  ADDITION_SYSTEM: {
    professionalDepth: {
      correctAnswer: 2.5,     // 正確回答專業問題
      deepUnderstanding: 1    // 展現深度理解
    },
    personalTraits: {
      upwardMotivation: 2.5,   // 向上心、求知慾
      continuousLearning: 2.5, // 持續學習
      outgoingPersonality: 2.5, // 活潑外向
      resilience: 2.5         // 抗壓性、堅強
    }
  }
}

// 評分等級
export enum ScoreLevel {
  EXCELLENT = 'excellent',    // 優秀 (9-10分)
  GOOD = 'good',             // 良好 (7-8分)
  AVERAGE = 'average',       // 一般 (5-6分)
  POOR = 'poor',            // 較差 (3-4分)
  VERY_POOR = 'very_poor'   // 很差 (0-2分)
}

// 獲取評分等級
export function getScoreLevel(score: number): ScoreLevel {
  if (score >= 9) return ScoreLevel.EXCELLENT
  if (score >= 7) return ScoreLevel.GOOD
  if (score >= 5) return ScoreLevel.AVERAGE
  if (score >= 3) return ScoreLevel.POOR
  return ScoreLevel.VERY_POOR
}

// 評分等級描述
export const SCORE_LEVEL_DESCRIPTIONS = {
  [ScoreLevel.EXCELLENT]: '優秀',
  [ScoreLevel.GOOD]: '良好',
  [ScoreLevel.AVERAGE]: '一般',
  [ScoreLevel.POOR]: '較差',
  [ScoreLevel.VERY_POOR]: '很差'
}

// 評分等級顏色
export const SCORE_LEVEL_COLORS = {
  [ScoreLevel.EXCELLENT]: 'text-green-600 bg-green-100',
  [ScoreLevel.GOOD]: 'text-blue-600 bg-blue-100',
  [ScoreLevel.AVERAGE]: 'text-yellow-600 bg-yellow-100',
  [ScoreLevel.POOR]: 'text-orange-600 bg-orange-100',
  [ScoreLevel.VERY_POOR]: 'text-red-600 bg-red-100'
}
