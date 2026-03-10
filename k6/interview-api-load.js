import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'
import encoding from 'k6/encoding'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const endpointErrors = new Counter('endpoint_errors')

// open() must be called in init stage (global scope).
// NOTE: open() resolves relative to the script location, not the repo root.
// When running `k6 run k6/...` from the repo root, `../tmp/...` points to the repo's tmp folder.
const ACCOUNTS_PATH = (__ENV.ACCOUNTS_PATH || '../tmp/stress-accounts.json').trim()
const ACCOUNTS = JSON.parse(open(ACCOUNTS_PATH))

function requiredEnv(name) {
  const v = (__ENV[name] || '').trim()
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

function pickErrorString(body) {
  if (!body || typeof body !== 'object') return null
  return body.error || body.message || body.details || null
}

function safeJson(res) {
  try {
    return res.json()
  } catch {
    return null
  }
}

function recordError(tag, res, body, fallback) {
  const errStr = pickErrorString(body) || fallback || ''
  endpointErrors.add(1, {
    status_code: String(res?.status ?? '0'),
    endpoint_tag: String(tag),
    error: String(errStr).slice(0, 200),
  })
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function basicAuthHeader() {
  const u = (__ENV.BASIC_USER || __ENV.BASIC_AUTH_USER || '').trim()
  const p = (__ENV.BASIC_PASS || __ENV.BASIC_AUTH_PASS || '').trim()
  if (!u || !p) return null
  const token = `${u}:${p}`
  const enc = encoding.b64encode(token)
  return `Basic ${enc}`
}

function appHeaders(accessToken) {
  const h = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
  const basic = basicAuthHeader()
  if (basic) h.Authorization = basic // basic auth for Caddy (if enabled)
  if (basic && accessToken) h['X-Supabase-Token'] = accessToken // pass jwt separately to satisfy API auth
  return h
}

function authHeaders() {
  return {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
  }
}

const BASE_URL = requiredEnv('BASE_URL').replace(/\/+$/, '')

const _SUPABASE_URL_RAW = (__ENV.NEXT_PUBLIC_SUPABASE_URL || __ENV.SUPABASE_URL || '').trim()
if (!_SUPABASE_URL_RAW) throw new Error('Missing required env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)')
const SUPABASE_URL = _SUPABASE_URL_RAW.replace(/\/+$/, '')

// Prefer anon key; fall back to service role if you really must (not recommended).
const SUPABASE_KEY =
  (__ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim() ||
  (__ENV.SUPABASE_ANON_KEY || '').trim() ||
  (__ENV.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!SUPABASE_KEY) throw new Error('Missing required env: NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)')

const TEST_MODE = (__ENV.TEST_MODE || 'ramp').trim() // 'ramp' | 'soak'
const SOAK_VUS = Number.parseInt((__ENV.SOAK_VUS || '50').trim(), 10)
const SOAK_DURATION = (__ENV.SOAK_DURATION || '10m').trim()

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios:
    TEST_MODE === 'soak'
      ? {
          soak: {
            executor: 'constant-vus',
            vus: Number.isFinite(SOAK_VUS) && SOAK_VUS > 0 ? SOAK_VUS : 50,
            duration: SOAK_DURATION || '10m',
            gracefulStop: '30s',
          },
        }
      : {
          ramp: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              { duration: '30s', target: 1 },
              { duration: '30s', target: 5 },
              { duration: '30s', target: 10 },
              { duration: '30s', target: 20 },
              { duration: '30s', target: 50 },
              { duration: '30s', target: 0 },
            ],
            gracefulRampDown: '30s',
          },
        },
  thresholds: {
    'http_req_failed{name:get}': ['rate<0.01'],
    'http_req_duration{name:get}': ['p(95)<1000', 'p(99)<2000'],

    'http_req_failed{name:start-session}': ['rate<0.01'],
    'http_req_duration{name:start-session}': ['p(95)<1000', 'p(99)<2000'],

    'http_req_failed{name:save-session}': ['rate<0.01'],
    'http_req_duration{name:save-session}': ['p(95)<1000', 'p(99)<2000'],
  },
}

