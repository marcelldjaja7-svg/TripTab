import type { Trip } from '../types'
import { normalizeTrip } from './storage'
import { decodeTripShare, encodeTripShare } from './share'

const NTFY = 'https://ntfy.sh'
const SNAPSHOT = 'https://bytebin.lucko.me'
const CLIENT_KEY = 'triptab.client'
const PING_MAX = 3500

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

export function liveTopic(shareId: string): string {
  const clean = shareId.replace(/[^a-zA-Z0-9_-]/g, '')
  return `tt${clean}`.slice(0, 64)
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

export async function publishLivePing(shareId: string, trip: Trip, bin?: string | null): Promise<void> {
  const ping: LivePing = {
    v: 1,
    bin: bin || undefined,
    fp: `${trip.updatedAt}:${trip.expenses.map((e) => `${e.id}:${e.updatedAt ?? e.createdAt}`).join(',')}:${trip.people.length}`,
    at: Date.now(),
    by: liveClientId(),
  }
  const encoded = encodeTripShare(trip)
  if (encoded.length <= PING_MAX) ping.p = encoded
  const body = JSON.stringify(ping)
  const topic = liveTopic(shareId)
  try {
    await fetch(`${NTFY}/${topic}`, { method: 'POST', body, credentials: 'omit' })
  } catch {
    /* SSE peers may still be on an older snapshot */
  }
  try {
    const ch = new BroadcastChannel(`triptab:${shareId}`)
    ch.postMessage(ping)
    ch.close()
  } catch {
    /* older browsers */
  }
}

export async function pollLivePings(shareId: string): Promise<LivePing[]> {
  try {
    const res = await fetch(`${NTFY}/${liveTopic(shareId)}/json?poll=1&since=all`, {
      method: 'GET',
      credentials: 'omit',
    })
    if (!res.ok) return []
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
    return []
  }
}

export async function pullLatestLiveTrip(shareId: string): Promise<Trip | null> {
  const pings = await pollLivePings(shareId)
  for (let i = pings.length - 1; i >= 0; i--) {
    const trip = await tripFromPing(pings[i]!, shareId)
    if (trip) return trip
  }
  return null
}

export function subscribeLivePings(shareId: string, onPing: (ping: LivePing) => void): () => void {
  const topic = liveTopic(shareId)
  let closed = false
  let source: EventSource | null = null

  const handle = (raw: unknown) => {
    const ping = parseLivePing(raw) ?? ntfyMessage(raw)
    if (!ping || ping.by === liveClientId()) return
    onPing(ping)
  }

  if (typeof EventSource !== 'undefined') {
    source = new EventSource(`${NTFY}/${topic}/sse`)
    source.onmessage = (event) => {
      try {
        handle(JSON.parse(event.data) as unknown)
      } catch {
        /* ignore keepalive */
      }
    }
  }

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(`triptab:${shareId}`)
    channel.onmessage = (event) => handle(event.data)
  } catch {
    channel = null
  }

  const poll = window.setInterval(() => {
    if (closed || document.hidden) return
    void pollLivePings(shareId).then((pings) => {
      const last = pings.at(-1)
      if (last) handle(last)
    })
  }, 8000)

  return () => {
    closed = true
    source?.close()
    channel?.close()
    window.clearInterval(poll)
  }
}
