import { afterEach, describe, expect, it, vi } from 'vitest'
import { FRANKFURTER_LATEST, fetchLiveRates, tripRatesFromFrankfurterQuotes } from './currencies'

describe('tripRatesFromFrankfurterQuotes', () => {
  it('inverts IDR quotes so JPY is IDR per 1 yen, not yen per rupiah', () => {
    const rates = tripRatesFromFrankfurterQuotes('IDR', { JPY: 0.00883, USD: 0.000056 })
    expect(rates.IDR).toBe(1)
    expect(rates.JPY).toBeCloseTo(113.25, 2)
    expect(rates.USD).toBeCloseTo(17857, 0)
    expect(2000 * (rates.JPY ?? 0)).toBeGreaterThan(200_000)
  })
})

describe('fetchLiveRates', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('asks Frankfurter for the IDR book and each used currency against IDR', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url.startsWith(FRANKFURTER_LATEST)).toBe(true)
      if (url.includes('from=IDR') && !url.includes('to=')) {
        return new Response(JSON.stringify({ base: 'IDR', rates: { JPY: 0.00883, USD: 0.000056 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('from=JPY') && url.includes('to=IDR')) {
        return new Response(JSON.stringify({ base: 'JPY', rates: { IDR: 113.21 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('no', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const rates = await fetchLiveRates('IDR', ['JPY', 'IDR'])
    expect(rates).not.toBeNull()
    expect(rates?.IDR).toBe(1)
    expect(rates?.JPY).toBe(113.21)
    expect(rates?.USD).toBeCloseTo(17857, 0)
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('from=IDR'))).toBe(true)
    expect(urls.some((url) => url.includes('from=JPY') && url.includes('to=IDR'))).toBe(true)
  })
})
