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

  it('uses a short public live id with no snapshot in the URL', () => {
    const trip = { ...createDemoTrip(), shareId: 'room-abcde' }
    const href = shareLinkForTrip(trip, trip.shareId, 'https://marcelldjaja7-svg.github.io/TripTab/', '/TripTab/')
    const parsed = parseShareLocation(href)
    expect(parsed.shareId).toBe('room-abcde')
    expect(parsed.trip).toBeNull()
    expect(href).toBe('https://marcelldjaja7-svg.github.io/TripTab/?t=room-abcde')
    expect(href).not.toContain('s=')
    expect(href).not.toContain('#')
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
    expect(parsed.trip).toBeNull()
    expect(href).toBe('https://marcelldjaja7-svg.github.io/TripTab/?t=ttroom12345')
  })

  it('still opens a link when a messenger mashed #s= into the live id', () => {
    const trip = createDemoTrip()
    const mashed = `https://marcelldjaja7-svg.github.io/TripTab/?t=ttroom12345#s=${encodeTripShare(trip)}`
    const broken = mashed.replace('#s=', '%23s=')
    const parsed = parseShareLocation(broken)
    expect(parsed.shareId).toBe('ttroom12345')
    expect(parsed.trip?.name).toBe(trip.name)
  })

  it('still reads a leftover ?s= snapshot from older app versions', () => {
    const trip = { ...createDemoTrip(), shareId: 'ttqueryroom1', expenses: [] }
    const href = `https://marcelldjaja7-svg.github.io/TripTab/?t=ttqueryroom1&s=${encodeTripShare(trip)}`
    expect(parseShareLocation(href).shareId).toBe('ttqueryroom1')
    expect(parseShareLocation(href).trip?.name).toBe(trip.name)
  })

  it('keeps the live id after the address bar is stripped', () => {
    resetCapturedShare()
    const first = captureShareLocation('https://marcelldjaja7-svg.github.io/TripTab/?t=dead-room-xxxxx')
    const later = captureShareLocation('https://marcelldjaja7-svg.github.io/TripTab/')
    expect(first.shareId).toBe('dead-room-xxxxx')
    expect(later.shareId).toBe('dead-room-xxxxx')
    resetCapturedShare()
  })

  it('never puts dozens of bills in the invite URL', () => {
    const demo = createDemoTrip()
    const trip = {
      ...demo,
      shareId: 'ttcopenhagen43',
      expenses: Array.from({ length: 43 }, (_, i) => ({
        ...demo.expenses[0]!,
        id: `bill-${i}`,
        amount: 100 + i,
        note: `Logged receipt ${i} ${'x'.repeat(40)}`,
      })),
    }
    const href = shareLinkForTrip(trip, trip.shareId, 'https://marcelldjaja7-svg.github.io/TripTab/', '/TripTab/')
    expect(href).toBe('https://marcelldjaja7-svg.github.io/TripTab/?t=ttcopenhagen43')
    expect(href.length).toBeLessThan(80)
    expect(href).not.toContain('s=')
    expect(parseShareLocation(href).trip).toBeNull()
    expect(parseShareLocation(href).shareId).toBe('ttcopenhagen43')
  })

  it('ignores a huge leftover snapshot so old invite links do not crash', () => {
    const href = `https://marcelldjaja7-svg.github.io/TripTab/?t=ttroom12345#s=${'A'.repeat(40_000)}`
    const parsed = parseShareLocation(href)
    expect(parsed.shareId).toBe('ttroom12345')
    expect(parsed.trip).toBeNull()
  })
})
