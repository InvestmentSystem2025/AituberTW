import { buildUrl } from '@/utils/buildUrl'
import Head from 'next/head'

const normalizeBaseUrl = (value: string | undefined): string =>
  String(value || '').trim().replace(/\/+$/, '')

export const Meta = () => {
  const title = 'AI 面試官系統'
  const description =
    '協助企業建立職缺、邀請候選人完成 AI 面試，集中管理面試紀錄與評估結果。'
  const siteUrl = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.BASE_URL ||
      process.env.APP_BASE_URL
  )
  const imagePath = buildUrl('/images/home/ai-interviewHomePage.png')
  const imageUrl = siteUrl ? `${siteUrl}${imagePath}` : imagePath
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      {siteUrl && <meta property="og:url" content={siteUrl} />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Head>
  )
}
