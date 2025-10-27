// Supabase 連線範例 - 使用者註冊
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

async function signUpExample() {
  console.log('🚀 開始使用者註冊範例...')
  
  try {
    // 註冊新使用者
    const { data, error } = await supabase.auth.signUp({
      email: 'newuser@example.com',
      password: 'Passw0rd!'
    })
    
    if (error) throw error
    console.log('✅ 註冊成功:', data.user?.id)

    // 建立使用者資料
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .insert([{ 
        user_id: data.user?.id, 
        username: 'newbie',
        email: 'newuser@example.com'
      }])
      .select()
      .single()

    if (pErr) throw pErr
    console.log('✅ 使用者資料建立成功:', profile)

    // 建立 AI 會話
    const { data: session, error: sErr } = await supabase
      .from('ai_sessions')
      .insert([{
        user_id: data.user?.id,
        session_name: '我的第一個會話',
        model_name: 'ollama/llama2'
      }])
      .select()
      .single()

    if (sErr) throw sErr
    console.log('✅ AI 會話建立成功:', session)

  } catch (error) {
    console.error('❌ 錯誤:', error)
  }
}

signUpExample().catch(console.error)
