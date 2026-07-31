import { useMemo, useState } from 'react'
import { useSessionStore, selectActiveSpeaker } from '../store'
import { soundAddWords, crutchAddWords } from '../detection/detector'

function hueFor(word: string): number {
  let hash = 0
  for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

// One shared "tap to add" section for both boxes: sound buttons add sound
// fillers, word buttons add crutch words, and the input adds a custom entry as
// either. All attribute to the active speaker.
export function ManualAdd() {
  const active = useSessionStore(selectActiveSpeaker)
  const wordList = useSessionStore((s) => s.wordList)
  const addManualDetection = useSessionStore((s) => s.addManualDetection)
  const addFiller = useSessionStore((s) => s.addFiller)
  const [custom, setCustom] = useState('')

  const sounds = useMemo(() => soundAddWords(wordList), [wordList])
  const words = useMemo(() => crutchAddWords(wordList), [wordList])

  if (!active) return null

  const submit = (group: 'sound' | 'word') => {
    const w = custom.trim()
    if (!w) return
    addFiller(w, group)
    setCustom('')
  }

  return (
    <div className="manual-add" data-tour="manual">
      <div className="manual-add-label">
        Tap to add for <strong>{active.name}</strong>
      </div>

      <div className="manual-add-row">
        <span className="manual-add-kind">Sounds</span>
        <div className="manual-add-buttons">
          {sounds.map((w) => (
            <button
              key={w}
              type="button"
              className="manual-btn"
              onClick={() => addManualDetection(w, 'sound')}
              style={{ borderColor: `hsl(${hueFor(w)} 80% 60% / 0.5)` }}
            >
              +{w}
            </button>
          ))}
        </div>
      </div>

      <div className="manual-add-row">
        <span className="manual-add-kind">Words</span>
        <div className="manual-add-buttons">
          {words.map((w) => (
            <button
              key={w}
              type="button"
              className="manual-btn"
              onClick={() => addManualDetection(w, 'crutch')}
              style={{ borderColor: `hsl(${hueFor(w)} 80% 60% / 0.5)` }}
            >
              +{w}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-word">
        <input
          type="text"
          className="custom-word-input"
          placeholder="Add a missing filler…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit('word')
          }}
          maxLength={30}
          autoComplete="off"
        />
        <button
          type="button"
          className="custom-word-btn"
          onClick={() => submit('sound')}
          disabled={!custom.trim()}
        >
          + sound
        </button>
        <button
          type="button"
          className="custom-word-btn"
          onClick={() => submit('word')}
          disabled={!custom.trim()}
        >
          + word
        </button>
      </div>
    </div>
  )
}
