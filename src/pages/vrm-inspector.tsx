import React, { useState, useRef, useEffect } from 'react'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { VRM } from '@pixiv/three-vrm'

interface BlendShapeInfo {
  name: string
  weight: number
  category: 'preset' | 'custom' | 'blink' | 'lookat' | 'mouth'
}

export default function VRMInspector() {
  const [blendShapes, setBlendShapes] = useState<BlendShapeInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [customWeight, setCustomWeight] = useState<{ [key: string]: number }>({})
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // 載入VRM模型並檢查BlendShape
  const loadVRMModel = async (modelPath: string) => {
    setIsLoading(true)
    setBlendShapes([])
    setCustomWeight({})
    
    try {
      const { viewer } = homeStore.getState()
      if (canvasRef.current) {
        viewer.setup(canvasRef.current)
        await viewer.loadVrm(`/vrm/${modelPath}`)
        
        // 等待模型載入完成
        setTimeout(() => {
          const { model } = viewer
          if (model?.vrm) {
            inspectBlendShapes(model.vrm)
          }
        }, 1000)
      }
    } catch (error) {
      console.error('載入VRM模型失敗:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 檢查VRM模型的BlendShape
  const inspectBlendShapes = (vrm: VRM) => {
    const blendShapeList: BlendShapeInfo[] = []
    
    // 1. 檢查Expression Manager的預設表情
    if (vrm.expressionManager) {
      console.log('🎭 Expression Manager 找到')
      
      // 預設表情
      const presetExpressions = vrm.expressionManager.expressions
      if (presetExpressions) {
        Object.keys(presetExpressions).forEach(name => {
          blendShapeList.push({
            name,
            weight: 0,
            category: 'preset'
          })
        })
      }
    }

    // 2. 檢查BlendShape Groups (VRM 1.0+)
    if ((vrm as any).blendShapeManager) {
      console.log('🎨 BlendShape Manager 找到')
      
      const blendShapeGroups = (vrm as any).blendShapeManager.blendShapeGroups
      blendShapeGroups.forEach((group: any, index: number) => {
        group.binds.forEach((bind: any) => {
          blendShapeList.push({
            name: `${group.name || `Group_${index}`}_${bind.index}`,
            weight: 0,
            category: 'custom'
          })
        })
      })
    }

    // 3. 檢查Mesh的BlendShape
    vrm.scene.traverse((child) => {
      if (child.type === 'SkinnedMesh') {
        const mesh = child as any
        if (mesh.morphTargetInfluences) {
          console.log(`🔍 找到SkinnedMesh: ${child.name}`)
          console.log(`📊 BlendShape數量: ${mesh.morphTargetInfluences.length}`)
          
          // 獲取BlendShape名稱
          if (mesh.morphTargetDictionary) {
            Object.keys(mesh.morphTargetDictionary).forEach(name => {
              const index = mesh.morphTargetDictionary[name]
              blendShapeList.push({
                name: `${child.name}_${name}`,
                weight: 0,
                category: 'custom'
              })
            })
          } else {
            // 如果沒有名稱字典，使用索引
            for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
              blendShapeList.push({
                name: `${child.name}_BlendShape_${i}`,
                weight: 0,
                category: 'custom'
              })
            }
          }
        }
      }
    })

    // 4. 檢查LookAt功能
    if (vrm.lookAt) {
      blendShapeList.push({
        name: 'lookat_horizontal',
        weight: 0,
        category: 'lookat'
      })
      blendShapeList.push({
        name: 'lookat_vertical', 
        weight: 0,
        category: 'lookat'
      })
    }

    // 5. 添加常見的口型同步BlendShape
    const commonMouthShapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'blink']
    commonMouthShapes.forEach(shape => {
      if (!blendShapeList.some(bs => bs.name === shape)) {
        blendShapeList.push({
          name: shape,
          weight: 0,
          category: 'mouth'
        })
      }
    })

    setBlendShapes(blendShapeList)
    console.log('📋 找到的BlendShape:', blendShapeList)
  }

  // 測試BlendShape權重
  const testBlendShape = (name: string, weight: number) => {
    const { viewer } = homeStore.getState()
    const { model } = viewer
    
    if (model?.vrm) {
      let found = false
      
      // 1. 嘗試使用Expression Manager (預設表情)
      if (model.vrm.expressionManager) {
        const expressions = model.vrm.expressionManager.expressions
        if (expressions && (expressions as any)[name]) {
          try {
            model.vrm.expressionManager.setValue(name as any, weight)
            console.log(`🎭 設定預設表情 ${name} 權重: ${weight}`)
            found = true
          } catch (error) {
            console.log(`❌ 無法設定預設表情 ${name}:`, error)
          }
        }
      }

      // 2. 嘗試直接操作Mesh的BlendShape
      if (!found) {
        model.vrm.scene.traverse((child) => {
          if (child.type === 'SkinnedMesh') {
            const mesh = child as any
            if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
              console.log(`🔍 檢查Mesh: ${child.name}`)
              console.log(`📋 morphTargetDictionary:`, mesh.morphTargetDictionary)
              
              // 檢查完整名稱匹配
              let index = mesh.morphTargetDictionary[name]
              if (index !== undefined) {
                mesh.morphTargetInfluences[index] = weight
                console.log(`🎨 設定BlendShape ${name} 權重: ${weight}`)
                found = true
                return
              }
              
              // 檢查部分名稱匹配 (去掉前綴)
              const shortName = name.split('_').pop()
              if (shortName && shortName !== name) {
                index = mesh.morphTargetDictionary[shortName]
                if (index !== undefined) {
                  mesh.morphTargetInfluences[index] = weight
                  console.log(`🎨 設定BlendShape ${shortName} 權重: ${weight}`)
                  found = true
                  return
                }
              }
              
              // 檢查所有可能的匹配
              for (const [dictName, dictIndex] of Object.entries(mesh.morphTargetDictionary)) {
                if (name.includes(dictName) || dictName.includes(name.split('_').pop() || '')) {
                  mesh.morphTargetInfluences[dictIndex as number] = weight
                  console.log(`🎨 設定BlendShape ${dictName} 權重: ${weight}`)
                  
                  // 強制更新模型
                  mesh.morphTargetInfluences.needsUpdate = true
                  mesh.morphTargetInfluences.version++
                  
                  found = true
                  return
                }
              }
            }
          }
        })
      }

      if (!found) {
        console.log(`⚠️ 未找到BlendShape: ${name}`)
      } else {
        // 強制更新VRM模型
        if (model.vrm) {
          model.vrm.update(0.016) // 模擬一幀的時間
          console.log(`🔄 強制更新VRM模型`)
        }
      }
    }

    // 更新本地狀態
    setCustomWeight(prev => ({
      ...prev,
      [name]: weight
    }))
  }

  // 智能表情匹配函數
  const findEmotionBlendShape = (emotionName: string): string | null => {
    // 表情名稱映射
    const emotionMappings: { [key: string]: string[] } = {
      'surprised': ['Surprised', 'surprised', 'SURPRISED'],
      'happy': ['Joy', 'joy', 'JOY', 'Fun', 'fun', 'FUN', 'Happy', 'happy', 'HAPPY'],
      'sad': ['Sorrow', 'sorrow', 'SORROW', 'Sad', 'sad', 'SAD'],
      'angry': ['Angry', 'angry', 'ANGRY'],
      'neutral': ['Neutral', 'neutral', 'NEUTRAL'],
      'aa': ['aa', 'AA', 'A', 'a', 'Mouth', 'mouth', 'MOUTH'],
      'blink': ['Close', 'close', 'CLOSE', 'Blink', 'blink', 'BLINK']
    }

    const targetEmotions = emotionMappings[emotionName] || [emotionName]
    
    // 在BlendShape列表中尋找匹配的項目
    for (const bs of blendShapes) {
      for (const target of targetEmotions) {
        if (bs.name.includes(target)) {
          console.log(`🔍 找到匹配的BlendShape: ${bs.name} (搜尋: ${emotionName})`)
          return bs.name
        }
      }
    }
    
    console.log(`❌ 未找到匹配的BlendShape: ${emotionName}`)
    return null
  }

  // 智能表情測試
  const testSmartEmotion = (emotionName: string, weight: number = 1) => {
    console.log(`🎭 智能測試表情: ${emotionName}`)
    
    const foundBlendShape = findEmotionBlendShape(emotionName)
    if (foundBlendShape) {
      testBlendShape(foundBlendShape, weight)
    } else {
      console.log(`⚠️ 無法找到表情 ${emotionName} 對應的BlendShape`)
    }
  }

  // 重置所有BlendShape
  const resetAllBlendShapes = () => {
    const { viewer } = homeStore.getState()
    const { model } = viewer
    
    if (model?.vrm) {
      // 重置Expression Manager
      if (model.vrm.expressionManager) {
        const expressions = model.vrm.expressionManager.expressions
        if (expressions) {
          Object.keys(expressions).forEach(name => {
            model.vrm?.expressionManager?.setValue(name as any, 0)
          })
        }
      }

      // 重置Mesh BlendShape
      model.vrm.scene.traverse((child) => {
        if (child.type === 'SkinnedMesh') {
          const mesh = child as any
          if (mesh.morphTargetInfluences) {
            for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
              mesh.morphTargetInfluences[i] = 0
            }
          }
        }
      })
    }

    setCustomWeight({})
    console.log('🔄 重置所有BlendShape')
  }

  // 單一表情測試（會先重置其他表情）
  const testSingleEmotion = (emotionName: string, weight: number = 1) => {
    console.log(`🎭 測試單一表情: ${emotionName}`)
    
    // 先重置所有表情
    resetAllBlendShapes()
    
    // 等待重置完成後設定新表情
    setTimeout(() => {
      testSmartEmotion(emotionName, weight)
    }, 100)
  }

  // 直接測試BlendShape（不重置）
  const testDirectBlendShape = (blendShapeName: string, weight: number = 1) => {
    console.log(`🎨 直接測試BlendShape: ${blendShapeName}`)
    testBlendShape(blendShapeName, weight)
  }

  // 使用EmoteController測試表情（與emotion-test相同的方法）
  const testEmotionWithController = (emotion: string) => {
    console.log(`🎭 使用EmoteController測試表情: ${emotion}`)
    const { viewer } = homeStore.getState()
    if (viewer.model?.vrm) {
      // 先重置所有表情
      resetAllBlendShapes()
      
      // 使用EmoteController播放表情
      setTimeout(() => {
        viewer.model?.playEmotion(emotion as any)
        console.log(`✅ 使用EmoteController播放表情: ${emotion}`)
      }, 100)
    }
  }

  // 強制渲染更新
  const forceRenderUpdate = () => {
    const { viewer } = homeStore.getState()
    if (viewer) {
      // 觸發渲染循環
      viewer.update()
      console.log(`🔄 強制渲染更新`)
    }
  }

  // 移除持續渲染循環，避免卡頓

  // 按類別分組BlendShape
  const groupedBlendShapes = blendShapes.reduce((acc, bs) => {
    if (!acc[bs.category]) {
      acc[bs.category] = []
    }
    acc[bs.category].push(bs)
    return acc
  }, {} as { [key: string]: BlendShapeInfo[] })

  const categoryColors = {
    preset: 'bg-blue-100 text-blue-800',
    custom: 'bg-green-100 text-green-800', 
    blink: 'bg-yellow-100 text-yellow-800',
    lookat: 'bg-purple-100 text-purple-800',
    mouth: 'bg-pink-100 text-pink-800'
  }

  const categoryLabels = {
    preset: '預設表情',
    custom: '自定義BlendShape',
    blink: '眨眼',
    lookat: '視線追蹤',
    mouth: '口型同步'
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">VRM BlendShape 檢查器</h1>
        
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

          {/* 中間：BlendShape列表 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">BlendShape 列表</h2>
                <div className="flex gap-2">
                  <button
                    onClick={forceRenderUpdate}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    強制渲染
                  </button>
                  <button
                    onClick={resetAllBlendShapes}
                    className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                  >
                    重置全部
                  </button>
                </div>
              </div>
            
            <div className="max-h-96 overflow-y-auto space-y-4">
              {Object.entries(groupedBlendShapes).map(([category, shapes]) => (
                <div key={category}>
                  <h3 className={`text-sm font-medium px-2 py-1 rounded ${categoryColors[category as keyof typeof categoryColors]} mb-2`}>
                    {categoryLabels[category as keyof typeof categoryLabels]} ({shapes.length})
                  </h3>
                  <div className="space-y-2">
                    {shapes.map((bs) => (
                      <div key={bs.name} className="flex items-center space-x-2">
                        <span className="text-xs text-gray-600 w-32 truncate" title={bs.name}>
                          {bs.name}
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={customWeight[bs.name] || 0}
                          onChange={(e) => {
                            const newWeight = parseFloat(e.target.value)
                            testBlendShape(bs.name, newWeight)
                          }}
                          className="flex-1"
                        />
                        <span className="text-xs w-8 text-center">
                          {((customWeight[bs.name] || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右側：控制面板 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">控制面板</h2>
            
            {/* 快速測試按鈕 */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium">快速測試</h3>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => testEmotionWithController('surprised')}
                  className="px-3 py-2 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                >
                  驚訝 (EmoteController)
                </button>
                <button
                  onClick={() => testEmotionWithController('happy')}
                  className="px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                >
                  開心 (EmoteController)
                </button>
                <button
                  onClick={() => testEmotionWithController('sad')}
                  className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  悲傷 (EmoteController)
                </button>
                <button
                  onClick={() => testEmotionWithController('angry')}
                  className="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  生氣 (EmoteController)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => testEmotionWithController('aa')}
                  className="px-3 py-2 bg-pink-500 text-white rounded text-sm hover:bg-pink-600"
                >
                  張嘴 (EmoteController)
                </button>
                <button
                  onClick={() => testEmotionWithController('blink')}
                  className="px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                >
                  眨眼 (EmoteController)
                </button>
              </div>

              {/* 針對此模型的特殊測試 */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">針對此模型的測試</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => testSingleEmotion('Surprised', 1)}
                    className="px-3 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600"
                  >
                    驚訝 (Surprised)
                  </button>
                  <button
                    onClick={() => testSingleEmotion('Joy', 1)}
                    className="px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  >
                    開心 (Joy)
                  </button>
                  <button
                    onClick={() => testSingleEmotion('Sorrow', 1)}
                    className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    悲傷 (Sorrow)
                  </button>
                  <button
                    onClick={() => testSingleEmotion('Angry', 1)}
                    className="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                  >
                    生氣 (Angry)
                  </button>
                </div>
              </div>

              {/* 直接BlendShape測試 */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">直接BlendShape測試</h4>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => testDirectBlendShape('Face_(merged)baked_Fcl_ALL_Angry', 1)}
                    className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    Face_ALL_Angry
                  </button>
                  <button
                    onClick={() => testDirectBlendShape('Face_(merged)baked_Fcl_ALL_Surprised', 1)}
                    className="px-3 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
                  >
                    Face_ALL_Surprised
                  </button>
                  <button
                    onClick={() => testDirectBlendShape('Face_(merged)baked_Fcl_ALL_Joy', 1)}
                    className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Face_ALL_Joy
                  </button>
                  <button
                    onClick={() => testDirectBlendShape('Face_(merged)baked_Fcl_EYE_Close', 1)}
                    className="px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                  >
                    Face_EYE_Close
                  </button>
                </div>
              </div>
            </div>

            {/* 使用說明 */}
            <div className="mt-6 bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">使用說明</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 選擇VRM模型載入</li>
                <li>• 查看所有可用的BlendShape</li>
                <li>• 拖動滑桿測試表情效果</li>
                <li>• 尋找適合的張嘴BlendShape</li>
                <li>• 查看控制台了解詳細資訊</li>
              </ul>
            </div>

            {/* 統計資訊 */}
            <div className="mt-4 bg-gray-50 p-3 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">統計資訊</h4>
              <div className="text-sm text-gray-700 space-y-1">
                <div>總BlendShape數量: {blendShapes.length}</div>
                {Object.entries(groupedBlendShapes).map(([category, shapes]) => (
                  <div key={category}>
                    {categoryLabels[category as keyof typeof categoryLabels]}: {shapes.length}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 控制台輸出區域 */}
        <div className="mt-8 bg-black text-green-400 p-4 rounded-lg font-mono text-sm">
          <h3 className="text-white mb-2">控制台輸出</h3>
          <p>請打開瀏覽器開發者工具 (F12) 查看詳細的BlendShape資訊</p>
        </div>
      </div>
    </div>
  )
}
