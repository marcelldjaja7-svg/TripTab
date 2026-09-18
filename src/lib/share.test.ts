import { describe, expect, it } from 'vitest'
import { createDemoTrip } from './demo'
import {
  captureShareLocation,
  canonicalAppUrl,
  decodeTripShare,
  encodeTripShare,
  parseShareLocation,
  resetCapturedShare,
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

  it('defaults localhost / missing origin to the public GitHub Pages invite', () => {
    const trip = { ...createDemoTrip(), shareId: 'ttroom12345' }
    const href = shareLinkForTrip(trip)
    expect(href.startsWith('https://marcelldjaja7-svg.github.io/TripTab/')).toBe(true)
    expect(href).toContain('t=ttroom12345')
    expect(href).not.toContain('localhost')
    const parsed = parseShareLocation(href)
    expect(parsed.shareId).toBe('ttroom12345')
    expect(parsed.trip?.name).toBe(trip.name)
  })

  it('still opens a link when a messenger mashed #s= into the live id', () => {
    const trip = createDemoTrip()
    const mashed = `https://marcelldjaja7-svg.github.io/TripTab/?t=ttroom12345#s=${encodeTripShare(trip)}`
    const broken = mashed.replace('#s=', '%23s=')
    const parsed = parseShareLocation(broken)
    expect(parsed.shareId).toBe('ttroom12345')
    expect(parsed.trip?.name).toBe(trip.name)
  })

  it('reads a snapshot from ?s= so chat apps that drop hashes still open the trip', () => {
    const trip = { ...createDemoTrip(), shareId: 'ttqueryroom1', expenses: [] }
    const href = shareLinkForTrip(
      trip,
      trip.shareId,
      'https://marcelldjaja7-svg.github.io/TripTab/',
      '/TripTab/',
    )
    expect(href).toContain('s=')
    expect(new URL(href).searchParams.get('s')).toBeTruthy()
    expect(parseShareLocation(href).trip?.name).toBe(trip.name)
  })

  it('keeps the snapshot after the live hash is stripped', () => {
    resetCapturedShare()
    const trip = createDemoTrip()
    const href = shareLinkForTrip(trip, 'dead-room-xxxxx', 'http://localhost:5173/', './')
    const first = captureShareLocation(href)
    const later = captureShareLocation('http://localhost:5173/?t=dead-room-xxxxx')
    expect(first.trip?.name).toBe(trip.name)
    expect(later.trip?.name).toBe(trip.name)
    expect(later.shareId).toBe('dead-room-xxxxx')
    resetCapturedShare()
  })
})
