import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const {
    text,
    speaker,
    style,
    speed,
    pitch_shift,
    style_weight,
    breath_pause,
    apiKey: bodyApiKey,
  } = req.body || {}

  // 優先使用伺服器端環境變數，絕不將 API Key 暴露給前端
  const apiKey =
    (process.env.VOAI_API_KEY as string)?.trim() ||
    (bodyApiKey as string)?.trim()
  const version = process.env.VOAI_TTS_VERSION?.trim() || 'Neo'

  if (!text || !speaker || !apiKey) {
    return res.status(400).json({
      error:
        'Missing required parameters (text, speaker, and VOAI API key in env or request)',
    })
  }

  try {
    const response = await fetch('https://connect.voai.ai/TTS/Speech', {
      method: 'POST',
      headers: {
        'x-output-format': 'wav',
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version,
        text: text,
        speaker: speaker,
        style: style || '預設',
        speed: speed || 1,
        pitch_shift: pitch_shift || 0,
        style_weight: style_weight || 0.5,
        breath_pause: breath_pause || 0,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('VOAI TTS API error:', errorText)
      return res.status(500).json({ error: errorText })
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    res.setHeader('Content-Type', 'audio/wav')
    res.send(buffer)
  } catch (error) {
    console.error('Error in VOAI TTS:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}
