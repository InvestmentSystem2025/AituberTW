import { useState, useRef, useCallback } from 'react'

interface RecordingOptions {
  enableRecording: boolean
}

export const useInterviewRecording = (options: RecordingOptions) => {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  /**
   * 備用下載函數（當伺服器保存失敗時使用）
   */
  const downloadToLocalBrowser = (blob: Blob, filename: string) => {
    console.log('💾 使用瀏覽器下載作為備用方案...')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = url
    a.download = filename
    
    document.body.appendChild(a)
    
    setTimeout(() => {
      a.click()
      console.log(`✅ 錄製檔案已觸發下載: ${filename}`)
      console.log(`📂 檔案將下載到瀏覽器預設下載資料夾`)
      
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        console.log('🧹 下載連結已清理')
      }, 1000)
    }, 100)
  }

  /**
   * 開始錄製
   */
  const startRecording = useCallback(async () => {
    if (!options.enableRecording) {
      console.log('⏸️ 錄製功能未啟用')
      return
    }

    try {
      console.log('🎬 開始準備錄製面試...')
      setRecordingError(null)
      recordedChunksRef.current = []

      // 獲取螢幕錄製權限（包含音頻）
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        } as any,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } as any,
      })

      console.log('✅ 螢幕錄製權限獲取成功')

      // 嘗試獲取麥克風音頻（可選）
      let audioStream: MediaStream | null = null
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        console.log('✅ 麥克風音頻獲取成功')
      } catch (audioError) {
        console.warn('⚠️ 無法獲取麥克風音頻:', audioError)
      }

      // 合併視頻和音頻軌道
      const tracks: MediaStreamTrack[] = [...displayStream.getVideoTracks()]
      
      // 創建 AudioContext 來混合音頻
      const audioContext = new AudioContext()
      const audioDestination = audioContext.createMediaStreamDestination()
      
      // 添加系統音頻（如果有）
      if (displayStream.getAudioTracks().length > 0) {
        const systemAudioSource = audioContext.createMediaStreamSource(
          new MediaStream(displayStream.getAudioTracks())
        )
        systemAudioSource.connect(audioDestination)
        console.log('🔊 已添加系統音頻')
      }
      
      // 添加麥克風音頻（如果有）
      if (audioStream && audioStream.getAudioTracks().length > 0) {
        const micAudioSource = audioContext.createMediaStreamSource(audioStream)
        micAudioSource.connect(audioDestination)
        console.log('🎤 已添加麥克風音頻')
      }
      
      // 添加混合後的音頻軌道
      if (audioDestination.stream.getAudioTracks().length > 0) {
        tracks.push(...audioDestination.stream.getAudioTracks())
        console.log(`🎵 音頻軌道總數: ${audioDestination.stream.getAudioTracks().length}`)
      }

      const combinedStream = new MediaStream(tracks)
      streamRef.current = combinedStream

      // 創建 MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000, // 2.5 Mbps
        audioBitsPerSecond: 128000,  // 128 kbps
      }

      // 檢查支援的 mimeType
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        console.warn('VP9 不支援，使用 VP8')
        options.mimeType = 'video/webm;codecs=vp8,opus'
        
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
          console.warn('VP8 不支援，使用預設編碼')
          options.mimeType = 'video/webm'
        }
      }

      console.log(`🎥 使用編碼: ${options.mimeType}`)

      const mediaRecorder = new MediaRecorder(combinedStream, options)
      mediaRecorderRef.current = mediaRecorder

      // 處理錄製數據
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
          console.log(`📦 錄製數據片段: ${event.data.size} bytes`)
        }
      }

      // 處理錄製停止
      mediaRecorder.onstop = async () => {
        console.log('🛑 錄製停止，開始處理檔案...')
        console.log(`📦 共收集了 ${recordedChunksRef.current.length} 個數據片段`)
        
        if (recordedChunksRef.current.length === 0) {
          console.error('❌ 沒有錄製到任何數據')
          setRecordingError('錄製失敗：沒有錄製到任何數據')
          return
        }

        try {
          // 合併所有錄製片段
          const blob = new Blob(recordedChunksRef.current, {
            type: 'video/webm',
          })
          
          console.log(`📊 錄製檔案大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)

          // 生成檔案名稱
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const filename = `interview_recording_${timestamp}.webm`

          // 將 Blob 轉換為 Base64 並上傳到伺服器
          console.log('📤 開始上傳錄製檔案到伺服器...')
          
          const reader = new FileReader()
          reader.onloadend = async () => {
            try {
              const base64data = reader.result as string
              
              const response = await fetch('/api/save-interview-recording', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  filename,
                  videoData: base64data,
                }),
              })
              
              const result = await response.json()
              
              if (response.ok && result.success) {
                console.log(`✅ 錄製檔案已保存到專案資料夾: ${result.filePath}`)
                console.log(`📂 檔案位置: interview-recordings/${filename}`)
              } else {
                console.error('❌ 上傳錄製檔案失敗:', result.message)
                // 如果上傳失敗，使用瀏覽器下載作為備用
                downloadToLocalBrowser(blob, filename)
              }
            } catch (error) {
              console.error('❌ 上傳錄製檔案時發生錯誤:', error)
              // 如果上傳失敗，使用瀏覽器下載作為備用
              downloadToLocalBrowser(blob, filename)
            }
          }
          
          reader.readAsDataURL(blob)
          
          // 清理
          recordedChunksRef.current = []
          
          // 停止所有媒體軌道
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
              track.stop()
              console.log(`⏹️ 已停止媒體軌道: ${track.kind}`)
            })
            streamRef.current = null
          }
          
          console.log('✅ 錄製完整流程結束')
        } catch (error) {
          console.error('❌ 處理錄製檔案時發生錯誤:', error)
          setRecordingError(`保存錄製失敗: ${error}`)
        }
      }

      // 處理錄製錯誤
      mediaRecorder.onerror = (event: any) => {
        console.error('❌ 錄製錯誤:', event.error)
        setRecordingError(`錄製錯誤: ${event.error?.message || '未知錯誤'}`)
      }

      // 開始錄製（每 10 秒保存一次數據）
      mediaRecorder.start(10000)
      setIsRecording(true)
      console.log('✅ 錄製已開始')

      // 監聽用戶停止分享
      displayStream.getVideoTracks()[0].onended = () => {
        console.log('👋 用戶停止了螢幕分享，停止錄製')
        stopRecording()
      }

    } catch (error: any) {
      console.error('❌ 開始錄製失敗:', error)
      setRecordingError(`開始錄製失敗: ${error.message || '未知錯誤'}`)
      setIsRecording(false)
    }
  }, [options.enableRecording])

  /**
   * 停止錄製
   */
  const stopRecording = useCallback(() => {
    console.log('🛑 stopRecording 被調用')
    console.log('🔍 mediaRecorderRef.current:', !!mediaRecorderRef.current)
    console.log('🔍 isRecording 狀態:', isRecording)
    
    // 強制停止，不依賴 isRecording 狀態
    if (mediaRecorderRef.current) {
      console.log('🔍 MediaRecorder 狀態:', mediaRecorderRef.current.state)
      
      try {
        // 立即停止錄製
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
          console.log('✅ MediaRecorder.stop() 已調用')
        } else {
          console.log('⚠️ MediaRecorder 已經是 inactive 狀態')
        }
        setIsRecording(false)
      } catch (error) {
        console.error('❌ 停止錄製時發生錯誤:', error)
        setRecordingError(`停止錄製失敗: ${error}`)
      }
    } else {
      console.log('⚠️ mediaRecorderRef.current 為 null')
    }
  }, [isRecording])

  /**
   * 取消錄製（不保存）
   */
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      console.log('❌ 取消錄製')
      mediaRecorderRef.current.stop()
      recordedChunksRef.current = []
      setIsRecording(false)
      
      // 停止所有媒體軌道
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  return {
    isRecording,
    recordingError,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}

