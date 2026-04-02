/**
 * PersonalityAnalysisPanel
 * 人格分析結果展示元件
 * 包含：DISC 雷達圖、Big Five 橫條、Schwartz 價值觀、核心特質、離職風險
 *
 * CSP 安全：全使用 Tailwind class + SVG 屬性，不使用 inline style
 */

import React from 'react'
import type {
  PersonalitySummary,
  CoreTraitResult,
  BigFiveResult,
  DISCResult,
  SchwartzValues,
  TurnoverRisk,
} from '@/types/interviewScoring'

// ─────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v))
}

function confidenceLabel(c?: string): string {
  if (c === 'high') return '信心：高'
  if (c === 'medium') return '信心：中'
  if (c === 'low') return '信心：低（待確認）'
  return ''
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-700'
  if (score >= 55) return 'text-blue-700'
  if (score >= 35) return 'text-amber-700'
  return 'text-red-600'
}

function scoreBgColor(score: number): string {
  if (score >= 75) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (score >= 55) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (score >= 35) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-red-100 text-red-800 border-red-200'
}

function riskBadge(level?: string) {
  if (level === 'high')
    return { cls: 'bg-red-100 text-red-800 border border-red-300', text: '高風險' }
  if (level === 'medium')
    return { cls: 'bg-amber-100 text-amber-800 border border-amber-300', text: '中度風險' }
  return { cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300', text: '低風險' }
}

// ─────────────────────────────────────────────
// SVG 橫條圖（單行）
// ─────────────────────────────────────────────

interface ScoreBarProps {
  score: number
  color: string // SVG fill className or hex
  maxWidth?: number
}

function ScoreBarSvg({ score, color, maxWidth = 200 }: ScoreBarProps) {
  const pct = clamp(score)
  const barWidth = Math.round((pct / 100) * maxWidth)
  return (
    <svg
      viewBox={`0 0 ${maxWidth} 10`}
      className="w-full"
      aria-hidden="true"
      role="presentation"
    >
      {/* Background */}
      <rect x={0} y={0} width={maxWidth} height={10} rx={5} fill="#e5e7eb" />
      {/* Filled */}
      <rect x={0} y={0} width={barWidth} height={10} rx={5} fill={color} />
    </svg>
  )
}

// ─────────────────────────────────────────────
// DISC 雷達圖（純 SVG）
// viewBox 200×220，中心 (100,100)，最大半徑 72
// ─────────────────────────────────────────────

interface DISCRadarProps {
  disc: DISCResult
}

function DISCRadar({ disc }: DISCRadarProps) {
  const cx = 100
  const cy = 105
  const r = 72
  const labelOffset = r + 14

  const axes = [
    { key: 'd' as const, label: 'D', angle: -90, color: '#ef4444', desc: '主導' },
    { key: 'i' as const, label: 'I', angle: 0,   color: '#f59e0b', desc: '影響' },
    { key: 's' as const, label: 'S', angle: 90,  color: '#10b981', desc: '穩定' },
    { key: 'c' as const, label: 'C', angle: 180, color: '#3b82f6', desc: '謹慎' },
  ]

  function polarX(angle: number, radius: number) {
    return cx + radius * Math.cos((angle * Math.PI) / 180)
  }
  function polarY(angle: number, radius: number) {
    return cy + radius * Math.sin((angle * Math.PI) / 180)
  }

  // 雷達多邊形頂點
  const polyPoints = axes
    .map((ax) => {
      const val = clamp(disc[ax.key])
      const rad = (val / 100) * r
      return `${polarX(ax.angle, rad).toFixed(1)},${polarY(ax.angle, rad).toFixed(1)}`
    })
    .join(' ')

  // 背景同心圓（25 / 50 / 75 / 100%）
  const gridRings = [0.25, 0.5, 0.75, 1].map((pct) => ({
    r: r * pct,
    label: Math.round(pct * 100),
  }))

  return (
    <svg
      viewBox="0 0 200 220"
      className="w-full max-w-xs mx-auto"
      aria-label="DISC 雷達圖"
      role="img"
    >
      {/* 背景同心圓 */}
      {gridRings.map(({ r: gr, label }) => (
        <g key={label}>
          <circle
            cx={cx}
            cy={cy}
            r={gr}
            fill="none"
            stroke="#d1d5db"
            strokeWidth="0.5"
          />
          {gr < r && (
            <text
              x={cx + 2}
              y={cy - gr + 4}
              fontSize="5"
              fill="#9ca3af"
              textAnchor="start"
            >
              {label}
            </text>
          )}
        </g>
      ))}

      {/* 軸線 */}
      {axes.map((ax) => (
        <line
          key={ax.key}
          x1={cx}
          y1={cy}
          x2={polarX(ax.angle, r)}
          y2={polarY(ax.angle, r)}
          stroke="#d1d5db"
          strokeWidth="0.8"
        />
      ))}

      {/* 資料多邊形 */}
      <polygon
        points={polyPoints}
        fill="rgba(99,102,241,0.20)"
        stroke="#6366f1"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* 資料點 */}
      {axes.map((ax) => {
        const val = clamp(disc[ax.key])
        const rad = (val / 100) * r
        return (
          <circle
            key={`pt-${ax.key}`}
            cx={polarX(ax.angle, rad)}
            cy={polarY(ax.angle, rad)}
            r={3}
            fill={ax.color}
          />
        )
      })}

      {/* 軸標籤（D/I/S/C + 副標） */}
      {axes.map((ax) => {
        const lx = polarX(ax.angle, labelOffset)
        const ly = polarY(ax.angle, labelOffset)
        const anchor =
          ax.angle === 0 ? 'start' : ax.angle === 180 ? 'end' : 'middle'
        const val = clamp(disc[ax.key])
        return (
          <g key={`lbl-${ax.key}`}>
            <text
              x={lx}
              y={ly - 3}
              fontSize="10"
              fontWeight="700"
              fill={ax.color}
              textAnchor={anchor}
            >
              {ax.label}
            </text>
            <text
              x={lx}
              y={ly + 7}
              fontSize="6.5"
              fill="#6b7280"
              textAnchor={anchor}
            >
              {ax.desc} {val}
            </text>
          </g>
        )
      })}

      {/* 主類型標示 */}
      <text
        x={cx}
        y={cy + 2}
        fontSize="11"
        fontWeight="700"
        fill="#6366f1"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {disc.primary_type}
        {disc.secondary_type ? `/${disc.secondary_type}` : ''}
      </text>

      {/* 底部說明文字區域 */}
      <text x={cx} y={190} fontSize="6.5" fill="#6b7280" textAnchor="middle">
        主類型：
        <tspan fill="#6366f1" fontWeight="700">
          {disc.primary_type}
        </tspan>
        {'  '}次類型：
        <tspan fill="#8b5cf6" fontWeight="700">
          {disc.secondary_type}
        </tspan>
      </text>
    </svg>
  )
}

