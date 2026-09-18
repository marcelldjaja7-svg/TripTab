import { ArrowUpRight, Check, Copy, Crown } from 'lucide-react'
import { formatMoney, tripTotalBase } from '../lib/money'
import { describeTransfer } from '../lib/share'
import {
  computeBalances,
  describeBalance,
  describeSettled,
  personSpendPaid,
  settlementExpense,
  suggestedTransfers,
} from '../lib/settle'
import { cn } from '../lib/utils'
import type { Person, Trip } from '../types'
import { Avatar, Button, Group, GroupRow, SectionLabel } from './ui'

const ROLLER_TITLES = [
  'THE HIGH ROLLER',
  'The good-time funder',
  'In for the ride',
  'Traveling light',
  'On the rail',
  'Small stack',
]

export function BalancesView({
  trip,
  onLogSettlement,
}: {
  trip: Trip
  onLogSettlement: (next: Trip) => void
}) {
  const rows = computeBalances(trip)
  const byShare = [...rows].sort((a, b) => b.share - a.share || b.paid - a.paid)
  const transfers = suggestedTransfers(trip)
  const spent = tripTotalBase(trip)
  const ranked = [...rows]
    .sort((a, b) => personSpendPaid(trip, b.personId) - personSpendPaid(trip, a.personId))
    .map((b) => {
      const person = trip.people.find((p) => p.id === b.personId)
      return person ? { ...b, person, paid: personSpendPaid(trip, b.personId) } : null
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
  const podium = ranked.slice(0, 3)
  const first = podium[0]
  const second = podium[1]
  const third = podium[2]

  return (
    <div className="pb-4">
      <SectionLabel>Each person's split</SectionLabel>
      <p className="mb-2 px-4 text-[13px] text-[var(--muted)]">
        The large amount is this friend's share of the trip: personal bills stay with them, equal
        splits divide evenly, custom and percent use the amounts on the bill. Paid is who covered
        the card. Settle-up payments move the net, not trip spend.
      </p>
      <Group>
        {byShare.map((row) => {
          const person = trip.people.find((p) => p.id === row.personId)
          if (!person) return null
          const settled = describeSettled(row, trip.baseCurrency)
          return (
            <GroupRow key={row.personId} className="items-start py-3">
              <Avatar person={person} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-medium">{person.name}</p>
                <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                  Paid {formatMoney(row.paid, trip.baseCurrency)}
                  {settled ? (
                    <>
                      <span className="mx-1.5">·</span>
                      {settled}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[17px] font-semibold tabular-nums">{formatMoney(row.share, trip.baseCurrency)}</p>
                <p
                  className={cn(
                    'mt-0.5 text-[13px] font-semibold tabular-nums',
                    Math.abs(row.net) < 0.005 ? 'text-[var(--muted)]' : row.net > 0 ? 'text-[var(--accent)]' : '',
                  )}
                >
                  {describeBalance(row, trip.baseCurrency)}
                </p>
              </div>
            </GroupRow>
          )
        })}
      </Group>
      <p className="mt-2 px-4 text-[13px] text-[var(--muted)]">
        Splits add up to {formatMoney(spent, trip.baseCurrency)} spent
      </p>

      <p className="px-1 pb-1.5 pt-6 text-[13px] font-normal uppercase tracking-[0.04em] text-[var(--muted)]">
        Suggested payments
      </p>
      {transfers.length === 0 ? (
        <div className="rounded-[16px] bg-[var(--grouped)] px-4 py-3">
          <p className="text-[15px] text-[var(--muted)]">The table is even. Nobody owes anybody.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] bg-[var(--grouped)]">
          {transfers.map((t) => {
            const from = trip.people.find((p) => p.id === t.fromId)
            const to = trip.people.find((p) => p.id === t.toId)
            if (!from || !to) return null
            return (
              <div
                key={`${t.fromId}-${t.toId}-${t.amount}`}
                className="row-sep relative flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="relative h-9 w-14 shrink-0">
                    <span className="absolute left-0 top-0">
                      <Avatar person={from} />
                    </span>
                    <span className="absolute left-5 top-0">
                      <Avatar person={to} />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-medium">
                      {from.name} <span className="text-[var(--muted)]">to</span> {to.name}
                    </p>
                    <p className="flex items-center gap-1 text-[15px] font-semibold tabular-nums">
                      <ArrowUpRight size={14} strokeWidth={2} className="text-[var(--accent)]" />
                      {formatMoney(t.amount, trip.baseCurrency)}
                    </p>
                  </div>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    variant="secondary"
                    className="flex-1 px-3 py-2 text-[15px] sm:flex-none"
                    onClick={async () => {
                      await navigator.clipboard.writeText(describeTransfer(trip, t))
                    }}
                  >
                    <Copy size={14} strokeWidth={2} /> Copy
                  </Button>
                  <Button
                    className="flex-1 px-3 py-2 text-[15px] sm:flex-none"
                    onClick={() => {
                      onLogSettlement({
                        ...trip,
                        expenses: [...trip.expenses, settlementExpense(trip, t.fromId, t.toId, t.amount)],
                      })
                    }}
                  >
                    <Check size={14} strokeWidth={2.25} /> Log
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <article className="casino-felt relative mt-6 overflow-hidden rounded-[28px] px-4 pb-5 pt-6 text-[#f4e7c3] sm:px-6">
        <span className="absolute left-4 top-4 text-[16px] text-[#d4af37]/70">♠</span>
        <span className="absolute right-4 top-4 text-[16px] text-[#d4af37]/70">♦</span>
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.34em] text-[#d4af37]">
          The TripTab Club
        </p>
        <h2 className="casino-serif mt-2 text-center text-[34px] leading-none tracking-tight text-[#f6e7b2] sm:text-[40px]">
          High Rollers
        </h2>
        <p className="mt-2 text-center text-[14px] text-[#d9c48a]/80">Who covered the bills — not their split.</p>

        {ranked.length === 0 ? (
          <p className="mt-8 pb-4 text-center text-[15px] text-[#d9c48a]/70">Add friends to open the table.</p>
        ) : (
          <>
            <div className="mt-5 flex items-end justify-center gap-3 sm:gap-5">
              {second ? <PodiumSeat place={2} person={second.person} paid={second.paid} currency={trip.baseCurrency} /> : <span className="w-[5.5rem]" />}
              {first ? <PodiumSeat place={1} person={first.person} paid={first.paid} currency={trip.baseCurrency} /> : null}
              {third ? <PodiumSeat place={3} person={third.person} paid={third.paid} currency={trip.baseCurrency} /> : <span className="w-[5.5rem]" />}
            </div>

            <ol className="mt-4 space-y-0.5">
              {ranked.map((row, index) => (
                <li
                  key={row.personId}
                  className="flex items-center gap-3 rounded-[14px] px-2 py-1.5"
                >
                  <span className="w-7 text-center font-semibold tabular-nums text-[#d4af37]/80">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Avatar person={row.person} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold text-[#f7efd2]">{row.person.name}</p>
                    <p className={cn('truncate text-[12px]', index === 0 ? 'font-semibold tracking-wide text-[#d4af37]' : 'text-[#cbb98a]/75')}>
                      {titleForRank(index, row.paid)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-semibold tabular-nums text-[#f6e7b2]">
                      {formatMoney(row.paid, trip.baseCurrency)}
                    </p>
                    <p className="text-[11px] tabular-nums text-[#d4af37]/70">
                      split {formatMoney(row.share, trip.baseCurrency)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-[#d4af37]/55">
              ♣ Ranked by bills paid · split is their cut ♣
            </p>
          </>
        )}
      </article>
    </div>
  )
}

function titleForRank(index: number, paid: number): string {
  if (paid <= 0) return 'Sitting this one out'
  return ROLLER_TITLES[index] ?? 'At the table'
}

function PodiumSeat({
  place,
  person,
  paid,
  currency,
}: {
  place: 1 | 2 | 3
  person: Person
  paid: number
  currency: string
}) {
  const champion = place === 1
  return (
    <div className={cn('flex w-[5.75rem] flex-col items-center sm:w-[6.5rem]', champion && '-mt-3 w-[6.75rem] sm:w-[7.5rem]')}>
      <div
        className={cn(
          'relative grid place-items-center rounded-full font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)]',
          champion
            ? 'casino-chip h-[4.6rem] w-[4.6rem] text-[22px]'
            : 'h-[3.4rem] w-[3.4rem] text-[16px] ring-[5px] ring-[#1f6b45]',
        )}
        style={!champion ? { background: person.color } : undefined}
      >
        {champion && (
          <Crown
            size={16}
            strokeWidth={2}
            className="absolute -top-3 text-[#f6e7b2] drop-shadow"
          />
        )}
        {person.name.trim().charAt(0).toUpperCase() || '?'}
      </div>
      <p className="mt-2 truncate text-center text-[14px] font-semibold text-[#f7efd2]">{person.name}</p>
      <p className="text-center text-[12px] tabular-nums text-[#d4af37]">{formatMoney(paid, currency)}</p>
      <div
        className={cn(
          'mt-2 grid w-full place-items-center rounded-t-[12px] font-serif text-[22px] font-semibold text-[#f6e7b2]',
          place === 1 && 'h-14 bg-gradient-to-b from-[#c9a227] to-[#7a5b12]',
          place === 2 && 'h-10 bg-[#1f4d38] text-[#c9d6cc]',
          place === 3 && 'h-8 bg-[#16382a] text-[#b7c4bb]',
        )}
      >
        {place}
      </div>
    </div>
  )
}
