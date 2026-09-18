import { DESTINATIONS, formatTripDates, resolveDestination } from '../lib/destinations'
import { cn } from '../lib/utils'
import type { Trip } from '../types'
import { AvatarStack } from './ui'

export function TripHero({
  trip,
  onDestinationChange,
}: {
  trip: Trip
  onDestinationChange: (destinationId: string | undefined) => void
}) {
  const dest = resolveDestination(trip)
  const dates = formatTripDates(trip.startDate, trip.endDate)
  const friends = `${trip.people.length} ${trip.people.length === 1 ? 'friend' : 'friends'}`
  const autoId = resolveDestination({ name: trip.name, emoji: trip.emoji }).id

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <img
        src={dest.photo}
        alt={dest.place}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/15" />
      <div className="relative flex min-h-[280px] flex-col justify-end px-5 pb-5 pt-16 sm:min-h-[320px] sm:px-7 sm:pb-6">
        <label className="absolute right-4 top-4 sm:right-5 sm:top-5">
          <span className="sr-only">Destination photo</span>
          <select
            value={trip.destinationId ?? autoId}
            onChange={(e) => {
              const next = e.target.value
              onDestinationChange(next === autoId ? undefined : next)
            }}
            className="max-w-[11.5rem] appearance-none rounded-full border border-white/25 bg-white/90 py-1.5 pl-3 pr-8 text-[13px] font-semibold text-neutral-900 shadow-sm outline-none ring-white/40 focus:ring-2"
          >
            {DESTINATIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.place}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">{dest.tagline}</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[40px]">
          <span className="text-[30px] leading-none sm:text-[34px]">{trip.emoji}</span>
          <span className="truncate">{trip.name}</span>
        </h1>
        <p className="mt-2 text-[15px] text-white/85">
          {dates}
          <span className="mx-1.5 text-white/45">·</span>
          {friends}
          <span className="mx-1.5 text-white/45">·</span>
          {trip.baseCurrency}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {trip.people.length > 0 && (
            <div className="flex min-w-0 items-center gap-2.5">
              <AvatarStack people={trip.people} />
              <p className="truncate text-[13px] text-white/80">
                {trip.people.length <= 4
                  ? trip.people.map((p) => p.name.split(' ')[0]).join(', ')
                  : `${trip.people
                      .slice(0, 3)
                      .map((p) => p.name.split(' ')[0])
                      .join(', ')} +${trip.people.length - 3}`}
              </p>
            </div>
          )}
          {trip.shareId ? (
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[12px] font-semibold text-emerald-100 ring-1 ring-emerald-300/30">
              Live · updates instantly
            </span>
          ) : trip.isDemo ? (
            <span className="rounded-full bg-black/35 px-2.5 py-1 text-[12px] font-medium text-white/85 ring-1 ring-white/15">
              Preview · Changes saved on this device
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function DestinationThumb({
  trip,
  className,
}: {
  trip: Pick<Trip, 'name' | 'emoji' | 'destinationId'>
  className?: string
}) {
  const dest = resolveDestination(trip)
  return (
    <span className={cn('relative isolate block overflow-hidden bg-neutral-800', className)}>
      <img src={dest.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <span className="absolute inset-0 bg-black/25" />
      <span className="relative grid h-full w-full place-items-center text-[18px] drop-shadow">{trip.emoji}</span>
    </span>
  )
}
