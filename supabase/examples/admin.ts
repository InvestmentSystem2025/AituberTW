// Supabase 連線範例 - 後端管理 (Service Role)
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function adminExample() {
  console.log('👑 開始後端管理範例...')
  
  try {
    // 建立管理員帳號
    const { data: created, error } = await admin.auth.admin.createUser({
      email: 'admin@example.com',
      password: 'AdminP@ss123!',
      email_confirm: true
    })
    
    if (error) throw error
    console.log('✅ 管理員帳號建立成功:', created.user?.id)

    // 建立管理員資料 (繞過 RLS)
    const { data: adminProfile, error: pErr } = await admin
      .from('profiles')
      .insert([{ 
        user_id: created.user!.id, 
        username: 'admin',
        email: 'admin@example.com'
      }])
      .select()
      .single()

    if (pErr) throw pErr
    console.log('✅ 管理員資料建立成功:', adminProfile)

    // 新增新聞資料
    const { data: news, error: nErr } = await admin
      .from('news_articles')
      .insert([{
        title: 'AI 技術最新發展',
        content: '人工智慧技術在 2025 年持續快速發展...',
        source: 'TechNews',
        url: 'https://example.com/news/ai-development',
        published_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (nErr) throw nErr
    console.log('✅ 新聞資料新增成功:', news)

    // 查詢所有使用者 (管理員權限)
    const { data: allUsers } = await admin
      .from('profiles')
      .select('*')
    
    console.log('👥 所有使用者:', allUsers)

    // 查詢所有 AI 會話統計
    const { data: sessionStats } = await admin
      .from('ai_sessions')
      .select('model_name, count(*)')
      .group('model_name')
    
    console.log('📊 AI 會話統計:', sessionStats)

  } catch (error) {
    console.error('❌ 錯誤:', error)
  }
}

adminExample().catch(console.error)
