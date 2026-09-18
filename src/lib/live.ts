import type { Trip } from '../types'
import { mergeTrips, liveContentKey, latestLogAt } from './merge'
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
  /** Total bills on the publisher's trip so peers keep pulling until they match. */
  n?: number
  /** Expense ids in this ping so members can tell when a piece is still missing. */
  ids?: string[]
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
const pullListeners = new Map<string, Set<(trip: Trip) => void>>()

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
      n: typeof ping.n === 'number' && ping.n >= 0 ? ping.n : undefined,
      ids: Array.isArray(ping.ids)
        ? ping.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
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
  if (!ping) return
  if (ping.by === liveClientId()) return
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

  void drainLiveQueue(shareId)

  const poll = globalThis.setInterval(() => {
    void drainLiveQueue(shareId)
    void pullLatestLiveTrip(shareId).then((trip) => {
      if (trip) pullListeners.get(shareId)?.forEach((fn) => fn(trip))
    })
  }, 2000)

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
  const logAt = latestLogAt(trip)
  return {
    ...trip,
    shareId,
    isDemo: false,
    updatedAt: logAt || trip.updatedAt,
    updatedByName: trip.updatedByName || ping.who,
  }
}

export async function tripFromPing(ping: LivePing, shareId: string): Promise<Trip | null> {
  const fromPayload = ping.p ? decodeTripShare(ping.p) : null
  const fromBin = ping.bin ? await readLiveSnapshot(ping.bin) : null
  // A header-only payload has no bills — never let its republish clock replace the snapshot.
  if (fromPayload && fromBin) {
    const trip =
      fromPayload.expenses.length === 0 ? fromBin : mergeTrips(fromPayload, fromBin)
    return withLiveMeta(trip, shareId, ping)
  }
  const trip = fromPayload ?? fromBin
  if (!trip) return null
  if (trip.expenses.length === 0 && ping.bin && !fromBin) return null
  return withLiveMeta(trip, shareId, ping)
}

function pingFingerprint(trip: Trip): string {
  return `${trip.updatedAt}:${trip.expenses.length}`
}

function pingSize(ping: LivePing): number {
  return JSON.stringify(ping).length
}

function liveWho(trip: Trip): string | undefined {
  const who = trip.updatedByName?.trim()
  return who ? who.slice(0, 40) : undefined
}

function livePartFp(trip: Trip, part: string): string {
  return `${trip.updatedAt}-${trip.expenses.length}-${part}`
}

function slimExpenseNote(expense: Trip['expenses'][number], noteMax: number): Trip['expenses'][number] {
  if (expense.note.length <= noteMax) return expense
  return { ...expense, note: expense.note.slice(0, noteMax) }
}

function packLiveChunk(header: Trip, trip: Trip, expenses: Trip['expenses']): Trip {
  return {
    ...header,
    expenses,
    deletedExpenseIds: trip.deletedExpenseIds ?? [],
    updatedAt: trip.updatedAt,
    updatedBy: trip.updatedBy,
    updatedByName: trip.updatedByName,
    shareId: trip.shareId,
  }
}

function chunkPing(trip: Trip, chunk: Trip, part: string): LivePing {
  return {
    v: 1,
    p: encodeTripShare(chunk),
    fp: livePartFp(trip, part),
    at: 9_999_999_999_999,
    by: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    who: liveWho(trip) ?? 'friend',
    n: trip.expenses.length,
    ids: chunk.expenses.map((expense) => expense.id),
  }
}

function chunkFits(trip: Trip, chunk: Trip): boolean {
  return pingSize(chunkPing(trip, chunk, '99/99')) <= PING_MAX
}

function splitLiveChunk(header: Trip, trip: Trip, chunk: Trip): Trip[] {
  if (chunkFits(trip, chunk)) return [chunk]
  if (chunk.expenses.length <= 1) {
    const slim = packLiveChunk(
      header,
      trip,
      chunk.expenses.map((expense) => slimExpenseNote(expense, 24)),
    )
    return [slim]
  }
  const mid = Math.ceil(chunk.expenses.length / 2)
  return [
    ...splitLiveChunk(header, trip, packLiveChunk(header, trip, chunk.expenses.slice(0, mid))),
    ...splitLiveChunk(header, trip, packLiveChunk(header, trip, chunk.expenses.slice(mid))),
  ]
}

