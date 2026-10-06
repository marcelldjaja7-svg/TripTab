import { Camera, ImageIcon, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatMoney } from '../lib/money'
import { loadVisionKey, resolveVisionKey, saveVisionKey, ScanError, scanReceiptPhoto, type ReceiptScan } from '../lib/receipt'
import { cn } from '../lib/utils'
import type { Trip } from '../types'
import { Group, GroupRow, TextInput } from './ui'

export function BillScanPanel({
  trip,
  disabled,
  onApply,
}: {
  trip: Trip
  disabled?: boolean
  onApply: (scan: ReceiptScan) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hasKey, setHasKey] = useState(() => Boolean(loadVisionKey()))
  const [keyDraft, setKeyDraft] = useState('')

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onFile = async (file: File | undefined) => {
    if (!file || disabled) return
    if (preview) URL.revokeObjectURL(preview)
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    setError('')
    setMessage('')
    const key = resolveVisionKey()
    if (!key) {
      setHasKey(false)
      setError('Paste a free Gemini key below so AI can list the items. You can still type the amount.')
      return
    }
    setScanning(true)
    try {
      const { scan, previewUrl } = await scanReceiptPhoto({
        file,
        apiKey: key,
        baseCurrency: trip.baseCurrency,
        categories: trip.categories,
      })
      URL.revokeObjectURL(localUrl)
      setPreview(previewUrl)
      onApply(scan)
      setMessage('Review the items and total below, then save. Nothing is saved until you confirm.')
    } catch (err) {
      const scanErr = err instanceof ScanError ? err : null
      setError(scanErr?.message ?? 'Could not read that bill. Enter it manually.')
    } finally {
      setScanning(false)
    }
  }

  const clearPreview = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setError('')
    setMessage('')
  }

  return (
    <div className="space-y-2">
      <Group>
        <GroupRow className="items-start py-3">
          <Camera size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-medium">Scan bill</p>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">
              Take a photo or pick from your library. Gemini reads the items and total — you check, then save.
            </p>
          </div>
        </GroupRow>
        {!hasKey && (
          <div className="row-sep space-y-2 px-4 py-3">
            <p className="text-[13px] text-[var(--muted)]">
              Optional. Paste a Google Gemini API key on this phone. It never goes into the trip or invite link.
            </p>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!keyDraft.trim()}
              onClick={() => {
                saveVisionKey(keyDraft)
                setHasKey(true)
                setKeyDraft('')
                setError('')
                setMessage('Key saved on this phone. Take a photo or pick from the library.')
              }}
              className="pressable min-h-[44px] w-full rounded-full bg-[var(--accent)] text-[15px] font-semibold text-white disabled:opacity-40"
            >
              Save key
            </button>
            <p className="text-[13px] text-[var(--muted)]">
              Create one at{' '}
              <a
                className="text-[var(--accent)]"
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
              >
                Google AI Studio
              </a>
              . Free tier is enough.
            </p>
          </div>
        )}
        <div className="row-sep flex gap-2 px-4 py-3">
          <label className="pressable inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-3 text-[15px] font-semibold text-white has-[:disabled]:opacity-40">
            <Camera size={16} strokeWidth={2} />
            Take Photo
            <input
              type="file"
              accept="image/*,image/heic,image/heif,.heic,.heif"
              capture="environment"
              disabled={disabled || scanning}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void onFile(file)
              }}
            />
          </label>
          <label className="pressable inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[var(--fill)] px-3 text-[15px] font-semibold has-[:disabled]:opacity-40">
            <ImageIcon size={16} strokeWidth={2} />
            Library
            <input
              type="file"
              accept="image/*,image/heic,image/heif,.heic,.heif"
              disabled={disabled || scanning}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void onFile(file)
              }}
            />
          </label>
        </div>
      </Group>

      {(preview || scanning) && (
        <div className="flex items-center gap-3 rounded-[12px] bg-[var(--grouped)] p-3">
          {preview ? (
            <img
              src={preview}
              alt="Bill preview"
              className="h-16 w-16 shrink-0 rounded-[10px] object-cover"
            />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-[10px] bg-[var(--fill)]">
              <LoaderCircle size={20} className="animate-spin text-[var(--muted)]" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{scanning ? 'Gemini is reading the bill…' : 'Bill photo'}</p>
            <p className="text-[13px] text-[var(--muted)]">
              {scanning ? 'Reading items, total, and shop name.' : 'Attached to this draft only.'}
            </p>
          </div>
          {!scanning && (
            <button
              type="button"
              className="pressable grid h-11 w-11 place-items-center rounded-full text-[var(--muted)]"
              aria-label="Remove photo"
              onClick={clearPreview}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {scanning && (
        <p className="flex items-center gap-2 px-1 text-[13px] text-[var(--muted)]">
          <LoaderCircle size={14} className="animate-spin" />
          Hang tight — this stays on a draft until you tap Add Expense.
        </p>
      )}
      {message && <p className="px-1 text-[13px] font-medium text-[var(--accent)]">{message}</p>}
      {error && <p className="px-1 text-[13px] font-medium text-[var(--danger)]">{error}</p>}
    </div>
  )
}

export function ScanLines({
  items,
  currency,
  total,
}: {
  items: { name: string; amount: number }[]
  currency: string
  total?: number
}) {
  if (items.length === 0) return null
  const lineSum = items.reduce((sum, item) => sum + item.amount, 0)
  const gap = typeof total === 'number' && Number.isFinite(total) ? lineSum - total : null
  return (
    <div>
      <p className="mb-2 px-1 text-[13px] font-medium text-[var(--muted)]">
        Items on this bill · {items.length} {items.length === 1 ? 'line' : 'lines'}
      </p>
      <Group className="max-h-52 overflow-y-auto">
        {items.map((item, index) => (
          <GroupRow key={`${item.name}-${index}`}>
            <span className="min-w-0 flex-1 break-words text-[17px]">{item.name}</span>
            <span className="shrink-0 text-[17px] font-semibold tabular-nums">
              {formatMoney(item.amount, currency)}
            </span>
          </GroupRow>
        ))}
      </Group>
      <p className={cn('mt-2 px-1 text-[13px]', gap && Math.abs(gap) >= 0.005 ? 'text-[var(--danger)]' : 'text-[var(--muted)]')}>
        {gap != null && Math.abs(gap) >= 0.005
          ? `Items add to ${formatMoney(lineSum, currency)} · ${gap > 0 ? `${formatMoney(gap, currency)} more than the total` : `${formatMoney(-gap, currency)} less than the total`}. The split still uses the total.`
          : 'Check these, then edit the total above if needed. The split uses the total, not the item list.'}
      </p>
    </div>
  )
}