export function setup() {
  const accounts = ACCOUNTS
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(`${ACCOUNTS_PATH} is empty or invalid`)
  }

  const tokenUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`
  const tokens = accounts.map((acc) => {
    const res = http.post(
      tokenUrl,
      JSON.stringify({ email: acc.email, password: acc.password }),
      { headers: authHeaders(), tags: { name: 'auth' } }
    )
    const body = safeJson(res)
    const ok = check(res, { 'auth HTTP 200': (r) => r.status === 200 })
    if (!ok) {
      recordError('auth', res, body, res.body)
      throw new Error(`auth failed for ${acc.email}: HTTP ${res.status} ${pickErrorString(body) || res.body}`)
    }
    const token = body?.access_token
    if (!token) throw new Error(`auth missing access_token for ${acc.email}`)
    return token
  })

  return { accounts, tokens }
}

// Per-VU flag: each VU should call start-session only once.
let didStartSession = false
let tokenCache = null

function refreshToken(acc) {
  const tokenUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`
  const res = http.post(
    tokenUrl,
    JSON.stringify({ email: acc.email, password: acc.password }),
    { headers: authHeaders(), tags: { name: 'auth' } }
  )
  const body = safeJson(res)
  const ok = check(res, { 'auth_refresh HTTP 200': (r) => r.status === 200 })
  if (!ok) {
    recordError('auth', res, body, res.body)
    return null
  }
  const token = body?.access_token
  return token || null
}

export default function (data) {
  const accounts = data.accounts
  const tokens = data.tokens

  const idx = (__VU - 1) % accounts.length
  const acc = accounts[idx]
  if (!tokenCache) tokenCache = tokens.slice()
  let token = tokenCache[idx]

  if (!didStartSession) {
    const doStart = () =>
      http.post(
        `${BASE_URL}/api/interviews/start-session`,
        JSON.stringify({ interviews_id: acc.interview_id }),
        { headers: appHeaders(token), tags: { name: 'start-session' } }
      )
    let res = doStart()
    let body = safeJson(res)
    if (res.status === 401) {
      const next = refreshToken(acc)
      if (next) {
        token = next
        tokenCache[idx] = next
        res = doStart()
        body = safeJson(res)
      }
    }
    const ok = check(res, {
      'start-session HTTP 200': (r) => r.status === 200,
      'start-session body.ok === true': () => body?.ok === true,
    })
    if (!ok) recordError('start-session', res, body, res.body)
    didStartSession = true
  }

  // GET /api/interviews/get
  {
    const doGet = () =>
      http.get(`${BASE_URL}/api/interviews/get?interview_id=${encodeURIComponent(acc.interview_id)}`, {
        headers: appHeaders(token),
        tags: { name: 'get' },
      })
    let res = doGet()
    let body = safeJson(res)
    if (res.status === 401) {
      const next = refreshToken(acc)
      if (next) {
        token = next
        tokenCache[idx] = next
        res = doGet()
        body = safeJson(res)
      }
    }
    const ok = check(res, { 'get HTTP 200': (r) => r.status === 200 })
    if (!ok) {
      recordError('get', res, body, res.body)
    } else {
      const st = body?.interview?.status
      const denied = ['completed', 'cancelled', 'expired', 'noShow', 'lateButComplete']
      const okStatus = !denied.includes(st)
      if (!check(null, { 'get status not in denied list': () => okStatus })) {
        recordError('get', res, body, `DISALLOWED_STATUS:${String(st)}`)
      }
    }
  }

  // POST /api/interviews/save-session
  {
    const step = (__ITER % 10) + 1
    const payload = {
      interviews_id: acc.interview_id,
      duration_seconds: step,
      progress_state: { v: 1, step },
      is_final: false,
    }
    const doSave = () =>
      http.post(`${BASE_URL}/api/interviews/save-session`, JSON.stringify(payload), {
        headers: appHeaders(token),
        tags: { name: 'save-session' },
      })
    let res = doSave()
    let body = safeJson(res)
    if (res.status === 401) {
      const next = refreshToken(acc)
      if (next) {
        token = next
        tokenCache[idx] = next
        res = doSave()
        body = safeJson(res)
      }
    }
    const ok = check(res, {
      'save-session HTTP 200': (r) => r.status === 200,
      'save-session body.ok === true': () => body?.ok === true,
    })
    if (!ok) recordError('save-session', res, body, res.body)
  }

  sleep(randInt(1, 3))
}

