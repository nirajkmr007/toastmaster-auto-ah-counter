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
// either. Tapped counts attribute to the active speaker.
//
// Always rendered — it's part of the app's shape, so hiding it until a speaker
// exists made the layout jump and hid the feature from first-time users. With
// no speaker selected the buttons are disabled instead.
export function ManualAdd() {
  const active = useSessionStore(selectActiveSpeaker)
  const wordList = useSessionStore((s) => s.wordList)
  const addManualDetection = useSessionStore((s) => s.addManualDetection)
  const addFiller = useSessionStore((s) => s.addFiller)
  // With the transcript collapsed this card owns the column, so the buttons
  // get bigger — the whole point of collapsing is easier tapping.
  const roomy = useSessionStore((s) => s.transcriptCollapsed)
  const [custom, setCustom] = useState('')

  const sounds = useMemo(() => soundAddWords(wordList), [wordList])
  const words = useMemo(() => crutchAddWords(wordList), [wordList])

  // Size the buttons from how many there are, so adding fillers shrinks them to
  // fit instead of pushing the last row out of the card.
  //
  // A button's footprint grows with the square of its font size, and the space
  // available is fixed — so size scales with 1/sqrt(count). The constant is
  // picked so the default list (~24 entries) lands near the normal 12px and a
  // short list reaches the 24px ceiling, i.e. never more than 2x normal.
  // Padding and gap are derived from the font size, which keeps the 2x cap
  // holding for the whole button, not just its text.
  const roomyStyle = useMemo(() => {
    if (!roomy) return undefined
    const count = Math.max(sounds.length + words.length, 1)
    const font = Math.round(Math.min(24, Math.max(12, 66 / Math.sqrt(count))))
    return {
      '--mbtn-font': `${font}px`,
      '--mbtn-pad-y': `${Math.round(font * 0.42)}px`,
      '--mbtn-pad-x': `${Math.round(font * 0.83)}px`,
      '--mbtn-gap': `${Math.round(font * 0.5)}px`,
    } as React.CSSProperties
  }, [roomy, sounds.length, words.length])

  const submit = (group: 'sound' | 'word') => {
    const w = custom.trim()
    if (!w) return
    addFiller(w, group)
    setCustom('')
  }

  return (
    <div
      className={`manual-add${roomy ? ' manual-add-roomy' : ''}`}
      style={roomyStyle}
      data-tour="manual"
    >
      <div className="manual-add-label">
        {active ? (
          <>
            Tap to add for <strong>{active.name}</strong>
          </>
        ) : (
          <>
            Tap to add — <strong>add a speaker first</strong>
          </>
        )}
      </div>

      {/* Rows grow in proportion to how many buttons they hold, so a short
          Sounds row doesn't reserve half the card while Words overflows. */}
      <div
        className="manual-add-row"
        style={roomy ? { flexGrow: Math.max(sounds.length, 1) } : undefined}
      >
        <span className="manual-add-kind">Sounds</span>
        <div className="manual-add-buttons">
          {sounds.map((w) => (
            <button
              key={w}
              type="button"
              className="manual-btn"
              onClick={() => addManualDetection(w, 'sound')}
              disabled={!active}
              style={{ borderColor: `hsl(${hueFor(w)} 80% 60% / 0.5)` }}
            >
              +{w}
            </button>
          ))}
        </div>
      </div>

      <div
        className="manual-add-row"
        style={roomy ? { flexGrow: Math.max(words.length, 1) } : undefined}
      >
        <span className="manual-add-kind">Words</span>
        <div className="manual-add-buttons">
          {words.map((w) => (
            <button
              key={w}
              type="button"
              className="manual-btn"
              onClick={() => addManualDetection(w, 'crutch')}
              disabled={!active}
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
