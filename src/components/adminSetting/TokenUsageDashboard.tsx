/**
 * TokenUsageDashboard
 *
 * Modern SaaS-style analytics dashboard for monitoring AI token usage and costs.
 * Reads data from GET /api/admin/token-usage/dashboard.
 *
 * Layout:
 *   - KPI Cards row (4 cards)
 *   - Daily trend line chart (recharts)
 *   - Breakdown cards: free vs paid / input vs output
 */
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Sub-components ────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  accent?: 'blue' | 'green' | 'amber' | 'rose'
  icon: React.ReactNode
}

function KpiCard({ title, value, subtitle, accent = 'blue', icon }: KpiCardProps) {
  const accentClasses = {
    blue:  'from-blue-500 to-blue-600',
    green: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    rose:  'from-rose-500 to-rose-600',
  }

  const bgClasses = {
    blue:  'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose:  'bg-rose-50 text-rose-700',
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br ${accentClasses[accent]}`}>
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

interface BreakdownBarProps {
  label: string
  value: number
  total: number
  color: string
}

function BreakdownBar({ label, value, total, color }: BreakdownBarProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{formatTokens(value)} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-gray-200 rounded-xl animate-pulse ${className ?? ''}`} />
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-9 rounded-xl" />
            </div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <Skeleton className="h-5 w-36 mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  )
}

// ── Custom tooltip for recharts ───────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-blue-600 font-medium">{formatTokens(payload[0].value)} tokens</p>
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
        headers: {
          'x-admin-auth': `Basic ${token}`,
        },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const json: DashboardData = await res.json()
      setData(json)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : '資料載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Empty state ─────────────────────────────────────────────────────────────
  const isEmpty =
    !loading &&
    !error &&
    data &&
    data.monthly.free_tokens === 0 &&
    data.monthly.paid_tokens === 0 &&
    data.daily.total_tokens === 0 &&
    data.trend.length === 0

  if (loading) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-600 text-sm">載入失敗：{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
        >
          重試
        </button>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
  const monthlyTotal = monthly.free_tokens + monthly.paid_tokens

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Token 使用統計</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {lastRefreshed
              ? `最後更新：${lastRefreshed.toLocaleTimeString('zh-TW')}`
              : '載入中…'}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重新整理
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          title="本月總使用量"
          value={formatTokens(monthlyTotal)}
          subtitle={`免費 ${formatTokens(monthly.free_tokens)} / 付費 ${formatTokens(monthly.paid_tokens)}`}
          accent="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <KpiCard
          title="本月免費用量"
          value={formatTokens(monthly.free_tokens)}
          subtitle="每日額度 2.5M tokens（全局）"
          accent="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          }
        />
        <KpiCard
          title="本月預估費用"
          value={formatCurrency(monthly.estimated_cost_twd)}
          subtitle={`Input ${formatTokens(monthly.paid_input_tokens)} / Output ${formatTokens(monthly.paid_output_tokens)}`}
          accent="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <KpiCard
          title="今日使用量"
          value={formatTokens(daily.total_tokens)}
          subtitle={`免費 ${formatTokens(daily.free_tokens)} / 付費 ${formatTokens(daily.paid_tokens)}`}
          accent="rose"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">每日 Token 使用趨勢（近 30 天）</h3>
        {trend.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            尚無歷史資料
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tickFormatter={formatTrendDate}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => formatTokens(v)}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="total_tokens"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Free vs Paid (monthly) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">本月 免費 vs 付費</h3>
          <div className="space-y-4">
            <BreakdownBar
              label="免費用量"
              value={monthly.free_tokens}
              total={monthlyTotal}
              color="bg-emerald-400"
            />
            <BreakdownBar
              label="付費用量"
              value={monthly.paid_tokens}
              total={monthlyTotal}
              color="bg-amber-400"
            />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
            <span>計費價格</span>
            <span className="font-medium">Input $0.40 / Output $1.60 per 1M tokens</span>
          </div>
        </div>

        {/* Input vs Output (monthly paid) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">本月付費 Input vs Output</h3>
          {monthly.paid_tokens === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">本月尚無付費使用</p>
          ) : (
            <div className="space-y-4">
              <BreakdownBar
                label="Input tokens"
                value={monthly.paid_input_tokens}
                total={monthly.paid_tokens}
                color="bg-blue-400"
              />
              <BreakdownBar
                label="Output tokens"
                value={monthly.paid_output_tokens}
                total={monthly.paid_tokens}
                color="bg-violet-400"
              />
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

      {/* Pricing info footer */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-blue-700">
          <span>每日免費額度：<strong>2,500,000 tokens</strong>（全局合計）</span>
          <span>計費：Input <strong>$0.40</strong> / Output <strong>$1.60</strong> per 1M tokens</span>
          <span>匯率：<strong>1 USD = 32 TWD</strong></span>
        </div>
      </div>
    </div>
  )
}
