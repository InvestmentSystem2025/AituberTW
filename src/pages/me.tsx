import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type TosResp = { accepted: boolean; version: string | null; accepted_at?: string }

export default function MePlaceholderPage() {
  const [email, setEmail] = useState<string>('')
  const [tos, setTos] = useState<TosResp | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      setEmail(session.session?.user?.email || '')
      if (token) {
        const resp = await fetch('/api/me/tos', { headers: { Authorization: `Bearer ${token}` } })
        const json = (await resp.json()) as TosResp
        setTos(json)
        if (!json.accepted) {
          window.location.href = '/tos'
        }
      }
    }
    init()
  }, [])

  return (
    <div style={{ maxWidth: 720, margin: '48px auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>個人ページ（仮）</h1>
      <div>こんにちは、{email || 'ゲスト'} さん</div>
      {tos && (
        <div style={{ marginTop: 12, fontSize: 14, color: '#555' }}>
          最新ToS同意: {String(tos.accepted)} / version: {tos.version || '-'} {tos.accepted_at ? `(at ${tos.accepted_at})` : ''}
        </div>
      )}
    </div>
  )
}