/** Split a fat trip into ntfy-sized copies so 45-bill rooms reconstruct without bytebin. */
export function chunkTripForLive(trip: Trip): Trip[] {
  const header = compactTripHeader(trip)
  const whole = packLiveChunk(header, trip, trip.expenses)
  if (chunkFits(trip, whole)) return [trip]

  const chunks: Trip[] = []
  let batch: Trip['expenses'] = []
  const flush = () => {
    if (batch.length === 0) return
    chunks.push(...splitLiveChunk(header, trip, packLiveChunk(header, trip, batch)))
    batch = []
  }

  for (const expense of trip.expenses) {
    const trial = packLiveChunk(header, trip, [...batch, expense])
    if (batch.length > 0 && !chunkFits(trip, trial)) flush()
    batch = [...batch, expense]
  }
  flush()
  return chunks.length > 0 ? chunks : [header]
}

async function postLivePing(relay: string, topic: string, body: string, ms: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${relay}/${topic}`,
      {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      },
      ms,
    )
    return res.ok
  } catch {
    return false
  }
}

async function deliverLiveBody(topic: string, body: string): Promise<boolean> {
  void postLivePing(PRIMARY_RELAY, topic, body, 2000)
  const fallbacks = await Promise.all(
    FALLBACK_RELAYS.map((relay) => postLivePing(relay, topic, body, 800)),
  )
  return fallbacks.some(Boolean)
}

type SyncJob = { body: string; tries: number }

const QUEUE_KEY = 'triptab.syncq.'
const outbound = new Map<string, { jobs: SyncJob[]; running: Promise<void> | null }>()

function readPersistedQueue(shareId: string): SyncJob[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY + shareId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const job = row as { body?: unknown; tries?: unknown }
        if (typeof job.body !== 'string' || !job.body) return null
        return { body: job.body, tries: typeof job.tries === 'number' && job.tries >= 0 ? job.tries : 0 }
      })
      .filter((job): job is SyncJob => Boolean(job))
  } catch {
    return []
  }
}

function persistQueue(shareId: string, jobs: SyncJob[]): void {
  try {
    if (jobs.length === 0) localStorage.removeItem(QUEUE_KEY + shareId)
    else localStorage.setItem(QUEUE_KEY + shareId, JSON.stringify(jobs))
  } catch {
    /* quota / private mode */
  }
}

function queueFor(shareId: string): { jobs: SyncJob[]; running: Promise<void> | null } {
  const existing = outbound.get(shareId)
  if (existing) return existing
  const created = { jobs: readPersistedQueue(shareId), running: null }
  outbound.set(shareId, created)
  return created
}

function enqueueLiveBodies(shareId: string, bodies: string[]): void {
  const q = queueFor(shareId)
  for (const body of bodies) q.jobs.push({ body, tries: 0 })
  persistQueue(shareId, q.jobs)
}

async function drainJobs(shareId: string, q: { jobs: SyncJob[] }): Promise<void> {
  const topic = liveTopic(shareId)
  while (q.jobs.length > 0) {
    const job = q.jobs[0]
    let ok = false
    try {
      ok = await deliverLiveBody(topic, job.body)
    } catch {
      ok = false
    }
    if (ok) {
      q.jobs.shift()
      persistQueue(shareId, q.jobs)
      continue
    }
    job.tries += 1
    persistQueue(shareId, q.jobs)
    const wait = Math.min(8000, 250 * Math.max(1, job.tries))
    await new Promise((resolve) => globalThis.setTimeout(resolve, wait))
  }
}

/** Send queued live pieces one at a time with retry so 429s do not drop bills. */
export function drainLiveQueue(shareId: string): Promise<void> {
  const q = queueFor(shareId)
  if (q.running) return q.running
  // Track the .then wrapper, not the inner async. An empty drain finishes
  // synchronously; assigning that resolved promise would skip later jobs.
  const run = drainJobs(shareId, q).then(
    () => {
      if (q.running === run) q.running = null
      if (q.jobs.length > 0) return drainLiveQueue(shareId)
    },
    () => {
      if (q.running === run) q.running = null
      if (q.jobs.length > 0) return drainLiveQueue(shareId)
    },
  )
  q.running = run
  return run
}

function fitChunkPing(trip: Trip, chunk: Trip, part: string, by: string, who: string | undefined, at: number): LivePing {
  const ping: LivePing = {
    v: 1,
    p: encodeTripShare(chunk),
    fp: livePartFp(trip, part),
    at,
    by,
    who,
    n: trip.expenses.length,
    ids: chunk.expenses.map((expense) => expense.id),
  }
  if (pingSize(ping) <= PING_MAX) return ping
  const slimmer = packLiveChunk(
    compactTripHeader(trip),
    trip,
    chunk.expenses.map((expense) => slimExpenseNote(expense, 24)),
  )
  ping.p = encodeTripShare(slimmer)
  ping.ids = slimmer.expenses.map((expense) => expense.id)
  if (pingSize(ping) <= PING_MAX) return ping
  const bare = packLiveChunk(
    compactTripHeader(trip),
    trip,
    chunk.expenses.map((expense) => slimExpenseNote(expense, 0)),
  )
  ping.p = encodeTripShare(bare)
  ping.ids = bare.expenses.map((expense) => expense.id)
  return ping
}

export async function publishLivePing(shareId: string, trip: Trip, bin?: string | null): Promise<void> {
  const withId = { ...trip, shareId, isDemo: false }
  rememberLiveTrip(shareId, withId)
  const full: LivePing = {
    v: 1,
    bin: bin || undefined,
    p: encodeTripShare(withId),
    fp: pingFingerprint(withId),
    at: Date.now(),
    by: liveClientId(),
    who: liveWho(withId),
    n: withId.expenses.length,
    ids: withId.expenses.map((expense) => expense.id),
  }
  try {
    channelFor(shareId)?.postMessage(full)
  } catch {
    /* older browsers */
  }

  const chunks = chunkTripForLive(withId)
  const bodies: string[] = []
  if (bin) {
    const binPing: LivePing = {
      v: 1,
      bin,
      fp: `${full.fp}:bin`,
      at: full.at,
      by: full.by,
      who: full.who,
      n: withId.expenses.length,
    }
    bodies.push(JSON.stringify(binPing))
  }
  for (const [i, chunk] of chunks.entries()) {
    const ping = fitChunkPing(withId, chunk, `${i}/${chunks.length}`, full.by, full.who, full.at)
    bodies.push(JSON.stringify(ping))
  }

  enqueueLiveBodies(shareId, bodies)
  await Promise.race([
    drainLiveQueue(shareId),
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1500)),
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

export async function pullLiveRoom(
  shareId: string,
): Promise<{ trip: Trip | null; expected: number }> {
  const pings = await pollLivePings(shareId)
  const advertised = new Set<string>()
  let expected = 0
  for (const ping of pings) {
    expected = Math.max(expected, ping.n ?? 0)
    for (const id of ping.ids ?? []) advertised.add(id)
  }
  expected = Math.max(expected, advertised.size)
  let merged: Trip | null = recalledLiveTrip(shareId)
  for (const ping of pings) {
    const trip = await tripFromPing(ping, shareId)
    if (!trip) continue
    merged = merged ? mergeTrips(merged, trip) : trip
  }
  if (merged) rememberLiveTrip(shareId, merged)
  return { trip: merged, expected }
}

export async function pullLatestLiveTrip(shareId: string): Promise<Trip | null> {
  return (await pullLiveRoom(shareId)).trip
}

export function subscribeLivePings(
  shareId: string,
  onPing: (ping: LivePing) => void,
  onTrip?: (trip: Trip) => void,
): () => void {
  const set = listeners.get(shareId) ?? new Set<(ping: LivePing) => void>()
  set.add(onPing)
  listeners.set(shareId, set)
  if (onTrip) {
    const trips = pullListeners.get(shareId) ?? new Set<(trip: Trip) => void>()
    trips.add(onTrip)
    pullListeners.set(shareId, trips)
  }
  ensureTransport(shareId)
  return () => {
    set.delete(onPing)
    if (onTrip) {
      const trips = pullListeners.get(shareId)
      trips?.delete(onTrip)
      if (trips && trips.size === 0) pullListeners.delete(shareId)
    }
    if (set.size === 0) transports.get(shareId)?.()
  }
}

export async function waitForLiveTrip(shareId: string, ms = 8000): Promise<Trip | null> {
  const started = Date.now()
  let best: Trip | null = recalledLiveTrip(shareId)
  let stable = 0
  while (Date.now() - started < ms) {
    const { trip, expected } = await pullLiveRoom(shareId)
    if (trip) {
      const next = best ? mergeTrips(best, trip) : trip
      const complete = expected === 0 || next.expenses.length >= expected
      if (best && liveContentKey(next) === liveContentKey(best)) {
        stable += 1
        best = next
        if (stable >= 1 && best.expenses.length > 0 && complete) return best
      } else {
        stable = 0
        best = next
      }
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 450))
  }
  return (await pullLiveRoom(shareId)).trip ?? best
}
