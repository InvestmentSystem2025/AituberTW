import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs/promises'

async function loadDotenvIfPresent(dotenvPath = '.env') {
  try {
    const raw = await fs.readFile(dotenvPath, 'utf8')
    const lines = raw.split(/\r?\n/)
    for (const line of lines) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const eq = s.indexOf('=')
      if (eq <= 0) continue
      const key = s.slice(0, eq).trim()
      if (!key) continue
      if (Object.prototype.hasOwnProperty.call(process.env, key)) continue
      let val = s.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  } catch {
    // ignore missing/unreadable .env
  }
}

function requiredEnv(name) {
  const v = (process.env[name] || '').trim()
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

function optionalEnv(name) {
  const v = (process.env[name] || '').trim()
  return v || null
}

function envInt(name, fallback) {
  const raw = (process.env[name] || '').trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid env ${name}: ${raw}`)
  return Math.floor(n)
}

function yyyyMMdd(d = new Date()) {
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...headers },
    body,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { res, text, json }
}

function pickErrorString(json) {
  if (!json || typeof json !== 'object') return null
  return json.error || json.message || json.details || null
}

function basicAuthHeader(user, pass) {
  if (!user || !pass) return null
  const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')
  return `Basic ${token}`
}

async function main() {
  // Allow "just run it" locally by loading .env if present.
  // Existing process env always wins (we never override).
  await loadDotenvIfPresent(process.env.DOTENV_PATH || '.env')

  const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const SERVICE_ROLE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const ANON_KEY =
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim() ||
    (process.env.SUPABASE_ANON_KEY || '').trim() ||
    ''
  const AUTH_API_KEY = ANON_KEY || SERVICE_ROLE_KEY

  const JOB_OPENING_ID = (process.env.JOB_OPENING_ID || '').trim()
  if (!JOB_OPENING_ID) {
    throw new Error('Missing required env: JOB_OPENING_ID')
  }

  const STRESS_USER_COUNT = envInt('STRESS_USER_COUNT', 50)
  const STRESS_USER_PASSWORD = (process.env.STRESS_USER_PASSWORD || 'StressP@ssw0rd!').trim()
  const STRESS_USER_EMAIL_PREFIX = (process.env.STRESS_USER_EMAIL_PREFIX || 'stress').trim()
  const STRESS_USER_EMAIL_DOMAIN = (process.env.STRESS_USER_EMAIL_DOMAIN || 'example.com').trim()
  const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '')
  const BASIC_USER = optionalEnv('BASIC_USER') || optionalEnv('BASIC_AUTH_USER')
  const BASIC_PASS = optionalEnv('BASIC_PASS') || optionalEnv('BASIC_AUTH_PASS')

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // a) 查 job_opening.company_id
  const { data: jo, error: joErr } = await supa
    .from('job_opening')
    .select('id, company_id')
    .eq('id', JOB_OPENING_ID)
    .single()
  if (joErr || !jo) {
    throw new Error(`JOB_OPENING_ID not found: ${JOB_OPENING_ID} (${joErr?.message || 'no data'})`)
  }
  const company_id = jo.company_id
  if (!company_id) throw new Error(`job_opening.company_id missing for JOB_OPENING_ID=${JOB_OPENING_ID}`)

  const stamp = yyyyMMdd()
  const accounts = []

  // b) createUser 建 STRESS_USER_COUNT 個 jobSeeker
  for (let i = 1; i <= STRESS_USER_COUNT; i++) {
    const email = `${STRESS_USER_EMAIL_PREFIX}+${stamp}-${String(i).padStart(2, '0')}@${STRESS_USER_EMAIL_DOMAIN}`
    const { data, error } = await supa.auth.admin.createUser({
      email,
      password: STRESS_USER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: 'jobSeeker',
        preferred_language: 'zh-TW',
        family_name: 'Stress',
        given_name: `User${i}`,
      },
    })
    if (error || !data?.user?.id) {
      throw new Error(`createUser failed for ${email}: ${error?.message || 'unknown error'}`)
    }
    accounts.push({ email, password: STRESS_USER_PASSWORD, user_id: data.user.id })
    if (i % 10 === 0 || i === STRESS_USER_COUNT) {
      console.log(`Created users: ${i}/${STRESS_USER_COUNT}`)
    }
  }

  // c) 等待 profiles trigger 建好（指數退避補齊，最多 10 次/總 30 秒）
  const byAuthId = new Map()
  const authIds = accounts.map((a) => a.user_id)
  const startedAt = Date.now()
  let attempt = 0
  let delayMs = 300
  while (attempt < 10) {
    attempt++
    const { data: profiles, error } = await supa
      .from('profiles')
      .select('id, auth_id, email')
      .in('auth_id', authIds)

    if (error) {
      throw new Error(`profiles select failed: ${error.message}`)
    }

    byAuthId.clear()
    for (const p of profiles || []) {
      byAuthId.set(String(p.auth_id), p)
    }

    const missing = accounts.filter((a) => !byAuthId.has(a.user_id))
    if (missing.length === 0) break

    const elapsed = Date.now() - startedAt
    if (elapsed > 30_000 || attempt >= 10) {
      const missingLines = missing
        .map((m) => `- ${m.email} (${m.user_id})`)
        .join('\n')
      throw new Error(
        `profiles trigger timeout: missing ${missing.length}/${accounts.length}\n${missingLines}`
      )
    }

    await sleep(delayMs)
    delayMs = Math.min(delayMs * 2, 5000)
  }

  // d) 對每個 profile：update profiles / upsert usage / insert interview
  for (const acc of accounts) {
    const profile = byAuthId.get(acc.user_id)
    if (!profile?.id) throw new Error(`profile missing for auth_id=${acc.user_id} (${acc.email})`)

    const nowIso = new Date().toISOString()

    const { error: pErr } = await supa
      .from('profiles')
      .update({ mfa_totp_enabled_at: nowIso })
      .eq('id', profile.id)
    if (pErr) throw new Error(`profiles update failed (${acc.email}): ${pErr.message}`)

    const { error: uErr } = await supa.from('job_seeker_usage').upsert(
      {
        profile_id: profile.id,
        used_count: 0,
        free_quota: 9999,
        updated_at: nowIso,
      },
      { onConflict: 'profile_id' }
    )
    if (uErr) throw new Error(`job_seeker_usage upsert failed (${acc.email}): ${uErr.message}`)

    const { data: iv, error: ivErr } = await supa
      .from('interviews')
      .insert({
        company_id,
        job_opening_id: JOB_OPENING_ID,
        profiles_id: profile.id,
        start_time: nowIso,
        status: 'waitToStart',
      })
      .select('id')
      .single()
    if (ivErr || !iv?.id) throw new Error(`interviews insert failed (${acc.email}): ${ivErr?.message || 'no id'}`)

    acc.profile_id = profile.id
    acc.interview_id = iv.id
  }

  // e) 可選：嘗試用 RPC 建 placeholder session（失敗只 warning）
  for (const acc of accounts) {
    try {
      const { data, error } = await supa.rpc('start_interview_session', {
        p_interviews_id: acc.interview_id,
        p_auth_user_id: acc.user_id,
      })
      if (error) {
        console.warn(`[warn] start_interview_session failed (${acc.email}): ${error.message}`)
        continue
      }
      const didIncrement = !!(data && typeof data === 'object' && data.did_increment)
      if (didIncrement) {
        const nowIso = new Date().toISOString()
        const { error: resetErr } = await supa.from('job_seeker_usage').upsert(
          { profile_id: acc.profile_id, used_count: 0, free_quota: 9999, updated_at: nowIso },
          { onConflict: 'profile_id' }
        )
        if (resetErr) {
          console.warn(`[warn] reset job_seeker_usage failed (${acc.email}): ${resetErr.message}`)
        }
      }
    } catch (err) {
      console.warn(`[warn] start_interview_session exception (${acc.email}): ${err?.message || String(err)}`)
    }
  }

  // f) 抽樣驗證：password grant 登入 + GET /api/interviews/get 必須 200
  {
    const sample = accounts[Math.floor(Math.random() * accounts.length)]
    const tokenUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`
    const { res: authRes, json: authJson, text: authText } = await fetchJson(tokenUrl, {
      method: 'POST',
      headers: {
        apikey: AUTH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: sample.email, password: sample.password }),
    })

    if (!authRes.ok) {
      const errStr = pickErrorString(authJson) || authText
      throw new Error(`Sample login failed (${sample.email}) HTTP ${authRes.status}: ${errStr}`)
    }

    const accessToken = authJson?.access_token
    if (!accessToken) throw new Error(`Sample login missing access_token (${sample.email})`)

    const apiUrl = `${BASE_URL}/api/interviews/get?interview_id=${encodeURIComponent(sample.interview_id)}`
    const basic = basicAuthHeader(BASIC_USER, BASIC_PASS)
    const { res: apiRes, json: apiJson, text: apiText } = await fetchJson(apiUrl, {
      method: 'GET',
      headers: basic
        ? { Authorization: basic, 'X-Supabase-Token': accessToken }
        : { Authorization: `Bearer ${accessToken}` },
    })

    if (apiRes.status !== 200) {
      const errStr = pickErrorString(apiJson) || apiText
      throw new Error(
        `Sample GET failed (${sample.email}, interview_id=${sample.interview_id}) HTTP ${apiRes.status}: ${errStr}`
      )
    }
    console.log(`Sample verification OK: ${sample.email} -> GET /api/interviews/get 200`)
  }

  // g) 輸出 tmp/stress-accounts.json（不要 commit）
  await fs.mkdir('tmp', { recursive: true })
  const outPath = 'tmp/stress-accounts.json'
  const out = accounts.map((a) => ({
    email: a.email,
    password: a.password,
    interview_id: a.interview_id,
    user_id: a.user_id,
    profile_id: a.profile_id,
  }))
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${out.length} accounts to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

