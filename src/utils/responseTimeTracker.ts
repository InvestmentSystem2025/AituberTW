/**
 * AI 回應時間追蹤工具
 * 用於測量和分析 AI 面試系統的回應時間
 */

export interface ResponseTimeMetrics {
  // 時間戳
  userInputTime: number // 用戶輸入時間
  apiCallStartTime: number // API 調用開始時間
  apiCallEndTime: number // API 調用結束時間
  responseCompleteTime: number // 回應完成時間
  
  // 時間段（毫秒）
  totalResponseTime: number // 總回應時間（從用戶輸入到回應完成）
  apiResponseTime: number // API 回應時間（從 API 調用到回應）
  networkLatency?: number // 網絡延遲（可選）
  processingTime?: number // 處理時間（可選）
  
  // 影響因素
  userInputLength: number // 用戶輸入文字量（字符數）
  conversationHistoryLength: number // 對話歷史長度（消息數）
  conversationHistoryTokens?: number // 對話歷史 token 數量（估算）
  aiService: string // 使用的 AI 服務
  aiModel: string // 使用的 AI 模型
  responseLength: number // AI 回應長度（字符數）
  
  // 其他元數據
  questionIndex?: number // 問題索引
  interviewStage?: string // 面試階段
  timestamp: string // ISO 時間戳
}

export interface ResponseTimeAnalysis {
  metrics: ResponseTimeMetrics[]
  averageTotalTime: number
  averageApiTime: number
  minTotalTime: number
  maxTotalTime: number
  medianTotalTime: number
  p95TotalTime: number
  p99TotalTime: number
  
  // 按服務分組的統計
  byService: Record<string, {
    count: number
    averageTime: number
    minTime: number
    maxTime: number
  }>
  
  // 按輸入長度分組的統計
  byInputLength: {
    short: { count: number; averageTime: number } // < 50 字符
    medium: { count: number; averageTime: number } // 50-200 字符
    long: { count: number; averageTime: number } // > 200 字符
  }
}

class ResponseTimeTracker {
  private metrics: ResponseTimeMetrics[] = []
  private readonly STORAGE_KEY = 'interview_response_time_metrics'
  private readonly MAX_STORED_METRICS = 1000 // 最多儲存 1000 筆記錄

  /**
   * 開始追蹤回應時間
   */
  startTracking(userInput: string, aiService: string, aiModel: string, conversationHistoryLength: number, questionIndex?: number, interviewStage?: string): string {
    const trackingId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const userInputTime = performance.now()
    
    // 估算對話歷史 token 數量（粗略估算：1 token ≈ 4 字符）
    const conversationHistoryTokens = conversationHistoryLength * 100 // 假設每條消息平均 100 tokens
    
    const metric: Partial<ResponseTimeMetrics> = {
      userInputTime,
      userInputLength: userInput.length,
      conversationHistoryLength,
      conversationHistoryTokens,
      aiService,
      aiModel,
      questionIndex,
      interviewStage,
      timestamp: new Date().toISOString(),
    }
    
    // 使用 sessionStorage 暫時儲存（避免頁面重新載入時丟失）
    if (typeof window !== 'undefined') {
      const pendingMetrics = JSON.parse(sessionStorage.getItem('pending_response_metrics') || '{}')
      pendingMetrics[trackingId] = metric
      sessionStorage.setItem('pending_response_metrics', JSON.stringify(pendingMetrics))
    }
    
    return trackingId
  }

  /**
   * 記錄 API 調用開始時間
   */
  recordApiCallStart(trackingId: string) {
    if (typeof window === 'undefined') return
    
    const pendingMetrics = JSON.parse(sessionStorage.getItem('pending_response_metrics') || '{}')
    const metric = pendingMetrics[trackingId]
    if (!metric) return
    
    metric.apiCallStartTime = performance.now()
    pendingMetrics[trackingId] = metric
    sessionStorage.setItem('pending_response_metrics', JSON.stringify(pendingMetrics))
  }

