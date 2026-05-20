import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Status = 'loading' | 'ready' | 'error'

export default function PaymentResultPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('付款結果確認中')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          if (!active) return
          setStatus('ready')
          setMessage('付款結果已送出，請回到個人頁重新登入後確認狀態。')
          return
        }
        const response = await fetch('/api/subscriptions/me', {
          headers: { 'x-supabase-token': token },
        })
        if (!active) return
        if (!response.ok) {
          setStatus('ready')
          setMessage('付款結果已送出，系統仍在等待藍新通知確認。')
          return
        }
        const body = await response.json()
        const sub = body?.subscription
        setStatus('ready')
        setMessage(
          sub?.status === 'active' || sub?.status === 'cancel_at_period_end'
            ? '訂閱狀態已更新。'
            : '付款結果已送出，系統仍在等待藍新通知確認。'
        )
      } catch {
        if (!active) return
        setStatus('error')
        setMessage('暫時無法查詢狀態，請稍後到個人頁確認。')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <section className="mx-auto max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">付款結果</h1>
        <p className="mt-4 text-sm leading-6 text-gray-700">
          {status === 'loading' ? '正在查詢目前訂閱狀態。' : message}
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/me?tab=subscription"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            回到訂閱頁
          </Link>
          <Link
            href="/me?tab=credits"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800"
          >
            查看面試次數
          </Link>
        </div>
      </section>
    </main>
  )
}
