import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import { useSessionStore } from '../store'
import { canonicalFiller } from '../detection/detector'
import { PRESETS } from '../detection/presets'
import {
  MILD_BLOCKED_COUNT,
  STRONG_BLOCKED_COUNT,
} from '../detection/profanity'
import { MODELS, getModel, isModelAvailable } from '../audio/models'
import {
  buildSettingsFile,
  parseSettingsFile,
  settingsFileName,
} from '../settingsFile'

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
  const hardStopMs = useSessionStore((s) => s.hardStopMs)
  const setHardStop = useSessionStore((s) => s.setHardStop)
  const extraBlockedWords = useSessionStore((s) => s.extraBlockedWords)
  const addBlockedWord = useSessionStore((s) => s.addBlockedWord)
  const removeBlockedWord = useSessionStore((s) => s.removeBlockedWord)
  const maskMildWords = useSessionStore((s) => s.maskMildWords)
  const setMaskMildWords = useSessionStore((s) => s.setMaskMildWords)
  const modelId = useSessionStore((s) => s.modelId)
  const setModelId = useSessionStore((s) => s.setModelId)
  const isListening = useSessionStore((s) => s.status === 'listening')
  const importSettings = useSessionStore((s) => s.importSettings)

  const [soundInput, setSoundInput] = useState('')
  const [wordInput, setWordInput] = useState('')
  const [blockedInput, setBlockedInput] = useState('')
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  )
  const fileRef = useRef<HTMLInputElement | null>(null)

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
  const submitBlocked = () => {
    const w = blockedInput.trim()
    if (!w) return
    addBlockedWord(w)
    setBlockedInput('')
  }

  const handleDownload = () => {
    const s = useSessionStore.getState()
    const body = buildSettingsFile({
      wordList: s.wordList,
      presetName: s.presetName,
      sensitivity: s.sensitivity,
      targetDurationMs: s.targetDurationMs,
      hardStopMs: s.hardStopMs,
      extraBlockedWords: s.extraBlockedWords,
      maskMildWords: s.maskMildWords,
      modelId: s.modelId,
      theme: s.theme,
      transcriptCollapsed: s.transcriptCollapsed,
    })
    const url = URL.createObjectURL(
      new Blob([body], { type: 'application/json' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = settingsFileName()
    link.click()
    URL.revokeObjectURL(url)
    setImportMsg({ ok: true, text: 'Settings downloaded.' })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so re-picking the same file fires change again.
    e.target.value = ''
    if (!file) return
    try {
      const { settings, error, warnings } = parseSettingsFile(await file.text())
      if (!settings) {
        setImportMsg({ ok: false, text: error ?? 'Could not read that file.' })
        return
      }
      importSettings(settings)
      const applied = Object.keys(settings).length
      setImportMsg({
        ok: true,
        text:
          `Applied ${applied} setting${applied === 1 ? '' : 's'}.` +
          (warnings.length > 0 ? ` ${warnings.join('; ')}` : ''),
      })
    } catch {
      setImportMsg({ ok: false, text: 'Could not read that file.' })
    }
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

            <div className="settings-group">
              <div className="settings-group-head">
                <span className="settings-group-title">Accent model</span>
                <span className="settings-group-sub dim">
                  Switching downloads a different speech model (one time, then
                  cached by the browser) and clears the loaded one. Not possible
                  while listening.
                </span>
              </div>
              <div className="model-toggle">
                {MODELS.map((m) => {
                  const available = isModelAvailable(m)
                  const selected = m.id === modelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`model-btn${selected ? ' model-btn-on' : ''}`}
                      onClick={() => setModelId(m.id)}
                      disabled={!available || isListening || selected}
                      title={
                        available
                          ? m.note
                          : 'Not configured yet — see scripts/repack-en-in-model.sh'
                      }
                    >
                      <span className="model-btn-label">{m.label}</span>
                      <span className="model-btn-sub">
                        {available ? `~${m.approxSizeMb} MB` : 'not hosted yet'}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="settings-hint dim">{getModel(modelId).note}</p>
            </div>

            <div className="settings-group">
              <div className="settings-group-head">
                <span className="settings-group-title">Auto-stop</span>
                <span className="settings-group-sub dim">
                  Safety cap — listening ends automatically after this long, so
                  a session left open never records indefinitely.
                </span>
              </div>
              <select
                className="settings-select"
                value={String(hardStopMs)}
                onChange={(e) => setHardStop(Number(e.target.value))}
                aria-label="Auto-stop listening after"
              >
                {[10, 15, 20, 30, 45, 60, 90, 120].map((min) => (
                  <option key={min} value={String(min * 60_000)}>
                    {min} min
                  </option>
                ))}
              </select>
            </div>

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

            <div className="settings-group">
              <div className="settings-group-head">
                <span className="settings-group-title">Clean transcript</span>
                <span className="settings-group-sub dim">
                  The model can mishear a grunt or a breath as a rude word.{' '}
                  {STRONG_BLOCKED_COUNT} profanities and slurs are always
                  replaced with <code>***</code> before anything is shown,
                  stored or exported — the built-in list isn&rsquo;t displayed
                  here on purpose. Filler counts are unaffected.
                </span>
              </div>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={maskMildWords}
                  onChange={(e) => setMaskMildWords(e.target.checked)}
                />
                <span>
                  Also mask {MILD_BLOCKED_COUNT} mild words (damn, hell,
                  crap&hellip;)
                </span>
              </label>

              <div className="settings-add">
                <input
                  type="text"
                  value={blockedInput}
                  placeholder="Add another word to mask"
                  onChange={(e) => setBlockedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitBlocked()
                  }}
                  maxLength={30}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-add-btn"
                  onClick={submitBlocked}
                  disabled={!blockedInput.trim()}
                >
                  Add
                </button>
              </div>

              {extraBlockedWords.length > 0 ? (
                <div className="settings-chips">
                  {extraBlockedWords.map((w) => (
                    <span key={w} className="settings-chip">
                      <span className="settings-chip-word">{w}</span>
                      <button
                        type="button"
                        className="settings-chip-remove"
                        aria-label={`Stop masking ${w}`}
                        onClick={() => removeBlockedWord(w)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="settings-group">
              <div className="settings-group-head">
                <span className="settings-group-title">Backup &amp; restore</span>
                <span className="settings-group-sub dim">
                  Nothing is stored on a server, so settings live in this
                  browser only. Download a file to carry them to another device
                  — or to get them back after clearing your browser. The file
                  holds settings only: no speech, transcripts, counts or speaker
                  names.
                </span>
              </div>
              <div className="settings-backup">
                <button
                  type="button"
                  className="settings-add-btn"
                  onClick={handleDownload}
                >
                  Download settings
                </button>
                <button
                  type="button"
                  className="settings-add-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload settings
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="settings-file-input"
                  onChange={handleUpload}
                />
              </div>
              {importMsg ? (
                <p
                  className={
                    importMsg.ok ? 'settings-note-ok' : 'settings-note-bad'
                  }
                >
                  {importMsg.text}
                </p>
              ) : null}
            </div>

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
