import React, { useState, useEffect } from 'react'
import { responseTimeTracker, type ResponseTimeAnalysis as ResponseTimeAnalysisData } from '@/utils/responseTimeTracker'

interface ResponseTimeAnalysisProps {
  isOpen: boolean
  onClose: () => void
}

export const ResponseTimeAnalysis: React.FC<ResponseTimeAnalysisProps> = ({
  isOpen,
  onClose,
}) => {
  const [analysis, setAnalysis] = useState<ResponseTimeAnalysisData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadAnalysis()
    }
  }, [isOpen])

  const loadAnalysis = () => {
    setIsLoading(true)
    try {
      responseTimeTracker.loadMetrics()
      const analysisData = responseTimeTracker.analyze()
      setAnalysis(analysisData)
    } catch (error) {
      console.error('載入分析數據失敗:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearData = () => {
    if (confirm('確定要清除所有回應時間數據嗎？此操作無法復原。')) {
      responseTimeTracker.clearMetrics()
      loadAnalysis()
    }
  }

  const handleExportMetrics = () => {
    const metrics = responseTimeTracker.exportMetrics()
    const blob = new Blob([metrics], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `response-time-metrics-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportAnalysis = () => {
    const analysisData = responseTimeTracker.exportAnalysis()
    const blob = new Blob([analysisData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `response-time-analysis-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="text-center">載入中...</div>
        </div>
      </div>
    )
  }

  if (!analysis || analysis.metrics.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">回應時間分析</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="text-center py-8">
            <p className="text-gray-500">目前還沒有回應時間數據</p>
            <p className="text-sm text-gray-400 mt-2">
              進行面試時，系統會自動記錄回應時間
            </p>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    )
  }

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}秒`
  }

  const getPerformanceLevel = (ms: number) => {
    if (ms < 2000) return { level: '優秀', color: 'text-green-600' }
    if (ms < 5000) return { level: '良好', color: 'text-blue-600' }
    if (ms < 10000) return { level: '一般', color: 'text-yellow-600' }
    return { level: '需改善', color: 'text-red-600' }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">📊 AI 回應時間分析報告</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>

        {/* 數據概覽 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">總記錄數</div>
            <div className="text-2xl font-bold text-blue-600">
              {analysis.metrics.length}
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">平均回應時間</div>
            <div className="text-2xl font-bold text-green-600">
              {formatTime(analysis.averageTotalTime)}
            </div>
            <div className={`text-xs mt-1 ${getPerformanceLevel(analysis.averageTotalTime).color}`}>
              {getPerformanceLevel(analysis.averageTotalTime).level}
            </div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">最短回應時間</div>
            <div className="text-2xl font-bold text-yellow-600">
              {formatTime(analysis.minTotalTime)}
            </div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600">最長回應時間</div>
            <div className="text-2xl font-bold text-red-600">
              {formatTime(analysis.maxTotalTime)}
            </div>
          </div>
        </div>

        {/* 統計詳細信息 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-bold mb-3">時間統計</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>中位數:</span>
                <span className="font-medium">{formatTime(analysis.medianTotalTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>P95 (95% 分位數):</span>
                <span className="font-medium">{formatTime(analysis.p95TotalTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>P99 (99% 分位數):</span>
                <span className="font-medium">{formatTime(analysis.p99TotalTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>平均 API 回應時間:</span>
                <span className="font-medium">{formatTime(analysis.averageApiTime)}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-bold mb-3">按輸入長度分組</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>短輸入 (&lt; 50 字符):</span>
                <span className="font-medium">
                  {analysis.byInputLength.short.count} 筆, 
                  {formatTime(analysis.byInputLength.short.averageTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>中等輸入 (50-200 字符):</span>
                <span className="font-medium">
                  {analysis.byInputLength.medium.count} 筆, 
                  {formatTime(analysis.byInputLength.medium.averageTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>長輸入 (&gt; 200 字符):</span>
                <span className="font-medium">
                  {analysis.byInputLength.long.count} 筆, 
                  {formatTime(analysis.byInputLength.long.averageTime)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 按服務分組統計 */}
        {Object.keys(analysis.byService).length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold mb-3">按 AI 服務分組</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="space-y-3">
                {Object.entries(analysis.byService).map(([service, stats]) => {
                  const perf = getPerformanceLevel(stats.averageTime)
                  return (
                    <div key={service} className="border-b pb-2 last:border-0">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{service}</span>
                        <span className={`text-sm ${perf.color}`}>
                          {perf.level}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-2 text-sm text-gray-600">
                        <div>
                          <span>記錄數: </span>
                          <span className="font-medium">{stats.count}</span>
                        </div>
                        <div>
                          <span>平均: </span>
                          <span className="font-medium">{formatTime(stats.averageTime)}</span>
                        </div>
                        <div>
                          <span>範圍: </span>
                          <span className="font-medium">
                            {formatTime(stats.minTime)} - {formatTime(stats.maxTime)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 改善建議 */}
        <div className="mb-6">
          <h3 className="font-bold mb-3">💡 改善建議</h3>
          <div className="bg-blue-50 p-4 rounded-lg text-sm space-y-2">
            {analysis.averageTotalTime > 5000 && (
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  <strong>回應時間較長:</strong> 平均回應時間超過 5 秒，建議：
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>考慮使用更快的 AI 模型（如 GPT-3.5-turbo 替代 GPT-4）</li>
                    <li>優化 prompt 長度，減少不必要的上下文</li>
                    <li>檢查網絡連接質量</li>
                  </ul>
                </span>
              </div>
            )}
            {analysis.byInputLength.long.averageTime > analysis.byInputLength.short.averageTime * 1.5 && (
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  <strong>輸入長度影響:</strong> 長輸入的回應時間明顯較長，建議：
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>考慮限制用戶輸入長度</li>
                    <li>對長輸入進行摘要或分段處理</li>
                  </ul>
                </span>
              </div>
            )}
            {Object.keys(analysis.byService).length > 1 && (
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  <strong>服務選擇:</strong> 不同 AI 服務的表現差異明顯，建議使用統計中表現較好的服務
                </span>
              </div>
            )}
            {analysis.averageApiTime / analysis.averageTotalTime > 0.8 && (
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  <strong>API 調用佔比高:</strong> API 調用時間佔總回應時間的 80% 以上，主要瓶頸在 API 端，建議：
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>考慮使用更快的 API 服務</li>
                    <li>檢查 API 服務的區域設置（選擇更近的區域）</li>
                    <li>考慮使用流式響應以提升用戶體驗</li>
                  </ul>
                </span>
              </div>
            )}
            {analysis.metrics.length < 10 && (
              <div className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  <strong>數據不足:</strong> 目前只有 {analysis.metrics.length} 筆記錄，建議收集更多數據後再進行分析
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleClearData}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
          >
            清除數據
          </button>
          <button
            onClick={handleExportMetrics}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            導出原始數據
          </button>
          <button
            onClick={handleExportAnalysis}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded"
          >
            導出分析報告
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

