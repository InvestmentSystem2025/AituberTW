import { Message } from '@/features/messages/messages'
import settingsStore from '@/features/stores/settings'
import {
  getBestComment,
  getMessagesForSleep,
  getAnotherTopic,
  getMessagesForNewTopic,
  checkIfResponseContinuationIsRequired,
  getMessagesForContinuation,
} from '@/features/youtube/conversationContinuityFunctions'
import { processAIResponse } from '../chat/handlers'
import homeStore from '@/features/stores/home'
import { messageSelectors } from '../messages/messageSelectors'

export const getLiveChatId = async (liveId: string): Promise<string> => {
  if (!liveId) return ''

  const cached = settingsStore.getState().youtubeLiveChatId
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(`/api/youtube/video?videoId=${encodeURIComponent(liveId)}`)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn('[YouTube] video details API failed', response.status, text)
      return ''
    }

    const json = await response.json()
    const liveChatId = json.items?.[0]?.liveStreamingDetails?.activeLiveChatId || ''
    if (liveChatId) {
      settingsStore.setState({ youtubeLiveChatId: liveChatId })
    }
    return liveChatId
  } catch (error) {
    console.warn('[YouTube] Failed to fetch live chat id', error)
    return ''
  }
}

type YouTubeComment = {
  userName: string
  userIconUrl: string
  userComment: string
}

type YouTubeComments = YouTubeComment[]

const retrieveLiveComments = async (
  activeLiveChatId: string,
  youtubeNextPageToken: string,
  setYoutubeNextPageToken: (token: string) => void
): Promise<YouTubeComments> => {
  try {
    const params = new URLSearchParams({ liveChatId: activeLiveChatId })
    if (youtubeNextPageToken) {
      params.set('pageToken', youtubeNextPageToken)
    }

    const response = await fetch(`/api/youtube/live-chat?${params.toString()}`)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn('[YouTube] live chat API failed', response.status, text)
      return []
    }

    const json = await response.json()
    const items = json.items || []

    if (json.nextPageToken) {
      setYoutubeNextPageToken(json.nextPageToken)
    }

    const comments = items
      .map((item: any) => ({
        userName: item.authorDetails.displayName,
        userIconUrl: item.authorDetails.profileImageUrl,
        userComment:
          item.snippet.textMessageDetails?.messageText ||
          item.snippet.superChatDetails?.userComment ||
          '',
      }))
      .filter(
        (comment: any) =>
          comment.userComment !== '' && !comment.userComment.startsWith('#')
      )

    return comments
  } catch (error) {
    console.warn('[YouTube] Failed to retrieve live comments', error)
    return []
  }
}

export const fetchAndProcessComments = async (
  handleSendChat: (text: string) => void
): Promise<void> => {
  const ss = settingsStore.getState()
  const hs = homeStore.getState()
  const chatLog = messageSelectors.getTextAndImageMessages(hs.chatLog)

  try {
    const liveChatId = await getLiveChatId(ss.youtubeLiveId)

    if (liveChatId) {
      // 会話の継続が必要かどうかを確認
      if (
        !ss.youtubeLiveId ||
        hs.chatProcessing ||
        hs.chatProcessingCount > 0 ||
        !ss.youtubeMode ||
        !ss.youtubePlaying
      ) {
        const isContinuationNeeded =
          await checkIfResponseContinuationIsRequired(chatLog)
        if (isContinuationNeeded) {
          const continuationMessage = await getMessagesForContinuation(
            ss.systemPrompt,
            chatLog
          )
          processAIResponse(continuationMessage)
          settingsStore.setState({
            youtubeContinuationCount: ss.youtubeContinuationCount + 1,
          })
          if (ss.youtubeNoCommentCount < 1) {
            settingsStore.setState({ youtubeNoCommentCount: 1 })
          }
          return
        }
      }
      settingsStore.setState({ youtubeContinuationCount: 0 })

      // コメントを取得
      const youtubeComments = await retrieveLiveComments(
        liveChatId,
        ss.youtubeNextPageToken,
        (token: string) =>
          settingsStore.setState({ youtubeNextPageToken: token })
      )
      // ランダムなコメントを選択して送信
      if (youtubeComments.length > 0) {
        settingsStore.setState({ youtubeNoCommentCount: 0 })
        settingsStore.setState({ youtubeSleepMode: false })
        let selectedComment = ''
        if (ss.conversationContinuityMode) {
          selectedComment = await getBestComment(chatLog, youtubeComments)
        } else {
          selectedComment =
            youtubeComments[Math.floor(Math.random() * youtubeComments.length)]
              .userComment
        }
        console.log('selectedYoutubeComment:', selectedComment)

        handleSendChat(selectedComment)
      } else {
        const noCommentCount = ss.youtubeNoCommentCount + 1
        if (ss.conversationContinuityMode) {
          if (
            noCommentCount < 3 ||
            (3 < noCommentCount && noCommentCount < 6)
          ) {
            // 会話の続きを生成
            const continuationMessage = await getMessagesForContinuation(
              ss.systemPrompt,
              chatLog
            )
            processAIResponse(continuationMessage)
          } else if (noCommentCount === 3) {
            // 新しいトピックを生成
            const anotherTopic = await getAnotherTopic(chatLog)
            console.log('anotherTopic:', anotherTopic)
            const newTopicMessage = await getMessagesForNewTopic(
              ss.systemPrompt,
              chatLog,
              anotherTopic
            )
            processAIResponse(newTopicMessage)
          } else if (noCommentCount === 6) {
            // スリープモードにする
            const messagesForSleep = await getMessagesForSleep(
              ss.systemPrompt,
              chatLog
            )
            processAIResponse(messagesForSleep)
            settingsStore.setState({ youtubeSleepMode: true })
          }
        }
        console.log('YoutubeNoCommentCount:', noCommentCount)
        settingsStore.setState({ youtubeNoCommentCount: noCommentCount })
      }
    }
  } catch (error) {
    console.warn('Error fetching comments:', error)
  }
}
