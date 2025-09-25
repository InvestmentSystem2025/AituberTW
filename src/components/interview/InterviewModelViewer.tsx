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

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // VRM 模型處理
  const handleVrmCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (canvas && modelType === 'vrm') {
      const { viewer } = homeStore.getState()
      const { selectedVrmPath } = settingsStore.getState()
      viewer.setup(canvas)
      viewer.loadVrm(selectedVrmPath)
    }
  }, [modelType])

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
          ref={handleVrmCanvas}
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

