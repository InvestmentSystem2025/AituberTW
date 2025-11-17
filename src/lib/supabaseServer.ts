import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 伺服端優先使用容器網路可達的 Internal URL（例：http://supabase-kong:8000），
// 若未設定則退回公開的 NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceUrl =
  (process.env.SUPABASE_INTERNAL_URL as string) || (process.env.NEXT_PUBLIC_SUPABASE_URL as string)
const supabaseAuthInternalUrl =
  (process.env.SUPABASE_AUTH_URL as string) ||
  (process.env.SUPABASE_INTERNAL_URL as string) ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL as string)
const supabaseAuthPublicUrl =
  (process.env.SUPABASE_AUTH_PUBLIC_URL as string) ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL as string) ||
  supabaseAuthInternalUrl
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export function getServiceClient(): SupabaseClient {
  return createClient(supabaseServiceUrl, serviceRoleKey, { auth: { persistSession: false } })
}

export function getAnonClient(): SupabaseClient {
  const forwardedHeaders: Record<string, string> = {}
  try {
    const publicUrl = new URL(supabaseAuthPublicUrl)
    forwardedHeaders['X-Forwarded-Host'] = publicUrl.host
    forwardedHeaders['X-Forwarded-Proto'] = publicUrl.protocol.replace(':', '')
  } catch (err) {
    // ignore malformed URL
  }
  return createClient(supabaseAuthInternalUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: forwardedHeaders }
  })
}

export async function getAuthUserIdFromRequest(req: { headers?: any }): Promise<string | null> {
  const authz = req.headers?.authorization || req.headers?.Authorization
  if (!authz || typeof authz !== 'string') return null
  const token = authz.replace(/^Bearer\s+/i, '')
  if (!token) return null
  
  try {
    // 先嘗試使用 service_role 來驗證（避免 RLS 問題）
    const serviceClient = getServiceClient()
    const { data, error } = await serviceClient.auth.getUser(token)
    if (!error && data?.user) return data.user.id
    
    // 如果是特定錯誤（如用戶不存在），記錄更詳細的資訊
    if (error && error.message?.includes('does not exist')) {
      console.warn('getAuthUserIdFromRequest: User from JWT does not exist - token may be stale after database reset')
    }
    
    // 如果 service_role 失敗，使用 anon client
    const anon = getAnonClient()
    const { data: anonData, error: anonError } = await anon.auth.getUser(token)
    if (!anonError && anonData?.user) return anonData.user.id
    
    // 記錄 anon client 的錯誤（特別是用戶不存在的情況）
    if (anonError && anonError.message?.includes('does not exist')) {
      console.warn('getAuthUserIdFromRequest: User from JWT does not exist - token may be stale after database reset')
    }
    
    return null
  } catch (err) {
    console.error('getAuthUserIdFromRequest error:', err)
    return null
  }
}

export async function getAuthEmailFromRequest(req: { headers?: any }): Promise<string | null> {
  const authz = req.headers?.authorization || req.headers?.Authorization
  if (!authz || typeof authz !== 'string') return null
  const token = authz.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const anon = getAnonClient()
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) return null
  return (data.user.email || '').toLowerCase()
}


