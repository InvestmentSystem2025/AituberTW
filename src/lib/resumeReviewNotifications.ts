import { sendMail } from '@/lib/mailer'

function getFrontendBaseUrl(): string {
  const base =
    process.env.AUTH_REDIRECT_URL ||
    process.env.SMTP_DEFAULT_REDIRECT_URL ||
    process.env.FRONTEND_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  return String(base).replace(/\/+$/, '')
}

export async function sendResumeReviewInvitationEmail(args: {
  to: string
  companyName: string
  jobTitle: string
  token: string
  expiresAt: string
}) {
  const base = getFrontendBaseUrl()
  const link = `${base}/resume-review?token=${encodeURIComponent(args.token)}`
  const subject = `履歷審查邀請｜${args.companyName} - ${args.jobTitle}`
  const text = [
    '您好，',
    '',
    `${args.companyName} 邀請您進行履歷審查。`,
    `應徵職缺：${args.jobTitle}`,
    `審查連結：${link}`,
    `有效期限：${args.expiresAt}`,
    '',
    '若您未申請此職缺，請忽略本信。',
  ].join('\n')

  await sendMail({
    to: args.to,
    subject,
    text,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#111827">
        <h2>履歷審查邀請</h2>
        <p><strong>公司</strong>：${args.companyName}</p>
        <p><strong>職缺</strong>：${args.jobTitle}</p>
        <p><strong>有效期限</strong>：${args.expiresAt}</p>
        <p style="margin-top:16px">
          <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">
            前往履歷審查
          </a>
        </p>
      </div>
    `,
  })
}