// ─────────────────────────────────────────────
// DISC 四象限座標圖（D-I 軸 × S-C 軸）
// ─────────────────────────────────────────────

interface DISCQuadrantProps {
  disc: DISCResult
}

function DISCQuadrant({ disc }: DISCQuadrantProps) {
  const size = 180
  const pad = 20
  const inner = size - pad * 2

  // X 軸：D（強）← 左 → I（強）右
  // Y 軸：S（強）↑ 上 → C（強）↓ 下
  const plotX = pad + ((disc.i - disc.d + 100) / 200) * inner
  const plotY = pad + ((disc.c - disc.s + 100) / 200) * inner

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-xs mx-auto"
      aria-label="DISC 四象限座標圖"
      role="img"
    >
      {/* 背景象限色 */}
      <rect x={pad} y={pad} width={inner / 2} height={inner / 2} fill="rgba(239,68,68,0.06)" />
      <rect x={pad + inner / 2} y={pad} width={inner / 2} height={inner / 2} fill="rgba(245,158,11,0.06)" />
      <rect x={pad} y={pad + inner / 2} width={inner / 2} height={inner / 2} fill="rgba(16,185,129,0.06)" />
      <rect x={pad + inner / 2} y={pad + inner / 2} width={inner / 2} height={inner / 2} fill="rgba(59,130,246,0.06)" />

      {/* 邊框 */}
      <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="#d1d5db" strokeWidth="1" />

      {/* 十字軸 */}
      <line x1={pad + inner / 2} y1={pad} x2={pad + inner / 2} y2={pad + inner} stroke="#d1d5db" strokeWidth="0.8" strokeDasharray="3,2" />
      <line x1={pad} y1={pad + inner / 2} x2={pad + inner} y2={pad + inner / 2} stroke="#d1d5db" strokeWidth="0.8" strokeDasharray="3,2" />

      {/* 象限標籤 */}
      <text x={pad + inner / 4} y={pad + 10} fontSize="7" fill="#ef4444" textAnchor="middle" fontWeight="600">D 主導</text>
      <text x={pad + (inner * 3) / 4} y={pad + 10} fontSize="7" fill="#f59e0b" textAnchor="middle" fontWeight="600">I 影響</text>
      <text x={pad + inner / 4} y={pad + inner - 4} fontSize="7" fill="#10b981" textAnchor="middle" fontWeight="600">S 穩定</text>
      <text x={pad + (inner * 3) / 4} y={pad + inner - 4} fontSize="7" fill="#3b82f6" textAnchor="middle" fontWeight="600">C 謹慎</text>

      {/* 候選人位置 */}
      <circle
        cx={plotX}
        cy={plotY}
        r={6}
        fill="#6366f1"
        opacity={0.85}
      />
      <circle
        cx={plotX}
        cy={plotY}
        r={10}
        fill="none"
        stroke="#6366f1"
        strokeWidth="1"
        opacity={0.4}
      />
    </svg>
  )
}

