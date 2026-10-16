import { useEffect, useState } from 'react'
import { useIndex, useMetrics } from './lib/data'
import { Overview } from './pages/Overview'
import { TickerPage } from './pages/TickerPage'

const YEAR = new Date().getFullYear()

// e.g. "16 Oct 2026, 8:13 AM SGT", in the viewer's own timezone. en-SG gives the short zone name
// (SGT, EDT, BST); the date and time are assembled by hand for an uppercase AM/PM.
function formatAsOf(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-SG', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  )
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()} ${parts.timeZoneName}`
}
const readHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || null

export default function App() {
  const { data: index, error } = useIndex()
  const { data: metrics } = useMetrics()
  const [route, setRoute] = useState<string | null>(readHash)
  useEffect(() => {
    const on = () => setRoute(readHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (sym: string | null) => (location.hash = sym ? `/${sym}` : '')
  const ticker = index?.tickers.find((t) => t.symbol === route) ?? null

  return (
    <div className="px-4 pt-7 pb-16">
      <div className="max-w-[1120px] mx-auto">
        <header className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-1.5">End-of-day options analytics · US equities &amp; ETFs</p>
              <h1 className="text-[28px] font-bold mb-2"><button onClick={() => go(null)}>Vol Surface Observatory</button></h1>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex flex-wrap lg:flex-nowrap items-start justify-between gap-x-10 gap-y-3">
            <p className="blurb max-w-[64ch]">
              Daily volatility surfaces for liquid US stocks and ETFs, built from each night's closing option chains.
            </p>
            {index && (
              <p className="text-xs text-muted leading-relaxed lg:border-l lg:border-line lg:pl-4 lg:mt-1 shrink-0">
                <span className="block">Source: Cboe delayed quotes, snapshotted after the close.</span>
                <span className="block">
                  Data as of <span className="mono text-ink">{formatAsOf(index.generatedAt)}</span>
                </span>
                {index.missing?.length > 0 && (
                  <span className="block text-bad mt-1">
                    Missing for the {index.session} close: {index.missing.join(', ')}; showing their previous snapshot.
                  </span>
                )}
              </p>
            )}
          </div>
        </header>

        {error && <div className="card text-bad">Could not load data/index.json — run the pipeline first. ({error})</div>}

        {index && (
          <>
            <nav className="tabs flex gap-0.5 border-b border-line mb-5 overflow-x-auto" role="tablist">
              <Tab active={!ticker} onClick={() => go(null)}>Overview</Tab>
              {index.tickers.map((t) => (
                <Tab key={t.symbol} active={ticker?.symbol === t.symbol} onClick={() => go(t.symbol)}>{t.symbol}</Tab>
              ))}
            </nav>
            {ticker ? (
              <TickerPage key={ticker.symbol} ticker={ticker} history={metrics?.[ticker.symbol] ?? (ticker.latest ? [ticker.latest] : [])} />
            ) : (
              <Overview tickers={index.tickers} onOpen={go} />
            )}
            <footer className="mt-8 pt-4 border-t border-line text-xs text-muted">
              © {YEAR} Frederick Pek
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3.5 py-2.5 text-[13.5px] font-semibold -mb-px border-b-2 whitespace-nowrap transition-colors ${
        active ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.dataset.theme ?? null)
  const apply = (t: string | null) => {
    setTheme(t)
    if (t) {
      document.documentElement.dataset.theme = t
      localStorage.setItem('theme', t)
    } else {
      delete document.documentElement.dataset.theme
      localStorage.removeItem('theme')
    }
  }
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {([['Auto', null], ['Light', 'light'], ['Dark', 'dark']] as const).map(([label, v]) => (
        <button key={label} aria-pressed={theme === v} onClick={() => apply(v)}>{label}</button>
      ))}
    </div>
  )
}
