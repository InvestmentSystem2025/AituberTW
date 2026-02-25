import { Meta } from '@/components/meta'
import Link from 'next/link'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import {
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  SparklesIcon,
  ClockIcon,
  CursorArrowRaysIcon,
  UsersIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const Home = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = useMemo(
    () => [
      {
        q: '可以自訂題庫與評分嗎？',
        a: '可以，所有題目與評分標準皆可依據職缺與所需能力指標彈性設定。',
      },
      {
        q: '支援哪些面試型態？',
        a: '目前支援文字與語音兩種模式。',
      },
      {
        q: '面試資料會拿去訓練 AI 嗎？',
        a: '不會。我們嚴格保護用戶隱私，資料不會用於模型訓練。',
      },
      {
        q: '資料會保存多久？',
        a: '只要企業帳號未刪除，資料會持續保存；企業也可依內部政策自行管理。',
      },
      {
        q: '我們可以用 PoC 先驗證嗎？',
        a: '可以，我們會與您共同定義成功指標，確保驗證過程符合您的業務需求。',
      },
    ],
    []
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Meta />

      {/* Section 1: Hero / Value Proposition */}
      <section className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:60px_60px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2">
              <SparklesIcon className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300">AI-Powered Interview System</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              AI 面試官，
              <br />
              將一次選考流程標準化
            </h1>

            <p className="text-xl md:text-2xl text-blue-200">更快・更一致・可追溯</p>

            <p className="text-lg text-gray-300 max-w-3xl mx-auto leading-relaxed">
              以文字 / 語音進行結構化面試，自訂題庫與評分標準，協助企業降低初篩工時、提升決策品質。
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/tos"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
                立即試用
              </Link>

              <a
                href="#demo"
                className="bg-white/10 hover:bg-white/20 text-white font-medium px-8 py-3 rounded-lg transition-colors border border-white/20 inline-flex items-center justify-center gap-2"
              >
                <DocumentTextIcon className="w-5 h-5" />
                取得 Demo
              </a>

              <a
                href="#contact"
                className="bg-white/10 hover:bg-white/20 text-white font-medium px-8 py-3 rounded-lg transition-colors border border-white/20"
              >
                聯絡我們
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Why Choose Us */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">為什麼選擇我們</h2>
            <p className="text-xl text-gray-600">解決現場的挑戰</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left: Challenges */}
            <div className="space-y-6">
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">採用現場的挑戰</h3>
              <div className="space-y-4">
                <div className="flex gap-4 p-4 bg-red-50 border border-red-100 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <XMarkIcon className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">履歷量大、初篩耗時</h4>
                    <p className="text-gray-600 text-sm">人工審閱大量履歷消耗寶貴時間</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 bg-red-50 border border-red-100 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <XMarkIcon className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">評估標準不一致</h4>
                    <p className="text-gray-600 text-sm">不同面試官的評估標準難以統一</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 bg-red-50 border border-red-100 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <XMarkIcon className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">面試紀錄分散、難以回溯</h4>
                    <p className="text-gray-600 text-sm">缺乏系統化的面試記錄管理</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Solutions */}
            <div className="space-y-6">
              <h3 className="text-2xl font-semibold text-gray-900 mb-6">我們的解法</h3>
              <div className="space-y-4">
                <div className="flex gap-4 p-4 bg-green-50 border border-green-100 rounded-lg">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">結構化問題</h4>
                    <p className="text-gray-600 text-sm">統一的面試問題確保評估一致性</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 bg-green-50 border border-green-100 rounded-lg">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">可自訂評分標準</h4>
                    <p className="text-gray-600 text-sm">根據職缺需求設定專屬評分標準</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 bg-green-50 border border-green-100 rounded-lg">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">輸出一致且可比較的結果摘要</h4>
                    <p className="text-gray-600 text-sm">系統化記錄，易於比較和追溯</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Product Overview */}
      <section className="py-20 bg-gray-50" id="demo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">產品概述</h2>
            <p className="text-xl text-gray-600">AI 面試官是什麼</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <ChatBubbleLeftRightIcon className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">支援文字 / 語音面試</h3>
                    <p className="text-gray-600">彈性選擇適合的面試方式，提供最佳候選人體驗</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Cog6ToothIcon className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">題庫、評分、流程皆可自訂</h3>
                    <p className="text-gray-600">完全客製化的面試設計，符合企業獨特需求</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <CursorArrowRaysIcon className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">嚴格遵循企業定義流程</h3>
                    <p className="text-gray-600">確保每次面試都按照標準化流程進行</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative h-[400px] rounded-2xl overflow-hidden shadow-2xl">
                <Image
                  src="/images/home/computer.jpg"
                  alt="AI Interview System"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Core Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">核心功能</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-xl transition-shadow bg-white">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <DocumentTextIcon className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">題庫自訂</h3>
              <p className="text-gray-600">根據職缺需求，建立專屬的面試題庫</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-xl transition-shadow bg-white">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <CheckBadgeIcon className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">評分標準自訂</h3>
              <p className="text-gray-600">彈性設定評分標準與權重</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-xl transition-shadow bg-white">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <ChatBubbleLeftRightIcon className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">文字 / 語音面試</h3>
              <p className="text-gray-600">支援多種面試形式，適應不同場景</p>
            </div>

            <div className="p-6 border border-gray-200 rounded-xl hover:shadow-xl transition-shadow bg-white">
              <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                <ChartBarIcon className="w-7 h-7 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">結果與摘要輸出</h3>
              <p className="text-gray-600">自動生成結構化的面試報告</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: How It Works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">使用流程</h2>
            <p className="text-xl text-gray-600">簡單四步驟，快速開始</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Enterprise Flow */}
            <div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-8 flex items-center gap-3">
                <UsersIcon className="w-7 h-7 text-blue-600" />
                企業端流程
              </h3>
              <div className="space-y-6">
                {[
                  { num: '1', title: '建立職缺與能力指標', desc: '定義職位要求與評估標準' },
                  { num: '2', title: '設定題庫與評分', desc: '客製化面試問題與評分規則' },
                  { num: '3', title: '發送面試邀請', desc: '透過系統發送面試連結給候選人' },
                  { num: '4', title: '查看結果與摘要', desc: '獲得結構化的面試結果報告' },
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                      {step.num}
                    </div>
                    <div className="flex-1 pt-1">
                      <h4 className="font-semibold text-gray-900 mb-1">{step.title}</h4>
                      <p className="text-gray-600 text-sm">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Candidate Flow */}
            <div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-8 flex items-center gap-3">
                <CursorArrowRaysIcon className="w-7 h-7 text-green-600" />
                候選人端流程
              </h3>
              <div className="space-y-6">
                {[
                  { num: '1', title: '開啟邀請連結', desc: '收到面試邀請後點擊連結' },
                  { num: '2', title: '完成文字或語音面試', desc: '依照系統引導完成面試' },
                  { num: '3', title: '送出', desc: '確認後提交面試結果' },
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="flex-shrink-0 w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">
                      {step.num}
                    </div>
                    <div className="flex-1 pt-1">
                      <h4 className="font-semibold text-gray-900 mb-1">{step.title}</h4>
                      <p className="text-gray-600 text-sm">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: PoC Information */}
      <section className="py-20 bg-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full mb-4">
                <ClockIcon className="w-4 h-4" />
                <span className="text-sm font-medium">PoC 階段</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">PoC 說明</h2>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-gray-700">
                  <span className="font-semibold">目前階段：</span>我們正處於 PoC（Proof of Concept）驗證階段
                </p>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-gray-700">
                  <span className="font-semibold">合作方式：</span>與您共同定義實作場景、成功指標與驗收方式
                </p>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="w-6 h-6 text-blue-600" />
                </div>
                <p className="text-gray-700">
                  <span className="font-semibold">重要說明：</span>PoC 不構成正式導入義務，雙方可根據驗證結果決定後續合作
                </p>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-200 text-center">
              <Link
                href="/tos"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
                申請 PoC 驗證
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: Security & Privacy */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <ShieldCheckIcon className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">資安與隱私</h2>
            <p className="text-xl text-gray-600">您的資料安全，是我們的首要責任</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="p-6 bg-green-50 border border-green-200 rounded-xl">
              <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-green-600" />
                資料保護承諾
              </h3>
              <p className="text-gray-700">
                我們<span className="font-semibold">絕不使用</span>面試資料訓練模型，確保您的商業機密與候選人隱私得到完整保護
              </p>
            </div>

            <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl">
              <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Cog6ToothIcon className="w-5 h-5 text-blue-600" />
                企業自主管理
              </h3>
              <p className="text-gray-700">
                面試資料安全保存，可由企業自行管理。您擁有完整的資料控制權
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: FAQ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">常見問題</h2>
            <p className="text-xl text-gray-600">FAQ</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-4">Q：{faq.q}</span>
                  <ChevronDownIcon
                    className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${
                      openFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <p className="text-gray-700">
                      <span className="font-medium">A：</span>
                      {faq.a}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-800 text-white" id="contact">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">準備好開始了嗎？</h2>
          <p className="text-xl text-blue-100 mb-8">立即與我們聯繫，讓 AI 協助您優化招募流程</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/tos"
              className="bg-white text-blue-600 hover:bg-gray-100 font-medium px-8 py-3 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
              申請 PoC
            </Link>
            <a
              href="mailto:contact@example.com"
              className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-8 py-3 rounded-lg transition-colors border border-blue-500"
            >
              聯絡我們
            </a>
          </div>
          <div className="mt-8 text-sm text-blue-100/80">
            或先從 <Link href="/login" className="underline underline-offset-4">登入</Link> 開始體驗
          </div>
        </div>
      </section>

      <footer className="bg-slate-900 text-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div>
            <div className="font-semibold">AI 面試官</div>
            <div className="text-sm text-slate-300">AI-Powered Interview System</div>
          </div>
          <div className="text-sm text-slate-300">
            <span>© {new Date().getFullYear()} All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home
