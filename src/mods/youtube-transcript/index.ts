import { defineMod } from '../../core/define'
import { copyText } from '../../core/clipboard'
import { formatCues, getTranscript } from './transcript'

const CLASS = 'sc-yt-transcript'
const ROW_ID = '#top-level-buttons-computed'
const ROW = `ytd-watch-metadata ${ROW_ID}`
/** The Share button. We clone it so our button is native by construction. */
const REFERENCE = `${ROW} yt-button-view-model button`

const ICON =
  'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z'

const IDLE = 'Transcript'
const TITLE = 'Copy transcript (shift-click to include timestamps)'

/* YouTube's button classes do not style a disabled state, and the fallback
   below needs a full look. Everything else is inherited from the clone. */
const STYLES = `
.${CLASS}[disabled] { opacity: 0.6; cursor: default; }
.${CLASS}-fallback {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px 0 12px;
  border: none;
  border-radius: 18px;
  background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05));
  color: var(--yt-spec-text-primary, #0f0f0f);
  font-family: "Roboto", "Arial", sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.${CLASS}-fallback:hover { background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1)); }
.${CLASS}-fallback svg { width: 24px; height: 24px; fill: currentColor; }
`

interface Button {
  el: HTMLButtonElement
  setLabel(text: string): void
}

/**
 * Deep-clone YouTube's own button and swap its icon and label.
 * The class names are generated (`ytSpecButtonShapeNext...`) and churn between
 * builds, so we copy whatever is on the page rather than hardcoding them, and
 * navigate the clone by child order rather than by class.
 */
function cloneNative(reference: HTMLButtonElement): Button | null {
  const el = reference.cloneNode(true) as HTMLButtonElement

  // Custom elements would get upgraded by YouTube's framework once inserted.
  // They are decorative (ripple, rim light), so drop them.
  for (const node of el.querySelectorAll('yt-touch-feedback-shape, yt-light-shape')) {
    node.remove()
  }
  for (const attr of ['aria-label', 'aria-disabled', 'title', 'style']) {
    el.removeAttribute(attr)
  }

  const [icon, label] = el.children
  const svg = icon?.querySelector('svg')
  if (!svg || !(label instanceof HTMLElement)) return null

  svg.replaceChildren()
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICON)
  svg.append(path)

  return { el, setLabel: (text) => (label.textContent = text) }
}

/** Used only if YouTube's markup changes enough that there is nothing to clone. */
function buildFallback(): Button {
  const el = document.createElement('button')
  el.className = `${CLASS}-fallback`
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON}"></path></svg><span></span>`
  const label = el.querySelector('span')!
  return { el, setLabel: (text) => (label.textContent = text) }
}

/**
 * The real rendered gap between the first two items in the row. YouTube's
 * spacing lives on the `yt-button-view-model` wrappers, which our bare button
 * is not, so we measure it instead of matching their selector.
 */
function gapBetweenItems(row: Element): number {
  const [first, second] = row.children
  if (!first || !second) return 8
  const gap = second.getBoundingClientRect().left - first.getBoundingClientRect().right
  return gap > 0 && gap <= 24 ? gap : 8
}

export default defineMod({
  id: 'youtube-transcript',
  name: 'Copy transcript button',
  description: 'Adds a button under the video that copies the transcript. Shift-click for timestamps.',
  matches: ['*://*.youtube.com/watch*'],

  run(ctx) {
    ctx.css(STYLES)

    // Keyed on the reference button, not the row: the row exists before
    // YouTube has rendered the buttons we want to copy.
    ctx.onElement<HTMLButtonElement>(REFERENCE, (reference) => {
      const row = reference.closest(ROW_ID)
      if (!row || row.querySelector(`.${CLASS}`)) return

      const button = cloneNative(reference) ?? buildFallback()
      const { el, setLabel } = button

      el.classList.add(CLASS)
      el.title = TITLE
      el.style.marginLeft = `${gapBetweenItems(row)}px`
      setLabel(IDLE)

      let busy = false
      el.addEventListener('click', async (event) => {
        if (busy) return
        busy = true
        el.disabled = true
        setLabel('Copying…')

        try {
          const cues = await getTranscript(ctx)
          if (cues.length === 0) throw new Error('empty transcript')
          await copyText(formatCues(cues, event.shiftKey))
          setLabel(`Copied ${cues.length} lines`)
        } catch (err) {
          ctx.log('transcript copy failed', err)
          setLabel('No transcript')
        } finally {
          busy = false
          el.disabled = false
          setTimeout(() => setLabel(IDLE), 2000)
        }
      })

      row.append(el)
      ctx.onCleanup(() => el.remove())
    })
  },
})
