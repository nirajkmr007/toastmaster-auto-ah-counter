import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useSessionStore } from '../store'
import { canonicalFiller } from '../detection/detector'
import { PRESETS } from '../detection/presets'

// Full CRUD manager for the effective filler-word list. Sounds are shown by
// canonical label (deleting one drops all its spelling variants); crutch words
// and phrases are shown verbatim. Everything here is persisted to localStorage
// and applied to the detector live.
export function SettingsPanel() {
  const showSettings = useSessionStore((s) => s.showSettings)
  const closeSettings = useSessionStore((s) => s.closeSettings)
  const wordList = useSessionStore((s) => s.wordList)
  const presetName = useSessionStore((s) => s.presetName)
  const addFiller = useSessionStore((s) => s.addFiller)
  const removeFiller = useSessionStore((s) => s.removeFiller)
  const setPreset = useSessionStore((s) => s.setPreset)

  const [soundInput, setSoundInput] = useState('')
  const [wordInput, setWordInput] = useState('')

  // Sounds collapsed to canonical labels (um, uh, …), stable order.
  const sounds = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of wordList.soundFillers) {
      const c = canonicalFiller(v)
      if (!seen.has(c)) {
        seen.add(c)
        out.push(c)
      }
    }
    return out
  }, [wordList.soundFillers])

  const words = useMemo(
    () => [...wordList.crutchWords, ...wordList.crutchPhrases],
    [wordList.crutchWords, wordList.crutchPhrases]
  )

  const submitSound = () => {
    const w = soundInput.trim()
    if (!w) return
    addFiller(w, 'sound')
    setSoundInput('')
  }
  const submitWord = () => {
    const w = wordInput.trim()
    if (!w) return
    addFiller(w, 'word')
    setWordInput('')
  }

  return (
    <AnimatePresence>
      {showSettings ? (
        <motion.div
          className="report-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeSettings}
        >
          <motion.div
            className="report-card settings-card"
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="report-header">
              <div>
                <div className="report-eyebrow">Manage filler words</div>
                <h2 className="report-title">List: {presetName}</h2>
              </div>
              <button
                type="button"
                className="report-close"
                onClick={closeSettings}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>

            <p className="settings-hint dim">
              Changes apply live and are saved on this device. Sounds are
              always counted; words &amp; phrases follow the sensitivity rules.
            </p>

            <FillerGroup
              title="Sounds"
              subtitle="um, uh, er… (counted every time)"
              items={sounds}
              onRemove={removeFiller}
              input={soundInput}
              setInput={setSoundInput}
              onSubmit={submitSound}
              placeholder="Add a sound, e.g. mhm"
            />

            <FillerGroup
              title="Words & phrases"
              subtitle="so, you know… (context + frequency rules apply)"
              items={words}
              onRemove={removeFiller}
              input={wordInput}
              setInput={setWordInput}
              onSubmit={submitWord}
              placeholder="Add a word or phrase, e.g. right / at this point"
            />

            <div className="settings-presets">
              <span className="settings-presets-label">Load a preset</span>
              <div className="settings-preset-buttons">
                {Object.keys(PRESETS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="footer-btn"
                    onClick={() => setPreset(name, PRESETS[name])}
                    title="Replace the current list with this preset"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="report-footer">
              Saved locally on this device · audio is never stored.
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

interface GroupProps {
  title: string
  subtitle: string
  items: string[]
  onRemove: (word: string) => void
  input: string
  setInput: (v: string) => void
  onSubmit: () => void
  placeholder: string
}

function FillerGroup({
  title,
  subtitle,
  items,
  onRemove,
  input,
  setInput,
  onSubmit,
  placeholder,
}: GroupProps) {
  return (
    <div className="settings-group">
      <div className="settings-group-head">
        <span className="settings-group-title">{title}</span>
        <span className="settings-group-sub dim">{subtitle}</span>
      </div>

      {items.length > 0 ? (
        <div className="settings-chips">
          {items.map((w) => (
            <span key={w} className="settings-chip">
              <span className="settings-chip-word">{w}</span>
              <button
                type="button"
                className="settings-chip-remove"
                aria-label={`Remove ${w}`}
                onClick={() => onRemove(w)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="dim settings-empty">Nothing here yet.</p>
      )}

      <div className="settings-add">
        <input
          type="text"
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
          maxLength={30}
          autoComplete="off"
        />
        <button
          type="button"
          className="settings-add-btn"
          onClick={onSubmit}
          disabled={!input.trim()}
        >
          Add
        </button>
      </div>
    </div>
  )
}
