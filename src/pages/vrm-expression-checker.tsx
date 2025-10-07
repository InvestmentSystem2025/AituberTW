import React, { useState, useRef, useEffect } from 'react'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { VRMExpressionPresetName } from '@pixiv/three-vrm'

interface ExpressionInfo {
  name: string
  weight: number
  isSupported: boolean
}

export default function VRMExpressionChecker() {
  const [expressions, setExpressions] = useState<ExpressionInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [testResults, setTestResults] = useState<{ [key: string]: boolean }>({})
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // VRM標準表情預設
  const VRM_EXPRESSIONS: { label: string; value: keyof typeof VRMExpressionPresetName }[] = [
    { label: '中性', value: 'Neutral' },
    { label: '開心', value: 'Happy' },
    { label: '生氣', value: 'Angry' },
    { label: '悲傷', value: 'Sad' },
    { label: '放鬆', value: 'Relaxed' },
    { label: '驚訝', value: 'Surprised' },
    { label: '眨眼', value: 'Blink' },
    { label: '左眼眨眼', value: 'BlinkLeft' },
    { label: '右眼眨眼', value: 'BlinkRight' },
    { label: '張嘴 (aa)', value: 'Aa' },
    { label: '張嘴 (ih)', value: 'Ih' },
    { label: '張嘴 (ou)', value: 'Ou' },
    { label: '張嘴 (ee)', value: 'Ee' },
    { label: '張嘴 (oh)', value: 'Oh' },
    { label: '向上看', value: 'LookUp' },
    { label: '向下看', value: 'LookDown' },
    { label: '向左看', value: 'LookLeft' },
    { label: '向右看', value: 'LookRight' },
  ]

  // 可用的VRM模型列表
  const vrmModels = [
    'AvatarSample_A.vrm',
    'AvatarSample_B.vrm', 
    'AvatarSample_C.vrm',
    'mentoly.vrm',
    'nikechan_v1.vrm',
    'nikechan_v2.vrm',
    'nikechan_v2_outerwear.vrm',
    'yuki.vrm'
  ]

  // 載入VRM模型並檢查表情
  const loadVRMModel = async (modelPath: string) => {
    setIsLoading(true)
    setExpressions([])
    setTestResults({})
    
    try {
      const { viewer } = homeStore.getState()
      if (canvasRef.current) {
        viewer.setup(canvasRef.current)
        await viewer.loadVrm(`/vrm/${modelPath}`)
        
        // 等待模型載入完成
        setTimeout(() => {
          const { model } = viewer
          if (model?.vrm) {
            checkExpressions(model.vrm)
          }
        }, 1000)
      }
    } catch (error) {
      console.error('載入VRM模型失敗:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 檢查VRM模型支援的表情
  const checkExpressions = (vrm: any) => {
    const expressionList: ExpressionInfo[] = []
    
    console.log('🔍 檢查VRM模型表情支援情況')
    console.log('VRM ExpressionManager:', vrm.expressionManager)
    
    // 檢查每個標準表情
    VRM_EXPRESSIONS.forEach(({ label, value }) => {
      const expressionName = VRMExpressionPresetName[value]
      
      // 先檢查 ExpressionManager 中是否有預設表情
      let isSupported = false
      if (vrm.expressionManager) {
        // 檢查 _expressionMap（實際的表情映射）
        if (vrm.expressionManager._expressionMap) {
          isSupported = vrm.expressionManager._expressionMap[expressionName] !== undefined
        }
        // 如果 _expressionMap 不存在，檢查 expressions 屬性
        else if (vrm.expressionManager.expressions) {
          isSupported = vrm.expressionManager.expressions[expressionName] !== undefined
        }
      }
      
      // 如果 ExpressionManager 中沒有，檢查是否能透過 BlendShape 實現
      if (!isSupported) {
        isSupported = checkBlendShapeSupport(vrm, expressionName)
      }
      
      expressionList.push({
        name: expressionName,
        weight: 0,
        isSupported
      })
      
      console.log(`表情 ${label} (${expressionName}): ${isSupported ? '✅ 支援' : '❌ 不支援'}`)
    })
    
    setExpressions(expressionList)
  }

  // 檢查是否能透過 BlendShape 支援表情
  const checkBlendShapeSupport = (vrm: any, expressionName: string): boolean => {
    let hasBlendShape = false
    
    vrm.scene.traverse((child: any) => {
      if (child.type === 'SkinnedMesh' && child.morphTargetDictionary) {
        const dict = child.morphTargetDictionary
        
        // 檢查是否有對應的 BlendShape
        if (dict[expressionName] !== undefined) {
          hasBlendShape = true
          return
        }
        
        // 檢查部分匹配（去掉前綴的情況）
        const shortName = expressionName.split('_').pop()
        if (shortName && dict[shortName] !== undefined) {
          hasBlendShape = true
          return
        }
        
        // 檢查所有可能的匹配
        for (const dictName of Object.keys(dict)) {
          if (expressionName.includes(dictName) || dictName.includes(expressionName)) {
            hasBlendShape = true
            return
          }
        }
      }
    })
    
    return hasBlendShape
  }

  // 測試表情
  const testExpression = (expressionName: string) => {
    const { viewer } = homeStore.getState()
    if (viewer.model?.vrm) {
      try {
        // 使用 EmoteController 播放表情（與 vrm-inspector 相同的方式）
        viewer.model.playEmotion(expressionName as any)
        
        // 更新測試結果
        setTestResults(prev => ({
          ...prev,
          [expressionName]: true
        }))
        
        console.log(`✅ 測試表情: ${expressionName}`)
        
        // 3秒後重置
        setTimeout(() => {
          if (viewer.model?.vrm) {
            viewer.model.playEmotion('neutral')
            setTestResults(prev => ({
              ...prev,
              [expressionName]: false
            }))
          }
        }, 3000)
        
      } catch (error) {
        console.error(`❌ 測試表情失敗: ${expressionName}`, error)
      }
    }
  }

  // 重置所有表情
  const resetAllExpressions = () => {
    const { viewer } = homeStore.getState()
    if (viewer.model?.vrm) {
      // 使用 EmoteController 重置到中性表情
      viewer.model.playEmotion('neutral')
      
      setTestResults({})
      console.log('🔄 重置所有表情')
    }
  }

  // 統計支援的表情
  const supportedCount = expressions.filter(expr => expr.isSupported).length
  const totalCount = expressions.length

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">VRM 表情支援檢查器</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左側：3D模型顯示 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">3D 模型預覽</h2>
            <div className="w-full h-96 bg-gray-200 rounded-lg relative overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ display: 'block' }}
              />
            </div>
            
            {/* 模型選擇 */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                選擇VRM模型
              </label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value)
                  if (e.target.value) {
                    loadVRMModel(e.target.value)
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                <option value="">選擇模型...</option>
                {vrmModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            {isLoading && (
              <div className="mt-4 text-center text-blue-600">
                載入中...
              </div>
            )}
          </div>

          {/* 中間：表情支援列表 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">表情支援檢查</h2>
              <button
                onClick={resetAllExpressions}
                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              >
                重置全部
              </button>
            </div>
            
            {/* 統計資訊 */}
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-800">
                <div>支援表情: <span className="font-bold text-green-600">{supportedCount}</span> / {totalCount}</div>
                <div>支援率: <span className="font-bold text-blue-600">{totalCount > 0 ? ((supportedCount / totalCount) * 100).toFixed(1) : 0}%</span></div>
              </div>
            </div>
            
            <div className="max-h-96 overflow-y-auto space-y-2">
              {expressions.map((expr, index) => {
                const expressionLabel = VRM_EXPRESSIONS.find(e => VRMExpressionPresetName[e.value] === expr.name)?.label || expr.name
                const isTesting = testResults[expr.name]
                
                return (
                  <div key={expr.name} className="flex items-center justify-between p-2 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <span className={`w-3 h-3 rounded-full ${expr.isSupported ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      <span className="text-sm font-medium">{expressionLabel}</span>
                      <span className="text-xs text-gray-500">({expr.name})</span>
                    </div>
                    <button
                      onClick={() => testExpression(expr.name)}
                      disabled={!expr.isSupported || isTesting}
                      className={`px-3 py-1 rounded text-xs ${
                        !expr.isSupported 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : isTesting
                          ? 'bg-yellow-500 text-white'
                          : 'bg-blue-500 text-white hover:bg-blue-600'
                      }`}
                    >
                      {!expr.isSupported ? '不支援' : isTesting ? '測試中...' : '測試'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右側：詳細資訊 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">詳細資訊</h2>
            
            {/* 支援的表情 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-green-600">✅ 支援的表情</h3>
              <div className="space-y-1">
                {expressions.filter(expr => expr.isSupported).map(expr => {
                  const expressionLabel = VRM_EXPRESSIONS.find(e => VRMExpressionPresetName[e.value] === expr.name)?.label || expr.name
                  return (
                    <div key={expr.name} className="text-sm text-green-700">
                      • {expressionLabel} ({expr.name})
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 不支援的表情 */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3 text-red-600">❌ 不支援的表情</h3>
              <div className="space-y-1">
                {expressions.filter(expr => !expr.isSupported).map(expr => {
                  const expressionLabel = VRM_EXPRESSIONS.find(e => VRMExpressionPresetName[e.value] === expr.name)?.label || expr.name
                  return (
                    <div key={expr.name} className="text-sm text-red-700">
                      • {expressionLabel} ({expr.name})
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 使用說明 */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">使用說明</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 選擇VRM模型載入</li>
                <li>• 查看表情支援情況</li>
                <li>• 點擊「測試」按鈕預覽表情</li>
                <li>• 綠色圓點表示支援</li>
                <li>• 紅色圓點表示不支援</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 控制台輸出區域 */}
        <div className="mt-8 bg-black text-green-400 p-4 rounded-lg font-mono text-sm">
          <h3 className="text-white mb-2">控制台輸出</h3>
          <p>請打開瀏覽器開發者工具 (F12) 查看詳細的表情檢查資訊</p>
        </div>
      </div>
    </div>
  )
}
