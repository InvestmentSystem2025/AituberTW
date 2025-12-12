import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'
import { modelDefinitions, ModelInfo } from '@/features/constants/aiModels'
import type { AIService } from '@/features/constants/settings'
import type { SettingsState } from '@/features/stores/settings'

type SuccessResponse<T> = {
  success: true
  data: T
}

type ErrorResponse = {
  success: false
  error: string
}

type AdminSettingsPayload = {
  aiService: AIService
  aiModel: string
  temperature?: number
  maxTokens?: number
  settingsJson?: SettingsState
}

const ADMIN_USERNAME = 'super123'
const ADMIN_PASSWORD = 'kapibarachiikawa'

const encodeBasicToken = (username: string, password: string) =>
  Buffer.from(`${username}:${password}`).toString('base64')

const EXPECTED_TOKEN = encodeBasicToken(ADMIN_USERNAME, ADMIN_PASSWORD)

const isValidAdminRequest = (req: NextApiRequest): boolean => {
  const header = req.headers['x-admin-auth']
  if (!header || typeof header !== 'string') return false

  // 允許直接傳 base64，也允許 'Basic xxx' 格式
  const token = header.startsWith('Basic ') ? header.slice(6).trim() : header
  return token === EXPECTED_TOKEN
}

const validatePayload = (payload: AdminSettingsPayload): string | null => {
  const { aiService, aiModel, temperature, maxTokens } = payload

  if (!aiService) {
    return 'AI SERVICE 不得為空'
  }

  // 檢查 service 是否存在於 modelDefinitions
  if (!(aiService in modelDefinitions)) {
    return `AI SERVICE 「${aiService}」不被支援`
  }

  if (!aiModel || !aiModel.trim()) {
    return 'AI MODEL 不得為空'
  }

  const modelsForService =
    modelDefinitions[aiService as keyof typeof modelDefinitions]
  const exists = modelsForService?.some((m: ModelInfo) => m.name === aiModel.trim())
  if (!exists) {
    return `AI MODEL 「${aiModel}」在服務「${aiService}」中不存在`
  }

  if (temperature !== undefined) {
    if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
      return 'temperature 必須介於 0 ~ 2 之間'
    }
  }

  if (maxTokens !== undefined) {
    if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
      return 'maxTokens 必須為大於 0 的整數'
    }
  }

  return null
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse<AdminSettingsPayload> | ErrorResponse>
) => {
  const supabase = getServiceClient()

  if (req.method === 'GET') {
    // 讀取公開全域設定（不需要 admin 驗證）
    const { data, error } = await supabase
      .from('admin_settings')
      .select('ai_service, ai_model, temperature, max_tokens, settings_json')
      .eq('id', 'default')
      .maybeSingle()

    if (error) {
      console.error('讀取 admin_settings 失敗:', error)
      return res
        .status(500)
        .json({ success: false, error: '讀取全域設定失敗，請稍後再試' })
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: '找不到全域設定，請聯絡系統管理者',
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        aiService: data.ai_service as AIService,
        aiModel: data.ai_model,
        temperature: data.temperature ?? undefined,
        maxTokens: data.max_tokens ?? undefined,
        settingsJson: (data.settings_json as SettingsState | null) ?? undefined,
      },
    })
  }

  if (req.method === 'POST') {
    if (!isValidAdminRequest(req)) {
      return res
        .status(401)
        .json({ success: false, error: '未授權，請重新登入管理後台' })
    }

    const payload = req.body as AdminSettingsPayload
    const validationError = validatePayload(payload)
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError })
    }

    try {
      const { aiService, aiModel } = payload
      const temperature =
        typeof payload.temperature === 'number' ? payload.temperature : 1.0
      const maxTokens =
        typeof payload.maxTokens === 'number' ? payload.maxTokens : 4096

      const { error } = await supabase
        .from('admin_settings')
        .upsert(
          {
            id: 'default',
            ai_service: aiService,
            ai_model: aiModel.trim(),
            temperature,
            max_tokens: maxTokens,
            settings_json: payload.settingsJson ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )

      if (error) {
        console.error('更新 admin_settings 失敗:', error)
        return res
          .status(500)
          .json({ success: false, error: '儲存全域設定失敗，請稍後再試' })
      }

      return res.status(200).json({
        success: true,
        data: {
          aiService,
          aiModel: aiModel.trim(),
          temperature,
          maxTokens,
          settingsJson: payload.settingsJson,
        },
      })
    } catch (e) {
      console.error('admin/settings 未預期錯誤:', e)
      return res
        .status(500)
        .json({ success: false, error: '系統發生錯誤，請稍後再試' })
    }
  }

  res.setHeader('Allow', 'GET,POST')
  return res
    .status(405)
    .json({ success: false, error: `不支援的 HTTP 方法：${req.method}` })
}

export default handler


