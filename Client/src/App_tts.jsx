import { useState } from 'react'
import './App_chat.css'

function App() {
  const [text, setText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const generateAudio = async () => {
    if (!text.trim()) return

    setIsGenerating(true)
    setError(null)
    setAudioUrl(null)

    try {
      const response = await fetch('http://localhost:3000/api/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate audio')
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate audio')
      }
      
      setAudioUrl(data.audioUrl)
      
      // Add to history
      setHistory(prev => [{
        text: text,
        audioUrl: data.audioUrl,
        timestamp: new Date().toLocaleString()
      }, ...prev])

    } catch (err) {
      setError(err.message)
      console.error('Error:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      generateAudio()
    }
  }

  const clearAll = () => {
    setText('')
    setAudioUrl(null)
    setError(null)
    setHistory([])
  }

  const playAudio = (url) => {
    const audio = new Audio(url)
    audio.play()
  }

  const downloadAudio = async (url, index) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `audio-${index + 1}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error('Download error:', err)
    }
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>🎵 Text to Audio Generator</h1>
        <button onClick={clearAll} className="clear-btn">
          Clear All
        </button>
      </header>

      <div className="messages-container">
        {history.length === 0 && !audioUrl && (
          <div className="welcome-message">
            <h2>Welcome! 🎙️</h2>
            <p>Convert your text into natural-sounding speech</p>
            <p style={{ marginTop: '10px', fontSize: '14px', color: '#888' }}>
              Powered by NVIDIA AI
            </p>
          </div>
        )}

        {/* Current Generation */}
        {isGenerating && (
          <div className="message assistant loading">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div style={{ marginTop: '10px', color: '#667eea' }}>
                Generating audio from your text...
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="message error">
            <div className="error-content">
              ❌ Error: {error}
            </div>
          </div>
        )}

        {/* Latest Audio Result */}
        {audioUrl && !isGenerating && (
          <div className="message assistant">
            <div className="message-avatar">🎵</div>
            <div className="message-content">
              <div className="message-text" style={{ marginBottom: '15px' }}>
                <strong>Generated Audio:</strong>
                <br />
                <em style={{ color: '#666' }}>{text}</em>
              </div>
              
              <audio controls src={audioUrl} style={{ width: '100%', marginBottom: '10px' }}>
                Your browser does not support the audio element.
              </audio>
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button 
                  onClick={() => playAudio(audioUrl)}
                  className="send-btn"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  ▶️ Play
                </button>
                <button 
                  onClick={() => downloadAudio(audioUrl, -1)}
                  className="send-btn"
                  style={{ padding: '8px 16px', fontSize: '13px', background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}
                >
                  ⬇️ Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ color: '#667eea', marginBottom: '15px' }}>📚 History</h3>
            {history.map((item, index) => (
              <div key={index} className="message assistant" style={{ marginBottom: '15px' }}>
                <div className="message-avatar">🎵</div>
                <div className="message-content">
                  <div className="message-text" style={{ fontSize: '13px' }}>
                    <strong>{item.text.substring(0, 100)}{item.text.length > 100 ? '...' : ''}</strong>
                    <br />
                    <small style={{ color: '#999' }}>{item.timestamp}</small>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button 
                      onClick={() => playAudio(item.audioUrl)}
                      className="send-btn"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      ▶️ Play
                    </button>
                    <button 
                      onClick={() => downloadAudio(item.audioUrl, index)}
                      className="send-btn"
                      style={{ padding: '6px 12px', fontSize: '12px', background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}
                    >
                      ⬇️ Download
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="input-container">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter text to convert to speech..."
          disabled={isGenerating}
          rows="4"
        />
        <button 
          onClick={generateAudio} 
          disabled={isGenerating || !text.trim()}
          className="send-btn"
          style={{ 
            background: isGenerating 
              ? 'linear-gradient(135deg, #ccc 0%, #999 100%)' 
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }}
        >
          {isGenerating ? '⏳ Generating...' : '🎵 Generate Audio'}
        </button>
      </div>
    </div>
  )
}

export default App
