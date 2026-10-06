import { describe, expect, it } from 'vitest'
import { DESTINATIONS, formatTripDates, resolveDestination } from './destinations'
import { CURRENCIES, USD_RATES } from './currencies'

describe('resolveDestination', () => {
  it('pins an explicit destination id', () => {
    expect(resolveDestination({ name: 'Tokyo', emoji: '🗼', destinationId: 'bali' }).id).toBe('bali')
  })

  it('matches Bali from the demo trip name', () => {
    expect(resolveDestination({ name: 'Bali Escape', emoji: '🏝️' }).id).toBe('bali')
    expect(resolveDestination({ name: 'Bali Escape', emoji: '🏝️' }).photo).toMatch(/destinations\/bali\.jpg$/)
  })

  it('matches city names and falls back to emoji then travel', () => {
    expect(resolveDestination({ name: 'Tokyo', emoji: '🎒' }).id).toBe('tokyo')
    expect(resolveDestination({ name: 'Weekend', emoji: '🗽' }).id).toBe('nyc')
    expect(resolveDestination({ name: 'Friends trip', emoji: '✈️' }).id).toBe('travel')
  })

  it('has a local photo for every destination', () => {
    for (const dest of DESTINATIONS) {
      expect(dest.photo).toMatch(new RegExp(`/destinations/${dest.id}\\.jpg$`))
    }
  })
})

describe('formatTripDates', () => {
  it('collapses a same-month range', () => {
    expect(formatTripDates('2026-09-12', '2026-09-20')).toMatch(/^12–20 Sep/)
  })
})

describe('currencies', () => {
  it('gives every listed currency a starter USD rate', () => {
    for (const currency of CURRENCIES) {
      expect(USD_RATES[currency.code], currency.code).toBeGreaterThan(0)
    }
  })
})
