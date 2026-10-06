import { useState } from 'react'
import {
  builtInVisionKey,
  loadVisionKey,
  maskVisionKey,
  resolveVisionKey,
  saveVisionKey,
  visionKeySource,
} from '../lib/receipt'
import { Group, GroupRow, TextInput } from './ui'

export function ScanSettings({ onNotify }: { onNotify?: (message: string) => void }) {
  const [saved, setSaved] = useState(() => loadVisionKey())
  const [draft, setDraft] = useState('')
  const source = visionKeySource()
  const connected = Boolean(resolveVisionKey())

  const persist = (value: string) => {
    saveVisionKey(value)
    setSaved(value.trim())
    setDraft('')
    onNotify?.(value.trim() ? 'Gemini key saved on this phone' : 'Custom Gemini key removed')
  }

  return (
    <>
      <p className="mb-2 px-4 text-[13px] text-[var(--muted)]">
        {connected
          ? 'Gemini reads receipt photos when you tap Take Photo or Library on Add Expense. Everyone on this phone can scan.'
          : 'Paste a Google Gemini API key so Take Photo can read bills. Stored only in this browser — never in trip backups or invite links.'}
      </p>
      <Group>
        {connected ? (
          <GroupRow>
            <span className="flex-1 text-[17px]">Gemini</span>
            <span className="text-[15px] text-[#30D158]">
              {source === 'custom' ? `On · ${maskVisionKey(saved)}` : 'Connected'}
            </span>
          </GroupRow>
        ) : null}
        {saved ? (
          <GroupRow onClick={() => persist('')}>
            <span className="flex-1 text-[17px] text-[var(--danger)]">Remove custom key</span>
          </GroupRow>
        ) : (
          <div className="space-y-2 px-4 py-3">
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => persist(draft)}
              className="pressable min-h-[44px] w-full rounded-full bg-[var(--accent)] text-[15px] font-semibold text-white disabled:opacity-40"
            >
              {builtInVisionKey() ? 'Use my own key' : 'Connect Gemini'}
            </button>
          </div>
        )}
      </Group>
      <p className="mt-2 px-4 text-[13px] text-[var(--muted)]">
        Create a key at{' '}
        <a
          className="text-[var(--accent)]"
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
        >
          Google AI Studio
        </a>
        . Restrict it to this site if you share the app. Free tier is enough for occasional scans.
      </p>
    </>
  )
}
