import http from 'k6/http'
import { check, sleep } from 'k6'
import encoding from 'k6/encoding'

export const options = {
  vus: 5,
  duration: '30s',
}

function basicAuthHeader(user, pass) {
  if (!user || !pass) return {}
  const token = encoding.b64encode(`${user}:${pass}`)
  return { Authorization: `Basic ${token}` }
}

export default function () {
  const baseUrl = __ENV.BASE_URL || 'https://stg.ai-interview.tw'
  const headers = {
    ...basicAuthHeader(__ENV.BASIC_USER, __ENV.BASIC_PASS),
  }

  const r1 = http.get(`${baseUrl}/`, { headers })
  check(r1, { 'GET / is 200': (res) => res.status === 200 })

  const r2 = http.get(`${baseUrl}/api/tos/latest`, { headers })
  check(r2, { 'GET /api/tos/latest is 200': (res) => res.status === 200 })

  sleep(1)
}

