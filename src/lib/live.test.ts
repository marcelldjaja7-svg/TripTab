import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeTripShare } from './share'
import { liveTopic, parseLivePing, pollLivePings, tripFromPing } from './live'
import { defaultCategories } from './demo'
import type { Trip } from '../types'

const sample: Trip = {
  id: 't',
  name: 'Copenhagen',
  emoji: '🌅',
  startDate: '',
  endDate: '',
  baseCurrency: 'DKK',
  categories: defaultCategories(),
  rates: { DKK: 1 },
  createdAt: 1,
  updatedAt: 2,
  people: [{ id: 'a', name: 'A', color: '#000' }],
  expenses: [],
}

describe('live channel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('builds a safe ntfy topic from a share id', () => {
    expect(liveTopic('ff808181abcd!')).toBe('ttff808181abcd')
    expect(liveTopic('tt' + 'x'.repeat(80)).length).toBe(64)
  })

  it('parses a live ping and ignores keepalives', () => {
    const ping = parseLivePing({ v: 1, fp: '1', at: 9, by: 'me', p: 'nope' })
    expect(ping?.by).toBe('me')
    expect(parseLivePing({ event: 'open', topic: 'x' })).toBeNull()
  })

  it('rebuilds a trip from a ping payload', async () => {
    const ping = parseLivePing({
      v: 1,
      fp: 'x',
      at: 1,
      by: 'friend',
      p: encodeTripShare(sample),
    })
    expect(ping).toBeTruthy()
    const trip = await tripFromPing(ping!, 'room1')
    expect(trip?.name).toBe('Copenhagen')
    expect(trip?.shareId).toBe('room1')
  })

  it('reads the latest ping from an ntfy poll stream', async () => {
    const encoded = encodeTripShare(sample)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const line = JSON.stringify({
          event: 'message',
          message: JSON.stringify({ v: 1, fp: 'x', at: 1, by: 'friend', p: encoded }),
        })
        return new Response(`${line}\n`, { status: 200 })
      }),
    )
    const pings = await pollLivePings('room1')
    expect(pings).toHaveLength(1)
    expect(pings[0]?.by).toBe('friend')
  })
})
