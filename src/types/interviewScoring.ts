/**
 * 面試評分系統的類型定義
 */

// 評分維度 - 支持動態評估項目（key -> score）
export type ScoringCriteria = Record<string, number>

// 核心特質單項（0-100 分 + 標籤 + 依據）
export interface CoreTraitResult {
  score: number             // 0–100
  label: string             // 高 / 中高 / 中 / 中低 / 低
  reason: string            // 判斷依據摘要
  confidence?: 'high' | 'medium' | 'low'
}

// Schwartz 價值理論
export interface SchwartzValues {
  money: number             // 金錢導向 0–100
  growth: number            // 成長導向 0–100
  stability: number         // 穩定導向 0–100
  power: number             // 權力/影響力導向 0–100
  interpretation: string    // 整體解讀與離職風險說明
}

// Big Five 性格模型
export interface BigFiveResult {
  openness: number          // 開放性 0–100
  conscientiousness: number // 盡責性 0–100
  extraversion: number      // 外向性 0–100
  agreeableness: number     // 協調性 0–100
  neuroticism: number       // 神經質傾向 0–100
  interpretation: string    // 職種適性與招募解讀
}

// DISC 行為模式
export interface DISCResult {
  d: number                 // 主導型 0–100
  i: number                 // 影響型 0–100
  s: number                 // 穩定型 0–100
  c: number                 // 謹慎型 0–100
  primary_type: 'D' | 'I' | 'S' | 'C'
  secondary_type: 'D' | 'I' | 'S' | 'C'
  interpretation: string    // 團隊定位與行為模式說明
}

// 離職風險
export interface TurnoverRisk {
  level: 'high' | 'medium' | 'low'
  reason: string
}

// 人格判斷結果（由 AI 在最後一題輸出）
export interface PersonalitySummary {
  // ── 舊版欄位（向後相容） ──────────────────────────────
  extraversion?: string              // 外向/內向 傾向與說明
  conscientiousness?: string         // 盡責/隨性 傾向與說明
  detail_attentiveness?: string      // 細心/粗心 傾向與說明
  proactivity?: string               // 主動/被動 傾向與說明
  learning_mindset?: string          // 學習與成長心態 傾向與說明
  stress_resilience?: string         // 抗壓與情緒穩定 傾向與說明
  collaboration?: string             // 合作與溝通方式 傾向與說明
  summaryText?: string               // 整體性格總結（5-6 句）

  // ── 新版擴充：人格總覽 ───────────────────────────────
  personality_summary?: {
    overview: string
    strengths: string[]
    risks: string[]
    confidence: 'high' | 'medium' | 'low'
  }

  // ── 新版擴充：四大核心特質 ───────────────────────────
  core_traits?: {
    integrity?: CoreTraitResult     // 誠實性/責任感
    intelligence?: CoreTraitResult  // 智能/理解力
    motivation?: CoreTraitResult    // 動機
    consistency?: CoreTraitResult   // 再現性/穩定性
  }

  // ── 新版擴充：三大分析模型 ───────────────────────────
  schwartz_values?: SchwartzValues
  big_five?: BigFiveResult
  disc?: DISCResult

  // ── 新版擴充：離職風險 ───────────────────────────────
  turnover_risk?: TurnoverRisk

  // 預留其他欄位，方便日後擴充
  [key: string]: any
}

// 單一加/扣分事件（方便統計與可追溯）
export interface ScoreReasonItem {
  points: number
  detail: string
  // 預留其他欄位，方便日後擴充
  [key: string]: any
}

// 單次回答的評分結果
export interface AnswerScore {
  answerId: string
  questionId: string
  questionText: string
  answerText: string
  timestamp: Date
  scores: ScoringCriteria // 支持動態評估項目
  totalScore: number
  deductions: Record<string, string[]> // 支持動態評估項目
  additions: Record<string, string[]>  // 支持動態評估項目
  // 新：結構化事件（優先用於統計；舊 UI/儲存可沿用 deductions/additions 字串）
  deductionItems?: Record<string, ScoreReasonItem[]>
  additionItems?: Record<string, ScoreReasonItem[]>
  aiFeedback: string
  additionsDetail?: string
  deductionsDetail?: string
  /**
   * 下一步動作（由 AI 在評分 JSON 中決定，前端用來控制題號是否推進）
   * - followup: 需要針對同一題追問（currentQuestionIndex 不變）
   * - next: 同一題已回答充分，可進到下一題（currentQuestionIndex + 1）
   * - end: 面試結束
   */
  nextAction?: 'followup' | 'next' | 'end'
   // （選用）人格判斷結果，只會在「最後一題」的評分中出現
  personality?: PersonalitySummary
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

// DB key 到前端 key 的映射（用於向後兼容）
export const DB_KEY_TO_FRONTEND_KEY: Record<string, string> = {
  'content_integrity': 'contentCompleteness',
  'logical_clarity': 'logicalClarity',
  'professional_depth': 'professionalDepth',
  'communication': 'communicationSkills',
  'personal_attributes': 'personalTraits'
}

// 前端 key 到 DB key 的映射（用於向後兼容）
export const FRONTEND_KEY_TO_DB_KEY: Record<string, string> = {
  'contentCompleteness': 'content_integrity',
  'logicalClarity': 'logical_clarity',
  'professionalDepth': 'professional_depth',
  'communicationSkills': 'communication',
  'personalTraits': 'personal_attributes'
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
