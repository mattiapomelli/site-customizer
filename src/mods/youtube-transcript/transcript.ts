import type { ModContext } from '../../core/define'
import { extractJsonAfter } from '../../core/json'

export interface Cue {
  /** Seconds from the start of the video. */
  start: number
  text: string
}

/* ------------------------------------------------------------------ *
 * Path 1: the caption tracks YouTube's own player uses.
 * Fast and complete, but it depends on undocumented page internals.
 * ------------------------------------------------------------------ */

interface CaptionTrack {
  baseUrl?: string
  languageCode?: string
  kind?: string
  name?: { simpleText?: string }
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const uiLang = document.documentElement.lang?.split('-')[0] ?? 'en'
  const inUiLang = tracks.filter((t) => t.languageCode?.split('-')[0] === uiLang)
  const pool = inUiLang.length > 0 ? inUiLang : tracks
  // Prefer human-authored captions over 'asr' (auto-generated).
  return pool.find((t) => t.kind !== 'asr') ?? pool[0]
}

async function fetchCues(videoId: string, signal: AbortSignal): Promise<Cue[]> {
  const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    credentials: 'include',
    signal,
  })
  const html = await page.text()

  const player = extractJsonAfter(html, 'ytInitialPlayerResponse') as
    | { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } }
    | null

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  const track = pickTrack(tracks)
  if (!track?.baseUrl) throw new Error('no caption track')

  const res = await fetch(`${track.baseUrl}&fmt=json3`, { credentials: 'include', signal })
  if (!res.ok) throw new Error(`timedtext ${res.status}`)

  // YouTube answers 200 with an empty body when the track needs a
  // proof-of-origin token, which the player has and we do not. Common on
  // auto-generated tracks. Say so, instead of failing on unparseable JSON.
  const raw = await res.text()
  if (raw.trim() === '') throw new Error('timedtext returned empty — captions are token-gated')

  const body = JSON.parse(raw) as {
    events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>
  }

  return (body.events ?? [])
    .map((e) => ({
      start: (e.tStartMs ?? 0) / 1000,
      text: (e.segs ?? [])
        .map((s) => s.utf8 ?? '')
        .join('')
        .trim(),
    }))
    .filter((c) => c.text !== '')
}

/* ------------------------------------------------------------------ *
 * Path 2: read the transcript panel YouTube renders in the page.
 * Slower and it flashes the panel open, but it only breaks if the
 * visible UI breaks.
 * ------------------------------------------------------------------ */

const PANEL =
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'

const isPanelOpen = (el: Element | null) =>
  el?.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED'

function parseTimestamp(raw: string): number {
  const parts = raw.trim().split(':').map(Number)
  return parts.reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0)
}

/** Where YouTube has put the "Show transcript" control, most specific first. */
const TRANSCRIPT_BUTTONS = [
  'ytd-video-description-transcript-section-renderer button',
  '#description-inline-expander ytd-video-description-transcript-section-renderer button',
  'ytd-engagement-panel-section-list-renderer #header button[aria-label*="ranscript" i]',
]

/**
 * Last resort when none of the known selectors hit: anything that names itself
 * as the transcript toggle. Skips our own button, which is also called
 * "Transcript" and would otherwise click itself.
 */
function findByLabel(): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'button, ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model',
  )
  for (const el of candidates) {
    if (el.closest('.sc-yt-transcript')) continue
    const text = `${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`
    if (/transcript/i.test(text)) return el
  }
  return null
}

function findTranscriptButton(): HTMLElement | null {
  for (const selector of TRANSCRIPT_BUTTONS) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return findByLabel()
}

async function openPanel(ctx: ModContext): Promise<boolean> {
  if (isPanelOpen(document.querySelector(PANEL))) return false

  // The control lives inside the description, which may still be collapsed.
  document.querySelector<HTMLElement>('#description-inline-expander #expand')?.click()

  let button = findTranscriptButton()
  if (!button) {
    // Expanding is async; give it one pass of the observer before giving up.
    await ctx.waitFor(TRANSCRIPT_BUTTONS[0]!, { timeout: 4000 }).catch(() => null)
    button = findTranscriptButton()
  }
  if (!button) throw new Error('could not find a "Show transcript" control on the page')

  ctx.log('opening the transcript panel via', button)
  button.click()
  return true
}

function closePanel(): void {
  document.querySelector<HTMLElement>(`${PANEL} #visibility-button button`)?.click()
}

async function scrapeCues(ctx: ModContext): Promise<Cue[]> {
  const weOpenedIt = await openPanel(ctx)
  try {
    await ctx.waitFor('ytd-transcript-segment-renderer', { timeout: 8000 })
    // Segments stream in; wait until the count stops growing.
    let previous = -1
    for (let i = 0; i < 20; i++) {
      const count = document.querySelectorAll('ytd-transcript-segment-renderer').length
      if (count === previous) break
      previous = count
      await new Promise((r) => setTimeout(r, 150))
    }

    return [...document.querySelectorAll('ytd-transcript-segment-renderer')]
      .map((seg) => ({
        start: parseTimestamp(seg.querySelector('.segment-timestamp')?.textContent ?? '0'),
        text: (seg.querySelector('.segment-text')?.textContent ?? '').trim(),
      }))
      .filter((c) => c.text !== '')
  } finally {
    if (weOpenedIt) closePanel()
  }
}

/* ------------------------------------------------------------------ */

export async function getTranscript(ctx: ModContext): Promise<Cue[]> {
  const videoId = new URL(location.href).searchParams.get('v')

  if (videoId) {
    try {
      const cues = await fetchCues(videoId, ctx.signal)
      if (cues.length > 0) return cues
    } catch (err) {
      ctx.log('caption API unavailable, reading the transcript panel instead', err)
    }
  }

  return scrapeCues(ctx)
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
