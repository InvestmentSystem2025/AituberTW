import { Meta } from '@/components/meta'
import Link from 'next/link'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
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

const scrollReveal = (delay = 0) => ({
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
})

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

      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white py-24 lg:py-36 overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-500/15 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-indigo-500/15 rounded-full blur-3xl"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          />
        </div>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/25 rounded-full px-4 py-2 backdrop-blur-sm"
            >
              <SparklesIcon className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300 font-medium">AI-Powered Interview System</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight"
            >
              AI 面試官，
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                將一次選考流程標準化
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-xl md:text-2xl text-blue-200/80 font-light"
            >
              更快・更一致・可追溯
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-lg text-gray-300 max-w-3xl mx-auto leading-relaxed"
            >
              以文字 / 語音進行結構化面試，自訂題庫與評分標準，
              協助企業降低初篩工時、提升決策品質。
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link
                href="/tos"
                className="group inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/30 hover:scale-105"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
                立即試用
              </Link>
              <a
                href="#demo"
                className="inline-flex items-center justify-center gap-2 bg-white/8 hover:bg-white/15 text-white font-bold px-8 py-3.5 rounded-xl transition-all duration-200 border border-white/20 backdrop-blur-sm hover:scale-105"
              >
                <DocumentTextIcon className="w-5 h-5" />
                取得 Demo
              </a>
              <a
                href="#contact"
                className="inline-flex items-center justify-center gap-2 bg-white/8 hover:bg-white/15 text-white font-bold px-8 py-3.5 rounded-xl transition-all duration-200 border border-white/20 backdrop-blur-sm hover:scale-105"
              >
                聯絡我們
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Why Choose Us ──────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...scrollReveal(0)} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">為什麼選擇我們</h2>
            <p className="text-xl text-gray-600">解決現場的挑戰</p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Challenges */}
            <motion.div {...scrollReveal(0.1)} className="space-y-4">
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600 text-sm font-bold">✕</span>
                採用現場的挑戰
              </h3>
              {[
                { title: '履歷量大、初篩耗時', desc: '人工審閱大量履歷消耗寶貴時間' },
                { title: '評估標準不一致', desc: '不同面試官的評估標準難以統一' },
                { title: '面試紀錄分散、難以回溯', desc: '缺乏系統化的面試記錄管理' },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...scrollReveal(0.1 + idx * 0.08)}
                  className="flex gap-4 p-5 bg-red-50 border border-red-100 rounded-xl hover:shadow-md transition-shadow"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <XMarkIcon className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                    <p className="text-gray-600 text-sm">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Solutions */}
            <motion.div {...scrollReveal(0.2)} className="space-y-4">
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <CheckCircleIcon className="w-8 h-8 text-green-600" />
                我們的解法
              </h3>
              {[
                { title: '結構化問題', desc: '統一的面試問題確保評估一致性' },
                { title: '可自訂評分標準', desc: '根據職缺需求設定專屬評分標準' },
                { title: '輸出一致且可比較的結果摘要', desc: '系統化記錄，易於比較和追溯' },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...scrollReveal(0.2 + idx * 0.08)}
                  className="flex gap-4 p-5 bg-green-50 border border-green-100 rounded-xl hover:shadow-md transition-shadow"
                >
                  <CheckCircleIcon className="w-8 h-8 text-green-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                    <p className="text-gray-600 text-sm">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Product Overview ────────────────────────────────── */}
      <section className="py-24 bg-gray-50" id="demo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...scrollReveal(0)} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">產品概述</h2>
            <p className="text-xl text-gray-600">AI 面試官是什麼</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div {...scrollReveal(0.1)} className="space-y-8">
              {[
                { Icon: ChatBubbleLeftRightIcon, color: 'bg-blue-100', iconColor: 'text-blue-600', title: '支援文字 / 語音面試', desc: '彈性選擇適合的面試方式，提供最佳候選人體驗' },
                { Icon: Cog6ToothIcon, color: 'bg-purple-100', iconColor: 'text-purple-600', title: '題庫、評分、流程皆可自訂', desc: '完全客製化的面試設計，符合企業獨特需求' },
                { Icon: CursorArrowRaysIcon, color: 'bg-green-100', iconColor: 'text-green-600', title: '嚴格遵循企業定義流程', desc: '確保每次面試都按照標準化流程進行' },
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  {...scrollReveal(0.1 + idx * 0.1)}
                  className="flex gap-5 group"
                >
                  <motion.div
                    className={`w-14 h-14 ${item.color} rounded-xl flex items-center justify-center flex-shrink-0`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <item.Icon className={`w-7 h-7 ${item.iconColor}`} />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{item.title}</h3>
                    <p className="text-gray-600">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div {...scrollReveal(0.2)} className="relative">
              <div className="relative h-[400px] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-200">
                <Image
                  src="/images/home/computer.jpg"
                  alt="AI Interview System"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 to-transparent" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Core Features ──────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...scrollReveal(0)} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">核心功能</h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { Icon: DocumentTextIcon, bg: 'bg-blue-100', text: 'text-blue-600', title: '題庫自訂', desc: '根據職缺需求，建立專屬的面試題庫' },
              { Icon: CheckBadgeIcon, bg: 'bg-green-100', text: 'text-green-600', title: '評分標準自訂', desc: '彈性設定評分標準與權重' },
              { Icon: ChatBubbleLeftRightIcon, bg: 'bg-purple-100', text: 'text-purple-600', title: '文字 / 語音面試', desc: '支援多種面試形式，適應不同場景' },
              { Icon: ChartBarIcon, bg: 'bg-orange-100', text: 'text-orange-600', title: '結果與摘要輸出', desc: '自動生成結構化的面試報告' },
            ].map((f, idx) => (
              <motion.div
                key={f.title}
                {...scrollReveal(idx * 0.1)}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                className="p-6 border border-gray-200 rounded-2xl hover:shadow-xl transition-shadow bg-white"
              >
                <div className={`w-14 h-14 ${f.bg} rounded-xl flex items-center justify-center mb-5`}>
                  <f.Icon className={`w-7 h-7 ${f.text}`} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ────────────────────────────────────── */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...scrollReveal(0)} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">使用流程</h2>
            <p className="text-xl text-gray-600">簡單幾步驟，快速開始</p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Enterprise */}
            <motion.div {...scrollReveal(0.1)}>
              <h3 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <UsersIcon className="w-6 h-6 text-blue-600" />
                </div>
                企業端流程
              </h3>
              <div className="space-y-5">
                {[
                  { num: '1', title: '建立職缺與能力指標', desc: '定義職位要求與評估標準' },
                  { num: '2', title: '設定題庫與評分', desc: '客製化面試問題與評分規則' },
                  { num: '3', title: '發送面試邀請', desc: '透過系統發送面試連結給候選人' },
                  { num: '4', title: '查看結果與摘要', desc: '獲得結構化的面試結果報告' },
                ].map((step, idx) => (
                  <motion.div
                    key={idx}
                    {...scrollReveal(0.1 + idx * 0.08)}
                    className="flex gap-4 items-start group"
                  >
                    <motion.div
                      className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md shadow-blue-200"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      {step.num}
                    </motion.div>
                    <div className="flex-1 pt-1">
                      <h4 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{step.title}</h4>
                      <p className="text-gray-600 text-sm">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Candidate */}
            <motion.div {...scrollReveal(0.2)}>
              <h3 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <CursorArrowRaysIcon className="w-6 h-6 text-green-600" />
                </div>
                候選人端流程
              </h3>
              <div className="space-y-5">
                {[
                  { num: '1', title: '開啟邀請連結', desc: '收到面試邀請後點擊連結' },
                  { num: '2', title: '完成文字或語音面試', desc: '依照系統引導完成面試' },
                  { num: '3', title: '送出', desc: '確認後提交面試結果' },
                ].map((step, idx) => (
                  <motion.div
                    key={idx}
                    {...scrollReveal(0.2 + idx * 0.08)}
                    className="flex gap-4 items-start group"
                  >
                    <motion.div
                      className="flex-shrink-0 w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md shadow-green-200"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      {step.num}
                    </motion.div>
                    <div className="flex-1 pt-1">
                      <h4 className="font-bold text-gray-900 mb-1 group-hover:text-green-600 transition-colors">{step.title}</h4>
                      <p className="text-gray-600 text-sm">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── PoC Section ────────────────────────────────────── */}
      <section className="py-24 bg-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            {...scrollReveal(0)}
            className="bg-white rounded-2xl shadow-xl ring-1 ring-blue-100 p-8 md:p-12"
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full mb-4 font-semibold text-sm">
                <ClockIcon className="w-4 h-4" />
                PoC 階段
              </div>
              <h2 className="text-3xl font-black text-gray-900 mb-4">PoC 說明</h2>
            </div>

            <div className="space-y-5">
              {[
                { label: '目前階段', value: '我們正處於 PoC（Proof of Concept）驗證階段' },
                { label: '合作方式', value: '與您共同定義實作場景、成功指標與驗收方式' },
                { label: '重要說明', value: 'PoC 不構成正式導入義務，雙方可根據驗證結果決定後續合作' },
              ].map((item, idx) => (
                <motion.div
                  key={item.label}
                  {...scrollReveal(idx * 0.1)}
                  className="flex gap-4"
                >
                  <CheckCircleIcon className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-gray-700">
                    <span className="font-bold">{item.label}：</span>{item.value}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="mt-10 pt-8 border-t border-gray-100 text-center">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/tos"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-blue-200"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                  申請 PoC 驗證
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Security & Privacy ──────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...scrollReveal(0)} className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-2xl mb-4">
              <ShieldCheckIcon className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">資安與隱私</h2>
            <p className="text-xl text-gray-600">您的資料安全，是我們的首要責任</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {[
              { Icon: ShieldCheckIcon, bg: 'bg-green-50', border: 'border-green-200', iconBg: 'bg-green-100', iconColor: 'text-green-600', title: '資料保護承諾', desc: '我們絕不使用面試資料訓練模型，確保您的商業機密與候選人隱私得到完整保護。' },
              { Icon: Cog6ToothIcon, bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', title: '企業自主管理', desc: '面試資料安全保存，可由企業自行管理。您擁有完整的資料控制權。' },
            ].map((item, idx) => (
              <motion.div
                key={item.title}
                {...scrollReveal(idx * 0.1)}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`p-6 ${item.bg} border ${item.border} rounded-2xl`}
              >
                <div className={`w-12 h-12 ${item.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                  <item.Icon className={`w-6 h-6 ${item.iconColor}`} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-700 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────────── */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...scrollReveal(0)} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">常見問題</h2>
            <p className="text-xl text-gray-600">FAQ</p>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <motion.div
                key={idx}
                {...scrollReveal(idx * 0.06)}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-4 text-sm md:text-base">
                    Q：{faq.q}
                  </span>
                  <motion.div
                    animate={{ rotate: openFaq === idx ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                        <p className="text-gray-700 text-sm leading-relaxed">
                          <span className="font-semibold text-blue-600">A：</span>{faq.a}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────── */}
      <section className="relative py-24 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white overflow-hidden" id="contact">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute -top-32 -right-32 w-96 h-96 bg-white/5 rounded-full blur-3xl"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div {...scrollReveal(0)} className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-black">準備好開始了嗎？</h2>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">
              立即與我們聯繫，讓 AI 協助您優化招募流程
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/tos"
                  className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 hover:bg-blue-50 font-bold px-8 py-3.5 rounded-xl transition-colors shadow-lg"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                  申請 PoC
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <a
                  href="mailto:contact@example.com"
                  className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-bold px-8 py-3.5 rounded-xl transition-colors border border-blue-500"
                >
                  聯絡我們
                </a>
              </motion.div>
            </div>
            <div className="mt-4 text-sm text-blue-100/80">
              或先從 <Link href="/login" className="underline underline-offset-4">登入</Link> 開始體驗
            </div>
          </motion.div>
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
