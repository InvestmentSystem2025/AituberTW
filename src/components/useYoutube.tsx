import { useCallback, useEffect } from 'react'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { fetchAndProcessComments } from '@/features/youtube/youtubeComments'
import { configureObsStream, startObsStream } from '@/lib/obsWebSocket'

const INTERVAL_MILL_SECONDS_RETRIEVING_COMMENTS = 10000 // 10秒
const AUTO_LAUNCH_CHECK_INTERVAL = 1000

interface Params {
  handleSendChat: (text: string) => Promise<void>
}

const useYoutube = ({ handleSendChat }: Params) => {
  const youtubePlaying = settingsStore((s) => s.youtubePlaying)

  const fetchAndProcessCommentsCallback = useCallback(async () => {
    const ss = settingsStore.getState()
    const hs = homeStore.getState()

    if (
      !ss.youtubeLiveId ||
      !ss.youtubeApiKey ||
      hs.chatProcessing ||
      hs.chatProcessingCount > 0 ||
      !ss.youtubeMode ||
      !ss.youtubePlaying
    ) {
      return
    }

    console.log('Call fetchAndProcessComments !!!')
    await fetchAndProcessComments(handleSendChat)
  }, [handleSendChat])

  useEffect(() => {
    if (!youtubePlaying) return
    fetchAndProcessCommentsCallback()

    const intervalId = setInterval(() => {
      fetchAndProcessCommentsCallback()
    }, INTERVAL_MILL_SECONDS_RETRIEVING_COMMENTS)

    return () => clearInterval(intervalId)
  }, [youtubePlaying, fetchAndProcessCommentsCallback])

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      const {
        youtubeAutoLaunchEnabled,
        youtubeAutoLaunchTriggered,
        youtubeScheduledStart,
        youtubeBroadcastId,
        youtubeIngestionAddress,
        youtubeStreamKey,
        youtubeObsConfigured,
      } = settingsStore.getState()

      if (!youtubeAutoLaunchEnabled || youtubeAutoLaunchTriggered) {
        return
      }

      if (!youtubeScheduledStart) {
        return
      }

      const scheduledDate = new Date(youtubeScheduledStart)
      if (Number.isNaN(scheduledDate.getTime())) {
        return
      }

      if (Date.now() < scheduledDate.getTime()) {
        return
      }

      if (!youtubeBroadcastId || !youtubeIngestionAddress || !youtubeStreamKey) {
        console.warn('[YouTube] 自動開播缺少必要的串流設定資訊')
        settingsStore.setState({ youtubeAutoLaunchEnabled: false })
        return
      }

      try {
        if (!youtubeObsConfigured) {
          await configureObsStream({
            ingestionAddress: youtubeIngestionAddress,
            streamKey: youtubeStreamKey,
          })
          settingsStore.setState({ youtubeObsConfigured: true })
        }

        await startObsStream()

        settingsStore.setState({
          youtubePlaying: true,
          youtubeBroadcastActive: true,
          youtubeAutoLaunchEnabled: false,
          youtubeAutoLaunchTriggered: true,
        })
      } catch (error) {
        console.error('[YouTube] 自動開播失敗', error)
      }
    }, AUTO_LAUNCH_CHECK_INTERVAL)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])
}

export default useYoutube