// ─────────────────────────────────────────────
// 核心特質卡片
// ─────────────────────────────────────────────

interface CoreTraitCardProps {
  label: string
  icon: string
  data?: CoreTraitResult
}

function CoreTraitCard({ label, icon, data }: CoreTraitCardProps) {
  if (!data) return null
  const score = clamp(data.score)
  return (
    <div className="rounded-xl border bg-white p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <span>{icon}</span>
          <span>{label}</span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scoreBgColor(score)}`}
        >
          {data.label}
        </span>
      </div>
      {/* 分數條 */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ScoreBarSvg
            score={score}
            color={score >= 70 ? '#10b981' : score >= 45 ? '#6366f1' : '#f59e0b'}
          />
        </div>
        <span className={`text-base font-bold min-w-[36px] text-right ${scoreColor(score)}`}>
          {score}
        </span>
      </div>
      {data.reason && (
        <p className="text-xs text-gray-600 leading-relaxed">{data.reason}</p>
      )}
      {data.confidence && data.confidence !== 'high' && (
        <span className="text-xs text-gray-400 italic">{confidenceLabel(data.confidence)}</span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Big Five 橫條組
// ─────────────────────────────────────────────

const BIG_FIVE_LABELS: { key: keyof BigFiveResult; label: string; color: string; tip: string }[] = [
  { key: 'openness',          label: '開放性（O）',  color: '#8b5cf6', tip: '學習意願、創意、新奇事物接受度' },
  { key: 'conscientiousness', label: '盡責性（C）',  color: '#3b82f6', tip: '計畫性、執行力、自律程度' },
  { key: 'extraversion',      label: '外向性（E）',  color: '#f59e0b', tip: '社交主動性、活力、表達欲' },
  { key: 'agreeableness',     label: '協調性（A）',  color: '#10b981', tip: '配合度、同理心、合作意願' },
  { key: 'neuroticism',       label: '神經質（N）',  color: '#ef4444', tip: '情緒波動、壓力敏感度（↓低=穩定）' },
]

interface BigFivePanelProps {
  data: BigFiveResult
}

function BigFivePanel({ data }: BigFivePanelProps) {
  return (
    <div className="space-y-3">
      {BIG_FIVE_LABELS.map(({ key, label, color, tip }) => {
        if (typeof data[key] !== 'number') return null
        const score = clamp(data[key] as number)
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-700">{label}</span>
                <span className="ml-1.5 text-xs text-gray-400 hidden sm:inline">{tip}</span>
              </div>
              <span className={`font-bold text-sm ${scoreColor(score)}`}>{score}</span>
            </div>
            <ScoreBarSvg score={score} color={color} />
          </div>
        )
      })}
      {data.interpretation && (
        <p className="text-xs text-gray-600 pt-2 border-t border-gray-100 leading-relaxed">
          {data.interpretation}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Schwartz 價值觀橫條組
// ─────────────────────────────────────────────

const SCHWARTZ_LABELS: { key: keyof SchwartzValues; label: string; color: string; desc: string }[] = [
  { key: 'growth',    label: '成長導向', color: '#8b5cf6', desc: '學習、挑戰、自我突破' },
  { key: 'stability', label: '穩定導向', color: '#10b981', desc: '安全感、可預測性、制度保障' },
  { key: 'money',     label: '金錢導向', color: '#f59e0b', desc: '薪酬、福利、物質報酬' },
  { key: 'power',     label: '權力導向', color: '#ef4444', desc: '影響力、晉升、掌控資源' },
]

interface SchwartzPanelProps {
  data: SchwartzValues
}

function SchwartzPanel({ data }: SchwartzPanelProps) {
  return (
    <div className="space-y-3">
      {SCHWARTZ_LABELS.map(({ key, label, color, desc }) => {
        if (typeof data[key] !== 'number') return null
        const score = clamp(data[key] as number)
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-700">{label}</span>
                <span className="ml-1.5 text-xs text-gray-400 hidden sm:inline">{desc}</span>
              </div>
              <span className={`font-bold text-sm ${scoreColor(score)}`}>{score}</span>
            </div>
            <ScoreBarSvg score={score} color={color} />
          </div>
        )
      })}
      {data.interpretation && (
        <p className="text-xs text-gray-600 pt-2 border-t border-gray-100 leading-relaxed">
          {data.interpretation}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 主元件：PersonalityAnalysisPanel
// ─────────────────────────────────────────────

interface Props {
  personality: PersonalitySummary
  /** 是否使用緊湊模式（公司後台列表用） */
  compact?: boolean
}

export function PersonalityAnalysisPanel({ personality, compact = false }: Props) {
  const ps = personality.personality_summary
  const ct = personality.core_traits
  const bf = personality.big_five
  const sv = personality.schwartz_values
  const disc = personality.disc
  const tr = personality.turnover_risk

  // 向後相容：若無新版欄位，降級顯示舊版文字摘要
  const hasNewFormat = !!(ps || ct || bf || sv || disc)

  if (!hasNewFormat) {
    return <LegacyPersonalityDisplay personality={personality} />
  }

  if (compact) {
    return <CompactPersonalityPanel personality={personality} />
  }

  return (
    <div className="space-y-6">
      {/* ── 1. 人格總覽 ─────────────────────── */}
      {ps && (
        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-indigo-900">人格總覽</h3>
            {ps.confidence && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                  ps.confidence === 'high'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : ps.confidence === 'medium'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}
              >
                {ps.confidence === 'high' ? '✓ 信心充足' : ps.confidence === 'medium' ? '~ 信心中等' : '⚠ 信心不足'}
              </span>
            )}
          </div>
          {ps.overview && (
            <p className="text-sm text-gray-700 leading-relaxed mb-4">{ps.overview}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ps.strengths && ps.strengths.length > 0 && (
              <div className="rounded-xl bg-white/70 p-3 border border-emerald-100">
                <div className="text-xs font-semibold text-emerald-700 mb-2">優勢特點</div>
                <ul className="space-y-1">
                  {ps.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ps.risks && ps.risks.length > 0 && (
              <div className="rounded-xl bg-white/70 p-3 border border-amber-100">
                <div className="text-xs font-semibold text-amber-700 mb-2">潛在風險</div>
                <ul className="space-y-1">
                  {ps.risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <span className="text-amber-500 mt-0.5">⚠</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {personality.summaryText && (
            <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-indigo-100 leading-relaxed">
              {personality.summaryText}
            </p>
          )}
        </section>
      )}

      {/* ── 2. 四大核心特質 ──────────────────── */}
      {ct && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3">核心特質評估</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CoreTraitCard label="誠實性／責任感" icon="🛡️" data={ct.integrity} />
            <CoreTraitCard label="智能／理解力" icon="🧠" data={ct.intelligence} />
            <CoreTraitCard label="動機" icon="🚀" data={ct.motivation} />
            <CoreTraitCard label="再現性／穩定性" icon="⚖️" data={ct.consistency} />
          </div>
        </section>
      )}

      {/* ── 3. DISC 行為模式 ─────────────────── */}
      {disc && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4">DISC 行為模式</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            {/* 雷達圖 */}
            <div>
              <p className="text-xs text-gray-500 text-center mb-2">雷達圖</p>
              <DISCRadar disc={disc} />
            </div>
            {/* 四象限 */}
            <div>
              <p className="text-xs text-gray-500 text-center mb-2">四象限座標</p>
              <DISCQuadrant disc={disc} />
            </div>
          </div>

          {/* DISC 分數橫條 */}
          <div className="mt-4 space-y-2">
            {(
              [
                { key: 'd', label: 'D 主導型', color: '#ef4444', desc: '結果導向、推進力強' },
                { key: 'i', label: 'I 影響型', color: '#f59e0b', desc: '溝通力、感染力強' },
                { key: 's', label: 'S 穩定型', color: '#10b981', desc: '耐心、持續力、支援性' },
                { key: 'c', label: 'C 謹慎型', color: '#3b82f6', desc: '分析、品質、精確導向' },
              ] as const
            ).map(({ key, label, color, desc }) => (
              <div key={key} className="space-y-0.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    {label}
                    <span className="ml-1.5 text-xs text-gray-400 hidden sm:inline">{desc}</span>
                  </span>
                  <span className="font-bold" style={{}}>{disc[key]}</span>
                </div>
                <ScoreBarSvg score={disc[key]} color={color} />
              </div>
            ))}
          </div>

          {disc.interpretation && (
            <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-100 leading-relaxed">
              {disc.interpretation}
            </p>
          )}
        </section>
      )}

      {/* ── 4. Big Five 性格模型 ──────────────── */}
      {bf && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4">Big Five 性格模型</h3>
          <BigFivePanel data={bf} />
        </section>
      )}

      {/* ── 5. Schwartz 價值觀 ───────────────── */}
      {sv && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4">Schwartz 價值觀分析</h3>
          <SchwartzPanel data={sv} />
        </section>
      )}

      {/* ── 6. 離職風險 ──────────────────────── */}
      {tr && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-gray-800">離職風險評估</h3>
            <span className={`text-sm px-3 py-1 rounded-full font-semibold ${riskBadge(tr.level).cls}`}>
              {riskBadge(tr.level).text}
            </span>
          </div>
          {tr.reason && (
            <p className="text-sm text-gray-600 leading-relaxed">{tr.reason}</p>
          )}
          <p className="text-xs text-gray-400 mt-2 italic">
            ※ 離職風險評估僅供參考，基於面試回答推測，非絕對預測。
          </p>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// 緊湊模式（公司後台列表嵌入用）
// ─────────────────────────────────────────────

function CompactPersonalityPanel({ personality }: { personality: PersonalitySummary }) {
  const ps = personality.personality_summary
  const ct = personality.core_traits
  const disc = personality.disc
  const tr = personality.turnover_risk

  return (
    <div className="space-y-3 text-sm">
      {/* 總覽文字 */}
      {ps?.overview && (
        <p className="text-gray-700 leading-relaxed">{ps.overview}</p>
      )}
      {personality.summaryText && !ps?.overview && (
        <p className="text-gray-700 leading-relaxed">{personality.summaryText}</p>
      )}

      {/* 核心特質快速列 */}
      {ct && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: 'integrity' as const, icon: '🛡️', label: '責任感' },
              { key: 'intelligence' as const, icon: '🧠', label: '理解力' },
              { key: 'motivation' as const, icon: '🚀', label: '動機' },
              { key: 'consistency' as const, icon: '⚖️', label: '穩定性' },
            ]
          ).map(({ key, icon, label }) => {
            const d = ct[key]
            if (!d) return null
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                <span>{icon}</span>
                <span className="text-gray-600">{label}</span>
                <span className={`font-bold ml-auto ${scoreColor(d.score)}`}>{d.score}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs border ${scoreBgColor(d.score)}`}>
                  {d.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* DISC 主/次類型 + 離職風險 */}
      <div className="flex flex-wrap items-center gap-2">
        {disc && (
          <>
            <span className="text-xs text-gray-500">DISC：</span>
            <span className="font-semibold text-indigo-700 text-xs bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              {disc.primary_type}/{disc.secondary_type}
            </span>
          </>
        )}
        {tr && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskBadge(tr.level).cls}`}>
            離職風險：{riskBadge(tr.level).text}
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 舊版降級顯示
// ─────────────────────────────────────────────

function LegacyPersonalityDisplay({ personality }: { personality: PersonalitySummary }) {
  const fields: { key: keyof PersonalitySummary; label: string }[] = [
    { key: 'extraversion', label: '外向傾向' },
    { key: 'conscientiousness', label: '盡責程度' },
    { key: 'detail_attentiveness', label: '細心程度' },
    { key: 'proactivity', label: '主動性' },
    { key: 'learning_mindset', label: '學習心態' },
    { key: 'stress_resilience', label: '抗壓穩定' },
    { key: 'collaboration', label: '合作溝通' },
    { key: 'summaryText', label: '整體總結' },
  ]
  return (
    <div className="space-y-2 text-sm text-gray-700">
      {fields.map(({ key, label }) =>
        personality[key] ? (
          <div key={key}>
            <span className="font-medium">{label}：</span>
            <span>{personality[key] as string}</span>
          </div>
        ) : null
      )}
    </div>
  )
}
