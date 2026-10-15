import { useCallback, useRef, useState, type ReactNode } from 'react'

export interface Tip {
  x: number
  y: number
  width: number
  content: ReactNode
}

/** Positions a tooltip inside a `position: relative` wrapper, flipping near the right edge. */
export function useTooltip() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const show = useCallback((clientX: number, clientY: number, content: ReactNode) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: clientX - r.left, y: clientY - r.top, width: r.width, content })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  const node = tip ? (
    <div
      className="chart-tooltip"
      style={{
        left: tip.x > tip.width * 0.6 ? undefined : tip.x + 14,
        right: tip.x > tip.width * 0.6 ? tip.width - tip.x + 14 : undefined,
        top: Math.max(0, tip.y - 12),
      }}
    >
      {tip.content}
    </div>
  ) : null
  return { wrapRef, show, hide, node }
}

/** Map a pointer event to SVG viewBox coordinates. */
export function svgPoint(e: React.PointerEvent<SVGElement>, vbWidth: number, vbHeight: number) {
  const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement)
  const r = svg.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * vbWidth, y: ((e.clientY - r.top) / r.height) * vbHeight }
}
