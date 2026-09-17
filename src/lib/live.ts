import type { Trip } from '../types'
import { decodeTripShare, encodeTripShare } from './share'
import { normalizeTrip } from './storage'

export const LIVE_RELAYS = [
  'https://ntfy.sh',
  'https://ntfy.adminforge.de',
  'https://ntfy.envs.net',
] as const

const SNAPSHOT = 'https://bytebin.lucko.me'
const CLIENT_KEY = 'triptab.client'
const LIVE_CACHE = 'triptab.live.'
const PING_MAX = 4000

export type LivePing = {
  v: 1
  bin?: string
  p?: string
  fp: string
  at: number
  by: string
}

export function liveClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_KEY)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `c_${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(CLIENT_KEY, id)
    return id
  } catch {
    return 'server'
  }
}

const channels = new Map<string, BroadcastChannel>()
const listeners = new Map<string, Set<(ping: LivePing) => void>>()
const transports = new Map<string, () => void>()
const lastFp = new Map<string, string>()

function channelFor(shareId: string): BroadcastChannel | null {
  try {
    const existing = channels.get(shareId)
    if (existing) return existing
    const ch = new BroadcastChannel(`triptab:${shareId}`)
    channels.set(shareId, ch)
    return ch
  } catch {
    return null
  }
}

export function liveTopic(shareId: string): string {
  const clean = shareId.replace(/[^a-zA-Z0-9_-]/g, '')
  const topic = clean.startsWith('tt') ? clean : `tt${clean}`
  return topic.slice(0, 64)
}

export function liveSseUrl(shareId: string, relay: string = LIVE_RELAYS[0]): string {
  return `${relay}/${encodeURIComponent(liveTopic(shareId))}/sse?since=all`
}

export function parseLivePing(raw: unknown): LivePing | null {
  try {
    const data = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
    if (!data || typeof data !== 'object') return null
    const ping = data as Record<string, unknown>
    if (ping.v !== 1 || typeof ping.fp !== 'string' || typeof ping.by !== 'string') return null
    if (typeof ping.at !== 'number') return null
    return {
      v: 1,
      bin: typeof ping.bin === 'string' ? ping.bin : undefined,
      p: typeof ping.p === 'string' ? ping.p : undefined,
      fp: ping.fp,
      at: ping.at,
      by: ping.by,
    }
  } catch {
    return null
  }
}

function ntfyMessage(json: unknown): LivePing | null {
  if (!json || typeof json !== 'object') return null
  const row = json as { event?: unknown; message?: unknown }
  if (row.event && row.event !== 'message') return null
  return parseLivePing(typeof row.message === 'string' ? row.message : json)
}

function emitPing(shareId: string, raw: unknown): void {
  const ping = parseLivePing(raw) ?? ntfyMessage(raw)
  if (!ping || ping.by === liveClientId()) return
  if (lastFp.get(shareId) === ping.fp) return
  lastFp.set(shareId, ping.fp)
  listeners.get(shareId)?.forEach((fn) => fn(ping))
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 4000): Promise<Response> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal, credentials: 'omit' })
  } finally {
    globalThis.clearTimeout(timer)
  }
}

function ensureTransport(shareId: string): void {
  if (transports.has(shareId)) return
  let stopped = false
  let openCount = 0
  const sources: EventSource[] = []
  const reconnects: number[] = []

  const attach = (relay: string, delay = 0) => {
    const start = () => {
      if (stopped || typeof EventSource === 'undefined') return
      const es = new EventSource(liveSseUrl(shareId, relay))
      sources.push(es)
      es.onopen = () => {
        openCount += 1
      }
      es.onmessage = (event) => {
        try {
          emitPing(shareId, JSON.parse(event.data) as unknown)
        } catch {
          emitPing(shareId, event.data)
        }
      }
      es.onerror = () => {
        if (stopped) return
        if (es.readyState === EventSource.CLOSED) {
          openCount = Math.max(0, openCount - 1)
          es.close()
          const wait = Math.min(15000, Math.max(800, delay || 800) * 2)
          reconnects.push(
            globalThis.setTimeout(() => {
              if (!stopped) attach(relay, wait)
            }, wait),
          )
        }
      }
    }
    if (delay) reconnects.push(globalThis.setTimeout(start, delay))
    else start()
  }

  for (const relay of LIVE_RELAYS) attach(relay)

  const channel = channelFor(shareId)
  if (channel) {
    channel.onmessage = (event) => emitPing(shareId, event.data)
  }

  const poll = globalThis.setInterval(() => {
    if (openCount > 0) return
    void pollLivePings(shareId).then((pings) => {
      const last = pings.at(-1)
      if (last) emitPing(shareId, last)
    })
  }, 8000)

  transports.set(shareId, () => {
    stopped = true
    for (const es of sources) es.close()
    for (const handle of reconnects) globalThis.clearTimeout(handle)
    globalThis.clearInterval(poll)
    transports.delete(shareId)
  })
}

export function rememberLiveTrip(shareId: string, trip: Trip): void {
  try {
    localStorage.setItem(LIVE_CACHE + shareId, encodeTripShare({ ...trip, shareId }))
  } catch {
    /* quota / private mode */
  }
}

export function recalledLiveTrip(shareId: string): Trip | null {
  try {
    const raw = localStorage.getItem(LIVE_CACHE + shareId)
    const trip = raw ? decodeTripShare(raw) : null
    return trip ? { ...trip, shareId, isDemo: false } : null
  } catch {
    return null
  }
}

export async function readLiveSnapshot(bin: string): Promise<Trip | null> {
  try {
    const res = await fetch(`${SNAPSHOT}/${encodeURIComponent(bin)}`, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return normalizeTrip(await res.json())
  } catch {
    return null
  }
}

export async function tripFromPing(ping: LivePing, shareId: string): Promise<Trip | null> {
  const fromPayload = ping.p ? decodeTripShare(ping.p) : null
  const fromBin = !fromPayload && ping.bin ? await readLiveSnapshot(ping.bin) : null
  const trip = fromPayload ?? fromBin
  return trip ? { ...trip, shareId, isDemo: false } : null
}

function pingFingerprint(trip: Trip): string {
  return `${trip.updatedAt}:${trip.expenses.map((e) => `${e.id}:${e.updatedAt ?? e.createdAt}:${e.amount}`).join(',')}:${trip.people.length}`
}

export async function publishLivePing(shareId: string, trip: Trip, bin?: string | null): Promise<void> {
  const withId = { ...trip, shareId, isDemo: false }
  const ping: LivePing = {
    v: 1,
    bin: bin || undefined,
    fp: pingFingerprint(withId),
    at: Date.now(),
    by: liveClientId(),
  }
  const encoded = encodeTripShare(withId)
  ping.p = encoded
  rememberLiveTrip(shareId, withId)
  try {
    channelFor(shareId)?.postMessage(ping)
  } catch {
    /* older browsers */
  }
  const forNtfy: LivePing = encoded.length <= PING_MAX ? ping : { ...ping, p: undefined }
  if (!forNtfy.p && !forNtfy.bin) forNtfy.p = encoded
  const body = JSON.stringify(forNtfy)
  const topic = liveTopic(shareId)
  await Promise.allSettled(
    LIVE_RELAYS.map((relay) =>
      fetchWithTimeout(
        `${relay}/${topic}`,
        {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        },
        2000,
      ),
    ),
  )
}

export async function pollLivePings(shareId: string): Promise<LivePing[]> {
  const topic = liveTopic(shareId)
  const rows = await Promise.all(
    LIVE_RELAYS.map(async (relay) => {
      try {
        const res = await fetchWithTimeout(`${relay}/${topic}/json?poll=1&since=all`, { method: 'GET' }, 2000)
        if (!res.ok) return [] as LivePing[]
        const text = await res.text()
        const pings: LivePing[] = []
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const ping = ntfyMessage(JSON.parse(line) as unknown)
            if (ping) pings.push(ping)
          } catch {
            /* skip bad line */
          }
        }
        return pings
      } catch {
        return [] as LivePing[]
      }
    }),
  )
  const seen = new Set<string>()
  const merged: LivePing[] = []
  for (const ping of rows.flat().sort((a, b) => a.at - b.at)) {
    const key = `${ping.by}:${ping.fp}:${ping.at}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(ping)
  }
  return merged
}

export async function pullLatestLiveTrip(shareId: string): Promise<Trip | null> {
  const pings = await pollLivePings(shareId)
  for (let i = pings.length - 1; i >= 0; i--) {
    const trip = await tripFromPing(pings[i]!, shareId)
    if (trip) return trip
  }
  return recalledLiveTrip(shareId)
}

export function subscribeLivePings(shareId: string, onPing: (ping: LivePing) => void): () => void {
  const set = listeners.get(shareId) ?? new Set<(ping: LivePing) => void>()
  set.add(onPing)
  listeners.set(shareId, set)
  ensureTransport(shareId)
  return () => {
    set.delete(onPing)
    if (set.size === 0) transports.get(shareId)?.()
  }
}

export async function waitForLiveTrip(shareId: string, ms = 2500): Promise<Trip | null> {
  const started = Date.now()
  while (Date.now() - started < ms) {
    const trip = await pullLatestLiveTrip(shareId)
    if (trip) return trip
    await new Promise((resolve) => globalThis.setTimeout(resolve, 600))
  }
  return pullLatestLiveTrip(shareId)
}
