import type { NextApiRequest, NextApiResponse } from 'next'

import {
  exchangeCodeForTokens,
  getClientConfig,
  writeStoredTokens,
} from '@/lib/youtubeAuth'

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>YouTube OAuth</title>
    <style>
      body {
        font-family: sans-serif;
        color: #111;
        background: #f6f6f6;
        margin: 0;
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
      }
      .card {
        background: white;
        padding: 24px 32px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        max-width: 420px;
        text-align: center;
      }
      h1 {
        margin-bottom: 8px;
        font-size: 22px;
      }
      p {
        margin: 0 0 4px;
        line-height: 1.4;
      }
      .muted {
        color: #666;
      }
      .success-icon {
        font-size: 40px;
        margin-bottom: 16px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="success-icon">✅</div>
      <h1>授權成功！</h1>
      <p>您可以關閉此視窗。</p>
      <p class="muted">視窗將在數秒後自動關閉。</p>
    </div>
    <script>
      setTimeout(() => {
        window.close();
      }, 3000);
    </script>
  </body>
</html>`

const ERROR_HTML = (message: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>YouTube OAuth</title>
  </head>
  <body>
    <h1>授權失敗</h1>
    <p>${message}</p>
  </body>
</html>`

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { code, error } = req.query

  if (error) {
    console.error('[YouTube][oauth-callback] Received error:', error)
    res.status(400).send(ERROR_HTML(String(error)))
    return
  }

  if (!code || typeof code !== 'string') {
    res.status(400).send(ERROR_HTML('缺少授權碼 (code)。'))
    return
  }

  try {
    const { clientId, clientSecret, redirectUri } = await getClientConfig()

    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri,
    })

    await writeStoredTokens(tokens)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(SUCCESS_HTML)
  } catch (err: unknown) {
    console.error('[YouTube][oauth-callback] Failed to exchange code', err)
    res
      .status(500)
      .send(ERROR_HTML('兌換 access token 失敗，請查看伺服器日誌。'))
  }
}

export default handler






