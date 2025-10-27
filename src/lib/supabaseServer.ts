import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 伺服端優先使用容器網路可達的 Internal URL（例：http://supabase-kong:8000），
// 若未設定則退回公開的 NEXT_PUBLIC_SUPABASE_URL
const supabaseUrl = (process.env.SUPABASE_INTERNAL_URL as string) || (process.env.NEXT_PUBLIC_SUPABASE_URL as string)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export function getServiceClient(): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
}

export function getAnonClient(): SupabaseClient {
  return createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
}

export async function getAuthUserIdFromRequest(req: { headers?: any }): Promise<string | null> {
  const authz = req.headers?.authorization || req.headers?.Authorization
  if (!authz || typeof authz !== 'string') return null
  const token = authz.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const anon = getAnonClient()
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user.id
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


