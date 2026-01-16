import React, { useEffect, useMemo, useRef, useState } from 'react'

type Action = {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

export type GuidedOverlayProps = {
  open: boolean
  /** 對應頁面元素的 data-tutorial-id；若不提供則不挖洞（全遮罩） */
  targetId?: string | null
  /** 多個目標洞（例如同時保留 tab 與按鈕）。若提供，會優先使用此欄位。 */
  targetIds?: string[]
  title?: string
  message: React.ReactNode
  actions?: Action[]
  onClose: () => void
  zIndex?: number
}

type Rect = { top: number; left: number; width: number; height: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function GuidedOverlay({
  open,
  targetId,
  targetIds,
  title = '使用教學',
  message,
  actions,
  onClose,
  zIndex = 10000,
}: GuidedOverlayProps) {
  const resolvedTargetIds = useMemo(() => {
    const list = Array.isArray(targetIds) ? targetIds.filter((x) => typeof x === 'string' && x.trim()) : []
    if (list.length > 0) return list
    return targetId ? [targetId] : []
  }, [targetId, targetIds])

  const [targetRects, setTargetRects] = useState<Rect[]>([])
  const [targetsMissing, setTargetsMissing] = useState(false)

  // 最穩定的做法：教學 overlay 開著時就用 rAF 迴圈持續量測。
  // 避免 observer 掛到舊 DOM、transition 動畫期間不同步等問題。
  const rafLoopRef = useRef<number | null>(null)
  const rectsRef = useRef<Rect[]>([])

  const findAndMeasure = () => {
    if (typeof window === 'undefined') return
    if (resolvedTargetIds.length === 0) {
      setTargetRects([])
      setTargetsMissing(false)
      rectsRef.current = []
      return []
    }

    const pad = 6
    let missing = false
    const rects: Rect[] = []
    for (const id of resolvedTargetIds) {
      const el = document.querySelector(`[data-tutorial-id="${CSS.escape(id)}"]`) as HTMLElement | null
      if (!el) {
        missing = true
        continue
      }
      const r = el.getBoundingClientRect()
      const top = clamp(r.top - pad, 0, window.innerHeight)
      const left = clamp(r.left - pad, 0, window.innerWidth)
      const right = clamp(r.right + pad, 0, window.innerWidth)
      const bottom = clamp(r.bottom + pad, 0, window.innerHeight)
      rects.push({
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      })
    }

    // 只有在真的變動時才 setState（避免每幀重 render）
    const prev = rectsRef.current
    const changed =
      prev.length !== rects.length ||
      prev.some((p, i) => {
        const n = rects[i]
        if (!n) return true
        return (
          Math.abs(p.top - n.top) > 0.5 ||
          Math.abs(p.left - n.left) > 0.5 ||
          Math.abs(p.width - n.width) > 0.5 ||
          Math.abs(p.height - n.height) > 0.5
        )
      })

    if (changed) {
      rectsRef.current = rects
      setTargetRects(rects)
    }
    setTargetsMissing(missing)
    return rects
  }

  useEffect(() => {
    if (!open) return
    // 先量一次避免首次閃動
    findAndMeasure()

    const loop = () => {
      rafLoopRef.current = window.requestAnimationFrame(() => {
        findAndMeasure()
        loop()
      })
    }
    loop()

    return () => {
      if (typeof window !== 'undefined' && rafLoopRef.current != null) {
        window.cancelAnimationFrame(rafLoopRef.current)
        rafLoopRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resolvedTargetIds.join('|')])

  // 初次 open 時，DOM 可能還沒 layout 完（特別是 tab 切換後）
  useEffect(() => {
    if (!open) return
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => findAndMeasure(), 0)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resolvedTargetIds.join('|')])

  const masks = useMemo(() => {
    if (!open) return null
    const bg = 'rgba(0,0,0,0.55)'
    if (targetRects.length === 0) {
      // 若指定了目標但目標元素尚未出現（例如資料還在載入/DOM 尚未 render）
      // 這時不要阻擋使用者操作，避免「該點的按鈕還沒出現」就被全屏遮罩卡住。
      if (resolvedTargetIds.length > 0 && targetsMissing) {
        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: bg,
              pointerEvents: 'none',
              zIndex,
            }}
          />
        )
      }
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: bg,
            pointerEvents: 'auto',
            zIndex,
          }}
        />
      )
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    const xs = new Set<number>([0, vw])
    for (const r of targetRects) {
      xs.add(clamp(r.left, 0, vw))
      xs.add(clamp(r.left + r.width, 0, vw))
    }
    const xCuts = Array.from(xs).sort((a, b) => a - b)

    const blocks: Array<{ left: number; top: number; width: number; height: number }> = []

    const mergeIntervals = (arr: Array<[number, number]>) => {
      const sorted = arr.sort((a, b) => a[0] - b[0])
      const merged: Array<[number, number]> = []
      for (const it of sorted) {
        if (merged.length === 0) {
          merged.push(it)
          continue
        }
        const last = merged[merged.length - 1]
        if (it[0] <= last[1]) last[1] = Math.max(last[1], it[1])
        else merged.push(it)
      }
      return merged
    }

    for (let i = 0; i < xCuts.length - 1; i++) {
      const x0 = xCuts[i]
      const x1 = xCuts[i + 1]
      if (x1 <= x0) continue

      const yIntervals: Array<[number, number]> = []
      for (const r of targetRects) {
        const rLeft = r.left
        const rRight = r.left + r.width
        if (rLeft < x1 && rRight > x0) {
          yIntervals.push([clamp(r.top, 0, vh), clamp(r.top + r.height, 0, vh)])
        }
      }

      const merged = mergeIntervals(yIntervals.filter(([a, b]) => b > a))
      let cursor = 0
      for (const [y0, y1] of merged) {
        if (y0 > cursor) {
          blocks.push({ left: x0, top: cursor, width: x1 - x0, height: y0 - cursor })
        }
        cursor = Math.max(cursor, y1)
      }
      if (cursor < vh) {
        blocks.push({ left: x0, top: cursor, width: x1 - x0, height: vh - cursor })
      }
    }

    return (
      <>
        {blocks.map((b, idx) => (
          <div
            key={idx}
            style={{
              position: 'fixed',
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
              background: bg,
              pointerEvents: 'auto',
              zIndex,
            }}
          />
        ))}
      </>
    )
  }, [open, resolvedTargetIds.length, targetRects, targetsMissing, zIndex])

  if (!open) return null

  return (
    <>
      {/* 只渲染四塊遮罩（有洞的地方沒有任何元素覆蓋），因此洞內可點穿到底層元素 */}
      {masks}

      {/* 右上角退出（避免擋住表單） */}
      <button
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: zIndex + 2,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'rgba(17,24,39,0.92)',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        }}
      >
        退出教學
      </button>

      {/* 上方置中說明卡（可互動，不擋住主要輸入區） */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          left: '50%',
          top: 5,
          transform: 'translateX(-50%)',
          width: 'min(620px, 92vw)',
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          pointerEvents: 'auto',
          zIndex: zIndex + 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{title}</span>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>如需結束教學，請點右上角「退出教學」</span>
        </div>
        <div style={{ fontSize: 14, color: '#111827', lineHeight: 1.7 }}>{message}</div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {(actions || []).map((a, idx) => {
            const isPrimary = a.variant !== 'secondary'
            return (
              <button
                key={idx}
                onClick={a.onClick}
                style={{
                  padding: '2px 13px',
                  borderRadius: 8,
                  border: isPrimary ? '1px solid #111827' : '1px solid #d1d5db',
                  background: isPrimary ? '#111827' : '#fff',
                  color: isPrimary ? '#fff' : '#111827',
                  cursor: 'pointer',
                }}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}


