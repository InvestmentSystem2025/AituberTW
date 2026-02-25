import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceClient } from '@/lib/supabaseServer'
import { modelDefinitions, ModelInfo } from '@/features/constants/aiModels'
import type { AIService } from '@/features/constants/settings'
import type { SettingsState } from '@/features/stores/settings'

// ZAP / 健康檢查可能會頻繁呼叫 GET /api/admin/settings。
// 若 Supabase 連線失敗（常見為本機未啟動/URL 錯誤），避免刷爆 server log。
let lastAdminSettingsFetchFailedLogAt = 0
const FETCH_FAILED_LOG_THROTTLE_MS = 60_000

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
  // 明確指定 JSON content-type（避免部分掃描工具在 redirect/錯誤路徑誤判缺少 header）
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  const supabaseUrl =
    (process.env.SUPABASE_INTERNAL_URL as string) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

  // Supabase 環境變數未設定時，避免觸發 undici 的「fetch failed」並狂刷 log。
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({
      success: false,
      error:
        'Supabase 尚未設定（需要 SUPABASE_INTERNAL_URL 或 NEXT_PUBLIC_SUPABASE_URL，且需要 SUPABASE_SERVICE_ROLE_KEY）',
    })
  }

  const supabase = getServiceClient()

  if (req.method === 'GET') {
    // 讀取公開全域設定（不需要 admin 驗證）
    const { data, error } = await supabase
      .from('admin_settings')
      .select('ai_service, ai_model, temperature, max_tokens, settings_json')
      .eq('id', 'default')
      .maybeSingle()

    if (error) {
      const message = error.message || ''
      const code = (error as any).code as string | undefined
      const isFetchFailed =
        message.includes('fetch failed') || message.includes('TypeError: fetch failed')

      // 這個 endpoint 可能會被健康檢查或掃描頻繁呼叫，避免輸出過多錯誤細節到 log。
      if (isFetchFailed) {
        const now = Date.now()
        if (now - lastAdminSettingsFetchFailedLogAt > FETCH_FAILED_LOG_THROTTLE_MS) {
          lastAdminSettingsFetchFailedLogAt = now
          console.warn('讀取 admin_settings 失敗（Supabase 連線失敗）:', {
            message,
            code,
          })
        }
        return res.status(503).json({
          success: false,
          error: '全域設定服務暫時不可用（資料庫連線失敗），請稍後再試',
        })
      }

      console.error('讀取 admin_settings 失敗:', { message, code })
      return res.status(500).json({
        success: false,
        error: '讀取全域設定失敗，請稍後再試',
      })
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


