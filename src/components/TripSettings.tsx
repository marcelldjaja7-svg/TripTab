import { Copy, Download, RefreshCw, Share, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PERSON_COLORS, TRIP_EMOJIS } from '../lib/colors'
import { convertRatesToNewBase, CURRENCY_CODES, fetchLiveRates } from '../lib/currencies'
import { DESTINATIONS } from '../lib/destinations'
import { inverseRate, roundTo } from '../lib/money'
import { downloadJson, shareUrlForTrip, slugify, tripSummaryText } from '../lib/share'
import { normalizeAppData, normalizeTrip } from '../lib/storage'
import { cn, uid } from '../lib/utils'
import { useStore } from '../state'
import type { Trip } from '../types'
import { CurrencyPicker } from './CurrencyPicker'
import { ScanSettings } from './ScanSettings'
import { Avatar, Group, GroupRow, SectionLabel, Select, TextInput } from './ui'

export function TripSettings({
  trip,
  onChange,
  onDeleteTrip,
  onNotify,
}: {
  trip: Trip
  onChange: (trip: Trip) => void
  onDeleteTrip: () => void
  onNotify: (message: string) => void
}) {
  const { shareWithFriends } = useStore()
  const [fetching, setFetching] = useState(false)
  const [newFriend, setNewFriend] = useState('')
  const [newCat, setNewCat] = useState('')

  const usedCurrencies = Array.from(
    new Set([trip.baseCurrency, ...trip.expenses.map((e) => e.currency), ...CURRENCY_CODES]),
  )

  const copySummary = async () => {
    await navigator.clipboard.writeText(tripSummaryText(trip))
    onNotify('Summary copied')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrlForTrip(trip))
      onNotify('Invite link copied')
    } catch {
      onNotify('Could not copy link')
    }
  }

  const pullRates = async () => {
    setFetching(true)
    const live = await fetchLiveRates(trip.baseCurrency)
    setFetching(false)
    if (!live) {
      onNotify('Live rates unavailable — edit manually')
      return
    }
    onChange({
      ...trip,
      rates: { ...trip.rates, ...live, [trip.baseCurrency]: 1 },
      ratesUpdatedAt: new Date().toISOString(),
    })
    onNotify('Rates updated from Frankfurter')
  }

  const involved = (personId: string) =>
    trip.expenses.some((e) => e.paidBy === personId || e.participantIds.includes(personId))

  return (
    <div className="pb-4">
      <SectionLabel>Trip</SectionLabel>
      <div className="mb-3 flex flex-wrap gap-1">
        {TRIP_EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => onChange({ ...trip, emoji: e })}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-[10px] text-[18px]',
              trip.emoji === e ? 'bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--fill)]',
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <Group>
        <GroupRow>
          <span className="w-[5.5rem] shrink-0 text-[17px] text-[var(--muted)]">Name</span>
          <TextInput
            className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
            value={trip.name}
            onChange={(e) => onChange({ ...trip, name: e.target.value })}
          />
        </GroupRow>
        <GroupRow>
          <span className="w-[5.5rem] shrink-0 text-[17px] text-[var(--muted)]">Start</span>
          <TextInput
            className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
            type="date"
            value={trip.startDate}
            onChange={(e) => onChange({ ...trip, startDate: e.target.value })}
          />
        </GroupRow>
        <GroupRow>
          <span className="w-[5.5rem] shrink-0 text-[17px] text-[var(--muted)]">End</span>
          <TextInput
            className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
            type="date"
            value={trip.endDate}
            onChange={(e) => onChange({ ...trip, endDate: e.target.value })}
          />
        </GroupRow>
        <GroupRow>
          <span className="w-[5.5rem] shrink-0 text-[17px] text-[var(--muted)]">Currency</span>
          <CurrencyPicker
            value={trip.baseCurrency}
            onChange={(base) =>
              onChange({
                ...trip,
                baseCurrency: base,
                rates: convertRatesToNewBase(trip.rates, base),
              })
            }
          />
        </GroupRow>
        <GroupRow>
          <span className="w-[5.5rem] shrink-0 text-[17px] text-[var(--muted)]">Place</span>
          <Select
            className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
            value={trip.destinationId ?? ''}
            onChange={(e) =>
              onChange({
                ...trip,
                destinationId: e.target.value || undefined,
              })
            }
          >
            <option value="">Match from name</option>
            {DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.place}
              </option>
            ))}
          </Select>
        </GroupRow>
      </Group>

      <SectionLabel>Friends</SectionLabel>
      <Group>
        {trip.people.map((p) => (
          <GroupRow key={p.id} inset className="flex-wrap py-3">
            <Avatar person={p} />
            <TextInput
              className="min-w-[7rem] flex-1 rounded-xl bg-[var(--fill)] px-3 py-2 dark:bg-black/25"
              value={p.name}
              onChange={(e) =>
                onChange({
                  ...trip,
                  people: trip.people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                })
              }
            />
            <div className="flex gap-1">
              {PERSON_COLORS.slice(0, 6).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-label={`Color ${c}`}
                  className={cn(
                    'h-5 w-5 rounded-full',
                    p.color === c && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--grouped)]',
                  )}
                  style={{ background: c }}
                  onClick={() =>
                    onChange({
                      ...trip,
                      people: trip.people.map((x) => (x.id === p.id ? { ...x, color: c } : x)),
                    })
                  }
                />
              ))}
            </div>
            <button
              type="button"
              className="text-[var(--danger)]"
              aria-label={`Remove ${p.name}`}
              onClick={() => {
                if (involved(p.id)) {
                  onNotify('This friend is on an expense — remove those first')
                  return
                }
                onChange({ ...trip, people: trip.people.filter((x) => x.id !== p.id) })
              }}
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </GroupRow>
        ))}
        <GroupRow>
          <TextInput
            className="rounded-none bg-transparent px-0 py-0 dark:bg-transparent"
            value={newFriend}
            placeholder="Add a friend"
            onChange={(e) => setNewFriend(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFriend.trim()) {
                const color = PERSON_COLORS[trip.people.length % PERSON_COLORS.length]
                onChange({
                  ...trip,
                  people: [...trip.people, { id: uid(), name: newFriend.trim(), color }],
                })
                setNewFriend('')
              }
            }}
          />
          <button
            type="button"
            className="text-[17px] font-medium text-[var(--accent)]"
            onClick={() => {
              if (!newFriend.trim()) return
              const color = PERSON_COLORS[trip.people.length % PERSON_COLORS.length]
              onChange({
                ...trip,
                people: [...trip.people, { id: uid(), name: newFriend.trim(), color }],
              })
              setNewFriend('')
            }}
          >
            Add
          </button>
        </GroupRow>
      </Group>

      <SectionLabel>Categories</SectionLabel>
      <Group>
        {trip.categories.map((c) => (
          <GroupRow key={c.id}>
            <TextInput
              className="w-12 rounded-xl bg-[var(--fill)] px-1 py-2 text-center dark:bg-black/25"
              value={c.emoji}
              onChange={(e) =>
                onChange({
                  ...trip,
                  categories: trip.categories.map((x) => (x.id === c.id ? { ...x, emoji: e.target.value } : x)),
                })
              }
            />
            <TextInput
              className="flex-1 rounded-none bg-transparent px-0 py-0 dark:bg-transparent"
              value={c.name}
              onChange={(e) =>
                onChange({
                  ...trip,
                  categories: trip.categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                })
              }
            />
            {c.id !== 'settlement' && (
              <button
                type="button"
                className="text-[var(--danger)]"
                aria-label={`Remove ${c.name}`}
                onClick={() => {
                  if (trip.expenses.some((e) => e.categoryId === c.id)) {
                    onNotify('Move expenses off this category first')
                    return
                  }
                  onChange({ ...trip, categories: trip.categories.filter((x) => x.id !== c.id) })
                }}
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            )}
          </GroupRow>
        ))}
        <GroupRow>
          <TextInput
            className="rounded-none bg-transparent px-0 py-0 dark:bg-transparent"
            value={newCat}
            placeholder="Custom category"
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button
            type="button"
            className="text-[17px] font-medium text-[var(--accent)]"
            onClick={() => {
              if (!newCat.trim()) return
              onChange({
                ...trip,
                categories: [...trip.categories, { id: uid(), name: newCat.trim(), emoji: '✨' }],
              })
              setNewCat('')
            }}
          >
            Add
          </button>
        </GroupRow>
      </Group>

      <SectionLabel>Conversion rates</SectionLabel>
      <p className="mb-2 px-4 text-[13px] text-[var(--muted)]">
        1 unit of each currency in {trip.baseCurrency}. Manual is enough; live fetch is optional.
        {trip.ratesUpdatedAt ? ` Last fetch ${new Date(trip.ratesUpdatedAt).toLocaleString()}.` : ''}
      </p>
      <Group>
        <GroupRow onClick={() => void pullRates()}>
          <RefreshCw size={16} strokeWidth={1.75} className={cn('text-[var(--accent)]', fetching && 'animate-spin')} />
          <span className="flex-1 text-[17px] text-[var(--accent)]">{fetching ? 'Fetching…' : 'Fetch Live Rates'}</span>
        </GroupRow>
        {usedCurrencies
          .filter((code, i, arr) => arr.indexOf(code) === i && code !== trip.baseCurrency)
          .slice(0, 18)
          .map((code) => {
            const rate = trip.rates[code] ?? 1
            return (
              <GroupRow key={code} className="py-3">
                <span className="w-14 font-semibold">{code}</span>
                <RateInput
                  value={rate}
                  onCommit={(n) =>
                    onChange({
                      ...trip,
                      rates: { ...trip.rates, [code]: n },
                    })
                  }
                />
                <span className="w-[7.5rem] text-right text-[12px] text-[var(--muted)]">
                  1 {trip.baseCurrency} ≈ {roundTo(inverseRate(rate), rate < 0.01 ? 0 : 2)} {code}
                </span>
              </GroupRow>
            )
          })}
      </Group>

      <SectionLabel>Scan bills</SectionLabel>
      <ScanSettings onNotify={onNotify} />

      <SectionLabel>Share with friends</SectionLabel>
      <p className="mb-2 px-4 text-[13px] text-[var(--muted)]">
        Send a link. Friends open it on any phone — the trip is in the link, so it works even if live sync is briefly down. Anyone with the link can edit.
      </p>
      <Group>
        <GroupRow
          onClick={() => {
            void shareWithFriends(trip)
          }}
        >
          <Share size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
          <span className="flex-1 text-[17px]">{trip.shareId ? 'Invite Friends' : 'Start Live Trip'}</span>
        </GroupRow>
        <GroupRow onClick={() => void copySummary()}>
          <Copy size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
          <span className="flex-1 text-[17px]">Copy Summary</span>
        </GroupRow>
        <GroupRow onClick={() => void copyLink()}>
          <Copy size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
          <span className="flex-1 text-[17px]">Copy Invite Link</span>
        </GroupRow>
        <GroupRow onClick={() => downloadJson(`${slugify(trip.name)}.triptab.json`, trip)}>
          <Download size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
          <span className="flex-1 text-[17px]">Download Trip</span>
        </GroupRow>
        <label className="row-sep relative flex min-h-[44px] w-full cursor-pointer items-center gap-3 px-4 py-2.5">
          <Upload size={16} strokeWidth={1.75} className="text-[var(--accent)]" />
          <span className="flex-1 text-[17px]">Import JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                const raw = JSON.parse(await file.text()) as unknown
                const one = normalizeTrip(raw)
                if (one && one.people) {
                  onChange({ ...one, id: trip.id })
                  onNotify('Replaced this trip from file')
                  return
                }
                const app = normalizeAppData(raw)
                if (app?.trips[0]) {
                  onChange({ ...app.trips[0], id: trip.id })
                  onNotify('Replaced this trip from file')
                  return
                }
                onNotify('Could not read that file')
              } catch {
                onNotify('Could not read that file')
              }
            }}
          />
        </label>
      </Group>

      <SectionLabel>Danger zone</SectionLabel>
      <Group>
        <GroupRow onClick={onDeleteTrip}>
          <Trash2 size={16} strokeWidth={1.75} className="text-[var(--danger)]" />
          <span className="flex-1 text-[17px] text-[var(--danger)]">Delete Trip</span>
        </GroupRow>
      </Group>
      <p className="mt-2 px-4 text-[13px] text-[var(--muted)]">
        Deletes this trip from this browser. Export first if you might need it.
      </p>
    </div>
  )
}

function RateInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  return (
    <TextInput
      inputMode="decimal"
      className="flex-1 rounded-xl bg-[var(--fill)] px-3 py-2 text-right dark:bg-black/25"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (Number.isFinite(n) && n > 0) onCommit(n)
      }}
    />
  )
}