export function handleSummary(data) {
  const base = textSummary(data, { indent: ' ', enableColors: true })

  const totalErr = data?.metrics?.endpoint_errors?.values?.count ?? 0
  const dist = Object.entries(data.metrics || {})
    .filter(([k]) => k.startsWith('endpoint_errors{'))
    .map(([k, v]) => ({ key: k, count: v?.values?.count ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  if (dist.length === 0) {
    const report = buildSanitizedReport(data)
    
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
    
    let filename = 'tmp/k6-report.json'
    if (TEST_MODE === 'soak') {
      const mins = SOAK_DURATION.replace(/m$/, '')
      filename = `tmp/k6-soak-${SOAK_VUS}vu-${mins}-${timestamp}.json`
    } else {
      filename = `tmp/k6-ramp-50vu-3-${timestamp}.json` // Default ramp in interview-api-load.js
    }

    return {
      stdout: base + `\n\nendpoint_errors_total: ${totalErr}\n`,
      [filename]: JSON.stringify(report, null, 2) + '\n',
    }
  }

  const lines = dist.slice(0, 50).map((x) => `${String(x.count).padStart(6, ' ')}  ${x.key}`)
  const extra =
    `\n\nendpoint_errors_total: ${totalErr}\n` +
    `Error distribution (status_code, endpoint_tag, error):\n` +
    lines.join('\n') +
    '\n'
  const report = buildSanitizedReport(data)
  
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
  
  let filename = 'tmp/k6-report.json'
  if (TEST_MODE === 'soak') {
    const mins = SOAK_DURATION.replace(/m$/, '')
    filename = `tmp/k6-soak-${SOAK_VUS}vu-${mins}-${timestamp}.json`
  } else {
    filename = `tmp/k6-ramp-50vu-3-${timestamp}.json` // Default ramp in interview-api-load.js
  }

  return {
    stdout: base + extra,
    [filename]: JSON.stringify(report, null, 2) + '\n',
  }
}

function buildSanitizedReport(data) {
  const metricValues = (m) => {
    if (!m) return null
    // In k6 handleSummary(), metric numbers live under `.values`.
    // Some older/alternate outputs may put them on the metric itself.
    return m.values || m
  }

  const pickTrend = (k) => {
    const m = data?.metrics?.[k]
    if (!m) return null
    const v = metricValues(m)
    // k6 trend values are in milliseconds in the summary object.
    return {
      avg_ms: v.avg ?? null,
      p95_ms: v['p(95)'] ?? null,
      p99_ms: v['p(99)'] ?? null,
      max_ms: v.max ?? null,
      min_ms: v.min ?? null,
      med_ms: v.med ?? null,
    }
  }

  const pickRate = (k) => {
    const m = data?.metrics?.[k]
    if (!m) return null
    const v = metricValues(m)
    return { rate: v.rate ?? v.value ?? null }
  }

  const thresholdsBreached = []
  for (const [metric, m] of Object.entries(data?.metrics || {})) {
    const t = m?.thresholds
    if (!t) continue
    for (const [expr, breached] of Object.entries(t)) {
      if (breached === true) thresholdsBreached.push({ metric, threshold: expr })
    }
  }

  const rawChecks = data?.root_group?.checks
  const checksSummary = {}
  if (Array.isArray(rawChecks)) {
    for (const c of rawChecks) {
      const name = String(c?.name ?? 'unknown')
      checksSummary[name] = { passes: c?.passes ?? 0, fails: c?.fails ?? 0 }
    }
  } else {
    const checks = rawChecks || {}
    for (const [name, v] of Object.entries(checks)) {
      checksSummary[String(name)] = { passes: v?.passes ?? 0, fails: v?.fails ?? 0 }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    test_mode: TEST_MODE,
    base_url: BASE_URL,
    soak: TEST_MODE === 'soak' ? { vus: SOAK_VUS, duration: SOAK_DURATION } : null,
    totals: {
      http_reqs: data?.metrics?.http_reqs?.values?.count ?? null,
      iterations: data?.metrics?.iterations?.values?.count ?? null,
      endpoint_errors_total: data?.metrics?.endpoint_errors?.values?.count ?? 0,
    },
    latency: {
      overall: pickTrend('http_req_duration'),
      get: pickTrend('http_req_duration{name:get}'),
      save_session: pickTrend('http_req_duration{name:save-session}'),
      start_session: pickTrend('http_req_duration{name:start-session}'),
    },
    error_rate: {
      overall: pickRate('http_req_failed'),
      get: pickRate('http_req_failed{name:get}'),
      save_session: pickRate('http_req_failed{name:save-session}'),
      start_session: pickRate('http_req_failed{name:start-session}'),
    },
    checks: checksSummary,
    thresholds_breached: thresholdsBreached,
    notes: [
      'This report is sanitized: it intentionally excludes setup_data (accounts/tokens).',
      'Durations are milliseconds.',
    ],
  }
}

