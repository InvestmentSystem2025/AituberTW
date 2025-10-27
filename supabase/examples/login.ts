// Supabase 連線範例 - 使用者登入與資料存取
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

async function loginExample() {
  console.log('🔐 開始使用者登入範例...')
  
  try {
    // 使用者登入
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: 'newuser@example.com',
      password: 'Passw0rd!'
    })
    
    if (error) throw error
    console.log('✅ 登入成功, JWT 長度:', signInData.session?.access_token.length)

    // 查詢自己的資料 (受 RLS 保護)
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('*')
    
    console.log('👤 我的資料:', myProfile)

    // 查詢我的 AI 會話
    const { data: mySessions } = await supabase
      .from('ai_sessions')
      .select('*')
      .order('created_at', { ascending: false })
    
    console.log('🤖 我的 AI 會話:', mySessions)

    // 新增對話記錄
    if (mySessions && mySessions.length > 0) {
      const { data: conversation, error: cErr } = await supabase
        .from('ai_conversations')
        .insert([{
          session_id: mySessions[0].id,
          role: 'user',
          content: '你好，我想了解 AI 的功能'
        }])
        .select()
        .single()

      if (cErr) throw cErr
      console.log('💬 對話記錄新增成功:', conversation)
    }

    // 查詢公開的新聞資料
    const { data: news } = await supabase
      .from('news_articles')
      .select('title, source, published_at')
      .limit(5)
      .order('published_at', { ascending: false })
    
    console.log('📰 最新新聞:', news)

  } catch (error) {
    console.error('❌ 錯誤:', error)
  }
}

loginExample().catch(console.error)
