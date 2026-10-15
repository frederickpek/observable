import { useEffect, useState } from 'react'
import type { Chain, Contract, IndexFile, Metrics, Slice } from './types'

const BASE = `${import.meta.env.BASE_URL}data/`
const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(BASE + path).then((r) => {
      if (!r.ok) throw new Error(`${r.status} loading ${path}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

type State<T> = { data?: T; error?: string; loading: boolean }

function useLoad<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ loading: !!path })
  useEffect(() => {
    if (!path) return
    let live = true
    setState((s) => ({ data: s.data, loading: true }))
    load<T>(path).then(
      (data) => live && setState({ data, loading: false }),
      (e: Error) => live && setState({ error: e.message, loading: false }),
    )
    return () => {
      live = false
    }
  }, [path])
  return state
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
