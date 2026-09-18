import type { Trip } from '../types'
import { mergeTrips } from './merge'
import { compactTripHeader, decodeTripShare, encodeTripShare } from './share'
import { normalizeTrip } from './storage'

export const LIVE_RELAYS = [
  'https://ntfy.sh',
  'https://ntfy.adminforge.de',
  'https://ntfy.envs.net',
] as const

/** ntfy.sh is often rate-limited from shared IPs; fallbacks carry live bills. */
const PRIMARY_RELAY = LIVE_RELAYS[0]
const FALLBACK_RELAYS = LIVE_RELAYS.slice(1)

const SNAPSHOT = 'https://bytebin.lucko.me'
const CLIENT_KEY = 'triptab.client'
const LIVE_CACHE = 'triptab.live.'
export const PING_MAX = 4000
const SNAP_CACHE_MS = 8000

const snapshotCache = new Map<string, { at: number; trip: Trip | null }>()

export type LivePing = {
  v: 1
  bin?: string
  p?: string
  fp: string
  at: number
  by: string
  who?: string
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
      who: typeof ping.who === 'string' && ping.who.trim() ? ping.who.trim() : undefined,
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

function pingApplyKey(ping: LivePing): string {
  return `${ping.fp}:${ping.p ? 'p' : ''}:${ping.bin ?? ''}`
}

function emitPing(shareId: string, raw: unknown): void {
  const ping = parseLivePing(raw) ?? ntfyMessage(raw)
  if (!ping || ping.by === liveClientId()) return
  // A first oversized ping may have no payload yet. Do not remember its
  // fingerprint or the later bytebin ping with the uploaded bills is dropped.
  if (!ping.p && !ping.bin) return
  const key = pingApplyKey(ping)
  if (lastFp.get(shareId) === key) return
  lastFp.set(shareId, key)
  listeners.get(shareId)?.forEach((fn) => fn(ping))
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 4000): Promise<Response> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort()
      reject(new DOMException('Timeout', 'AbortError'))
    }, ms)
  })
  try {
    return await Promise.race([
      fetch(url, { ...init, signal: controller.signal, credentials: 'omit' }),
      timeout,
    ])
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer)
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
    // Keep polling every relay even when EventSource reports "open". ntfy.sh can
    // sit in a zombie open state and fallbacks still hold the uploaded bills.
    void pollLivePings(shareId).then((pings) => {
      const last = pings.at(-1)
      if (last) emitPing(shareId, last)
    })
  }, 2500)

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
  const hit = snapshotCache.get(bin)
  if (hit && Date.now() - hit.at < SNAP_CACHE_MS) return hit.trip
  try {
    const res = await fetch(`${SNAPSHOT}/${encodeURIComponent(bin)}`, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    })
    const trip = res.ok ? normalizeTrip(await res.json()) : null
    snapshotCache.set(bin, { at: Date.now(), trip })
    return trip
  } catch {
    snapshotCache.set(bin, { at: Date.now(), trip: null })
    return null
  }
}

function withLiveMeta(trip: Trip, shareId: string, ping: LivePing): Trip {
  return {
    ...trip,
    shareId,
    isDemo: false,
    updatedByName: trip.updatedByName || ping.who,
  }
}

export async function tripFromPing(ping: LivePing, shareId: string): Promise<Trip | null> {
  const fromPayload = ping.p ? decodeTripShare(ping.p) : null
  const fromBin = ping.bin ? await readLiveSnapshot(ping.bin) : null
  if (fromPayload && fromBin) {
    return withLiveMeta(mergeTrips(fromPayload, fromBin), shareId, ping)
  }
  const trip = fromPayload ?? fromBin
  if (!trip) return null
  return withLiveMeta(trip, shareId, ping)
}

function clipPingForNtfy(full: LivePing, header: string): LivePing {
  if (JSON.stringify(full).length <= PING_MAX) return full
  const withHeader: LivePing = { ...full, p: header }
  if (JSON.stringify(withHeader).length <= PING_MAX) return withHeader
  return { ...full, p: undefined }
}

function pingFingerprint(trip: Trip): string {
  return `${trip.updatedAt}:${trip.expenses.map((e) => `${e.id}:${e.updatedAt ?? e.createdAt}:${e.amount}`).join(',')}:${trip.people.length}`
}

async function postLivePing(relay: string, topic: string, body: string, ms: number): Promise<void> {
  await fetchWithTimeout(
    `${relay}/${topic}`,
    {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
    ms,
  )
}

export async function publishLivePing(shareId: string, trip: Trip, bin?: string | null): Promise<void> {
  const withId = { ...trip, shareId, isDemo: false }
  const encoded = encodeTripShare(withId)
  const ping: LivePing = {
    v: 1,
    bin: bin || undefined,
    p: encoded,
    fp: pingFingerprint(withId),
    at: Date.now(),
    by: liveClientId(),
    who: withId.updatedByName,
  }
  rememberLiveTrip(shareId, withId)
  try {
    channelFor(shareId)?.postMessage(ping)
  } catch {
    /* older browsers */
  }
  const forNtfy = clipPingForNtfy(ping, encodeTripShare(compactTripHeader(withId)))
  const body = JSON.stringify(forNtfy)
  const topic = liveTopic(shareId)
  // ntfy.sh often hangs or 429s from this IP — do not block other phones on it.
  void postLivePing(PRIMARY_RELAY, topic, body, 2000)
  await Promise.race([
    Promise.allSettled(FALLBACK_RELAYS.map((relay) => postLivePing(relay, topic, body, 1200))),
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1300)),
  ])
}

export async function pollLivePings(
  shareId: string,
  relays: readonly string[] = LIVE_RELAYS,
): Promise<LivePing[]> {
  const topic = liveTopic(shareId)
  const rows = await Promise.all(
    relays.map(async (relay) => {
      try {
        const ms = relay === PRIMARY_RELAY ? 800 : 1500
        const res = await fetchWithTimeout(`${relay}/${topic}/json?poll=1&since=all`, { method: 'GET' }, ms)
        if (!res.ok) return [] as LivePing[]
        const text = await res.text()
        const pings: LivePing[] = []
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const ping = ntfyMessage(JSON.parse(line) as unknown)
            if (ping && (ping.p || ping.bin)) pings.push(ping)
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
  let merged: Trip | null = recalledLiveTrip(shareId)
  for (const ping of pings) {
    const trip = await tripFromPing(ping, shareId)
    if (!trip) continue
    merged = merged ? mergeTrips(merged, trip) : trip
  }
  if (merged) rememberLiveTrip(shareId, merged)
  return merged
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
