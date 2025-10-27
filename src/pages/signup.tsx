import { useState } from 'react'
import Link from 'next/link'

export default function SignUpPage() {
  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>建立帳號</h1>
      <p>この画面は旧フローです。新規登録は ToS 画面から開始してください。</p>
      <div style={{ marginTop: 12 }}>
        <Link href="/tos">ToS に同意してサインアップへ</Link>
      </div>
    </div>
  )
}
