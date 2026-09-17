import { ArrowLeft, Plus, Receipt, Scale, Settings2, Share } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EMPTY_FILTER, filterExpenses, isFilterActive, type ExpenseFilter } from '../lib/filter'
import { convertedLabel, formatMoney, isSettlement, splitLabel, tripTotalBase } from '../lib/money'
import { cn } from '../lib/utils'
import { useStore } from '../state'
import type { Expense, Trip } from '../types'
import { BalancesView } from './BalancesView'
import { ExpenseFilterBar } from './ExpenseFilters'
import { ExpenseForm } from './ExpenseForm'
import { TripHero } from './TripHero'
import { TripSettings } from './TripSettings'
import { Avatar, Button, Chevron, Group, GroupRow, Screen, SectionLabel, ThemeToggle } from './ui'

type Tab = 'expenses' | 'settle' | 'settings'

export function TripPage({ trip }: { trip: Trip }) {
  const { selectTrip, saveTrip, deleteTrip, notify, shareWithFriends } = useStore()
  const [tab, setTab] = useState<Tab>('expenses')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [filter, setFilter] = useState<ExpenseFilter>(EMPTY_FILTER)
  const [flashIds, setFlashIds] = useState<Set<string>>(() => new Set())
  const seenExpenseIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    const ids = new Set(trip.expenses.map((e) => e.id))
    const prev = seenExpenseIds.current
    seenExpenseIds.current = ids
    if (!prev) return
    const added = [...ids].filter((id) => !prev.has(id))
    if (added.length === 0) return
    setFlashIds(new Set(added))
    const handle = window.setTimeout(() => setFlashIds(new Set()), 1600)
    return () => window.clearTimeout(handle)
  }, [trip.expenses])

  const peopleById = useMemo(() => new Map(trip.people.map((p) => [p.id, p])), [trip.people])
  const cats = useMemo(() => new Map(trip.categories.map((c) => [c.id, c])), [trip.categories])
  const visibleExpenses = useMemo(() => filterExpenses(trip.expenses, filter), [trip.expenses, filter])
  const filtering = isFilterActive(filter)
  const showFiltered = tab === 'expenses' && filtering
  const spent = tripTotalBase(trip, showFiltered ? visibleExpenses : trip.expenses)
  const loggedCount = showFiltered ? visibleExpenses.length : trip.expenses.length

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>()
    const sorted = [...visibleExpenses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt)
    for (const e of sorted) {
      const key = e.date || 'Undated'
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [visibleExpenses])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const saveExpense = (expense: Expense, rate?: { currency: string; rate: number }) => {
    const rates = rate ? { ...trip.rates, [rate.currency]: rate.rate } : trip.rates
    const exists = trip.expenses.some((e) => e.id === expense.id)
    saveTrip({
      ...trip,
      rates,
      expenses: exists
        ? trip.expenses.map((e) => (e.id === expense.id ? { ...expense, updatedAt: Date.now() } : e))
        : [{ ...expense, updatedAt: Date.now() }, ...trip.expenses],
    })
    setFormOpen(false)
    setEditing(null)
    notify(exists ? 'Expense updated' : 'Expense added')
  }

  return (
    <Screen className="pb-36 pt-0 sm:pb-16">
      <div className="sticky top-0 z-20 -mx-4 flex min-h-12 items-center justify-between bg-[var(--nav-bg)] px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 sm:px-4">
        <button
          type="button"
          onClick={() => selectTrip(null)}
          className="pressable inline-flex min-h-[44px] items-center gap-0.5 rounded-full px-2 py-2 text-[17px] text-[var(--accent)]"
        >
          <ArrowLeft size={20} strokeWidth={2} />
          Trips
        </button>
        <div className="hidden gap-1 rounded-[9px] bg-[var(--fill)] p-[2px] sm:flex">
          <TabBtn on={tab === 'expenses'} onClick={() => setTab('expenses')} icon={<Receipt size={15} strokeWidth={1.75} />} label="Expenses" compact />
          <TabBtn on={tab === 'settle'} onClick={() => setTab('settle')} icon={<Scale size={15} strokeWidth={1.75} />} label="Settle" compact />
          <TabBtn on={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings2 size={15} strokeWidth={1.75} />} label="Trip" compact />
        </div>
        <div className="mr-1 flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void shareWithFriends(trip)}
            className="pressable inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--fill)] text-[var(--accent)]"
            aria-label="Invite friends"
          >
            <Share size={16} strokeWidth={2} />
          </button>
          {tab !== 'settings' ? (
            <button
              type="button"
              onClick={openNew}
              className="pressable inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white"
              aria-label="Add expense"
            >
              <Plus size={18} strokeWidth={2.25} />
            </button>
          ) : (
            <span className="w-9" />
          )}
        </div>
      </div>

      <header className="pt-1">
        <TripHero
          trip={trip}
          onDestinationChange={(destinationId) => saveTrip({ ...trip, destinationId })}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[12px] bg-[var(--grouped)] px-4 py-3">
            <p className="text-[13px] text-[var(--muted)]">{showFiltered ? 'Filtered' : 'Spent'}</p>
            <p className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">
              {formatMoney(spent, trip.baseCurrency)}
            </p>
          </div>
          <div className="rounded-[12px] bg-[var(--grouped)] px-4 py-3">
            <p className="text-[13px] text-[var(--muted)]">{showFiltered ? 'Showing' : 'Logged'}</p>
            <p className="mt-0.5 text-[22px] font-semibold tracking-tight">
              {loggedCount} {loggedCount === 1 ? 'bill' : 'bills'}
              {showFiltered ? ` of ${trip.expenses.length}` : ''}
            </p>
          </div>
        </div>
        {tab === 'expenses' && trip.expenses.length > 0 && (
          <ExpenseFilterBar trip={trip} filter={filter} onChange={setFilter} />
        )}
      </header>

      <div className="mt-2">
        {tab === 'expenses' && (
          <div>
            {trip.expenses.length === 0 ? (
              <div className="mt-8 flex flex-col items-center px-6 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-[var(--grouped)] text-[var(--muted)]">
                  <Receipt size={28} strokeWidth={1.5} />
                </span>
                <p className="title-3 mt-4">No expenses yet</p>
                <p className="mt-1 text-[15px] text-[var(--muted)]">Add a taxi, meal, or stay to get started.</p>
                <Button className="mt-5" onClick={openNew}>
                  <Plus size={16} strokeWidth={2.25} /> Add Expense
                </Button>
              </div>
            ) : grouped.length === 0 ? (
              <div className="mt-8 flex flex-col items-center px-6 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-[var(--grouped)] text-[var(--muted)]">
                  <Receipt size={28} strokeWidth={1.5} />
                </span>
                <p className="title-3 mt-4">Nothing matches</p>
                <p className="mt-1 text-[15px] text-[var(--muted)]">Try another friend or category, or clear the filter.</p>
                <Button className="mt-5" variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
                  Clear Filter
                </Button>
              </div>
            ) : (
              grouped.map(([date, items]) => (
                <section key={date}>
                  <SectionLabel>{prettyDate(date)}</SectionLabel>
                  <Group>
                    {items.map((expense) => {
                      const payer = peopleById.get(expense.paidBy)
                      const cat = cats.get(expense.categoryId)
                      const splitPeople = expense.participantIds
                        .map((id) => peopleById.get(id))
                        .filter((p): p is NonNullable<typeof p> => Boolean(p))
                      return (
                        <GroupRow
                          key={expense.id}
                          inset
                          onClick={() => {
                            setEditing(expense)
                            setFormOpen(true)
                          }}
                          className={flashIds.has(expense.id) ? 'row-flash py-3' : 'py-3'}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--fill)] text-[18px]">
                            {cat?.emoji ?? '📦'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[17px] font-medium">
                              {expense.note.trim() || cat?.name || 'Expense'}
                              {isSettlement(trip, expense) ? ' · Payment' : ''}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
                              {payer && <Avatar person={payer} size="sm" />}
                              <span className="truncate">
                                {payer ? `${payer.name} paid` : 'Paid'}
                                {' · '}
                                {splitLabel(expense.splitMode, splitPeople.length, trip.people.length)}
                              </span>
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-[17px] font-semibold tabular-nums">
                              {formatMoney(expense.amount, expense.currency)}
                            </span>
                            {expense.currency !== trip.baseCurrency && (
                              <span className="text-[12px] text-[var(--muted)]">
                                {convertedLabel(trip, expense.amount, expense.currency)}
                              </span>
                            )}
                          </span>
                          <Chevron />
                        </GroupRow>
                      )
                    })}
                  </Group>
                </section>
              ))
            )}
          </div>
        )}

        {tab === 'settle' && (
          <BalancesView
            trip={trip}
            onLogSettlement={(next) => {
              saveTrip(next)
              notify('Payment logged')
            }}
          />
        )}

        {tab === 'settings' && (
          <TripSettings
            trip={trip}
            onChange={saveTrip}
            onDeleteTrip={() => {
              deleteTrip(trip.id)
              notify('Trip deleted')
            }}
            onNotify={notify}
          />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--nav-bg)] px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl backdrop-saturate-150 sm:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          <TabBtn on={tab === 'expenses'} onClick={() => setTab('expenses')} icon={<Receipt size={22} strokeWidth={1.75} />} label="Expenses" />
          <TabBtn on={tab === 'settle'} onClick={() => setTab('settle')} icon={<Scale size={22} strokeWidth={1.75} />} label="Settle" />
          <TabBtn on={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings2 size={22} strokeWidth={1.75} />} label="Trip" />
        </div>
      </nav>

      {formOpen && (
        <ExpenseForm
          key={editing?.id ?? 'new'}
          trip={trip}
          expense={editing}
          open={formOpen}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSave={saveExpense}
          onDelete={(id) => {
            saveTrip({
              ...trip,
              expenses: trip.expenses.filter((e) => e.id !== id),
              deletedExpenseIds: [...new Set([...(trip.deletedExpenseIds ?? []), id])],
            })
            setFormOpen(false)
            setEditing(null)
            notify('Expense deleted')
          }}
        />
      )}
    </Screen>
  )
}

function TabBtn({
  on,
  onClick,
  icon,
  label,
  compact,
}: {
  on: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-[7px] font-medium',
        compact
          ? 'min-h-[36px] px-3 py-1.5 text-[13px]'
          : 'min-h-[44px] min-w-[4.5rem] flex-col gap-0.5 px-3 py-1 text-[10px]',
        on ? 'text-[var(--accent)]' : 'text-[var(--muted)]',
        compact && on && 'bg-white text-black shadow-sm dark:bg-[var(--grouped-3)] dark:text-white',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function prettyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
