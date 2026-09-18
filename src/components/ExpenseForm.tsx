import { useMemo, useState } from 'react'
import {
  equalPercents,
  equalShares,
  formatMoney,
  percentToAmounts,
  percentsMatch100,
  roundTo,
  sharesMatchTotal,
  sharesSum,
} from '../lib/money'
import { parseExpenseDate } from '../lib/dates'
import type { ReceiptScan } from '../lib/receipt'
import { cn, todayISO, uid } from '../lib/utils'
import type { Expense, SplitMode, Trip } from '../types'
import { BillScanPanel, ScanLines } from './BillScan'
import { CurrencyPicker } from './CurrencyPicker'
import { Avatar, Button, Group, GroupRow, Modal, Segmented, TextInput } from './ui'

type Props = {
  trip: Trip
  expense?: Expense | null
  open: boolean
  onClose: () => void
  onSave: (expense: Expense, rate?: { currency: string; rate: number }) => void
  onDelete?: (id: string) => void
}

const SPLIT_TABS: { id: SplitMode; label: string }[] = [
  { id: 'equal', label: 'Equal' },
  { id: 'custom', label: 'Amounts' },
  { id: 'percent', label: '%' },
]

export function ExpenseForm({ trip, expense, open, onClose, onSave, onDelete }: Props) {
  const editing = Boolean(expense)
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [currency, setCurrency] = useState(expense?.currency ?? trip.baseCurrency)
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? trip.people[0]?.id ?? '')
  const [participants, setParticipants] = useState<string[]>(
    expense?.participantIds ?? trip.people.map((p) => p.id),
  )
  const [splitMode, setSplitMode] = useState<SplitMode>(expense?.splitMode ?? 'equal')
  const [amountShares, setAmountShares] = useState<Record<string, string>>(() => {
    if (expense?.splitMode === 'custom' && expense.shares) {
      return Object.fromEntries(Object.entries(expense.shares).map(([k, v]) => [k, String(v)]))
    }
    return {}
  })
  const [percentShares, setPercentShares] = useState<Record<string, string>>(() => {
    if (expense?.splitMode === 'percent' && expense.shares) {
      return Object.fromEntries(Object.entries(expense.shares).map(([k, v]) => [k, String(v)]))
    }
    return {}
  })
  const [categoryId, setCategoryId] = useState(
    expense?.categoryId ?? trip.categories.find((c) => c.id !== 'settlement')?.id ?? trip.categories[0]?.id,
  )
  const [note, setNote] = useState(expense?.note ?? '')
  const [date, setDate] = useState(parseExpenseDate(expense?.date) || expense?.date || todayISO())
  const [rateDraft, setRateDraft] = useState(() => {
    const r = trip.rates[expense?.currency ?? trip.baseCurrency]
    return r ? String(roundTo(r, 8)) : '1'
  })
  const [error, setError] = useState('')
  const [scanLines, setScanLines] = useState<{ name: string; amount: number }[]>([])

  const parsedAmount = Number(amount)
  const rate = Number(rateDraft)
  const hasRate = currency === trip.baseCurrency || (Number.isFinite(rate) && rate > 0)
  const converted =
    Number.isFinite(parsedAmount) && hasRate
      ? currency === trip.baseCurrency
        ? parsedAmount
        : parsedAmount * rate
      : null

  const equal = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || participants.length === 0) return {}
    return equalShares(parsedAmount, participants, currency)
  }, [parsedAmount, participants, currency])

  const parsedAmounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const id of participants) {
      const n = Number(amountShares[id])
      out[id] = Number.isFinite(n) ? n : 0
    }
    return out
  }, [participants, amountShares])

  const parsedPercents = useMemo(() => {
    const out: Record<string, number> = {}
    for (const id of participants) {
      const n = Number(percentShares[id])
      out[id] = Number.isFinite(n) ? n : 0
    }
    return out
  }, [participants, percentShares])

  const percentAmounts = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || participants.length === 0) return {}
    return percentToAmounts(parsedAmount, parsedPercents, participants, currency)
  }, [parsedAmount, parsedPercents, participants, currency])

  const amountLeft = Number.isFinite(parsedAmount) ? parsedAmount - sharesSum(parsedAmounts) : 0
  const percentLeft = 100 - sharesSum(parsedPercents)

  const togglePerson = (id: string) => {
    setParticipants((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }

  const fillEqualAmounts = (ids: string[] = participants) => {
    if (!Number.isFinite(parsedAmount) || ids.length === 0) return
    setAmountShares(Object.fromEntries(Object.entries(equalShares(parsedAmount, ids, currency)).map(([k, v]) => [k, String(v)])))
  }

  const fillEqualPercents = (ids: string[] = participants) => {
    setPercentShares(Object.fromEntries(Object.entries(equalPercents(ids)).map(([k, v]) => [k, String(v)])))
  }

  const setMode = (mode: SplitMode) => {
    setSplitMode(mode)
    if (mode === 'custom') fillEqualAmounts()
    if (mode === 'percent') fillEqualPercents()
  }

  const applyScan = (scan: ReceiptScan) => {
    if (scan.amount !== undefined) setAmount(String(scan.amount))
    if (scan.currency) {
      setCurrency(scan.currency)
      const existing = trip.rates[scan.currency]
      setRateDraft(existing ? String(roundTo(existing, 8)) : '1')
    }
    if (scan.note) setNote(scan.note)
    if (scan.date) setDate(parseExpenseDate(scan.date) || scan.date)
    if (scan.categoryId) setCategoryId(scan.categoryId)
    setScanLines(scan.lineItems ?? [])
    setError('')
  }

  const submit = () => {
    setError('')
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!paidBy) {
      setError('Who paid?')
      return
    }
    if (participants.length === 0) {
      setError('Include at least one person on this bill.')
      return
    }
    if (splitMode === 'custom' && !sharesMatchTotal(parsedAmounts, parsedAmount, currency)) {
      setError(`Amounts must add up to ${formatMoney(parsedAmount, currency)}.`)
      return
    }
    if (splitMode === 'percent' && !percentsMatch100(parsedPercents, participants)) {
      setError('Percentages must add up to 100%.')
      return
    }
    if (currency !== trip.baseCurrency && (!Number.isFinite(rate) || rate <= 0)) {
      setError('Set a conversion rate first.')
      return
    }
    const next: Expense = {
      id: expense?.id ?? uid(),
      amount: parsedAmount,
      currency,
      paidBy,
      participantIds: participants,
      splitMode,
      shares: splitMode === 'custom' ? parsedAmounts : splitMode === 'percent' ? parsedPercents : undefined,
      categoryId,
      note: note.trim(),
      date: parseExpenseDate(date) || date,
      createdAt: expense?.createdAt ?? Date.now(),
    }
    onSave(next, currency === trip.baseCurrency ? undefined : { currency, rate })
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Expense' : 'Add Expense'} wide>
      {trip.people.length === 0 ? (
        <p className="text-[15px] text-[var(--muted)]">Add friends to the trip before logging expenses.</p>
      ) : (
        <div className="space-y-4">
          <BillScanPanel trip={trip} onApply={applyScan} />
          {scanLines.length > 0 && <ScanLines items={scanLines} currency={currency} />}

          <Group>
            <GroupRow>
              <span className="w-[5.75rem] shrink-0 text-[17px] text-[var(--muted)]">Amount</span>
              <TextInput
                className="rounded-none bg-transparent px-0 py-0 text-right text-[22px] font-semibold tabular-nums dark:bg-transparent"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </GroupRow>
            <GroupRow>
              <span className="w-[5.75rem] shrink-0 text-[17px] text-[var(--muted)]">Currency</span>
              <CurrencyPicker
                showName={false}
                value={currency}
                onChange={(code) => {
                  setCurrency(code)
                  const existing = trip.rates[code]
                  setRateDraft(existing ? String(roundTo(existing, 8)) : '1')
                }}
              />
            </GroupRow>
            <GroupRow>
              <span className="w-[5.75rem] shrink-0 text-[17px] text-[var(--muted)]">Date</span>
              <TextInput
                className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
                type="date"
                value={parseExpenseDate(date) || ''}
                onChange={(e) => setDate(e.target.value)}
              />
            </GroupRow>
            <GroupRow>
              <span className="w-[5.75rem] shrink-0 text-[17px] text-[var(--muted)]">Note</span>
              <TextInput
                className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nasi goreng, taxi…"
              />
            </GroupRow>
          </Group>

          {currency !== trip.baseCurrency && (
            <Group>
              <GroupRow className="flex-wrap">
                <span className="w-full text-[13px] text-[var(--muted)]">Rate to {trip.baseCurrency}</span>
                <span className="text-[17px]">1 {currency} =</span>
                <TextInput
                  inputMode="decimal"
                  className="max-w-[9rem] rounded-xl bg-[var(--fill)] px-3 py-2 text-right dark:bg-black/30"
                  value={rateDraft}
                  onChange={(e) => setRateDraft(e.target.value)}
                />
                <span className="text-[17px]">{trip.baseCurrency}</span>
              </GroupRow>
              {converted !== null && (
                <GroupRow>
                  <span className="flex-1 text-[15px] text-[var(--muted)]">Converts to</span>
                  <span className="text-[15px] font-semibold tabular-nums">
                    {formatMoney(converted, trip.baseCurrency)}
                  </span>
                </GroupRow>
              )}
            </Group>
          )}

          <div>
            <p className="mb-2 px-1 text-[13px] text-[var(--muted)]">Who paid</p>
            <div className="flex flex-wrap gap-2">
              {trip.people.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPaidBy(p.id)}
                  data-on={paidBy === p.id}
                  className={cn(
                    'chip flex min-h-[44px] items-center gap-2 rounded-full px-2.5 py-1.5 pr-3 text-[15px] font-medium',
                    paidBy === p.id ? 'text-white' : 'bg-[var(--fill)]',
                  )}
                  style={paidBy === p.id ? { background: p.color } : undefined}
                >
                  <Avatar person={p} size="sm" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 px-1 text-[13px] text-[var(--muted)]">Split</p>
            <Segmented
              options={SPLIT_TABS}
              value={splitMode}
              onChange={(id) => setMode(id as SplitMode)}
            />
            <p className="mt-2 px-1 text-[13px] text-[var(--muted)]">
              Tap In / Out to leave someone off this expense.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="min-h-[36px] rounded-full bg-[var(--fill)] px-3 py-1.5 text-[13px] font-medium"
                onClick={() => {
                  const ids = trip.people.map((p) => p.id)
                  setParticipants(ids)
                  if (splitMode === 'custom') fillEqualAmounts(ids)
                  if (splitMode === 'percent') fillEqualPercents(ids)
                }}
              >
                Everyone
              </button>
              <button
                type="button"
                className="min-h-[36px] rounded-full bg-[var(--fill)] px-3 py-1.5 text-[13px] font-medium"
                onClick={() => {
                  if (!paidBy) return
                  setParticipants([paidBy])
                  if (splitMode === 'custom') fillEqualAmounts([paidBy])
                  if (splitMode === 'percent') fillEqualPercents([paidBy])
                }}
              >
                Just payer
              </button>
            </div>

            <Group className="mt-3">
              {trip.people.map((p) => {
                const on = participants.includes(p.id)
                return (
                  <GroupRow key={p.id} inset className={cn('flex-wrap', !on && 'opacity-45')}>
                    <Avatar person={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[17px]">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => togglePerson(p.id)}
                      className={cn(
                        'min-h-[32px] min-w-[44px] rounded-full px-3 py-1 text-[13px] font-semibold',
                        on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill)] text-[var(--muted)]',
                      )}
                    >
                      {on ? 'In' : 'Out'}
                    </button>
                    {on && splitMode === 'equal' && Number.isFinite(parsedAmount) && (
                      <span className="w-full text-right text-[15px] tabular-nums text-[var(--muted)] sm:w-auto">
                        {formatMoney(equal[p.id] ?? 0, currency)}
                      </span>
                    )}
                    {on && splitMode === 'custom' && (
                      <TextInput
                        inputMode="decimal"
                        className="w-28 rounded-xl bg-[var(--fill)] py-2 text-right dark:bg-black/30"
                        value={amountShares[p.id] ?? ''}
                        onChange={(e) => setAmountShares((s) => ({ ...s, [p.id]: e.target.value }))}
                        placeholder="0"
                        aria-label={`${p.name} amount`}
                      />
                    )}
                    {on && splitMode === 'percent' && (
                      <div className="flex items-center gap-1">
                        <TextInput
                          inputMode="decimal"
                          className="w-20 rounded-xl bg-[var(--fill)] py-2 text-right dark:bg-black/30"
                          value={percentShares[p.id] ?? ''}
                          onChange={(e) => setPercentShares((s) => ({ ...s, [p.id]: e.target.value }))}
                          placeholder="0"
                          aria-label={`${p.name} percent`}
                        />
                        <span className="text-[15px] font-medium">%</span>
                        {Number.isFinite(parsedAmount) && (
                          <span className="hidden text-[13px] text-[var(--muted)] sm:inline">
                            {formatMoney(percentAmounts[p.id] ?? 0, currency)}
                          </span>
                        )}
                      </div>
                    )}
                  </GroupRow>
                )
              })}
            </Group>

            {splitMode === 'equal' && Number.isFinite(parsedAmount) && participants.length > 0 && (
              <p className="mt-2 px-1 text-[13px] text-[var(--muted)]">
                {participants.length} {participants.length === 1 ? 'person' : 'people'} ·{' '}
                {formatMoney(equal[participants[0]] ?? 0, currency)} each
              </p>
            )}
            {splitMode === 'custom' && Number.isFinite(parsedAmount) && (
              <p
                className={cn(
                  'mt-2 px-1 text-[13px] font-medium',
                  Math.abs(amountLeft) < 0.005 ? 'text-[var(--muted)]' : 'text-[var(--danger)]',
                )}
              >
                {Math.abs(amountLeft) < 0.005
                  ? `Adds up to ${formatMoney(parsedAmount, currency)}`
                  : `${formatMoney(Math.abs(amountLeft), currency)} ${amountLeft > 0 ? 'left' : 'over'}`}
              </p>
            )}
            {splitMode === 'percent' && (
              <p
                className={cn(
                  'mt-2 px-1 text-[13px] font-medium',
                  Math.abs(percentLeft) < 0.005 ? 'text-[var(--muted)]' : 'text-[var(--danger)]',
                )}
              >
                {Math.abs(percentLeft) < 0.005
                  ? 'Adds up to 100%'
                  : `${roundTo(Math.abs(percentLeft), 2)}% ${percentLeft > 0 ? 'left' : 'over'}`}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 px-1 text-[13px] text-[var(--muted)]">Category</p>
            <div className="flex flex-wrap gap-2">
              {trip.categories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'min-h-[36px] rounded-full px-3 py-1.5 text-[15px] font-medium',
                    categoryId === c.id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill)]',
                  )}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[15px] font-medium text-[var(--danger)]">{error}</p>}

          <div className="flex flex-col gap-2 pb-2">
            <Button className="w-full" onClick={submit}>
              {editing ? 'Save Changes' : 'Add Expense'}
            </Button>
            {editing && onDelete && expense && (
              <Button variant="ghost" className="w-full text-[var(--danger)]" onClick={() => onDelete(expense.id)}>
                Delete Expense
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
