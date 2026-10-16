/** Diverging rich/cheap colour for a z-score: cheap (blue) ← neutral grey → rich (red). */
export function zColor(z: number | null, conf: number | null = 1): string {
  if (z == null) return 'var(--neutral)'
  const t = Math.min(Math.abs(z) / 4, 1)
  const strength = Math.max(0, (Math.abs(z) - 1) / 3)
  if (strength <= 0 || (conf ?? 0) <= 0) return `color-mix(in oklab, var(--neutral) 100%, transparent)`
  const pole = z > 0 ? 'var(--rich)' : 'var(--cheap)'
  return `color-mix(in oklab, ${pole} ${Math.round(35 + 65 * t)}%, var(--neutral))`
}

/** True when zColor renders the neutral grey: the quote is no signal either way. */
export function isNeutral(z: number | null, conf: number | null = 1): boolean {
  return z == null || Math.abs(z) <= 1 || (conf ?? 0) <= 0
}
