#!/usr/bin/env node

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const DEFAULT_BASE_URL = 'https://stg.ai-interview.tw'

const cases = new Set([
  'period-initial-success',
  'period-initial-failure',
  'period-auth-success',
  'period-auth-failure',
  'cau-active',
  'cau-card-not-allowed',
  'mpg-success',
  'mpg-failure',
  'mpg-security-alert',
])

const usage = `Usage:
  node scripts/newebpay-fake-webhook.mjs <case> [options]

Cases:
  period-initial-success
  period-initial-failure
  period-auth-success
  period-auth-failure
  cau-active
  cau-card-not-allowed
  mpg-success
  mpg-failure
  mpg-security-alert

Common options:
  --env-file <path>              Load NewebPay secrets from an env file
  --base-url <url>               Default: ${DEFAULT_BASE_URL}
  --repeat <n>                   Send the same payload n times for duplicate tests
  --merchant-order-no <value>    Existing subscriptions/one_time_purchases merchant order no
  --period-no <value>            Existing or fake PeriodNo
  --trade-no <value>             Fake TradeNo
  --respond-code <value>         Default: 00 for success, 05 for failure
  --amt <number>                 MPG amount / Period auth amount

Examples:
  node scripts/newebpay-fake-webhook.mjs mpg-security-alert \\
    --env-file .env \\
    --base-url https://stg.ai-interview.tw

  node scripts/newebpay-fake-webhook.mjs mpg-success \\
    --env-file .env \\
    --merchant-order-no CRD202605250001 \\
    --amt 10 \\
    --repeat 2

  node scripts/newebpay-fake-webhook.mjs period-initial-success \\
    --env-file .env \\
    --merchant-order-no SUB202605250001 \\
    --period-no P250525000001 \\
    --amt 10
`