  /**
   * 記錄 API 調用結束時間
   */
  recordApiCallEnd(trackingId: string) {
    if (typeof window === 'undefined') return
    
    const pendingMetrics = JSON.parse(sessionStorage.getItem('pending_response_metrics') || '{}')
    const metric = pendingMetrics[trackingId]
    if (!metric) return
    
    metric.apiCallEndTime = performance.now()
    if (metric.apiCallStartTime) {
      metric.apiResponseTime = metric.apiCallEndTime - metric.apiCallStartTime
    }
    pendingMetrics[trackingId] = metric
    sessionStorage.setItem('pending_response_metrics', JSON.stringify(pendingMetrics))
  }

  /**
   * 完成追蹤並儲存指標
   */
  completeTracking(trackingId: string, responseText: string) {
    if (typeof window === 'undefined') return
    
    const pendingMetrics = JSON.parse(sessionStorage.getItem('pending_response_metrics') || '{}')
    const metric = pendingMetrics[trackingId]
    if (!metric) {
      console.warn(`找不到追蹤 ID: ${trackingId}`)
      return
    }
    
    const responseCompleteTime = performance.now()
    const totalResponseTime = responseCompleteTime - metric.userInputTime
    
    const completeMetric: ResponseTimeMetrics = {
      ...metric as ResponseTimeMetrics,
      responseCompleteTime,
      totalResponseTime,
      responseLength: responseText.length,
      apiResponseTime: metric.apiResponseTime || (metric.apiCallEndTime ? metric.apiCallEndTime - (metric.apiCallStartTime || metric.userInputTime) : 0),
    }
    
    // 計算網絡延遲（如果可能）
    if (metric.apiCallStartTime && metric.apiCallEndTime) {
      completeMetric.networkLatency = metric.apiResponseTime || 0
    }
    
    // 儲存到本地儲存
    this.metrics.push(completeMetric)
    this.saveMetrics()
    
    // 從 sessionStorage 中移除
    delete pendingMetrics[trackingId]
    sessionStorage.setItem('pending_response_metrics', JSON.stringify(pendingMetrics))
    
    // 記錄到控制台
    this.logMetric(completeMetric)
    
    return completeMetric
  }

  /**
   * 記錄指標到控制台
   */
  private logMetric(metric: ResponseTimeMetrics) {
    console.group('📊 AI 回應時間指標')
    console.log(`總回應時間: ${metric.totalResponseTime.toFixed(2)}ms (${(metric.totalResponseTime / 1000).toFixed(2)}秒)`)
    console.log(`API 回應時間: ${metric.apiResponseTime.toFixed(2)}ms (${(metric.apiResponseTime / 1000).toFixed(2)}秒)`)
    console.log(`用戶輸入長度: ${metric.userInputLength} 字符`)
    console.log(`對話歷史長度: ${metric.conversationHistoryLength} 條消息`)
    console.log(`AI 回應長度: ${metric.responseLength} 字符`)
    console.log(`AI 服務: ${metric.aiService}`)
    console.log(`AI 模型: ${metric.aiModel}`)
    if (metric.questionIndex !== undefined) {
      console.log(`問題索引: ${metric.questionIndex}`)
    }
    if (metric.interviewStage) {
      console.log(`面試階段: ${metric.interviewStage}`)
    }
    console.groupEnd()
  }

