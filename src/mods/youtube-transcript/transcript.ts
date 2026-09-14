import type { ModContext } from '../../core/define'

export interface Cue {
  /** Seconds from the start of the video. */
  start: number
  text: string
}

/**
 * The same call YouTube's own transcript panel makes.
 *
 * Two earlier approaches are gone because both were verified dead, not merely
 * fragile: the `timedtext` caption URL answers 200-with-empty-body for
 * auto-generated tracks, which need a proof-of-origin token only the player
 * has; and clicking "Show transcript" from a content script never opens the
 * panel, even as a real trusted click. `get_transcript` is also gone and now
 * answers FAILED_PRECONDITION.
 *
 * This endpoint needs no auth header, no cookies, and no page scrape.
 */
const ENDPOINT = 'https://www.youtube.com/youtubei/v1/get_panel?prettyPrint=false'
const PANEL_ID = 'PAmodern_transcript_view'
/** Only has to be roughly current — a year-old version is still accepted. */
const CLIENT_VERSION = '2.20250101.00.00'

/**
 * `params` is a protobuf of `{ 149: { 1: videoId, 3: 2 } }`. Small enough to
 * emit by hand; video ids are always 11 chars, so this never needs padding.
 */
function buildParams(videoId: string): string {
  const id = new TextEncoder().encode(videoId)
  const inner = [0x0a, id.length, ...id, 0x18, 0x02]
  return btoa(String.fromCharCode(0xaa, 0x09, inner.length, ...inner))
}

interface SegmentViewModel {
  simpleText?: string
  timestamp?: string
}

/**
 * Collect every segment wherever it sits. The response nests them about eight
 * levels down through renderers we have no other use for, so walking for the
 * key we want survives YouTube reshuffling the wrapper layers.
 */
function collectSegments(node: unknown, out: SegmentViewModel[] = []): SegmentViewModel[] {
  if (Array.isArray(node)) {
    for (const item of node) collectSegments(item, out)
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'transcriptSegmentViewModel') out.push(value as SegmentViewModel)
      else collectSegments(value, out)
    }
  }
  return out
}

/** "1:02:43" -> 3763 */
function parseTimestamp(raw: string): number {
  return raw
    .trim()
    .split(':')
    .reduce((acc, part) => acc * 60 + (Number(part) || 0), 0)
}

export async function getTranscript(ctx: ModContext): Promise<Cue[]> {
  const videoId = new URL(location.href).searchParams.get('v')
  if (!videoId) throw new Error('no video id in the URL')

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    signal: ctx.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION } },
      panelId: PANEL_ID,
      params: buildParams(videoId),
    }),
  })
  if (!res.ok) throw new Error(`get_panel returned ${res.status}`)

  const segments = collectSegments(await res.json())
  ctx.log(`${segments.length} segments for ${videoId}`)

  return segments
    .map((s) => ({ start: parseTimestamp(s.timestamp ?? '0'), text: (s.simpleText ?? '').trim() }))
    .filter((c) => c.text !== '')
}

const stamp = (seconds: number): string => {
  const s = Math.floor(seconds)
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  const hh = Math.floor(s / 3600)
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatCues(cues: Cue[], withTimestamps: boolean): string {
  if (withTimestamps) {
    return cues.map((c) => `[${stamp(c.start)}] ${c.text}`).join('\n')
  }
  // Reflow into readable prose rather than one line per caption chunk.
  return cues
    .map((c) => c.text.replace(/\s+/g, ' '))
    .join(' ')
    .replace(/([.!?]) (?=[A-Z])/g, '$1\n\n')
}
