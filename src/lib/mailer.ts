import nodemailer from 'nodemailer'

export type MailContent = {
  to: string
  subject: string
  text?: string
  html?: string
  replyTo?: string
}

type TransportConfig =
  | {
      enabled: true
      host: string
      port: number
      secure: boolean
      user: string
      pass: string
      from: string
    }
  | {
      enabled: false
    }

let transporter: nodemailer.Transporter | null = null
let cachedConfig: TransportConfig | null = null

function loadConfig(): TransportConfig {
  if (cachedConfig) return cachedConfig

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const senderName = process.env.SMTP_SENDER_NAME || 'AITuber Kit'
  const adminEmail = process.env.SMTP_ADMIN_EMAIL || user

  if (!host || !user || !adminEmail || !pass) {
    console.warn('[mailer] SMTP 設定尚未完成（host/user/adminEmail/pass 至少一項缺失），跳過寄信。')
    cachedConfig = { enabled: false }
    return cachedConfig
  }

  if (Number.isNaN(port)) {
    console.warn('[mailer] SMTP_PORT 不是有效數字，將改用預設 587。')
  }

  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465

  cachedConfig = {
    enabled: true,
    host,
    port: Number.isNaN(port) ? 587 : port,
    secure,
    user,
    pass,
    from: `${senderName} <${adminEmail}>`
  }
  return cachedConfig
}

async function getTransporter(config: Extract<TransportConfig, { enabled: true }>): Promise<nodemailer.Transporter> {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  })

  try {
    await transporter.verify()
  } catch (err) {
    transporter = null
    throw err
  }

  return transporter
}

export async function sendMail({ to, subject, text, html, replyTo }: MailContent): Promise<void> {
  if (!to) throw new Error('寄件對象 (to) 不可為空。')
  if (!subject) throw new Error('郵件主旨不可為空。')

  const config = loadConfig()
  if (!config.enabled) {
    console.warn('[mailer] SMTP 設定未完成，郵件尚未寄出。')
    return
  }

  const activeConfig = config
  const mailer = await getTransporter(activeConfig)

  await mailer.sendMail({
    from: activeConfig.from,
    to,
    subject,
    text,
    html,
    replyTo
  })
}

