import { useEffect, useState } from 'react'
import type { Chain, Contract, IndexFile, Metrics, Slice } from './types'

const BASE = `${import.meta.env.BASE_URL}data/`
const cache = new Map<string, Promise<unknown>>()
// Files that have finished downloading, so a revisit can render them immediately.
const resolved = new Map<string, unknown>()

function load<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(BASE + path)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} loading ${path}`)
        return r.json()
      })
      .then((data) => {
        resolved.set(path, data)
        return data
      })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

/** Start downloading a ticker's latest chain early (e.g. on tab hover) so switching to it is instant. */
export function prefetchChain(symbol: string, date: string | undefined) {
  if (date) load(`chains/${symbol}/${date}.json`).catch(() => {})
}

type State<T> = { data?: T; error?: string; loading: boolean }

function useLoad<T>(path: string | null): State<T> {
  // The last settled result and the path it belongs to. While a new path is in flight the previous
  // data keeps rendering, and `loading` is true until a result for the current path arrives.
  const [settled, setSettled] = useState<{ path: string; data?: T; error?: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let live = true
    load<T>(path).then(
      (data) => live && setSettled({ path, data }),
      (e: Error) => live && setSettled({ path, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [path])
  if (!path) return { loading: false }
  // Already downloaded: serve it synchronously, so switching never flashes an empty loading state.
  if (resolved.has(path)) return { data: resolved.get(path) as T, loading: false }
  if (settled?.path === path) return { data: settled.data, error: settled.error, loading: false }
  return { data: settled?.data, loading: true }
}

export const useIndex = () => useLoad<IndexFile>('index.json')
export const useMetrics = () => useLoad<Metrics>('metrics.json')
export const useChain = (symbol: string | null, date: string | null) =>
  useLoad<Chain>(symbol && date ? `chains/${symbol}/${date}.json` : null)

export function contracts(s: Slice): Contract[] {
  return s.K.map((K, i) => ({
    exp: s.exp,
    dte: s.dte,
    K,
    cp: s.cp[i] as 'C' | 'P',
    k: Math.log(K / s.F),
    bid: s.bid[i],
    ask: s.ask[i],
    ivMid: s.ivMid[i],
    ivBid: s.ivBid[i],
    ivAsk: s.ivAsk[i],
    ivFit: s.ivFit[i],
    z: s.z[i],
    edge: s.edge[i],
    conf: s.conf[i],
    delta: s.delta[i],
    oi: s.oi[i],
    vol: s.vol[i],
  }))
}

export function sviVol(p: Slice['svi'], k: number, T: number): number {
  const [a, b, rho, m, s] = p
  const x = k - m
  const w = a + b * (rho * x + Math.sqrt(x * x + s * s))
  return Math.sqrt(Math.max(w, 1e-10) / T)
}
