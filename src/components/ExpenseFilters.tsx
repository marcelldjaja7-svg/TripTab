import { ListFilter } from 'lucide-react'
import { useState } from 'react'
import {
  EMPTY_FILTER,
  filterChipCount,
  isFilterActive,
  toggleId,
  type ExpenseFilter,
} from '../lib/filter'
import { cn } from '../lib/utils'
import type { Trip } from '../types'
import { Avatar, Button, Modal } from './ui'

export function ExpenseFilterBar({
  trip,
  filter,
  onChange,
}: {
  trip: Trip
  filter: ExpenseFilter
  onChange: (filter: ExpenseFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const active = isFilterActive(filter)
  const count = filterChipCount(filter)
  const people = new Map(trip.people.map((p) => [p.id, p]))
  const cats = new Map(trip.categories.map((c) => [c.id, c]))

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex min-h-[44px] w-full items-center gap-3 rounded-[12px] bg-[var(--grouped)] px-4 py-3 text-left"
        aria-label="Filter expenses"
      >
        <ListFilter size={18} strokeWidth={2} className="text-[var(--accent)]" />
        <span className="flex-1 text-[17px] font-medium">Filter</span>
        {active ? (
          <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[13px] font-semibold text-white">
            {count}
          </span>
        ) : (
          <span className="text-[15px] text-[var(--muted)]">People & categories</span>
        )}
      </button>

      {active && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filter.personIds.map((id) => {
            const person = people.get(id)
            if (!person) return null
            return (
              <button
                type="button"
                key={id}
                onClick={() => onChange({ ...filter, personIds: filter.personIds.filter((x) => x !== id) })}
                className="chip inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[13px] font-medium text-white"
                style={{ background: person.color }}
              >
                <Avatar person={person} size="sm" />
                {person.name.split(' ')[0]}
              </button>
            )
          })}
          {filter.categoryIds.map((id) => {
            const cat = cats.get(id)
            if (!cat) return null
            return (
              <button
                type="button"
                key={id}
                onClick={() => onChange({ ...filter, categoryIds: filter.categoryIds.filter((x) => x !== id) })}
                className="chip inline-flex items-center gap-1 rounded-full bg-[var(--fill)] px-2.5 py-1 text-[13px] font-medium"
              >
                {cat.emoji} {cat.name}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTER)}
            className="chip rounded-full px-2.5 py-1 text-[13px] font-medium text-[var(--accent)]"
          >
            Clear
          </button>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Filter">
        <div className="space-y-5 pb-2">
          <section>
            <p className="mb-2 px-1 text-[13px] text-[var(--muted)]">Friends</p>
            <div className="flex flex-wrap gap-2">
              {trip.people.map((person) => {
                const on = filter.personIds.includes(person.id)
                return (
                  <button
                    type="button"
                    key={person.id}
                    onClick={() => onChange({ ...filter, personIds: toggleId(filter.personIds, person.id) })}
                    className={cn(
                      'chip flex min-h-[44px] items-center gap-2 rounded-full px-2.5 py-1.5 pr-3 text-[15px] font-medium',
                      on ? 'text-white' : 'bg-[var(--fill)]',
                    )}
                    style={on ? { background: person.color } : undefined}
                  >
                    <Avatar person={person} size="sm" />
                    {person.name}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 px-1 text-[13px] text-[var(--muted)]">Show bills that person paid or split.</p>
          </section>

          <section>
            <p className="mb-2 px-1 text-[13px] text-[var(--muted)]">Categories</p>
            <div className="flex flex-wrap gap-2">
              {trip.categories.map((cat) => {
                const on = filter.categoryIds.includes(cat.id)
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => onChange({ ...filter, categoryIds: toggleId(filter.categoryIds, cat.id) })}
                    className={cn(
                      'chip min-h-[44px] rounded-full px-3 py-1.5 text-[15px] font-medium',
                      on ? 'bg-[var(--accent)] text-white' : 'bg-[var(--fill)]',
                    )}
                  >
                    {cat.emoji} {cat.name}
                  </button>
                )
              })}
            </div>
          </section>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => onChange(EMPTY_FILTER)}>
              Clear
            </Button>
            <Button className="flex-1" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
