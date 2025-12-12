import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import settingsStore from '@/features/stores/settings'
import { TextButton } from '@/components/textButton'
import Settings from '@/components/settings'

const ADMIN_USERNAME = 'super123'
const ADMIN_PASSWORD = 'kapibarachiikawa'
const ADMIN_TOKEN_KEY = 'adminAuthToken'

const encodeBasicToken = (username: string, password: string) =>
  typeof window === 'undefined'
    ? ''
    : window.btoa(`${username}:${password}`)

const getStoredToken = () => {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY)
}

const setStoredToken = (token: string) => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
}

const clearStoredToken = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}

const AdminSettingPage = () => {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 初回ロード時に DB のグローバル設定を取得し settingsStore に反映
  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      setIsAuthenticated(true)
    }

    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/admin/settings', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!res.ok) return

        const json = await res.json()
        if (json.success && json.data && json.data.settingsJson) {
          // DB に保存されている全設定スナップショットを反映
          settingsStore.setState((prev) => ({
            ...prev,
            ...json.data.settingsJson,
          }))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleLogin = () => {
    setLoginError(null)
    setMessage(null)
    setError(null)

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      setLoginError('帳號或密碼錯誤')
      return
    }

    const token = encodeBasicToken(username, password)
    if (!token) {
      setLoginError('瀏覽器環境初始化失敗，請稍後再試')
      return
    }

    setStoredToken(token)
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    clearStoredToken()
    setIsAuthenticated(false)
    setUsername('')
    setPassword('')
    setMessage(null)
    setError(null)
  }

  const handleSave = async () => {
    setMessage(null)
    setError(null)

    const token = getStoredToken()
    if (!token) {
      setError('尚未登入或登入已過期，請重新登入')
      setIsAuthenticated(false)
      return
    }

    setSaving(true)
    try {
      const ss = settingsStore.getState()

      if (!ss.selectAIModel || !ss.selectAIModel.trim()) {
        setError('AI MODEL 不得為空')
        setSaving(false)
        return
      }

      const payload = {
        aiService: ss.selectAIService,
        aiModel: ss.selectAIModel.trim(),
        temperature: ss.temperature,
        maxTokens: ss.maxTokens,
        settingsJson: ss,
      }

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': `Basic ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        setError(json.error || '儲存失敗，請稍後再試')
        return
      }

      setMessage('儲存成功')
    } catch (e) {
      console.error('儲存全域設定錯誤:', e)
      setError('儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  const renderLogin = () => {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">管理者登入</h1>
          <div className="mb-4">
            <label className="block mb-1 text-sm font-medium">帳號</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-lg"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="輸入管理帳號"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-1 text-sm font-medium">密碼</label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded-lg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="輸入管理密碼"
            />
          </div>
          {loginError && (
            <div className="mb-4 text-red-600 text-sm">{loginError}</div>
          )}
          <div className="flex justify-between items-center">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
              onClick={() => router.push('/')}
            >
              返回首頁
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleLogin}
            >
              登入
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderSettingsForm = () => {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-5xl mx-auto py-10 px-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Admin 全域設定</h1>
            <div className="flex gap-3">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-sm"
                onClick={() => router.push('/')}
              >
                返回首頁
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm"
                onClick={handleLogout}
              >
                登出
              </button>
            </div>
          </div>

          <p className="mb-4 text-gray-600 text-sm">
            此頁面使用與首頁相同的完整設定畫面，所有變更會以全域 JSON 設定形式儲存到資料庫，並套用到所有用戶。
          </p>

          <div className="relative h-[80vh] min-h-[600px] border rounded-xl bg-white/80 shadow overflow-hidden">
            {/* 直接重用原本的 Settings UI */}
            <Settings onClickClose={() => {}} />
          </div>

          <div className="mt-6 space-y-2">
            {error && <div className="text-red-600 text-sm">{error}</div>}
            {message && <div className="text-green-600 text-sm">{message}</div>}

            <div className="flex justify-end">
              <TextButton onClick={handleSave} disabled={saving}>
                {saving ? '儲存中...' : '儲存全域設定'}
              </TextButton>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return renderLogin()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>載入設定中...</div>
      </div>
    )
  }

  return renderSettingsForm()
}

export default AdminSettingPage


