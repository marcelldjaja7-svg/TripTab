import { Download, FileSpreadsheet, Map, Plus, Upload } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { TRIP_EMOJIS } from '../lib/colors'
import { DEFAULT_BASE_CURRENCY } from '../lib/currencies'
import { DESTINATIONS, resolveDestination } from '../lib/destinations'
import { formatMoney, tripTotalBase } from '../lib/money'
import { downloadJson } from '../lib/share'
import { allTripsWorkbookXml, downloadExcel } from '../lib/excel'
import { cn, todayISO } from '../lib/utils'
import { useStore } from '../state'
import { ScanSettings } from './ScanSettings'
import { CurrencyPicker } from './CurrencyPicker'
import { DestinationThumb } from './TripHero'
import {
  AvatarStack,
  Button,
  Chevron,
  Glyph,
  Group,
  GroupRow,
  Modal,
  Screen,
  SectionLabel,
  Select,
  TextInput,
  ThemeToggle,
} from './ui'

export function HomePage() {
  const { data, selectTrip, createTrip, loadDemo, importData, notify } = useStore()
  const [open, setOpen] = useState(false)

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const ok = importData(JSON.parse(text))
      notify(ok ? 'Trip imported' : 'Could not read that file')
    } catch {
      notify('Could not read that file')
    }
  }

  return (
    <Screen className="pb-16 pt-0">
      <header className="sticky top-0 z-20 -mx-4 mb-1 flex min-h-12 items-center justify-between bg-[var(--nav-bg)] px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center gap-2.5">
          <Glyph className="h-7 w-7 bg-[var(--accent)] text-[13px] text-white">✈️</Glyph>
          <span className="text-[17px] font-semibold">TripTab</span>
        </div>
        <ThemeToggle />
      </header>

      <h1 className="large-title mt-2">Trips</h1>
      <p className="mt-1 max-w-md text-[15px] text-[var(--muted)]">
        Split expenses with friends. Settle in IDR or any currency. Invite them with a live link so everyone can add bills from their own phone.
      </p>

      <div className="mt-5 flex gap-2">
        <Button className="flex-1" onClick={() => setOpen(true)}>
          <Plus size={18} strokeWidth={2.25} /> New Trip
        </Button>
        <Button variant="secondary" onClick={() => loadDemo()}>
          Demo
        </Button>
      </div>

      {data.trips.length === 0 ? (
        <div className="mt-10 flex flex-col items-center px-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-[18px] bg-[var(--grouped)] text-[var(--muted)]">
            <Map size={28} strokeWidth={1.5} />
          </span>
          <p className="title-3 mt-4">No trips yet</p>
          <p className="mt-1 text-[15px] text-[var(--muted)]">
            Create one for your group, or open the sample Bali trip.
          </p>
        </div>
      ) : (
        <>
          <SectionLabel>Your trips</SectionLabel>
          <Group>
            {data.trips.map((trip) => (
              <GroupRow key={trip.id} inset onClick={() => selectTrip(trip.id)} className="fade-up py-3">
                <DestinationThumb trip={trip} className="h-12 w-12 shrink-0 rounded-[12px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold">{trip.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[13px] text-[var(--muted)]">
                    <AvatarStack people={trip.people} />
                    <span className="truncate">
                      {trip.baseCurrency}
                      {trip.isDemo ? ' · Demo' : ''}
                    </span>
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-semibold tabular-nums">
                    {formatMoney(tripTotalBase(trip), trip.baseCurrency)}
                  </span>
                  <span className="text-[12px] text-[var(--muted)]">
                    {trip.expenses.length} {trip.expenses.length === 1 ? 'expense' : 'expenses'}
                  </span>
                </span>
                <Chevron />
              </GroupRow>
            ))}
          </Group>
        </>
      )}

      <SectionLabel>Data</SectionLabel>
      <Group>
        <label className="row-sep relative flex min-h-[44px] w-full cursor-pointer items-center gap-3 px-4 py-2.5">
          <Glyph className="bg-[#30D158]/15 text-[#30D158]">
            <Upload size={16} strokeWidth={2} />
          </Glyph>
          <span className="flex-1 text-[17px]">Import JSON</span>
          <Chevron />
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {data.trips.length > 0 && (
          <>
            <GroupRow
              inset
              onClick={() => {
                downloadExcel('triptab.xls', allTripsWorkbookXml(data.trips))
                notify('Excel file downloaded')
              }}
            >
              <Glyph className="bg-[#30D158]/15 text-[#30D158]">
                <FileSpreadsheet size={16} strokeWidth={2} />
              </Glyph>
              <span className="flex-1 text-[17px]">Export Excel</span>
              <Chevron />
            </GroupRow>
            <GroupRow
              inset
              onClick={() => downloadJson('triptab-backup.json', { version: 1, trips: data.trips })}
            >
              <Glyph className="bg-[var(--accent)]/15 text-[var(--accent)]">
                <Download size={16} strokeWidth={2} />
              </Glyph>
              <span className="flex-1 text-[17px]">Export all JSON</span>
              <Chevron />
            </GroupRow>
          </>
        )}
      </Group>

      <SectionLabel>Scan bills</SectionLabel>
      <ScanSettings onNotify={notify} />

      <NewTripModal open={open} onClose={() => setOpen(false)} onCreate={createTrip} />
    </Screen>
  )
}

function NewTripModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: {
    name: string
    emoji: string
    baseCurrency: string
    startDate?: string
    endDate?: string
    destinationId?: string
    people: string[]
  }) => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏝️')
  const [baseCurrency, setBaseCurrency] = useState(DEFAULT_BASE_CURRENCY)
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [people, setPeople] = useState(['', ''])
  const [destinationId, setDestinationId] = useState<string | 'auto'>('auto')
  const preview = useMemo(
    () =>
      resolveDestination({
        name,
        emoji,
        destinationId: destinationId === 'auto' ? undefined : destinationId,
      }),
    [name, emoji, destinationId],
  )

  const submit = () => {
    const names = people.map((p) => p.trim()).filter(Boolean)
    if (!name.trim()) return
    if (names.length < 1) return
    onCreate({
      name,
      emoji,
      baseCurrency,
      startDate,
      endDate,
      destinationId: destinationId === 'auto' ? preview.id : destinationId,
      people: names,
    })
    onClose()
    setName('')
    setPeople(['', ''])
  }

  return (
    <Modal open={open} onClose={onClose} title="New Trip">
      <div className="space-y-4 pb-2">
        <div>
          <p className="mb-2 px-1 text-[13px] text-[var(--muted)]">Icon</p>
          <div className="flex flex-wrap gap-1">
            {TRIP_EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-[10px] text-[18px]',
                  emoji === e ? 'bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]' : 'hover:bg-[var(--fill)]',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <Group>
          <FieldBlock label="Name">
            <TextInput
              className="rounded-none bg-transparent px-0 py-0 dark:bg-transparent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tokyo"
              autoFocus
            />
          </FieldBlock>
          <FieldBlock label="Start">
            <TextInput
              className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FieldBlock>
          <FieldBlock label="End">
            <TextInput
              className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FieldBlock>
          <FieldBlock label="Currency">
            <CurrencyPicker value={baseCurrency} onChange={setBaseCurrency} />
          </FieldBlock>
          <FieldBlock label="Place">
            <Select
              className="rounded-none bg-transparent px-0 py-0 text-right dark:bg-transparent"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value as typeof destinationId)}
            >
              <option value="auto">Match from name ({preview.place})</option>
              {DESTINATIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.place}
                </option>
              ))}
            </Select>
          </FieldBlock>
        </Group>
        <div className="overflow-hidden rounded-[16px]">
          <div className="relative h-28">
            <img src={preview.photo} alt={preview.place} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
            <p className="absolute bottom-3 left-3 text-[13px] font-semibold text-white">{preview.place}</p>
          </div>
        </div>
        <p className="px-4 text-[13px] text-[var(--muted)]">You’ll settle up in this currency. IDR is the default. The photo is a real place that matches the trip.</p>

        <SectionLabel>Friends</SectionLabel>
        <Group>
          {people.map((p, i) => (
            <GroupRow key={i}>
              <TextInput
                className="rounded-none bg-transparent px-0 py-0 dark:bg-transparent"
                value={p}
                placeholder={i === 0 ? 'You' : 'Friend name'}
                onChange={(e) => setPeople((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {people.length > 1 && (
                <button
                  type="button"
                  className="text-[15px] text-[var(--danger)]"
                  onClick={() => setPeople((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              )}
            </GroupRow>
          ))}
          <GroupRow onClick={() => setPeople((p) => [...p, ''])}>
            <span className="text-[17px] text-[var(--accent)]">Add Friend</span>
          </GroupRow>
        </Group>

        <Button className="mt-2 w-full" onClick={submit} disabled={!name.trim() || people.every((p) => !p.trim())}>
          Create Trip
        </Button>
      </div>
    </Modal>
  )
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <GroupRow>
      <span className="w-[5.5rem] shrink-0 text-[17px]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </GroupRow>
  )
}
