import { afterEach, describe, expect, it, vi } from 'vitest'
import { ratesForBase } from './currencies'
import { defaultCategories } from './demo'
import {
  PING_MAX,
  liveSseUrl,
  liveTopic,
  parseLivePing,
  pollLivePings,
  publishLivePing,
  pullLatestLiveTrip,
  subscribeLivePings,
  tripFromPing,
} from './live'
import { compactTripForShare, decodeTripShare, encodeTripShare } from './share'
import type { Expense, Trip } from '../types'

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

function bill(id: string, amount: number): Expense {
  return {
    id,
    amount,
    currency: 'DKK',
    paidBy: 'a',
    participantIds: ['a'],
    splitMode: 'equal',
    categoryId: 'food',
    note: id,
    date: '2026-09-18',
    createdAt: amount,
  }
}

function withBills(count: number, updatedAt: number): Trip {
  return {
    ...sample,
    updatedAt,
    updatedByName: `${count} bills`,
    expenses: Array.from({ length: count }, (_, i) => bill(`e${i}`, i + 1)),
  }
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
    const ping = parseLivePing({ v: 1, fp: '1', at: 9, by: 'me', p: 'nope', who: 'Alex' })
    expect(ping?.by).toBe('me')
    expect(ping?.who).toBe('Alex')
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

  it('does not treat a republish clock as a newer trip', async () => {
    const ping = parseLivePing({
      v: 1,
      fp: 'x',
      at: 99_000,
      by: 'friend',
      who: 'Stale phone',
      p: encodeTripShare({ ...sample, updatedAt: 2, updatedByName: 'engdjaja' }),
    })
    const trip = await tripFromPing(ping!, 'room1')
    expect(trip?.updatedAt).toBe(2)
    expect(trip?.updatedByName).toBe('engdjaja')
  })

  it('merges a compact ping payload with the full snapshot', async () => {
    const compact = withBills(12, 40)
    const full = withBills(43, 10)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('lucko.me/bin-full-43')) {
          return new Response(JSON.stringify(full), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('no', { status: 404 })
      }),
    )
    const ping = parseLivePing({
      v: 1,
      fp: 'x',
      at: 80_000,
      by: 'friend',
      p: encodeTripShare(compact),
      bin: 'bin-full-43',
    })
    const trip = await tripFromPing(ping!, 'tt-merge-p-bin')
    expect(trip?.expenses).toHaveLength(43)
    expect(trip?.updatedAt).toBe(40)
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

  it('unions 12, 30, and 43 bill copies instead of keeping the newest ping', async () => {
    const pingLine = (trip: Trip, at: number) =>
      JSON.stringify({
        event: 'message',
        message: JSON.stringify({ v: 1, fp: `fp-${at}`, at, by: 'friend', p: encodeTripShare(trip) }),
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/json')) {
          return new Response(
            [pingLine(withBills(43, 50), 1), pingLine(withBills(30, 20), 2), pingLine(withBills(12, 10), 3)].join('\n'),
            { status: 200 },
          )
        }
        return new Response('no', { status: 404 })
      }),
    )
    const trip = await pullLatestLiveTrip('tt-merge-counts')
    expect(trip?.expenses).toHaveLength(43)
    expect(trip?.updatedByName).toBe('43 bills')
  })

  it('never posts an oversized live ping body', async () => {
    const fat = withBills(40, 9)
    fat.expenses = fat.expenses.map((e, i) => ({
      ...e,
      note: `Uploaded receipt ${i} ${'x'.repeat(120)}`,
    }))
    expect(encodeTripShare(fat).length).toBeGreaterThan(PING_MAX)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('ntfy') && (init?.method ?? 'GET') === 'POST') {
        const body = String(init?.body ?? '')
        expect(body.length).toBeLessThanOrEqual(PING_MAX)
        const ping = JSON.parse(body) as { p?: string; bin?: string }
        if (ping.p) expect(decodeTripShare(ping.p)?.expenses.length ?? 0).toBeLessThan(40)
        return new Response('ok', { status: 200 })
      }
      return new Response('no', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await publishLivePing('tt-fat-ping', fat, 'bin-fat')
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('ntfy'))).toBe(true)
  })

  it('still delivers a later snapshot ping after an empty fingerprint ping', async () => {
    class FakeSource {
      static CLOSED = 2
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onopen: (() => void) | null = null
      readyState = 1
      constructor() {
        FakeSource.current = this
      }
      static current: FakeSource | null = null
      close() {
        this.readyState = 2
      }
    }
    vi.stubGlobal('EventSource', FakeSource)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    const seen: Array<{ fp: string; bin?: string; p?: string }> = []
    const unsub = subscribeLivePings('tt-bin-followup', (ping) => {
      seen.push({ fp: ping.fp, bin: ping.bin, p: ping.p })
    })
    FakeSource.current?.onopen?.()
    FakeSource.current?.onmessage?.({
      data: JSON.stringify({
        event: 'message',
        message: JSON.stringify({ v: 1, fp: 'upload-1', at: 1, by: 'friend' }),
      }),
    })
    FakeSource.current?.onmessage?.({
      data: JSON.stringify({
        event: 'message',
        message: JSON.stringify({ v: 1, fp: 'upload-1', at: 2, by: 'friend', bin: 'snap-uploaded' }),
      }),
    })
    expect(seen).toEqual([{ fp: 'upload-1', bin: 'snap-uploaded', p: undefined }])
    unsub()
  })

  it('does not wait for a hung ntfy.sh before finishing a live publish', async () => {
    let resolveHang: (() => void) | undefined
    const hang = new Promise<void>((resolve) => {
      resolveHang = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('ntfy.sh')) {
        await hang
        return new Response('ok', { status: 200 })
      }
      if (url.includes('ntfy')) return new Response('ok', { status: 200 })
      return new Response('no', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const start = Date.now()
    const { publishLivePing } = await import('./live')
    await publishLivePing('tt-hang-room', sample)
    expect(Date.now() - start).toBeLessThan(1500)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('adminforge'))).toBe(true)
    resolveHang?.()
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
