import { useCallback, useEffect, useMemo, useState } from 'react'

import { configureObsStream, startObsStream, stopObsStream } from '@/lib/obsWebSocket'
import { TextButton } from '../textButton'
import settingsStore from '@/features/stores/settings'

interface LiveCreationResult {
  broadcastId: string
  streamId: string
  liveChatId: string | null
  ingestionInfo: {
    ingestionAddress: string | null
    backupIngestionAddress: string | null
    streamName: string | null
  }
  scheduledStartTime: string | null
  enableAutoStart: boolean
  enableAutoStop: boolean
}

const DEFAULT_PRIVACY = 'private'
const PRIVACY_OPTIONS = [
  { value: 'public', label: '公開 (public)' },
  { value: 'unlisted', label: '不公開連結 (unlisted)' },
  { value: 'private', label: '私人 (private)' },
]

type PrivacyStatus = (typeof PRIVACY_OPTIONS)[number]['value']

const buildLiveInfoMessage = (data: LiveCreationResult) => {
  const ingestionAddress = data.ingestionInfo.ingestionAddress
    ? `Primary Server: ${data.ingestionInfo.ingestionAddress}`
    : 'Primary Server: -'
  const streamKey = data.ingestionInfo.streamName
    ? `Stream Key: ${data.ingestionInfo.streamName}`
    : 'Stream Key: -'
  const broadcastId = `Broadcast ID: ${data.broadcastId}`
  const streamId = `Stream ID: ${data.streamId}`
  return ['✅ 已建立直播並取得串流設定', broadcastId, streamId, ingestionAddress, streamKey].join('\n')
}