const parseArgs = (argv) => {
  const [caseName, ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`)
    }
    const key = token.slice(2)
    const next = rest[i + 1]
    if (!next || next.startsWith('--')) {
      options[key] = 'true'
    } else {
      options[key] = next
      i += 1
    }
  }
  return { caseName, options }
}

const loadEnvFile = (filePath) => {
  if (!filePath) return
  const resolved = path.resolve(process.cwd(), filePath)
  const text = fs.readFileSync(resolved, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1')
  }
}

const env = (key) => (process.env[key] || '').trim()

const getConfig = (kind) => {
  const merchantId =
    env(`NEWEBPAY_${kind}_MERCHANT_ID`) || env('NEWEBPAY_MERCHANT_ID')
  const hashKey = env(`NEWEBPAY_${kind}_HASH_KEY`) || env('NEWEBPAY_HASH_KEY')
  const hashIV = env(`NEWEBPAY_${kind}_HASH_IV`) || env('NEWEBPAY_HASH_IV')
  if (!merchantId) throw new Error(`Missing NEWEBPAY_${kind}_MERCHANT_ID or NEWEBPAY_MERCHANT_ID`)
  if (Buffer.byteLength(hashKey, 'utf8') !== 32) {
    throw new Error(`NEWEBPAY_${kind}_HASH_KEY / NEWEBPAY_HASH_KEY must be 32 bytes`)
  }
  if (Buffer.byteLength(hashIV, 'utf8') !== 16) {
    throw new Error(`NEWEBPAY_${kind}_HASH_IV / NEWEBPAY_HASH_IV must be 16 bytes`)
  }
  return { merchantId, hashKey, hashIV }
}

const toQuery = (payload) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  return params.toString()
}

const encrypt = (payload, config) => {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(config.hashKey, 'utf8'),
    Buffer.from(config.hashIV, 'utf8')
  )
  cipher.setAutoPadding(true)
  return cipher.update(JSON.stringify(payload), 'utf8', 'hex') + cipher.final('hex')
}

const tradeSha = (tradeInfo, config) =>
  crypto
    .createHash('sha256')
    .update(`HashKey=${config.hashKey}&${tradeInfo}&HashIV=${config.hashIV}`)
    .digest('hex')
    .toUpperCase()

const nowText = () => {
  const date = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const nextDateText = () => {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const value = (options, key, fallback) => options[key] || fallback

const buildPeriodPayload = (caseName, options, config) => {
  const success = caseName.endsWith('success')
  const merchantOrderNo = value(options, 'merchant-order-no', 'SUB_FAKE_ORDER')
  const periodNo = value(options, 'period-no', 'P_FAKE_PERIOD')
  const tradeNo = value(options, 'trade-no', `T${Date.now()}`)
  const respondCode = value(options, 'respond-code', success ? '00' : '05')
  const amt = Number(value(options, 'amt', '10'))

  if (caseName.startsWith('period-initial')) {
    return {
      Status: success ? 'SUCCESS' : 'FAIL',
      Message: success ? '授權成功' : '授權失敗',
      Result: {
        MerchantID: config.merchantId,
        MerchantOrderNo: merchantOrderNo,
        PeriodType: 'M',
        AuthTimes: 'NE',
        DateArray: nextDateText(),
        PeriodAmt: String(amt),
        PeriodNo: periodNo,
        AuthTime: nowText(),
        TradeNo: tradeNo,
        CardNo: '400022******1111',
        AuthCode: success ? '123456' : '',
        RespondCode: respondCode,
        EscrowBank: 'HNCB',
        AuthBank: 'TEST',
        PaymentMethod: 'CREDIT',
      },
    }
  }

  const alreadyTimes = value(options, 'already-times', '2')
  return {
    Status: success ? 'SUCCESS' : 'FAIL',
    Message: success ? '授權成功' : '授權失敗',
    Result: {
      MerchantID: config.merchantId,
      MerchantOrderNo: merchantOrderNo,
      OrderNo: value(options, 'order-no', `${merchantOrderNo}_${alreadyTimes}`),
      TradeNo: tradeNo,
      AuthDate: nowText(),
      TotalTimes: 'NE',
      AlreadyTimes: alreadyTimes,
      AuthAmt: String(amt),
      AuthCode: success ? '123456' : '',
      RespondCode: respondCode,
      EscrowBank: 'HNCB',
      AuthBank: 'TEST',
      NextAuthDate: nextDateText(),
      PeriodNo: periodNo,
    },
  }
}

const buildCauPayload = (caseName, options, config) => {
  const merchantOrderNo = value(options, 'merchant-order-no', 'SUB_FAKE_ORDER')
  const periodNo = value(options, 'period-no', 'P_FAKE_PERIOD')
  const active = caseName === 'cau-active'
  return {
    Status: 'SUCCESS',
    Message: active ? '信用卡更新成功' : '信用卡不可使用',
    Result: {
      MerchantID: config.merchantId,
      MerchantOrderNo: merchantOrderNo,
      remainingTimes: 'NE',
      AuthAmt: String(Number(value(options, 'amt', '10'))),
      NextAuthDate: nextDateText(),
      scheduleDates: nextDateText(),
      PeriodNo: periodNo,
      AlterType: active ? 'restart' : 'terminate',
      cardStatus: active ? 'ACTIVE' : 'CARD_NOT_ALLOWED',
      newExpiry: value(options, 'new-expiry', '3001'),
    },
  }
}

const buildMpgPayload = (caseName, options, config) => {
  const success = caseName === 'mpg-success'
  const merchantOrderNo = value(options, 'merchant-order-no', 'CRD_FAKE_ORDER')
  const tradeNo = value(options, 'trade-no', `M${Date.now()}`)
  const respondCode = value(options, 'respond-code', success ? '00' : '05')
  const amt = Number(value(options, 'amt', '10'))
  return {
    Status: success ? 'SUCCESS' : 'FAIL',
    Message: success ? '付款成功' : '付款失敗',
    Result: {
      MerchantID: config.merchantId,
      MerchantOrderNo: merchantOrderNo,
      Amt: String(amt),
      TradeNo: tradeNo,
      RespondCode: respondCode,
      PaymentType: 'CREDIT',
      PayTime: nowText(),
      Card6No: '400022',
      Card4No: '1111',
      Auth: success ? '123456' : '',
    },
  }
}

const postForm = async (url, fields) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toQuery(fields),
  })
  const text = await response.text()
  return { status: response.status, text }
}

const main = async () => {
  const { caseName, options } = parseArgs(process.argv.slice(2))
  if (!caseName || caseName === 'help' || caseName === '--help') {
    console.log(usage)
    return
  }
  if (!cases.has(caseName)) {
    throw new Error(`Unknown case: ${caseName}\n\n${usage}`)
  }

  loadEnvFile(options['env-file'])

  const baseUrl = (options['base-url'] || DEFAULT_BASE_URL).replace(/\/$/, '')
  const repeat = Math.max(1, Number(options.repeat || 1))

  let url
  let fields
  if (caseName.startsWith('period-')) {
    const config = getConfig('PERIOD')
    const payload = buildPeriodPayload(caseName, options, config)
    url = `${baseUrl}/api/newebpay/period/notify`
    fields = { Period: encrypt(payload, config) }
  } else if (caseName.startsWith('cau-')) {
    const config = getConfig('PERIOD')
    const payload = buildCauPayload(caseName, options, config)
    url = `${baseUrl}/api/newebpay/cau/notify`
    fields = { Period: encrypt(payload, config) }
  } else if (caseName === 'mpg-security-alert') {
    url = `${baseUrl}/api/newebpay/mpg/notify`
    fields = { TradeInfo: 'bad', TradeSha: 'bad' }
  } else {
    const config = getConfig('MPG')
    const payload = buildMpgPayload(caseName, options, config)
    const tradeInfo = encrypt(payload, config)
    url = `${baseUrl}/api/newebpay/mpg/notify`
    fields = {
      MerchantID: config.merchantId,
      TradeInfo: tradeInfo,
      TradeSha: tradeSha(tradeInfo, config),
      Version: env('NEWEBPAY_MPG_VERSION') || '2.3',
    }
  }

  for (let i = 1; i <= repeat; i += 1) {
    const result = await postForm(url, fields)
    console.log(`[${i}/${repeat}] ${caseName} -> HTTP ${result.status}`)
    console.log(result.text)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
