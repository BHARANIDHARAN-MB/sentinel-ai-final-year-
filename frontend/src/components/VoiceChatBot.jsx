import React, { useEffect, useRef, useState } from 'react'

const REPORT_PORT = 8004
const SEARCH_PORT = 8008

// "find file X" / "search for X" / "locate X" - extracts the filename part
const FIND_FILE_PATTERN = /\b(find|search for|locate|look for)\s+(?:file|the file)?\s*(.+)/i

// "find photo/picture/image of X" / "find video/clip of X" / "find folder X" -
// captures both the category word and the search term, so voice/text can
// filter to just pictures or just videos, not only generic files.
const FIND_MEDIA_PATTERN =
  /\b(find|search for|locate|look for)\s+(?:a |the )?(photo|photos|picture|pictures|image|images|video|videos|clip|clips|folder|folders)\s+(?:of |named |called )?(.+)/i

const CATEGORY_WORD_MAP = {
  photo: 'image', photos: 'image', picture: 'image', pictures: 'image', image: 'image', images: 'image',
  video: 'video', videos: 'video', clip: 'video', clips: 'video',
  folder: 'folder', folders: 'folder',
}

function useSpeechSupport() {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(Boolean(SR) && Boolean(window.speechSynthesis))
  }, [])
  return supported
}

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel() // don't stack overlapping utterances
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.02
  utterance.pitch = 1.0
  window.speechSynthesis.speak(utterance)
}

export default function VoiceChatBot({ lastScanSummary }) {
  const [open, setOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hi, I'm the Sentinel AI assistant. Ask about your scan, say \"find file\" and a name, or \"find photo/video of\" something." },
  ])
  const [textInput, setTextInput] = useState('')
  const recognitionRef = useRef(null)
  const scrollRef = useRef(null)
  const supported = useSpeechSupport()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function addMessage(role, text) {
    setMessages((m) => [...m, { role, text }])
  }

  async function handleUserMessage(text) {
    addMessage('user', text)

    // Check the more specific media pattern first ("find photo of X" should
    // not fall through to the generic file pattern, which would search for
    // a file literally named "photo of X").
    const mediaMatch = text.match(FIND_MEDIA_PATTERN)
    if (mediaMatch) {
      const category = CATEGORY_WORD_MAP[mediaMatch[2].toLowerCase()] || 'any'
      const term = mediaMatch[3].trim()
      await handleFileSearch(term, category)
      return
    }

    const findMatch = text.match(FIND_FILE_PATTERN)
    if (findMatch) {
      const filename = findMatch[2].trim()
      await handleFileSearch(filename, 'any')
      return
    }

    await handleChat(text)
  }

  async function handleFileSearch(filename, category = 'any') {
    const categoryLabel = { image: 'pictures', video: 'videos', folder: 'folders', any: '' }[category]
    addMessage('bot', categoryLabel ? `Searching ${categoryLabel} for "${filename}"…` : `Searching for "${filename}"…`)
    try {
      const res = await fetch(`http://localhost:${SEARCH_PORT}/search-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: filename, category }),
      })
      const data = await res.json()

      let reply
      if (data.results.length === 0) {
        reply = `I couldn't find any ${categoryLabel || 'matching files'} for "${filename}" in your Downloads, Desktop, Documents, Pictures, or Videos.`
      } else {
        const top = data.results[0]
        const label = top.match_type === 'exact' ? 'Found it' : 'Closest match'
        reply = `${label}: ${top.filename}, in ${top.path}.`
        if (data.results.length > 1) {
          reply += ` I also found ${data.results.length - 1} other possible match${data.results.length > 2 ? 'es' : ''}.`
        }
      }
      addMessage('bot', reply)
      speak(reply)
    } catch (e) {
      const reply = "I couldn't reach the File Search Agent on port 8008. Is it running?"
      addMessage('bot', reply)
      speak(reply)
    }
  }

  async function handleChat(text) {
    try {
      const res = await fetch(`http://localhost:${REPORT_PORT}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context: lastScanSummary }),
      })
      const data = await res.json()
      addMessage('bot', data.reply)
      speak(data.reply)
    } catch (e) {
      const reply = "I couldn't reach the Report Agent's chat endpoint on port 8004."
      addMessage('bot', reply)
      speak(reply)
    }
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      handleUserMessage(transcript)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function handleTextSubmit(e) {
    e.preventDefault()
    if (!textInput.trim()) return
    handleUserMessage(textInput.trim())
    setTextInput('')
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        className="focus-ring fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-amber text-bg flex items-center justify-center shadow-lg hover:bg-amber/90 transition-colors"
      >
        {open ? '✕' : '🎙'}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-full max-w-sm bg-surface border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden" style={{ height: '480px' }}>
          <div className="px-4 py-3 border-b border-border">
            <p className="font-mono text-xs text-amber tracking-widest">SENTINEL ASSISTANT</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-md text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-amber text-bg' : 'bg-surface2 text-ink border border-border'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleTextSubmit} className="p-3 border-t border-border flex gap-2">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type or use the mic…"
              className="focus-ring flex-1 bg-surface2 border border-border rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted/60"
            />
            {supported && (
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                aria-label={listening ? 'Stop listening' : 'Start voice input'}
                className={`focus-ring w-9 h-9 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                  listening ? 'bg-threat text-white animate-pulse' : 'bg-surface2 border border-border text-ink hover:border-amber'
                }`}
              >
                🎙
              </button>
            )}
            <button
              type="submit"
              className="focus-ring px-3 py-2 rounded-md bg-amber text-bg text-sm font-medium hover:bg-amber/90 transition-colors shrink-0"
            >
              Send
            </button>
          </form>

          {!supported && (
            <p className="px-4 pb-3 text-xs text-muted">
              Voice input isn't supported in this browser — try Chrome or Edge. Text chat still works.
            </p>
          )}
        </div>
      )}
    </>
  )
}