  /**
   * 儲存指標到本地儲存
   */
  private saveMetrics() {
    if (typeof window === 'undefined') return
    
    // 只保留最新的 N 筆記錄
    if (this.metrics.length > this.MAX_STORED_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_STORED_METRICS)
    }
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.metrics))
    } catch (error) {
      console.warn('無法儲存回應時間指標到 localStorage:', error)
    }
  }

  /**
   * 從本地儲存載入指標
   */
  loadMetrics(): ResponseTimeMetrics[] {
    if (typeof window === 'undefined') return []
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        this.metrics = JSON.parse(stored)
      }
    } catch (error) {
      console.warn('無法從 localStorage 載入回應時間指標:', error)
    }
    
    return this.metrics
  }

  /**
   * 清除所有指標
   */
  clearMetrics() {
    this.metrics = []
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY)
      sessionStorage.removeItem('pending_response_metrics')
    }
  }

  /**
   * 獲取所有指標
   */
  getMetrics(): ResponseTimeMetrics[] {
    return this.metrics
  }

  /**
   * 分析指標並生成報告
   */
  analyze(): ResponseTimeAnalysis {
    const metrics = this.metrics
    
    if (metrics.length === 0) {
      return {
        metrics: [],
        averageTotalTime: 0,
        averageApiTime: 0,
        minTotalTime: 0,
        maxTotalTime: 0,
        medianTotalTime: 0,
        p95TotalTime: 0,
        p99TotalTime: 0,
        byService: {},
        byInputLength: {
          short: { count: 0, averageTime: 0 },
          medium: { count: 0, averageTime: 0 },
          long: { count: 0, averageTime: 0 },
        },
      }
    }
    
    // 計算基本統計
    const totalTimes = metrics.map(m => m.totalResponseTime).sort((a, b) => a - b)
    const apiTimes = metrics.map(m => m.apiResponseTime).filter(t => t > 0)
    
    const averageTotalTime = totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length
    const averageApiTime = apiTimes.length > 0 ? apiTimes.reduce((a, b) => a + b, 0) / apiTimes.length : 0
    const minTotalTime = totalTimes[0] || 0
    const maxTotalTime = totalTimes[totalTimes.length - 1] || 0
    const medianTotalTime = totalTimes[Math.floor(totalTimes.length / 2)] || 0
    const p95TotalTime = totalTimes[Math.floor(totalTimes.length * 0.95)] || 0
    const p99TotalTime = totalTimes[Math.floor(totalTimes.length * 0.99)] || 0
    
    // 按服務分組統計
    const byService: Record<string, { count: number; averageTime: number; minTime: number; maxTime: number }> = {}
    metrics.forEach(metric => {
      if (!byService[metric.aiService]) {
        byService[metric.aiService] = {
          count: 0,
          averageTime: 0,
          minTime: Infinity,
          maxTime: 0,
        }
      }
      const service = byService[metric.aiService]
      service.count++
      service.averageTime += metric.totalResponseTime
      service.minTime = Math.min(service.minTime, metric.totalResponseTime)
      service.maxTime = Math.max(service.maxTime, metric.totalResponseTime)
    })
    
    Object.keys(byService).forEach(service => {
      byService[service].averageTime /= byService[service].count
    })
    
    // 按輸入長度分組統計
    const short: ResponseTimeMetrics[] = []
    const medium: ResponseTimeMetrics[] = []
    const long: ResponseTimeMetrics[] = []
    
    metrics.forEach(metric => {
      if (metric.userInputLength < 50) {
        short.push(metric)
      } else if (metric.userInputLength <= 200) {
        medium.push(metric)
      } else {
        long.push(metric)
      }
    })
    
    const byInputLength = {
      short: {
        count: short.length,
        averageTime: short.length > 0 ? short.reduce((sum, m) => sum + m.totalResponseTime, 0) / short.length : 0,
      },
      medium: {
        count: medium.length,
        averageTime: medium.length > 0 ? medium.reduce((sum, m) => sum + m.totalResponseTime, 0) / medium.length : 0,
      },
      long: {
        count: long.length,
        averageTime: long.length > 0 ? long.reduce((sum, m) => sum + m.totalResponseTime, 0) / long.length : 0,
      },
    }
    
    return {
      metrics,
      averageTotalTime,
      averageApiTime,
      minTotalTime,
      maxTotalTime,
      medianTotalTime,
      p95TotalTime,
      p99TotalTime,
      byService,
      byInputLength,
    }
  }

  /**
   * 導出指標為 JSON
   */
  exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2)
  }

  /**
   * 導出分析報告為 JSON
   */
  exportAnalysis(): string {
    return JSON.stringify(this.analyze(), null, 2)
  }
}

// 單例實例
export const responseTimeTracker = new ResponseTimeTracker()

