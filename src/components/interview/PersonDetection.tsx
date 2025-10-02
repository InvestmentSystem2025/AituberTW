console.log('👀 This is client-side log')
import React, { useRef, useEffect, useState, useCallback } from 'react'

interface PersonDetectionProps {
  onPersonDetected: (isDetected: boolean, confidence: number) => void
  onDetectionError: (error: string) => void
  onStartInterview?: () => void
}

export const PersonDetection: React.FC<PersonDetectionProps> = ({
  onPersonDetected,
  onDetectionError,
  onStartInterview,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionStatus, setDetectionStatus] = useState<string>('初始化中...')
  const [showStartPrompt, setShowStartPrompt] = useState(false)
  const [detectionStartTime, setDetectionStartTime] = useState<number | null>(null)

  const faceDetectorRef = useRef<any>(null)
  const animationFrameIdRef = useRef<number | null>(null)

  // 調試：確認組件被渲染（只在初始化時顯示）
  useEffect(() => {
    console.log('🎬 PersonDetection 組件被渲染！')
  }, [])

  // 初始化 MediaPipe FaceDetector
  const initializeFaceDetector = useCallback(async () => {
    try {
      setDetectionStatus('載入 MediaPipe 模型中...')

      const { FilesetResolver, FaceDetector } = await import(
        '@mediapipe/tasks-vision'
      )
      console.log('✅ MediaPipe 模組載入成功')
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      )
      console.log('✅ FilesetResolver 初始化成功')

      faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.3, // 降低信心度要求
        minSuppressionThreshold: 0.3,
      })

      console.log('✅ FaceDetector 創建成功')
      setIsInitialized(true)
      setDetectionStatus('模型載入完成，等待鏡頭權限...')
    } catch (error) {
      console.error('MediaPipe 初始化失敗:', error)
      onDetectionError(`MediaPipe 初始化失敗: ${error}`)
      setDetectionStatus('初始化失敗')
    }
  }, [onDetectionError])

  // 初始化鏡頭
  const initializeCamera = useCallback(async () => {
    try {
      console.log('📹 開始初始化鏡頭')

      if (!navigator.mediaDevices) {
        throw new Error('此瀏覽器不支援 MediaDevices API')
      }

      console.log('🔍 檢查 MediaDevices API 支援:', !!navigator.mediaDevices)
      setDetectionStatus('請求鏡頭權限中...')

      console.log('🎥 請求鏡頭權限...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      })
      console.log('✅ 鏡頭權限獲取成功')

      if (videoRef.current) {
        console.log('📺 設置視頻流到 video 元素')
        videoRef.current.srcObject = stream

        console.log('▶️ 開始播放視頻')
        await videoRef.current.play()

        console.log('🎯 視頻播放成功，開始檢測')
        setDetectionStatus('鏡頭已啟動，開始檢測...')
        console.log('🔧 設置 isDetecting = true')
        setIsDetecting(true)

        // 等待視頻載入完成
        videoRef.current.addEventListener('loadedmetadata', () => {
          console.log(
            '📏 視頻尺寸:',
            videoRef.current?.videoWidth,
            'x',
            videoRef.current?.videoHeight
          )
        })
      }
    } catch (error) {
      console.error('❌ 鏡頭初始化失敗:', error)
      onDetectionError(`鏡頭初始化失敗: ${error}`)
      setDetectionStatus('鏡頭初始化失敗')
    }
  }, [onDetectionError])

  // 執行人臉檢測
  const detectFaces = useCallback(async () => {
    if (!faceDetectorRef.current || !videoRef.current || !canvasRef.current) {
      console.log('檢測條件不滿足:', {
        faceDetector: !!faceDetectorRef.current,
        video: !!videoRef.current,
        canvas: !!canvasRef.current,
      })
      return
    }

    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        console.log('無法獲取 canvas context')
        return
      }

      // 設定 canvas 尺寸
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      // 執行檢測
      const detections = faceDetectorRef.current.detectForVideo(video, performance.now())

      // 清除 canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 檢測邏輯：檢測到人臉超過3秒後顯示開始提示
      if (detections.detections.length > 0) {
        const currentTime = Date.now()
        
        // 如果是第一次檢測到人臉，記錄開始時間
        if (!detectionStartTime) {
          setDetectionStartTime(currentTime)
          console.log('✅ 檢測到人臉，開始計時...')
        }
        
        // 檢查是否已經檢測超過3秒
        const detectionDuration = currentTime - (detectionStartTime || currentTime)
        
        if (detectionDuration >= 3000 && !showStartPrompt) {
          console.log('✅ 檢測到人臉超過3秒，顯示開始提示')
          setShowStartPrompt(true)
          setDetectionStatus('已偵測到面試者，如您準備好請按下開始面試')
          setIsDetecting(false) // 停止檢測循環
          // 不調用 onPersonDetected，等待手動開始
        }

        // 繪製檢測框
        const detection = detections.detections[0]
        const bbox = detection.boundingBox

        if (bbox) {
          ctx.strokeStyle = '#00FF00'
          ctx.lineWidth = 3
          ctx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height)

          // 顯示檢測狀態
          ctx.fillStyle = '#00FF00'
          ctx.font = '20px Arial'
          if (showStartPrompt) {
            ctx.fillText('準備開始面試', 10, 30)
          } else {
            ctx.fillText('檢測中...', 10, 30)
          }
        }
      } else {
        // 未檢測到人臉，重置計時
        if (detectionStartTime) {
          console.log('❌ 人臉消失，重置檢測計時')
          setDetectionStartTime(null)
          setShowStartPrompt(false)
          setDetectionStatus('未檢測到人員')
          onPersonDetected(false, 0)
        }
      }
    } catch (error) {
      console.error('❌ 檢測過程發生錯誤:', error)
      onDetectionError(`檢測錯誤: ${error}`)
    }
  }, [onPersonDetected, onDetectionError, detectionStartTime, showStartPrompt])

  // 檢測循環
  const detectionLoop = useCallback(() => {
    if (isDetecting && faceDetectorRef.current) {
      detectFaces()
      animationFrameIdRef.current = requestAnimationFrame(detectionLoop)
    } else {
      console.log('檢測循環停止:', {
        isDetecting,
        faceDetector: !!faceDetectorRef.current,
      })
    }
  }, [isDetecting, detectFaces])

  // 組件初始化
  useEffect(() => {
    console.log('🎬 PersonDetection 組件初始化')
    initializeFaceDetector()

    return () => {
      console.log('🧹 PersonDetection 組件清理')
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
      if (faceDetectorRef.current) {
        faceDetectorRef.current.close()
      }
    }
  }, [initializeFaceDetector])

  // 當初始化完成後啟動鏡頭
  useEffect(() => {
    if (isInitialized) {
      console.log('✅ MediaPipe 初始化完成，開始初始化鏡頭')
      initializeCamera()
    } else {
      console.log('⏳ 等待 MediaPipe 初始化完成...')
    }
  }, [isInitialized, initializeCamera])

  // 當檢測狀態改變時啟動/停止檢測循環
  useEffect(() => {
    console.log('🔍 檢測狀態檢查:', {
      isDetecting,
      faceDetector: !!faceDetectorRef.current,
      faceDetectorType: typeof faceDetectorRef.current
    })
    
    if (isDetecting && faceDetectorRef.current) {
      console.log('🔄 開始檢測循環')
      detectionLoop()
    } else {
      console.log('⏸️ 檢測循環暫停:', {
        isDetecting,
        faceDetector: !!faceDetectorRef.current,
      })
    }

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [isDetecting, detectionLoop])

  // 手動開始面試
  const handleStartInterview = useCallback(() => {
    console.log('🎯 手動開始面試')
    setShowStartPrompt(false)
    setDetectionStartTime(null)
    setDetectionStatus('面試即將開始...')
    
    // 先通知檢測到人員，觸發面試流程
    onPersonDetected(true, 1.0)
    
    // 然後觸發面試開始的回調
    if (onStartInterview) {
      onStartInterview()
    }
  }, [onStartInterview, onPersonDetected])

  return (
    <div className="relative w-full h-full">
      {/* 檢測狀態指示器 */}
      <div className="absolute top-4 left-4 z-10 bg-black/70 text-white px-3 py-2 rounded-lg text-sm">
        {detectionStatus}
      </div>

      {/* 螢幕中央提示語 */}
      {showStartPrompt && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-black/80 text-white px-8 py-6 rounded-lg text-center max-w-md mx-4 pointer-events-auto">
            <div className="text-2xl font-bold mb-4">已偵測到面試者</div>
            <div className="text-lg mb-6">如您準備好請按下開始面試</div>
            <button
              onClick={handleStartInterview}
              className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg text-lg transition-colors"
            >
              開始面試
            </button>
          </div>
        </div>
      )}

      {/* 視頻和檢測框 */}
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
      </div>

      {/* 檢測控制按鈕 */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => setIsDetecting(!isDetecting)}
          className={`px-4 py-2 rounded-lg text-white font-medium ${
            isDetecting
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {isDetecting ? '停止檢測' : '開始檢測'}
        </button>
        
        {/* 開始面試按鈕 - 只在顯示提示時出現 */}
        {showStartPrompt && (
          <button
            onClick={handleStartInterview}
            className="px-6 py-2 rounded-lg text-white font-medium bg-blue-500 hover:bg-blue-600"
          >
            開始面試
          </button>
        )}
      </div>
    </div>
  )
}
