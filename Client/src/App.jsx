import { useState, useRef } from 'react'
import ResultsTable from './components/ResultsTable'

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;1,9..144,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Mono', monospace;
    background: #0d0d0d;
    color: #e8e4d9;
    min-height: 100vh;
  }

  .root {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }

  .header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    border-bottom: 1px solid #2a2a2a;
    padding-bottom: 1.5rem;
    margin-bottom: 2.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-left {}

  .logo {
    font-family: 'Fraunces', serif;
    font-size: 2rem;
    font-weight: 300;
    color: #e8e4d9;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-bottom: 0.25rem;
  }

  .logo em {
    font-style: italic;
    color: #c9f468;
  }

  .subtitle {
    font-size: 0.7rem;
    color: #555;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

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
  }

  .clear-btn:hover {
    border-color: #555;
    color: #aaa;
  }

  .search-grid {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 0;
    border: 1px solid #2a2a2a;
    margin-bottom: 2.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    padding: 1rem 1.25rem;
    border-right: 1px solid #2a2a2a;
  }

  .field:last-child {
    border-right: none;
  }

  .field label {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 0.5rem;
  }

  .field input {
    background: transparent;
    border: none;
    outline: none;
    font-family: 'DM Mono', monospace;
    font-size: 0.9rem;
    color: #e8e4d9;
    padding: 0;
    width: 100%;
  }

  .field input::placeholder { color: #444; }

  .field input:disabled { opacity: 0.5; cursor: not-allowed; }

  .search-btn {
    background: #c9f468;
    border: none;
    color: #0d0d0d;
    font-family: 'DM Mono', monospace;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1rem 1.5rem;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
    min-width: 140px;
  }

  .search-btn:hover:not(:disabled) { background: #d8f87a; }

  .search-btn:disabled {
    background: #1e2a10;
    color: #4a6020;
    cursor: not-allowed;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 2rem;
    font-size: 0.75rem;
    color: #555;
  }

  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #c9f468;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.75); }
  }

  .error-msg {
    border: 1px solid #3a1a1a;
    background: #1a0a0a;
    color: #e05555;
    font-size: 0.8rem;
    padding: 1rem 1.25rem;
    margin-bottom: 2rem;
    letter-spacing: 0.02em;
  }

  .welcome {
    text-align: center;
    padding: 4rem 2rem;
    border: 1px dashed #1e1e1e;
  }

  .welcome-title {
    font-family: 'Fraunces', serif;
    font-size: 1.25rem;
    font-weight: 300;
    color: #555;
    margin-bottom: 0.5rem;
  }

  .welcome-sub {
    font-size: 0.75rem;
    color: #333;
    letter-spacing: 0.05em;
  }

  .results-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .results-count {
    font-size: 0.75rem;
    color: #666;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .results-count strong {
    color: #c9f468;
    font-weight: 500;
  }

  .export-btn {
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #888;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.4rem 0.875rem;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .export-btn:hover {
    border-color: #c9f468;
    color: #c9f468;
  }

  .table-wrap {
    border: 1px solid #1e1e1e;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }

  thead tr {
    border-bottom: 1px solid #2a2a2a;
  }

  th {
    text-align: left;
    padding: 0.75rem 1rem;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #444;
    font-weight: 400;
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid #151515;
    transition: background 0.15s;
  }

  tbody tr:last-child { border-bottom: none; }

  tbody tr:hover { background: #111; }

  td {
    padding: 0.875rem 1rem;
    color: #aaa;
    vertical-align: top;
    line-height: 1.5;
  }

  .td-name {
    color: #e8e4d9;
    font-weight: 500;
    min-width: 160px;
  }

  .td-addr { color: #666; max-width: 220px; }

  .td-phone { white-space: nowrap; color: #888; }

  .td-rating {
    white-space: nowrap;
    color: #c9f468;
    font-weight: 500;
  }

  .td-reviews { color: #555; }

  .td-action {
    white-space: nowrap;
    min-width: 100px;
  }

  .whatsapp-btn {
    background: #25D366;
    border: none;
    color: white;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.5rem 1rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s, transform 0.15s;
  }

  .whatsapp-btn:hover {
    background: #20BA5A;
    transform: translateY(-1px);
  }

  .whatsapp-btn:active {
    transform: translateY(0);
  }

  .no-phone-msg {
    color: #333;
    font-size: 0.75rem;
    font-style: italic;
  }

  .no-data {
    color: #333;
    font-style: italic;
    font-size: 0.75rem;
  }

  @media (max-width: 640px) {
    .search-grid {
      grid-template-columns: 1fr;
    }
    .field {
      border-right: none;
      border-bottom: 1px solid #2a2a2a;
    }
    .search-btn {
      width: 100%;
      padding: 1.25rem;
    }
  }
`

export default function App() {
  const [location, setLocation] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const bizRef = useRef(null)

  const handleSearch = async () => {
    if (!location.trim() || !businessType.trim()) {
      setError('Both fields are required')
      return
    }
    setIsLoading(true)
    setError(null)
    setResults([])
    setSearched(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

    try {
      console.log('Starting search for:', { location, businessType })
      const res = await fetch('http://localhost:3000/api/scrape-gmb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, businessType }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      console.log('Response status:', res.status)
      const data = await res.json()
      console.log('Response data:', data)
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to get results')
      setResults(data.data)
    } catch (err) {
      console.error('Search error:', err)
      if (err.name === 'AbortError') {
        setError('Request timed out. The server is taking too long to respond.')
      } else {
        setError(err.message)
      }
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Tab' && e.target.name === 'location') {
      e.preventDefault()
      bizRef.current?.focus()
    }
  }

  const clearAll = () => {
    setResults([])
    setError(null)
    setSearched(false)
    setLocation('')
    setBusinessType('')
  }

  const exportCSV = () => {
    if (!results.length) return
    const rows = [
      ['Name', 'Address', 'Phone', 'Rating', 'Reviews'],
      ...results.map(b => [b.name, b.address, b.phone, b.rating, b.reviews].map(v => `"${v}"`))
    ]
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gmb_${location.replace(/\s+/g, '_')}_${Date.now()}.csv`
    a.click()
  }

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
            <label>Location</label>
            <input
              name="location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New York, NY"
              disabled={isLoading}
            />
          </div>
          <div className="field">
            <label>Business type</label>
            <input
              ref={bizRef}
              name="business"
              type="text"
              value={businessType}
              onChange={e => setBusinessType(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Plumbers, Dentists…"
              disabled={isLoading}
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
          <div className="status-bar">
            <div className="pulse" />
            Scraping Google Maps for {businessType} in {location}…
          </div>
        )}

        {error && <div className="error-msg">Error: {error}</div>}

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
                <strong>{results.length}</strong> businesses found without websites
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