import { useState, useRef } from 'react'
import ResultsTable from './components/ResultsTable'

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;1,9..144,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }

  body {
    font-family: 'DM Mono', monospace;
    background: #0d0d0d;
    color: #e8e4d9;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .root { max-width: 1400px; margin: 0 auto; padding: 1.25rem 1rem 4rem; }

  .header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    border-bottom: 1px solid #2a2a2a;
    padding-bottom: 1.25rem;
    margin-bottom: 1.75rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .logo {
    font-family: 'Fraunces', serif;
    font-size: clamp(1.5rem, 5vw, 2rem);
    font-weight: 300;
    color: #e8e4d9;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-bottom: 0.2rem;
  }

  .logo em { font-style: italic; color: #c9f468; }
  .subtitle { font-size: 0.65rem; color: #555; letter-spacing: 0.12em; text-transform: uppercase; }

  .clear-btn {
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #666;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .clear-btn:hover { border-color: #555; color: #aaa; }

  .search-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border: 1px solid #2a2a2a;
    margin-bottom: 1.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    padding: 0.875rem 1rem;
    border-right: 1px solid #2a2a2a;
    border-bottom: 1px solid #2a2a2a;
  }
  .field:nth-child(2) { border-right: none; }

  .field label { font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; color: #555; margin-bottom: 0.4rem; }

  .field input {
    background: transparent;
    border: none;
    outline: none;
    font-family: 'DM Mono', monospace;
    font-size: 1rem;
    color: #e8e4d9;
    padding: 0;
    width: 100%;
    -webkit-appearance: none;
  }
  .field input::placeholder { color: #444; }
  .field input:disabled { opacity: 0.5; cursor: not-allowed; }

  .search-btn {
    grid-column: 1 / -1;
    background: #c9f468;
    border: none;
    color: #0d0d0d;
    font-family: 'DM Mono', monospace;
    font-size: 0.8rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1rem 1.5rem;
    cursor: pointer;
    transition: background 0.2s;
    width: 100%;
    min-height: 52px;
  }
  .search-btn:hover:not(:disabled) { background: #d8f87a; }
  .search-btn:disabled { background: #1e2a10; color: #4a6020; cursor: not-allowed; }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.75rem;
    color: #555;
  }

  .pulse {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #c9f468;
    flex-shrink: 0;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.75); }
  }

  /* Progress bar */
  .progress-wrap {
    height: 2px;
    background: #1a1a1a;
    margin-bottom: 1.5rem;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: #c9f468;
    transition: width 0.3s ease;
  }

  .error-msg {
    border: 1px solid #3a1a1a;
    background: #1a0a0a;
    color: #e05555;
    font-size: 0.78rem;
    padding: 0.875rem 1rem;
    margin-bottom: 1.5rem;
    letter-spacing: 0.02em;
    line-height: 1.5;
  }

  .welcome {
    text-align: center;
    padding: 3rem 1.5rem;
    border: 1px dashed #1e1e1e;
  }
  .welcome-title { font-family: 'Fraunces', serif; font-size: 1.1rem; font-weight: 300; color: #555; margin-bottom: 0.4rem; }
  .welcome-sub { font-size: 0.72rem; color: #333; letter-spacing: 0.05em; }

  .results-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .results-count { font-size: 0.72rem; color: #666; letter-spacing: 0.08em; text-transform: uppercase; }
  .results-count strong { color: #c9f468; font-weight: 500; }

  .export-btn {
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #888;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.5rem 0.875rem;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
  .export-btn:hover { border-color: #c9f468; color: #c9f468; }

  .table-wrap { border: 1px solid #1e1e1e; overflow-x: auto; -webkit-overflow-scrolling: touch; }

  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; min-width: 600px; }
  thead tr { border-bottom: 1px solid #2a2a2a; }
  th {
    text-align: left; padding: 0.75rem 0.875rem;
    font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: #444; font-weight: 400; white-space: nowrap;
  }
  tbody tr { border-bottom: 1px solid #151515; transition: background 0.15s; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: #111; }
  td { padding: 0.875rem; color: #aaa; vertical-align: top; line-height: 1.5; }

  .td-name { color: #e8e4d9; font-weight: 500; min-width: 160px; }
  .td-addr { color: #666; max-width: 220px; word-break: break-word; }
  .td-phone { color: #888; white-space: nowrap; }
  .td-rating { color: #c9f468; font-weight: 500; white-space: nowrap; }
  .td-reviews { color: #555; }
  .td-action { min-width: 120px; }

  .whatsapp-btn-container { display: flex; flex-direction: column; gap: 0.4rem; }
  .whatsapp-btn {
    border: none; color: white;
    font-family: 'DM Mono', monospace; font-size: 0.68rem; font-weight: 500;
    letter-spacing: 0.05em; text-transform: uppercase;
    padding: 0.5rem 0.75rem; cursor: pointer; border-radius: 4px;
    transition: opacity 0.2s, transform 0.15s; min-height: 36px; white-space: nowrap;
  }
  .whatsapp-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .whatsapp-btn-tanglome { background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); }
  .whatsapp-btn-tanglome:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
  .whatsapp-btn-zeonhub { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); }
  .whatsapp-btn-zeonhub:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
  .whatsapp-btn:active { transform: translateY(0); }

  .no-phone-msg { color: #333; font-size: 0.72rem; font-style: italic; }
  .no-data { color: #333; font-style: italic; font-size: 0.72rem; }

  @media (max-width: 640px) {
    .root { padding: 1rem 0.875rem 3rem; }
    .search-grid { grid-template-columns: 1fr; }
    .field { border-right: none; border-bottom: 1px solid #2a2a2a; }
    .search-btn { grid-column: 1; }
    .table-wrap { border: none; overflow: visible; }
    table, thead, tbody, th, td, tr { display: block; }
    thead { display: none; }
    tbody tr { border: 1px solid #1e1e1e; margin-bottom: 0.75rem; padding: 1rem; background: #0f0f0f; }
    tbody tr:hover { background: #131313; }
    td { padding: 0.25rem 0; display: flex; flex-direction: column; border: none; }
    td::before { content: attr(data-label); font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase; color: #444; margin-bottom: 0.2rem; }
    td:empty { display: none; }
    .td-name { font-size: 0.9rem; margin-bottom: 0.25rem; }
    .td-action { margin-top: 0.5rem; min-width: unset; }
    .whatsapp-btn-container { flex-direction: row; flex-wrap: wrap; }
    .whatsapp-btn { flex: 1; min-width: 100px; text-align: center; }
  }
`

const API_BASE = 'https://webscraping-a1ky.onrender.com'

export default function App() {
  const [location, setLocation] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const bizRef = useRef(null)
  const esRef = useRef(null)

  const handleSearch = () => {
    if (!location.trim() || !businessType.trim()) {
      setError('Both fields are required')
      return
    }

    // Close any existing connection
    if (esRef.current) esRef.current.close()

    setIsLoading(true)
    setError(null)
    setResults([])
    setSearched(true)
    setProgress({ completed: 0, total: 0 })
    setStatusMsg('Connecting…')

    const params = new URLSearchParams({ location, businessType })
    const es = new EventSource(`${API_BASE}/api/scrape-stream?${params}`)
    esRef.current = es

    es.addEventListener('status', (e) => {
      const { message } = JSON.parse(e.data)
      setStatusMsg(message)
    })

    es.addEventListener('total', (e) => {
      const { total } = JSON.parse(e.data)
      setProgress(p => ({ ...p, total }))
    })

    es.addEventListener('business', (e) => {
      const biz = JSON.parse(e.data)
      setResults(prev => [...prev, biz])
    })

    es.addEventListener('progress', (e) => {
      const { completed, total } = JSON.parse(e.data)
      setProgress({ completed, total })
      setStatusMsg(`Fetching phone numbers… ${completed}/${total}`)
    })

    es.addEventListener('done', (e) => {
      setIsLoading(false)
      setStatusMsg('')
      es.close()
    })

    es.addEventListener('error', (e) => {
      // e.data may be a JSON error from server, or a network drop
      try {
        const { message } = JSON.parse(e.data)
        setError(message)
      } catch {
        // Only show error if we haven't already gotten results
        setError(prev => results.length === 0 ? 'Connection failed. Is the server running?' : null)
      }
      setIsLoading(false)
      setStatusMsg('')
      es.close()
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Tab' && e.target.name === 'location') {
      e.preventDefault()
      bizRef.current?.focus()
    }
  }

  const clearAll = () => {
    if (esRef.current) esRef.current.close()
    setResults([])
    setError(null)
    setSearched(false)
    setIsLoading(false)
    setStatusMsg('')
    setProgress({ completed: 0, total: 0 })
    setLocation('')
    setBusinessType('')
  }

  const exportCSV = () => {
    if (!results.length) return
    const rows = [
      ['Name', 'Address', 'Phone', 'Rating', 'Reviews'],
      ...results.map(b => [b.name, b.address, b.phone, b.rating, b.reviews].map(v => `"${v ?? ''}"`))
    ]
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gmb_${location.replace(/\s+/g, '_')}_${Date.now()}.csv`
    a.click()
  }

  const progressPct = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0

  return (
    <>
      <style>{STYLES}</style>
      <div className="root">
        <header className="header">
          <div className="header-left">
            <h1 className="logo">GMB <em>Scout</em></h1>
            <p className="subtitle">Businesses without websites — Google Maps</p>
          </div>
          {searched && (
            <button className="clear-btn" onClick={clearAll}>Reset</button>
          )}
        </header>

        <div className="search-grid">
          <div className="field">
            <label htmlFor="location-input">Location</label>
            <input
              id="location-input"
              name="location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="City, State or Country"
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
            />
          </div>
          <div className="field">
            <label htmlFor="business-input">Business type</label>
            <input
              id="business-input"
              ref={bizRef}
              name="business"
              type="text"
              value={businessType}
              onChange={e => setBusinessType(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Dentists, Electricians…"
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
            />
          </div>
          <button
            className="search-btn"
            onClick={handleSearch}
            disabled={isLoading || !location.trim() || !businessType.trim()}
          >
            {isLoading ? 'Searching…' : 'Run Search →'}
          </button>
        </div>

        {isLoading && (
          <>
            <div className="status-bar">
              <div className="pulse" />
              <span>{statusMsg || 'Loading…'}</span>
            </div>
            {progress.total > 0 && (
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </>
        )}

        {error && <div className="error-msg">⚠ {error}</div>}

        {!searched && !isLoading && (
          <div className="welcome">
            <p className="welcome-title">Find your next prospects</p>
            <p className="welcome-sub">Enter a location and business type above to begin</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="results-meta">
              <span className="results-count">
                <strong>{results.length}</strong>
                {isLoading ? ` of ${progress.total} loaded so far` : ' businesses found'}
              </span>
              <button className="export-btn" onClick={exportCSV}>Export CSV ↓</button>
            </div>
            <ResultsTable results={results} />
          </>
        )}

        {searched && results.length === 0 && !isLoading && !error && (
          <div className="welcome">
            <p className="welcome-title">No results found</p>
            <p className="welcome-sub">Try adjusting your location or business type</p>
          </div>
        )}
      </div>
    </>
  )
}