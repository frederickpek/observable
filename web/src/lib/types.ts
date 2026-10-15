export interface Summary {
  date: string
  spot: number
  atm30: number | null
  atm60: number | null
  atm90: number | null
  atm180: number | null
  rr25: number | null
  bf25: number | null
  rv10: number | null
  rv20: number | null
  rv60: number | null
  ivRank: number | null
  ivPct: number | null
  histDays: number
  signalsRich: number
  signalsCheap: number
  fitRmse: number
  butterflyArb: number
  calendarArb: number
}

export interface IndexTicker {
  symbol: string
  name: string
  dates: string[]
  latest: Summary | null
}

export interface IndexFile {
  generatedAt: string
  retentionDays: number
  failures: Record<string, string>
  tickers: IndexTicker[]
}

export type Nullable = (number | null)[]

export interface Slice {
  exp: string
  dte: number
  T: number
  F: number
  D: number
  atmIv: number
  svi: [number, number, number, number, number]
  rmse: number
  butterflyMinG: number
  nFit: number
  kFit: [number, number]
  K: number[]
  cp: string
  bid: number[]
  ask: number[]
  ivMid: Nullable
  ivBid: Nullable
  ivAsk: Nullable
  ivFit: Nullable
  z: Nullable
  edge: Nullable
  conf: Nullable
  delta: Nullable
  oi: number[]
  vol: number[]
}

export interface Chain {
  symbol: string
  name: string
  date: string
  spot: number
  cboeIv30: number | null
  summary: Summary
  closes: { d: string; c: number }[]
  slices: Slice[]
}

export type Metrics = Record<string, Summary[]>

/** One contract row flattened out of a slice, for tables and tooltips. */
export interface Contract {
  exp: string
  dte: number
  K: number
  cp: 'C' | 'P'
  k: number
  bid: number
  ask: number
  ivMid: number | null
  ivBid: number | null
  ivAsk: number | null
  ivFit: number | null
  z: number | null
  edge: number | null
  conf: number | null
  delta: number | null
  oi: number
  vol: number
}
