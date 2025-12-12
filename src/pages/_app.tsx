import '@charcoal-ui/icons'
import type { AppProps } from 'next/app'
import React, { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/react'

import { isLanguageSupported } from '@/features/constants/settings'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import '@/styles/globals.css'
import '@/styles/themes.css'
import migrateStore from '@/utils/migrateStore'
import i18n from '../lib/i18n'

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
    if (settingsJson && typeof settingsJson === 'object') {
      settingsStore.setState((prev) => ({
        ...prev,
        ...settingsJson,
      }))
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

  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
