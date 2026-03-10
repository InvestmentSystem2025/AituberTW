import base, { setup, handleSummary as handleSummaryBase } from './interview-api-load.js'

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    spike_30vu: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 }, // 0 -> 30 in 30s
        { duration: '5m', target: 30 },  // hold 5m
        { duration: '5m', target: 0 },   // ramp down (same as hold) to 0
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

export default base
export { setup }

export function handleSummary(data) {
  const res = handleSummaryBase(data)
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
  const filename = `tmp/k6-spike-30vu-10-${timestamp}.json`
  
  const oldKey = Object.keys(res).find(k => k.endsWith('.json'))
  if (oldKey) {
    res[filename] = res[oldKey]
    delete res[oldKey]
  }
  return res
}

