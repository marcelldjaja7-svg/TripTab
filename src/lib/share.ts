import type { PersonBalance, Transfer, Trip } from '../types'
import { formatMoney } from './money'
import { computeBalances, suggestedTransfers } from './settle'
import { normalizeTrip } from './storage'

export function tripSummaryText(trip: Trip): string {
  const people = new Map(trip.people.map((p) => [p.id, p.name]))
  const balances = computeBalances(trip)
  const transfers = suggestedTransfers(trip)
  const dates = [trip.startDate, trip.endDate].filter(Boolean).join(' → ')
  const lines: string[] = [
    `${trip.emoji} ${trip.name}`,
    dates ? `${dates} · ${trip.baseCurrency}` : trip.baseCurrency,
    '',
    'Balances',
  ]

  for (const b of balances) {
    const name = people.get(b.personId) ?? 'Friend'
    lines.push(
      `• ${name}: split ${formatMoney(b.share, trip.baseCurrency)} · paid ${formatMoney(b.paid, trip.baseCurrency)} · ${describeNet(b, trip.baseCurrency)}`,
    )
  }

  lines.push('')
  if (transfers.length === 0) {
    lines.push('Everyone is settled. Nice.')
  } else {
    lines.push('Settle up')
    for (const t of transfers) {
      const from = people.get(t.fromId) ?? 'Friend'
      const to = people.get(t.toId) ?? 'Friend'
      lines.push(`• ${from} → ${to}  ${formatMoney(t.amount, trip.baseCurrency)}`)
    }
  }

  lines.push('', `Expenses (${trip.expenses.length})`)
  const cats = new Map(trip.categories.map((c) => [c.id, c]))
  const sorted = [...trip.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  for (const e of sorted) {
    const payer = people.get(e.paidBy) ?? 'Friend'
    const cat = cats.get(e.categoryId)
    const label = e.note.trim() || cat?.name || 'Expense'
    const converted =
      e.currency === trip.baseCurrency
        ? ''
        : ` → ${formatMoney(e.amount * (trip.rates[e.currency] ?? 1), trip.baseCurrency)}`
    lines.push(
      `• ${e.date || 'undated'}  ${label}  ${formatMoney(e.amount, e.currency)}${converted}  (paid by ${payer})`,
    )
  }

  lines.push('', '— shared from TripTab')
  return lines.join('\n')
}

function describeNet(b: PersonBalance, currency: string): string {
  if (Math.abs(b.net) < 0.005) return 'settled'
  if (b.net > 0) return `is owed ${formatMoney(b.net, currency)}`
  return `owes ${formatMoney(-b.net, currency)}`
}

/** Drop unused FX rates so invite hashes and live pings stay small. */
export function compactTripForShare(trip: Trip): Trip {
  const used = new Set<string>([trip.baseCurrency])
  for (const expense of trip.expenses) used.add(expense.currency)
  const rates: Record<string, number> = { [trip.baseCurrency]: 1 }
  for (const code of used) {
    const n = trip.rates[code]
    if (typeof n === 'number' && n > 0) rates[code] = n
  }
  return { ...trip, rates, isDemo: false }
}

/** Name and friends only — never put bills in a URL (long hashes crash phones). */
export function compactTripHeader(trip: Trip): Trip {
  return compactTripForShare({
    ...trip,
    expenses: [],
    deletedExpenseIds: [],
    isDemo: false,
  })
}

export function encodeTripShare(trip: Trip): string {
  const json = JSON.stringify(compactTripForShare(trip))
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeTripShare(payload: string): Trip | null {
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const binary = atob(b64 + pad)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    return normalizeTrip(JSON.parse(json))
  } catch {
    return null
  }
}

/** Live site friends should open. Localhost invites are unreachable from a phone. */
export const PUBLIC_APP_URL = 'https://marcelldjaja7-svg.github.io/TripTab/'
export const PUBLIC_APP_BASE = '/TripTab/'
/** Skip huge leftover #s= dumps (they crash Safari). Still decode normal #import= snapshots. */
export const SNAP_PAYLOAD_MAX = 24_000

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function resolveShareLocation(href?: string, base?: string): { href: string; base: string } {
  if (href) return { href, base: base ?? import.meta.env.BASE_URL }
  const current = typeof window !== 'undefined' ? window.location.href : PUBLIC_APP_URL
  try {
    const loc = new URL(current)
    if (isLoopbackHost(loc.hostname)) return { href: PUBLIC_APP_URL, base: PUBLIC_APP_BASE }
    if (loc.hostname.endsWith('github.io')) return { href: PUBLIC_APP_URL, base: PUBLIC_APP_BASE }
  } catch {
    return { href: PUBLIC_APP_URL, base: PUBLIC_APP_BASE }
  }
  return { href: current, base: base ?? import.meta.env.BASE_URL }
}

/** Public app URL with a trailing slash so GitHub Pages invite links resolve. */
export function canonicalAppUrl(
  href: string = typeof window !== 'undefined' ? window.location.href : PUBLIC_APP_URL,
  base: string = import.meta.env.BASE_URL,
): string {
  const loc = new URL(href)
  if (base && base !== './' && base !== '.') {
    const path = base.endsWith('/') ? base : `${base}/`
    return `${loc.origin}${path.startsWith('/') ? path : `/${path}`}`
  }
  let path = loc.pathname.replace(/index\.html$/i, '')
  if (!path.endsWith('/')) {
    const last = path.split('/').pop() ?? ''
    path = last.includes('.') ? path.slice(0, path.lastIndexOf('/') + 1) : `${path}/`
  }
  return `${loc.origin}${path}`
}

export type ParsedShare = {
  shareId: string | null
  trip: Trip | null
}

let capturedShare: ParsedShare | undefined

export function resetCapturedShare(): void {
  capturedShare = undefined
}

/** Remember the first invite URL this page load so replaceState cannot drop the snapshot. */
export function captureShareLocation(href: string): ParsedShare {
  capturedShare ??= parseShareLocation(href)
  return capturedShare
}

export function parseShareLocation(href: string): ParsedShare {
  try {
    const url = new URL(href)
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    const hashParams = new URLSearchParams(hash.includes('=') ? hash : '')
    const query = url.searchParams
    let rawId = query.get('t') || query.get('trip') || hashParams.get('t') || hashParams.get('trip')
    let payload = hashParams.get('s') || hashParams.get('import') || query.get('s') || query.get('import')
    if (rawId && !payload) {
      for (const marker of ['#s=', '%23s=']) {
        const at = rawId.indexOf(marker)
        if (at === -1) continue
        payload = rawId.slice(at + marker.length)
        rawId = rawId.slice(0, at)
        break
      }
    }
    if (payload && payload.length > SNAP_PAYLOAD_MAX) payload = null
    return {
      shareId: rawId && rawId.length > 4 ? rawId : null,
      trip: payload ? decodeTripShare(payload) : null,
    }
  } catch {
    return { shareId: null, trip: null }
  }
}

export function shareLinkForTrip(
  trip: Trip,
  shareId: string | null | undefined = trip.shareId,
  href?: string,
  base?: string,
): string {
  const loc = resolveShareLocation(href, base)
  const url = new URL(canonicalAppUrl(loc.href, loc.base))
  url.search = ''
  url.hash = ''
  if (shareId) url.searchParams.set('t', shareId)
  return url.toString()
}

export function shareUrlForTrip(trip: Trip): string {
  return shareLinkForTrip(trip, trip.shareId)
}

export function parseImportFromLocation(): Trip | null {
  if (typeof window === 'undefined') return null
  return parseShareLocation(window.location.href).trip
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'trip'
  )
}

export function describeTransfer(trip: Trip, t: Transfer): string {
  const from = trip.people.find((p) => p.id === t.fromId)?.name ?? 'Friend'
  const to = trip.people.find((p) => p.id === t.toId)?.name ?? 'Friend'
  return `${from} pays ${to} ${formatMoney(t.amount, trip.baseCurrency)}`
}
