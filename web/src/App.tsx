import { useEffect, useRef, useState } from 'react'
import { prefetchChain, useIndex, useMetrics } from './lib/data'
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
    window.addEventListener('popstate', on)
    return () => {
      window.removeEventListener('hashchange', on)
      window.removeEventListener('popstate', on)
    }
  }, [])
  const navRef = useRef<HTMLElement>(null)
  // Zero-height marker where the tab bar naturally sits; a stuck sticky bar can't report that itself.
  const navAnchorRef = useRef<HTMLDivElement>(null)
  // pushState rather than setting location.hash: an empty hash (Overview) makes the browser jump to the top.
  // If the tab bar is pinned (scrolled past the header), keep it pinned after switching: a shorter page
  // would otherwise pull the view back up and the tabs would slide away from the top.
  const go = (sym: string | null) => {
    const nav = navRef.current
    const pinned = nav != null && nav.getBoundingClientRect().top <= 0
    const navTop = navAnchorRef.current?.offsetTop ?? 0
    history.pushState(null, '', sym ? `#/${sym}` : location.pathname + location.search)
    setRoute(sym)
    if (pinned) requestAnimationFrame(() => { if (scrollY < navTop) scrollTo(0, navTop) })
  }
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
            <div ref={navAnchorRef} />
            <nav ref={navRef} className="tabs sticky top-0 z-40 flex gap-0.5 border-b border-line mb-5 overflow-x-auto" role="tablist">
              <Tab active={!ticker} onClick={() => go(null)}>Overview</Tab>
              {index.tickers.map((t) => (
                <Tab key={t.symbol} active={ticker?.symbol === t.symbol} onClick={() => go(t.symbol)}
                  onPrefetch={() => prefetchChain(t.symbol, t.dates[0])}>{t.symbol}</Tab>
              ))}
            </nav>
            {ticker ? (
              <TickerPage ticker={ticker} history={metrics?.[ticker.symbol] ?? (ticker.latest ? [ticker.latest] : [])} />
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

function Tab({ active, onClick, onPrefetch, children }: {
  active: boolean; onClick: () => void; onPrefetch?: () => void; children: React.ReactNode
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      className={`px-3.5 py-2.5 text-[13.5px] font-semibold -mb-px border-b-2 whitespace-nowrap transition-colors ${
        active ? 'text-accent border-accent' : 'text-muted border-transparent hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function ThemeToggle() {
  // null = Auto (follow the OS). index.html applies a saved choice before first paint.
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.dataset.theme ?? null)
  useEffect(() => {
    const root = document.documentElement
    if (theme) {
      root.dataset.theme = theme
      localStorage.setItem('theme', theme)
    } else {
      delete root.dataset.theme
      localStorage.removeItem('theme')
    }
  }, [theme])
  const apply = setTheme
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {([['Auto', null], ['Light', 'light'], ['Dark', 'dark']] as const).map(([label, v]) => (
        <button key={label} aria-pressed={theme === v} onClick={() => apply(v)}>{label}</button>
      ))}
    </div>
  )
}
