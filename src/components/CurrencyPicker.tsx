import { useMemo, useState } from 'react'
import { CURRENCIES, getCurrency } from '../lib/currencies'
import { cn } from '../lib/utils'

export function CurrencyPicker({
  value,
  onChange,
  showName = true,
}: {
  value: string
  onChange: (code: string) => void
  showName?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = getCurrency(value)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CURRENCIES
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[32px] items-center justify-end gap-2 text-right text-[17px]"
        aria-expanded={open}
      >
        <span className="truncate">
          {showName ? `${current.code} — ${current.name}` : `${current.code} ${current.symbol}`}
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded-[12px] bg-[var(--fill)] p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search AED, peso, yen…"
            className="w-full rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2 text-[15px] outline-none ring-[var(--accent)] focus:ring-2"
          />
          <div className="mt-1 max-h-52 overflow-y-auto overscroll-contain">
            {matches.length === 0 ? (
              <p className="px-2 py-3 text-[14px] text-[var(--muted)]">No matches</p>
            ) : (
              matches.map((c) => (
                <button
                  type="button"
                  key={c.code}
                  onClick={() => {
                    onChange(c.code)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-[10px] px-2.5 py-2 text-left text-[15px]',
                    c.code === value ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'hover:bg-[var(--fill)]',
                  )}
                >
                  <span className="font-semibold tabular-nums">{c.code}</span>
                  <span className="truncate text-[13px] text-[var(--muted)]">{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
