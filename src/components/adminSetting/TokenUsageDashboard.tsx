/**
 * TokenUsageDashboard
 *
 * CSP-compatible: zero inline styles — uses only Tailwind classes and SVG attributes.
 * No recharts dependency (recharts injects inline styles that violate strict CSP).
 *
 * Chart is a hand-rolled pure SVG line chart.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardData {
  monthly: {
    free_tokens: number
    paid_tokens: number
    paid_input_tokens: number
    paid_output_tokens: number
    estimated_cost_twd: number
  }
  daily: {
    free_tokens: number
    paid_tokens: number
    paid_input_tokens: number
    paid_output_tokens: number
    total_tokens: number
  }
  trend: Array<{ date: string; total_tokens: number }>
}

// ── Billing constants (mirror tokenUsageService.ts) ──────────────────────────
const INPUT_PRICE_PER_MILLION = 0.40
const OUTPUT_PRICE_PER_MILLION = 1.60
const TWD_PER_USD = 32

function calcCostTwd(paidInput: number, paidOutput: number): number {
  const usd =
    (paidInput / 1_000_000) * INPUT_PRICE_PER_MILLION +
    (paidOutput / 1_000_000) * OUTPUT_PRICE_PER_MILLION
  return Math.round(usd * TWD_PER_USD * 10000) / 10000
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCurrency(twd: number): string {
  return `NT$ ${twd.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatTrendDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+08:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getAdminToken(): string {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem('adminAuthToken') ?? ''
}

// ── Pure SVG Line Chart (no inline styles, CSP-compatible) ────────────────────
interface SvgLineChartProps {
  data: Array<{ date: string; total_tokens: number }>
}

function SvgLineChart({ data }: SvgLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const HEIGHT = 220
  const PAD_LEFT = 56
  const PAD_RIGHT = 16
  const PAD_TOP = 12
  const PAD_BOTTOM = 32

  const chartW = width - PAD_LEFT - PAD_RIGHT
  const chartH = HEIGHT - PAD_TOP - PAD_BOTTOM

  const maxVal = Math.max(...data.map((d) => d.total_tokens), 1)
  const minVal = 0

  const toX = (i: number) => PAD_LEFT + (i / Math.max(data.length - 1, 1)) * chartW
  const toY = (v: number) => PAD_TOP + chartH - ((v - minVal) / (maxVal - minVal)) * chartH

  const points = data.map((d, i) => `${toX(i)},${toY(d.total_tokens)}`).join(' ')

  // Y-axis labels (4 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: Math.round(maxVal * f),
    y: PAD_TOP + chartH - f * chartH,
  }))

  // X-axis labels — show at most 7 evenly spaced
  const xStep = Math.max(1, Math.floor(data.length / 7))
  const xTicks = data
    .map((d, i) => ({ label: formatTrendDate(d.date), x: toX(i), i }))
    .filter((_, i) => i % xStep === 0 || i === data.length - 1)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    // Find nearest data point
    let closest = 0
    let minDist = Infinity
    data.forEach((_, i) => {
      const dx = Math.abs(toX(i) - mx)
      if (dx < minDist) { minDist = dx; closest = i }
    })
    const d = data[closest]
    setTooltip({
      x: toX(closest),
      y: toY(d.total_tokens),
      label: formatTrendDate(d.date),
      value: formatTokens(d.total_tokens),
    })
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        role="img"
        aria-label="每日 Token 使用趨勢圖"
      >
        {/* Grid lines */}
        {yTicks.map((t) => (
          <line
            key={t.value}
            x1={PAD_LEFT}
            y1={t.y}
            x2={PAD_LEFT + chartW}
            y2={t.y}
            stroke="#f3f4f6"
            strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((t) => (
          <text
            key={t.value}
            x={PAD_LEFT - 6}
            y={t.y + 4}
            textAnchor="end"
            fontSize="11"
            fill="#9ca3af"
          >
            {formatTokens(t.value)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((t) => (
          <text
            key={t.i}
            x={t.x}
            y={HEIGHT - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#9ca3af"
          >
            {t.label}
          </text>
        ))}

        {/* Area fill (gradient via SVG linearGradient — no inline style) */}
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {data.length > 1 && (
          <polygon
            points={`${PAD_LEFT},${PAD_TOP + chartH} ${points} ${PAD_LEFT + chartW},${PAD_TOP + chartH}`}
            fill="url(#areaGrad)"
          />
        )}

        {/* Line */}
        {data.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Active dot */}
        {tooltip && (
          <circle
            cx={tooltip.x}
            cy={tooltip.y}
            r="5"
            fill="#3b82f6"
            stroke="white"
            strokeWidth="2"
          />
        )}

        {/* Tooltip box */}
        {tooltip && (() => {
          const tw = 88
          const th = 42
          const tx = Math.min(tooltip.x - tw / 2, width - tw - 4)
          const ty = Math.max(tooltip.y - th - 10, PAD_TOP)
          return (
            <g>
              <rect
                x={tx}
                y={ty}
                width={tw}
                height={th}
                rx="8"
                fill="white"
                stroke="#e5e7eb"
                strokeWidth="1"
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.08))"
              />
              <text x={tx + tw / 2} y={ty + 14} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="500">
                {tooltip.label}
              </text>
              <text x={tx + tw / 2} y={ty + 30} textAnchor="middle" fontSize="12" fill="#3b82f6" fontWeight="600">
                {tooltip.value}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  accent?: 'blue' | 'green' | 'amber' | 'rose'
  icon: React.ReactNode
}

function KpiCard({ title, value, subtitle, accent = 'blue', icon }: KpiCardProps) {
  const gradients: Record<string, string> = {
    blue:  'from-blue-500 to-blue-600',
    green: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    rose:  'from-rose-500 to-rose-600',
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br ${gradients[accent]}`}>
          {icon}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Breakdown Bar (Tailwind only, no inline style width) ─────────────────────
interface BreakdownBarProps {
  label: string
  value: number
  total: number
  color: string
}

function BreakdownBar({ label, value, total, color }: BreakdownBarProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  // Use SVG rect instead of a div with inline width to avoid CSP violation
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{formatTokens(value)} ({pct}%)</span>
      </div>
      <svg width="100%" height="8" className="rounded-full overflow-visible">
        <rect x="0" y="0" width="100%" height="8" rx="4" fill="#f3f4f6" />
        <rect x="0" y="0" width={`${pct}%`} height="8" rx="4" fill={color === 'bg-emerald-400' ? '#34d399' : color === 'bg-amber-400' ? '#fbbf24' : color === 'bg-blue-400' ? '#60a5fa' : '#a78bfa'} />
      </svg>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="flex justify-between">
              <div className="h-4 w-24 bg-gray-200 rounded-xl" />
              <div className="h-9 w-9 bg-gray-200 rounded-xl" />
            </div>
            <div className="h-7 w-32 bg-gray-200 rounded-xl" />
            <div className="h-3 w-20 bg-gray-200 rounded-xl" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <div className="h-5 w-36 bg-gray-200 rounded-xl" />
        <div className="h-48 w-full bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TokenUsageDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getAdminToken()
      const res = await fetch('/api/admin/token-usage/dashboard', {
        headers: { 'x-admin-auth': `Basic ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: DashboardData = await res.json()
      setData(json)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : '資料載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-600 text-sm">載入失敗：{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">
          重試
        </button>
      </div>
    )
  }

  const isEmpty = data && data.monthly.free_tokens === 0 && data.monthly.paid_tokens === 0 && data.daily.total_tokens === 0 && data.trend.length === 0

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-gray-500 font-medium">尚無 Token 使用記錄</p>
        <p className="text-gray-400 text-sm">AI 請求完成後資料將自動顯示</p>
      </div>
    )
  }

  const monthly = data!.monthly
  const daily = data!.daily
  const trend = data!.trend

  // ── 本月含今日合算（今日即時數據 + 歷史聚合）──────────────────────────────
  // monthly.*  = 本月「不含今日」的 daily 聚合（由後端從 token_usage_daily 累加）
  // daily.*    = 今日即時數據（Redis total + logs breakdown）
  // 顯示「本月」時必須把今日加回去，否則今日資料在隔天 cron 前不會反映
  const combined = {
    total:       (monthly.free_tokens + monthly.paid_tokens) + daily.total_tokens,
    free:        monthly.free_tokens        + daily.free_tokens,
    paidInput:   monthly.paid_input_tokens  + daily.paid_input_tokens,
    paidOutput:  monthly.paid_output_tokens + daily.paid_output_tokens,
    paid:        monthly.paid_tokens        + daily.paid_tokens,
    costTwd:     monthly.estimated_cost_twd + calcCostTwd(daily.paid_input_tokens, daily.paid_output_tokens),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Token 使用統計</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {lastRefreshed ? `最後更新：${lastRefreshed.toLocaleTimeString('zh-TW')}` : ''}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重新整理
        </button>
      </div>

      {/* 本月 KPI Cards（歷史聚合 + 今日即時，共 3 cards） */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">本月累計（含今日）</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            title="本月總使用量"
            value={formatTokens(combined.total)}
            subtitle={`免費 ${formatTokens(combined.free)} / 付費 ${formatTokens(combined.paid)}`}
            accent="blue"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          />
          <KpiCard
            title="本月免費用量"
            value={formatTokens(combined.free)}
            subtitle="每日額度 2.5M tokens（全局）"
            accent="green"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>}
          />
          <KpiCard
            title="本月預估費用"
            value={formatCurrency(combined.costTwd)}
            subtitle={`Input ${formatTokens(combined.paidInput)} / Output ${formatTokens(combined.paidOutput)}`}
            accent="amber"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* 今日 KPI Cards（3 cards） */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">今日即時</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            title="今日總使用量"
            value={formatTokens(daily.total_tokens)}
            subtitle={`免費 ${formatTokens(daily.free_tokens)} / 付費 ${formatTokens(daily.paid_tokens)}`}
            accent="blue"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
          <KpiCard
            title="今日免費使用量"
            value={`${formatTokens(daily.free_tokens)} / 2500K`}
            subtitle="每日全局免費額度 2.5M tokens"
            accent="green"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>}
          />
          <KpiCard
            title="今日付費使用量"
            value={formatTokens(daily.paid_tokens)}
            subtitle={`Input: ${formatTokens(daily.paid_input_tokens)} / Output: ${formatTokens(daily.paid_output_tokens)}`}
            accent="rose"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          />
        </div>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">每日 Token 使用趨勢（近 30 天）</h3>
        {trend.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">尚無歷史資料</div>
        ) : (
          <SvgLineChart data={trend} />
        )}
      </div>

      {/* Breakdown Cards（本月含今日） */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">本月 免費 vs 付費（含今日）</h3>
          <div className="space-y-4">
            <BreakdownBar label="免費用量" value={combined.free} total={combined.total} color="bg-emerald-400" />
            <BreakdownBar label="付費用量" value={combined.paid} total={combined.total} color="bg-amber-400" />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
            <span>計費價格</span>
            <span className="font-medium">Input $0.40 / Output $1.60 per 1M tokens</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">本月付費 Input vs Output（含今日）</h3>
          {combined.paid === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">本月尚無付費使用</p>
          ) : (
            <div className="space-y-4">
              <BreakdownBar label="Input tokens" value={combined.paidInput} total={combined.paid} color="bg-blue-400" />
              <BreakdownBar label="Output tokens" value={combined.paidOutput} total={combined.paid} color="bg-violet-400" />
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>今日 Input 付費</span>
              <span className="font-medium text-gray-700">{formatTokens(daily.paid_input_tokens)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>今日 Output 付費</span>
              <span className="font-medium text-gray-700">{formatTokens(daily.paid_output_tokens)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-blue-700">
          <span>每日免費額度：<strong>2,500,000 tokens</strong>（全局合計）</span>
          <span>計費：Input <strong>$0.40</strong> / Output <strong>$1.60</strong> per 1M tokens</span>
          <span>匯率：<strong>1 USD = 32 TWD</strong></span>
        </div>
      </div>
    </div>
  )
}
