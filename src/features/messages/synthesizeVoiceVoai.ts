import { Talk } from './messages'

export async function synthesizeVoiceVoaiApi(
  talk: Talk,
  apiKey: string,
  speaker: string,
  style: string,
  speed: number,
  pitchShift: number,
  styleWeight: number,
  breathPause: number
): Promise<ArrayBuffer> {
  try {
    const res = await fetch('/api/tts-voai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: talk.message,
        speaker,
        style,
        speed,
        pitch_shift: pitchShift,
        style_weight: styleWeight,
        breath_pause: breathPause,
        apiKey,
      }),
    })

    if (!res.ok) {
      throw new Error(
        `VOAIからの応答が異常です。ステータスコード: ${res.status}`
      )
    }

    return await res.arrayBuffer()
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`VOAIでエラーが発生しました: ${error.message}`)
    } else {
      throw new Error('VOAIで不明なエラーが発生しました')
    }
  }
}