const YoutubeUpload = () => {
  const [authorized, setAuthorized] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [authorizing, setAuthorizing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [configuringObs, setConfiguringObs] = useState(false)
  const [launchingObs, setLaunchingObs] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>(DEFAULT_PRIVACY)
  const initialScheduledTime = useMemo(() => {
    const stored = settingsStore.getState().youtubeScheduledStart
    if (!stored) return ''
    const date = new Date(stored)
    if (Number.isNaN(date.getTime())) return ''
    return stored.slice(0, 16)
  }, [])

  const [scheduledTime, setScheduledTime] = useState<string>(initialScheduledTime)
  const [enableAutoStart, setEnableAutoStart] = useState(true)
  const [enableAutoStop, setEnableAutoStop] = useState(true)
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(
    () => settingsStore.getState().youtubeAutoUpload ?? true
  )

  const [result, setResult] = useState<LiveCreationResult | null>(null)
  const message = settingsStore((state) => state.youtubeLastBroadcastInfo)
  const setMessage = useCallback((text: string) => {
    settingsStore.setState({ youtubeLastBroadcastInfo: text })
  }, [])
  const [error, setError] = useState<string>('')
  const [obsConfigured, setObsConfigured] = useState(
    () => settingsStore.getState().youtubeObsConfigured
  )
  const [uploading, setUploading] = useState(false)
  const [stoppingBroadcast, setStoppingBroadcast] = useState(false)

  const scheduledStartISO = useMemo(() => {
    if (!scheduledTime) return null
    const asDate = new Date(scheduledTime)
    if (Number.isNaN(asDate.getTime())) return null
    return asDate.toISOString()
  }, [scheduledTime])

  useEffect(() => {
    const check = async () => {
      setCheckingAuth(true)
      try {
        const res = await fetch('/api/youtube/check-auth')
        const data = await res.json()
        setAuthorized(Boolean(data.authorized))
      } catch (err) {
        console.error('[YouTube] Failed to check auth status', err)
      } finally {
        setCheckingAuth(false)
      }
    }

    void check()
  }, [])

  const pollAuthorization = useCallback(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const res = await fetch('/api/youtube/check-auth')
        const data = await res.json()
        if (data.authorized) {
          window.clearInterval(intervalId)
          setAuthorized(true)
          setAuthorizing(false)
          setMessage('✅ 已取得 YouTube 授權')
        }
      } catch (err) {
        console.error('[YouTube] polling auth failed', err)
        window.clearInterval(intervalId)
        setAuthorizing(false)
      }
    }, 2000)
  }, [])

  const handleAuthorize = useCallback(async () => {
    setError('')
    setMessage('')
    setAuthorizing(true)

    try {
      const res = await fetch('/api/youtube/oauth-url')
      if (!res.ok) {
        throw new Error('無法取得授權網址')
      }
      const data = await res.json()
      const authUrl: string | undefined = data.authUrl
      if (!authUrl) {
        throw new Error('授權網址格式錯誤')
      }

      window.open(authUrl, '_blank', 'width=500,height=700')
      pollAuthorization()
    } catch (err) {
      console.error('[YouTube] authorize failed', err)
      setAuthorizing(false)
      setError('取得授權網址失敗，請稍後再試。')
    }
  }, [pollAuthorization])

  const handleCreateLive = useCallback(async () => {
    if (!authorized) {
      setError('請先完成 YouTube 授權')
      return
    }

    if (!title.trim()) {
      setError('請輸入直播標題')
      return
    }

    setError('')
    setMessage('')
    setCreating(true)

    try {
      const res = await fetch('/api/youtube/create-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledStartTime: scheduledStartISO || undefined,
          privacyStatus,
          enableAutoStart,
          enableAutoStop,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text)
      }

      const data = (await res.json()) as LiveCreationResult
      setResult(data)
      const currentLiveId = settingsStore.getState().youtubeLiveId

      settingsStore.setState({
        youtubeBroadcastId: data.broadcastId,
        youtubeStreamId: data.streamId,
        youtubeStreamKey: data.ingestionInfo.streamName ?? '',
        youtubeIngestionAddress: data.ingestionInfo.ingestionAddress ?? '',
        youtubeObsConfigured: false,
        youtubeAutoUpload: autoUploadEnabled,
        youtubeLiveChatId: data.liveChatId ?? '',
        youtubeAutoLaunchTriggered: false,
      })

      if (!currentLiveId) {
        settingsStore.setState({ youtubeLiveId: data.broadcastId })
      }

      if (data.ingestionInfo.ingestionAddress && data.ingestionInfo.streamName) {
        try {
          await configureObsStream({
            ingestionAddress: data.ingestionInfo.ingestionAddress,
            streamKey: data.ingestionInfo.streamName,
          })
          settingsStore.setState({ youtubeObsConfigured: true })
          setObsConfigured(true)
          setMessage(
            `${buildLiveInfoMessage(data)}
OBS 設定已自動更新`
          )
        } catch (obsError) {
          console.error('[YouTube] configure OBS after create failed', obsError)
          setMessage(
            `${buildLiveInfoMessage(data)}
⚠️ 已建立直播，但設定 OBS 失敗，請確認 WebSocket 狀態。`
          )
        }
      } else {
        setMessage(buildLiveInfoMessage(data))
      }
    } catch (err: any) {
      console.error('[YouTube] create live failed', err)
      const defaultMessage = '建立直播失敗，請檢查授權與輸入資訊。'
      setError(err?.message ? `${defaultMessage}\n${err.message}` : defaultMessage)
    } finally {
      setCreating(false)
    }
  }, [authorized, description, enableAutoStart, enableAutoStop, privacyStatus, scheduledStartISO, title, autoUploadEnabled])

  const handleConfigureObs = useCallback(async () => {
    if (!result?.ingestionInfo?.ingestionAddress || !result?.ingestionInfo?.streamName) {
      setError('缺少串流伺服器或串流金鑰，請重新建立直播。')
      return
    }

    setError('')
    setMessage('')
    setConfiguringObs(true)

    try {
      await configureObsStream({
        ingestionAddress: result.ingestionInfo.ingestionAddress,
        streamKey: result.ingestionInfo.streamName,
      })
      setObsConfigured(true)
      setMessage('✅ 已更新 OBS 串流設定')
      settingsStore.setState({ youtubeObsConfigured: true })
    } catch (err) {
      console.error('[YouTube] configure OBS failed', err)
      setError('設定 OBS 時發生錯誤，請確認 OBS WebSocket 是否啟用。')
    } finally {
      setConfiguringObs(false)
    }
  }, [result])

  const handleStartObsImmediately = useCallback(async () => {
    setError('')
    setMessage('')
    setLaunchingObs(true)

    try {
      await startObsStream()
      setMessage('📡 已指示 OBS 開始串流')
    } catch (err) {
      console.error('[YouTube] start OBS stream failed', err)
      setError('啟動 OBS 串流失敗，請確認 OBS 是否啟動且 WebSocket 連線正常。')
    } finally {
      setLaunchingObs(false)
    }
  }, [])

  const uploadRecording = useCallback(
    async (fileName: string) => {
      setError('')
      setUploading(true)
      try {
        const res = await fetch('/api/youtube/upload-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName,
            title: title.trim() || fileName,
            description: description.trim() || undefined,
            privacyStatus,
          }),
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text)
        }

        const data = await res.json()
        setMessage(
          `🎬 已上傳影片至 YouTube (videoId=${data.videoId ?? 'unknown'})`
        )
      } catch (err: any) {
        console.error('[YouTube] upload recording failed', err)
        const defaultMessage = '上傳錄影檔失敗，請稍後再試。'
        setError(
          err?.message ? `${defaultMessage}\n${err.message}` : defaultMessage
        )
      } finally {
        setUploading(false)
      }
    },
    [description, privacyStatus, title]
  )

  const handleStopAndUpload = useCallback(async () => {
    if (!result?.broadcastId) {
      setError('尚未建立直播或缺少 broadcastId')
      return
    }

    setError('')
    setMessage('')
    setStoppingBroadcast(true)
    settingsStore.setState({
      youtubeAutoLaunchEnabled: false,
      youtubeAutoLaunchTriggered: false,
    })

    try {
      try {
        await stopObsStream()
      } catch (obsError) {
        console.warn('[YouTube] stop OBS failed, continue to YouTube stop', obsError)
      }

      let targetRecording = ''
      let attempts = 0
      const maxAttempts = 12

      while (attempts < maxAttempts && !targetRecording) {
        attempts += 1
        const targetRecordingResponse = await fetch('/api/youtube/list-recordings', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        })

        if (!targetRecordingResponse.ok) {
          const text = await targetRecordingResponse.text()
          console.warn('[YouTube] list recordings failed', text)
          setMessage('⌛ 正在確認錄影檔...' )
          await new Promise((resolve) => setTimeout(resolve, 1000))
          continue
        }

        const payload = await targetRecordingResponse.json()

        const recordingsList = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.recordings)
            ? payload.recordings
            : []

        if (recordingsList.length > 0 && recordingsList[0]?.fileName) {
          targetRecording = recordingsList[0].fileName
        }

        if (!targetRecording) {
          setMessage('⌛ 等待錄影檔寫入...')
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      if (!targetRecording) {
        throw new Error('找不到可上傳的錄影檔，請確認 OBS 錄影路徑與錄影設定。')
      }

      if (autoUploadEnabled) {
        await uploadRecording(targetRecording)
        setMessage('✅ 已停止直播並上傳錄影檔至 YouTube。')
      } else {
        setMessage('✅ 已停止直播，錄影檔已保留在 youtube-recordings 資料夾。')
      }
    } catch (err: any) {
      console.error('[YouTube] stop and upload failed', err)
      setError(
        err?.message ? `停止或上傳過程失敗：${err.message}` : '停止或上傳過程失敗'
      )
    } finally {
      setStoppingBroadcast(false)
      settingsStore.setState({
        youtubeBroadcastActive: false,
        youtubePlaying: false,
        youtubeLiveChatId: '',
      })
    }
  }, [autoUploadEnabled, result, uploadRecording])

  const youtubePlayingState = settingsStore((state) => state.youtubePlaying)
  const youtubeBroadcastActiveState = settingsStore(
    (state) => state.youtubeBroadcastActive
  )
  const youtubeAutoLaunchEnabled = settingsStore(
    (state) => state.youtubeAutoLaunchEnabled
  )
  const youtubeScheduledStartValue = settingsStore(
    (state) => state.youtubeScheduledStart
  )

  const authorizationStatusText = checkingAuth
    ? '檢查中'
    : authorized
      ? '已授權'
      : '未授權'

  const authorizationStatusClass = authorized
    ? 'bg-green-100 text-green-700'
    : checkingAuth
      ? 'bg-blue-100 text-blue-700'
      : 'bg-red-100 text-red-700'

  useEffect(() => {
    const iso = scheduledStartISO || ''
    settingsStore.setState({
      youtubeScheduledStart: iso,
      youtubeAutoLaunchTriggered: false,
    })
  }, [scheduledStartISO])

  useEffect(() => {
    settingsStore.setState({ youtubeAutoUpload: autoUploadEnabled })
  }, [autoUploadEnabled])

  const handleToggleAutoLaunch = useCallback(
    (checked: boolean) => {
      if (!checked) {
        settingsStore.setState({
          youtubeAutoLaunchEnabled: false,
          youtubeAutoLaunchTriggered: false,
        })
        return
      }

      if (!scheduledStartISO) {
        setError('請先設定排程時間後再啟用自動開播。')
        settingsStore.setState({
          youtubeAutoLaunchEnabled: false,
          youtubeAutoLaunchTriggered: false,
        })
        return
      }

      const targetDate = new Date(scheduledStartISO)
      if (Number.isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
        setError('排程時間必須是未來的時間，請重新設定。')
        settingsStore.setState({
          youtubeScheduledStart: '',
          youtubeAutoLaunchEnabled: false,
          youtubeAutoLaunchTriggered: false,
        })
        return
      }

      settingsStore.setState({
        youtubeAutoLaunchEnabled: true,
        youtubeAutoLaunchTriggered: false,
      })
      setMessage(
        `🕒 已排程在 ${targetDate.toLocaleString()} 自動啟動 OBS 串流。`
      )
    },
    [scheduledStartISO]
  )

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white/70 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-gray-500">YouTube 授權狀態</span>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${authorizationStatusClass}`}
            >
              {authorizationStatusText}
            </span>
            <p className="text-xs text-gray-500">
              授權完成後才能建立直播與啟用自動化流程。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TextButton
              onClick={handleAuthorize}
              disabled={authorizing || checkingAuth || authorized}
            >
              {checkingAuth
                ? '檢查授權中...'
                : authorizing
                  ? '授權中...'
                  : authorized
                    ? '已授權'
                    : '授權 YouTube'}
            </TextButton>
            {authorized && (
              <span className="text-xs text-gray-500">
                若需更換帳號，可先解除授權再重新授權。
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white/70 p-4">
        <h3 className="text-lg font-semibold mb-4">直播設定</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">直播標題</span>
            <input
              type="text"
              className="flex-1 px-3 py-2 border rounded-md"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">直播描述</span>
            <textarea
              className="flex-1 px-3 py-2 border rounded-md h-24"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">隱私設定</span>
            <select
              className="flex-1 px-3 py-2 border rounded-md"
              value={privacyStatus}
              onChange={(e) => setPrivacyStatus(e.target.value as PrivacyStatus)}
            >
              {PRIVACY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">排程時間</span>
            <input
              type="datetime-local"
              className="flex-1 px-3 py-2 border rounded-md"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={youtubeAutoLaunchEnabled}
              onChange={(e) => handleToggleAutoLaunch(e.target.checked)}
            />
            排程時間自動啟動 OBS 串流
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={enableAutoStart}
              onChange={(e) => setEnableAutoStart(e.target.checked)}
            />
            通知 YouTube 自動開播（AutoStart）
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={enableAutoStop}
              onChange={(e) => setEnableAutoStop(e.target.checked)}
            />
            直播結束時自動停止（AutoStop）
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={autoUploadEnabled}
              onChange={(event) => {
                const value = event.target.checked
                setAutoUploadEnabled(value)
              }}
            />
            停止直播時自動上傳最新錄影檔
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <TextButton onClick={handleCreateLive} disabled={creating || !authorized}>
            {creating ? '建立中...' : '建立直播'}
          </TextButton>
          <TextButton onClick={handleStartObsImmediately} disabled={launchingObs}>
            {launchingObs ? '啟動中...' : '立即啟動 OBS 串流'}
          </TextButton>
        </div>
      </div>

      {youtubeAutoLaunchEnabled && youtubeScheduledStartValue && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          已啟用排程：{youtubeScheduledStartValue
            ? new Date(youtubeScheduledStartValue).toLocaleString()
            : '未設定時間'}
        </div>
      )}

      {youtubePlayingState && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          目前已有直播正在進行中。
        </div>
      )}

      {message && <div className="text-green-600 whitespace-pre-line">{message}</div>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

export default YoutubeUpload