import { sendMail } from '@/lib/mailer'
import { getServiceClient } from '@/lib/supabaseServer'

type InterviewRecord = {
  id: string
  company_id: string
  job_opening_id: string
  start_time: string
  end_time?: string | null
  candidate_email?: string | null
  profiles_id?: string | null
}

async function resolveCandidateEmail(interview: InterviewRecord): Promise<string | null> {
  if (interview.candidate_email) {
    return String(interview.candidate_email).toLowerCase()
  }

  if (!interview.profiles_id) return null

  try {
    const supa = getServiceClient()
    const { data, error } = await supa.from('profiles').select('email').eq('id', interview.profiles_id).maybeSingle()
    if (error) {
      console.error('[interviewNotifications] 讀取 profiles email 失敗：', error)
      return null
    }
    if (!data?.email) return null
    return String(data.email).toLowerCase()
  } catch (err) {
    console.error('[interviewNotifications] resolveCandidateEmail 發生錯誤：', err)
    return null
  }
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return ''
  try {
    const tz = process.env.INTERVIEW_TIMEZONE || 'Asia/Taipei'
    const dt = new Date(iso)
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(dt)
  } catch {
    return iso
  }
}

function getFrontendBaseUrl(): string {
  const base =
    process.env.AUTH_REDIRECT_URL ||
    process.env.SMTP_DEFAULT_REDIRECT_URL ||
    process.env.FRONTEND_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  return String(base).replace(/\/+$/, '')
}

async function resolveCompanyAndJob(
  interview: InterviewRecord
): Promise<{ companyName: string; jobTitle: string }> {
  const supa = getServiceClient()
  let companyName = interview.company_id
  let jobTitle = interview.job_opening_id
  try {
    const [{ data: c }, { data: j }] = await Promise.all([
      supa.from('company').select('company_name').eq('id', interview.company_id).maybeSingle(),
      supa.from('job_opening').select('job_title').eq('id', interview.job_opening_id).maybeSingle()
    ])
    if (c?.company_name) companyName = c.company_name
    if (j?.job_title) jobTitle = j.job_title
  } catch (err) {
    console.warn('[interviewNotifications] 讀取公司/職缺資訊失敗，將退回使用 ID。', err)
  }
  return { companyName, jobTitle }
}

async function isRegisteredCandidate(email: string, profilesId?: string | null): Promise<boolean> {
  if (profilesId) return true
  try {
    const supa = getServiceClient()
    const { data } = await supa
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .limit(1)
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

function buildMailContent(args: {
  companyName: string
  jobTitle: string
  startTime: string
  endTime?: string | null
  signupUrl?: string
  profilePageUrl?: string
}): { subject: string; text: string; html: string } {
  const { companyName, jobTitle, startTime, endTime, signupUrl, profilePageUrl } = args

  const subject = `面試通知｜${companyName}－${jobTitle}（${startTime}）`
  const lines = [
    `您好，`,
    ``,
    `這是 AITuber Kit 自動寄送的面試排程通知。`,
    `公司：${companyName}`,
    `職缺：${jobTitle}`,
    `面試開始時間：${startTime}`,
    endTime ? `面試結束時間：${endTime}` : ``,
    signupUrl ? `` : ``,
    signupUrl ? `尚未註冊？請點此註冊：${signupUrl}` : ``,
    profilePageUrl ? `` : ``,
    profilePageUrl ? `查看面試詳情：${profilePageUrl}` : ``,
    ``,
    `若此信件與您無關，請忽略即可。`,
    ``,
    `AITuber Kit 團隊`
  ].filter(Boolean)

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#111827">
    <h2 style="margin:0 0 12px 0">面試通知</h2>
    <p style="margin:0 0 8px 0"><strong>公司</strong>：${companyName}</p>
    <p style="margin:0 0 8px 0"><strong>職缺</strong>：${jobTitle}</p>
    <p style="margin:0 0 8px 0"><strong>面試開始時間</strong>：${startTime}</p>
    ${endTime ? `<p style="margin:0 0 8px 0"><strong>面試結束時間</strong>：${endTime}</p>` : ''}
    ${
      signupUrl
        ? `<p style="margin:16px 0 8px 0">尚未註冊？請點下方按鈕完成註冊：</p>
           <p style="margin:0 0 16px 0">
             <a href="${signupUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">前往註冊</a>
           </p>`
        : ''
    }
    ${
      profilePageUrl
        ? `<p style="margin:16px 0 8px 0">查看面試詳情：</p>
           <p style="margin:0 0 16px 0">
             <a href="${profilePageUrl}" style="display:inline-block;background:#4CAF50;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">前往個人頁面</a>
           </p>`
        : ''
    }
    <p style="color:#6b7280;font-size:12px;margin-top:16px">若此信件與您無關，請忽略即可。</p>
    <p style="color:#6b7280;font-size:12px;margin:0">AITuber Kit 團隊</p>
  </div>
  `

  return { subject, text: lines.join('\n'), html }
}

export async function sendInterviewCreationEmail(interview: InterviewRecord): Promise<void> {
  const candidateEmail = await resolveCandidateEmail(interview)
  if (!candidateEmail) {
    console.warn('[interviewNotifications] 找不到候選人的 email，略過寄送面試通知。', {
      interviewId: interview.id
    })
    return
  }

  const { companyName, jobTitle } = await resolveCompanyAndJob(interview)
  const startText = formatDateTime(interview.start_time)
  const endText = formatDateTime(interview.end_time || undefined)

  const registered = await isRegisteredCandidate(candidateEmail, interview.profiles_id)
  const base = getFrontendBaseUrl()
  const signupUrl = registered ? undefined : `${base}/tos`
  
  // 如果使用 profiles_id 或候選人已註冊，加入個人頁面連結，直接導向面試預定 tab
  const profilePageUrl = (interview.profiles_id || registered) ? `${base}/me?tab=interviews` : undefined

  const mail = buildMailContent({
    companyName,
    jobTitle,
    startTime: startText,
    endTime: endText || undefined,
    signupUrl,
    profilePageUrl
  })
  await sendMail({
    to: candidateEmail,
    subject: mail.subject,
    text: mail.text,
    html: mail.html
  })
}

