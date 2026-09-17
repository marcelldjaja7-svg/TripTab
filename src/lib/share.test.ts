import { describe, expect, it } from 'vitest'
import { createDemoTrip } from './demo'
import {
  canonicalAppUrl,
  decodeTripShare,
  encodeTripShare,
  parseShareLocation,
  shareLinkForTrip,
} from './share'

describe('trip share encoding', () => {
  it('round-trips a trip', () => {
    const trip = createDemoTrip()
    const again = decodeTripShare(encodeTripShare(trip))
    expect(again?.name).toBe(trip.name)
    expect(again?.people.map((p) => p.name)).toEqual(trip.people.map((p) => p.name))
    expect(again?.expenses).toHaveLength(trip.expenses.length)
  })
})

describe('share URLs', () => {
  it('uses the GitHub Pages base path so invites are not missing /TripTab/', () => {
    const url = canonicalAppUrl('https://marcelldjaja7-svg.github.io/TripTab/?t=old', '/TripTab/')
    expect(url).toBe('https://marcelldjaja7-svg.github.io/TripTab/')
  })

  it('keeps the current folder when the Vite base is relative', () => {
    expect(canonicalAppUrl('http://192.168.1.8:5173/index.html', './')).toBe('http://192.168.1.8:5173/')
  })

  it('packs a live id and a snapshot so the link opens without the room', () => {
    const trip = { ...createDemoTrip(), shareId: 'room-abcde' }
    const href = shareLinkForTrip(trip, trip.shareId, 'https://marcelldjaja7-svg.github.io/TripTab/', '/TripTab/')
    const parsed = parseShareLocation(href)
    expect(parsed.shareId).toBe('room-abcde')
    expect(parsed.trip?.name).toBe(trip.name)
    expect(parsed.trip?.expenses.length).toBe(trip.expenses.length)
  })

  it('still opens legacy #import= snapshot links', () => {
    const trip = createDemoTrip()
    const href = `https://example.com/TripTab/#import=${encodeTripShare(trip)}`
    const parsed = parseShareLocation(href)
    expect(parsed.shareId).toBeNull()
    expect(parsed.trip?.name).toBe(trip.name)
  })

  it('reads ?t= live ids from existing invites', () => {
    const parsed = parseShareLocation('https://marcelldjaja7-svg.github.io/TripTab/?t=ff808181abcd1')
    expect(parsed.shareId).toBe('ff808181abcd1')
    expect(parsed.trip).toBeNull()
  })
})
