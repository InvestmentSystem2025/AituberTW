import '@charcoal-ui/icons'
import type { AppProps } from 'next/app'
import React, { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Montserrat, M_PLUS_2 } from 'next/font/google'

import { isLanguageSupported } from '@/features/constants/settings'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import '@/styles/globals.css'
import '@/styles/themes.css'
import migrateStore from '@/utils/migrateStore'
import i18n from '../lib/i18n'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

const mPlus2 = M_PLUS_2({
  // M PLUS 2 supports Japanese; keep latin as fallback for environments that subset.
  subsets: ['latin'],
  variable: '--font-mplus2',
  display: 'swap',
})

async function loadGlobalAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      console.warn('載入全域 AI 設定失敗：', res.status)
      return
    }

    const json = await res.json()
    if (!json.success || !json.data) return

    const { aiService, aiModel, temperature, maxTokens, settingsJson } = json
      .data as {
      aiService?: any
      aiModel?: string
      temperature?: number
      maxTokens?: number
      settingsJson?: any
    }

    // 優先使用 DB 側に保存されている settingsJson（全設定のスナップショット）
    // VOAI 等の .env 預設：若 DB 內對應欄位為空且 .env 有設，則以 .env 為準，避免每次都要到 Admin 手動填寫
    if (settingsJson && typeof settingsJson === 'object') {
      const merged = { ...settingsStore.getState(), ...settingsJson }
      // VOAI API Key 僅在伺服器端由 VOAI_API_KEY 提供，不從前端 env 寫入
      if (process.env.NEXT_PUBLIC_VOAI_SPEAKER && !merged.voaiSpeaker)
        merged.voaiSpeaker = process.env.NEXT_PUBLIC_VOAI_SPEAKER
      if (process.env.NEXT_PUBLIC_VOAI_STYLE && !merged.voaiStyle)
        merged.voaiStyle = process.env.NEXT_PUBLIC_VOAI_STYLE
      if (process.env.NEXT_PUBLIC_VOAI_SPEED != null && process.env.NEXT_PUBLIC_VOAI_SPEED !== '') {
        const v = parseFloat(process.env.NEXT_PUBLIC_VOAI_SPEED)
        if (Number.isFinite(v)) merged.voaiSpeed = v
      }
      if (process.env.NEXT_PUBLIC_VOAI_PITCH_SHIFT != null && process.env.NEXT_PUBLIC_VOAI_PITCH_SHIFT !== '') {
        const v = parseFloat(process.env.NEXT_PUBLIC_VOAI_PITCH_SHIFT)
        if (Number.isFinite(v)) merged.voaiPitchShift = v
      }
      if (process.env.NEXT_PUBLIC_VOAI_STYLE_WEIGHT != null && process.env.NEXT_PUBLIC_VOAI_STYLE_WEIGHT !== '') {
        const v = parseFloat(process.env.NEXT_PUBLIC_VOAI_STYLE_WEIGHT)
        if (Number.isFinite(v)) merged.voaiStyleWeight = v
      }
      if (process.env.NEXT_PUBLIC_VOAI_BREATH_PAUSE != null && process.env.NEXT_PUBLIC_VOAI_BREATH_PAUSE !== '') {
        const v = parseFloat(process.env.NEXT_PUBLIC_VOAI_BREATH_PAUSE)
        if (Number.isFinite(v)) merged.voaiBreathPause = v
      }
      settingsStore.setState(merged)
      return
    }

    // 旧バージョン互換：settingsJson が無い場合は AI 関連のみを上書き
    if (aiService || aiModel || temperature !== undefined || maxTokens !== undefined) {
      settingsStore.setState((prev) => ({
        ...prev,
        selectAIService: aiService ?? prev.selectAIService,
        selectAIModel: aiModel ?? prev.selectAIModel,
        temperature:
          typeof temperature === 'number' ? temperature : prev.temperature,
        maxTokens:
          typeof maxTokens === 'number' ? maxTokens : prev.maxTokens,
      }))
    }
  } catch (err) {
    console.error('載入全域 AI 設定時發生錯誤:', err)
  }
}

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    const hs = homeStore.getState()
    const ss = settingsStore.getState()

    // 先載入 DB 全域設定（不阻塞其它初始化，失敗則沿用 env 預設）
    loadGlobalAdminSettings()

    if (hs.userOnboarded) {
      i18n.changeLanguage(ss.selectLanguage)
      // 保存されたテーマを適用
      document.documentElement.setAttribute('data-theme', ss.colorTheme)
      return
    }

    migrateStore()

    const browserLanguage = navigator.language
    const languageCode = browserLanguage.match(/^zh/i)
      ? 'zh'
      : browserLanguage.split('-')[0].toLowerCase()

    let language = ss.selectLanguage
    if (!language) {
      language = isLanguageSupported(languageCode) ? languageCode : 'ja'
    }
    i18n.changeLanguage(language)
    settingsStore.setState({ selectLanguage: language })

    // 初期テーマを適用
    document.documentElement.setAttribute('data-theme', ss.colorTheme)

    homeStore.setState({ userOnboarded: true })
  }, [])

  // Avoid noisy console errors in local/self-hosted envs where `/_vercel/insights/script.js` doesn't exist.
  const enableVercelAnalytics =
    process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === '1' ||
    process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true'

  return (
    <div className={`${montserrat.variable} ${mPlus2.variable}`}>
      <Component {...pageProps} />
      {enableVercelAnalytics ? <Analytics /> : null}
    </div>
  )
}
