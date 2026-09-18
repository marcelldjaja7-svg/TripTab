import { afterEach, describe, expect, it, vi } from 'vitest'
import { ratesForBase } from './currencies'
import { defaultCategories } from './demo'
import {
  liveSseUrl,
  liveTopic,
  parseLivePing,
  pollLivePings,
  subscribeLivePings,
  tripFromPing,
} from './live'
import { compactTripForShare, decodeTripShare, encodeTripShare } from './share'
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
    expect(liveTopic('ttabc')).toBe('ttabc')
    expect(liveTopic('tt' + 'x'.repeat(80)).length).toBe(64)
  })

  it('replays history on the SSE URL so a late phone still gets the last bill', () => {
    expect(liveSseUrl('ttroom')).toContain('/sse?since=all')
    expect(liveSseUrl('ttroom', 'https://ntfy.adminforge.de')).toContain('ntfy.adminforge.de')
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

  it('drops unused conversion rates so pings fit in the live channel', () => {
    const fat: Trip = {
      ...sample,
      baseCurrency: 'IDR',
      rates: ratesForBase('IDR'),
      expenses: [
        {
          id: 'e1',
          amount: 12,
          currency: 'USD',
          paidBy: 'a',
          participantIds: ['a'],
          splitMode: 'equal',
          categoryId: 'food',
          note: 'Taxi',
          date: '2026-09-01',
          createdAt: 1,
        },
      ],
    }
    const compact = compactTripForShare(fat)
    expect(Object.keys(compact.rates).sort()).toEqual(['IDR', 'USD'])
    expect(encodeTripShare(fat).length).toBeLessThan(4000)
    expect(decodeTripShare(encodeTripShare(fat))?.expenses).toHaveLength(1)
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

  it('delivers an ntfy SSE envelope to subscribers', async () => {
    const encoded = encodeTripShare(sample)
    const opened: string[] = []
    class FakeSource {
      static CLOSED = 2
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      readyState = 1
      constructor(url: string) {
        opened.push(url)
        FakeSource.current = this
      }
      static current: FakeSource | null = null
      close() {
        this.readyState = 2
      }
    }
    vi.stubGlobal('EventSource', FakeSource)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    )
    const seen: string[] = []
    const unsub = subscribeLivePings('tt-sse-room', (ping) => {
      seen.push(ping.by)
    })
    expect(opened.some((url) => url.includes('since=all'))).toBe(true)
    expect(opened.some((url) => url.includes('adminforge') || url.includes('envs.net'))).toBe(true)
    FakeSource.current?.onmessage?.({
      data: JSON.stringify({
        event: 'message',
        message: JSON.stringify({ v: 1, fp: 'live-1', at: 1, by: 'friend', p: encoded }),
      }),
    })
    expect(seen).toEqual(['friend'])
    unsub()
  })
})
