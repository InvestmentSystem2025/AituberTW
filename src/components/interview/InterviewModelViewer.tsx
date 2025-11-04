import React, { useCallback, useEffect, useRef, useState } from 'react'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'

interface InterviewModelViewerProps {
  modelType: 'vrm' | 'live2d'
}

export const InterviewModelViewer: React.FC<InterviewModelViewerProps> = ({
  modelType,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isMounted, setIsMounted] = useState(false)
  const selectedVrmPath = settingsStore((s) => s.selectedVrmPath)
  const isSetupRef = useRef(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // 初始化viewer setup（只執行一次）
  useEffect(() => {
    if (canvasRef.current && modelType === 'vrm' && !isSetupRef.current && isMounted) {
      const { viewer } = homeStore.getState()
      const currentVrmPath = settingsStore.getState().selectedVrmPath
      
      // 確保 canvas 已經掛載
      const timeoutId = setTimeout(() => {
        if (canvasRef.current && !isSetupRef.current) {
          try {
            viewer.setup(canvasRef.current)
            isSetupRef.current = true
            
            // 如果已經有 selectedVrmPath，立即載入模型
            if (currentVrmPath) {
              viewer.loadVrm(currentVrmPath)
            }
          } catch (error) {
            console.error('Failed to setup viewer:', error)
          }
        }
      }, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [modelType, isMounted])

  // 當 selectedVrmPath 改變時，重新載入模型（setup 之後）
  useEffect(() => {
    if (canvasRef.current && modelType === 'vrm' && selectedVrmPath && isSetupRef.current) {
      const { viewer } = homeStore.getState()
      try {
        viewer.loadVrm(selectedVrmPath)
      } catch (error) {
        console.error('Failed to load VRM model:', error)
      }
    }
  }, [selectedVrmPath, modelType])

  if (!isMounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-200">
        <div className="text-gray-500">載入中...</div>
      </div>
    )
  }

  if (modelType === 'vrm') {
    return (
      <div className="w-full h-full relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: 'block' }}
        />
      </div>
    )
  }

  // Live2D 模型處理
  return (
    <div className="w-full h-full relative">
      <div className="w-full h-full flex items-center justify-center bg-gray-200">
        <div className="text-gray-500">Live2D 模型載入中...</div>
      </div>
    </div>
  )
}

