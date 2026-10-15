export const pct = (v: number | null | undefined, d = 1) => (v == null ? '–' : `${(v * 100).toFixed(d)}%`)
export const volPts = (v: number | null | undefined, d = 1) =>
  v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}`
export const num = (v: number | null | undefined, d = 2) => (v == null ? '–' : v.toFixed(d))
export const signed = (v: number | null | undefined, d = 2) =>
  v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`
export const int = (v: number) => v.toLocaleString('en-US')
export const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortDate(iso: string, withYear = false) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${String(y).slice(2)}` : ''}`
}
export function expLabel(iso: string, dte: number) {
  return `${shortDate(iso, dte > 300)} · ${dte}d`
}
