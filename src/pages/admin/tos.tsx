import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type TosItem = { version: string; published_at: string | null }

export default function TosAdminPage() {
  const [items, setItems] = useState<TosItem[]>([])
  const [version, setVersion] = useState('')
  const [body, setBody] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) {
      setMsg('ログインしてください')
      return
    }
    const resp = await fetch('/api/admin/tos', { headers: { Authorization: `Bearer ${token}` } })
    const json = await resp.json()
    if (resp.ok) setItems(json.items)
    else setMsg(json.error || '読み込み失敗')
  }

  useEffect(() => {
    load()
  }, [])

  const onPublish = async () => {
    setPublishing(true)
    setMsg(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('UNAUTHORIZED')
      const resp = await fetch('/api/admin/tos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ version, body, publish_now: true })
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'UPSERT_FAILED')
      setVersion('')
      setBody('')
      await load()
      setMsg('公開しました')
    } catch (e: any) {
      setMsg(e?.message || '公開に失敗しました')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>ToS 管理</h1>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>發佈</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            Version
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2025-10-23" style={{ width: '100%', padding: 8, marginTop: 4 }} />
          </label>
          <label>
            Body (HTML/Markdown 可)
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={{ width: '100%', padding: 8, marginTop: 4, fontFamily: 'monospace' }} />
          </label>
          <button onClick={onPublish} disabled={publishing || !version || !body} style={{ padding: '8px 12px' }}>
            {publishing ? '處理中…' : '公開'}
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>版本列表</h2>
        <ul>
          {items.map((it) => (
            <li key={it.version} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <b>{it.version}</b> / {it.published_at || '(未公開)'}
            </li>
          ))}
        </ul>
      </section>

      {msg && <p style={{ marginTop: 12, color: '#b00' }}>{msg}</p>}
    </div>
  )
}


