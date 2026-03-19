import base, { setup, handleSummary as handleSummaryBase } from './interview-api-load.js'

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    soak_50vu_30m: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m',
      gracefulStop: '30s',
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

export default base
export { setup }

export function handleSummary(data) {
  const res = handleSummaryBase(data)
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
  const filename = `tmp/k6-soak-50vu-30-${timestamp}.json`

  const oldKey = Object.keys(res).find((k) => k.endsWith('.json'))
  if (oldKey) {
    res[filename] = res[oldKey]
    delete res[oldKey]
  }
  return res
}
