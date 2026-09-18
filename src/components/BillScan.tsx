import { Camera, ImageIcon, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatMoney } from '../lib/money'
import { resolveVisionKey, ScanError, scanReceiptPhoto, type ReceiptScan } from '../lib/receipt'
import type { Trip } from '../types'
import { Group, GroupRow } from './ui'

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
      setError('Connect Gemini in Scan bills (Home or Trip settings), then try the photo again.')
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
      setMessage('Review the fields below, then save. Nothing is saved until you confirm.')
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
              Gemini reads the photo. Check every field before saving.
            </p>
          </div>
        </GroupRow>
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
              {scanning ? 'Amount, currency, shop, and line items.' : 'Attached to this draft only.'}
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
}: {
  items: { name: string; amount: number }[]
  currency: string
}) {
  if (items.length === 0) return null
  return (
    <div className="max-h-52 overflow-y-auto rounded-[12px] bg-[var(--grouped)] px-4 py-3">
      <p className="text-[13px] text-[var(--muted)]">
        Seen on the bill · {items.length} {items.length === 1 ? 'line' : 'lines'}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className="min-w-0 break-words">{item.name}</span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">{formatMoney(item.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
