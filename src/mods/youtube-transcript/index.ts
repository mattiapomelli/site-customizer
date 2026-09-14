import { defineMod } from '../../core/define'
import { copyText } from '../../core/clipboard'
import { formatCues, getTranscript } from './transcript'

const BUTTON_CLASS = 'sc-yt-transcript'

const STYLES = `
.${BUTTON_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  /* Matches YouTube's own icon+label buttons: tighter on the icon side. */
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
  transition: background 120ms ease, opacity 120ms ease;
}
.${BUTTON_CLASS}:hover { background: var(--yt-spec-10-percent-layer, rgba(0, 0, 0, 0.1)); }
.${BUTTON_CLASS}[disabled] { cursor: default; opacity: 0.6; }
.${BUTTON_CLASS} svg { width: 24px; height: 24px; fill: currentColor; }
`

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>`

export default defineMod({
  id: 'youtube-transcript',
  name: 'Copy transcript button',
  description: 'Adds a button under the video that copies the transcript. Shift-click for timestamps.',
  matches: ['*://*.youtube.com/watch*'],

  run(ctx) {
    ctx.css(STYLES)

    ctx.onElement<HTMLElement>('ytd-watch-metadata #top-level-buttons-computed', (row) => {
      if (row.querySelector(`.${BUTTON_CLASS}`)) return

      const button = document.createElement('button')
      button.className = BUTTON_CLASS
      button.title = 'Copy transcript (shift-click to include timestamps)'

      const label = (text: string) => {
        button.innerHTML = `${ICON}<span></span>`
        button.querySelector('span')!.textContent = text
      }
      label('Transcript')

      let busy = false
      button.addEventListener('click', async (event) => {
        if (busy) return
        busy = true
        button.disabled = true
        label('Copying…')

        try {
          const cues = await getTranscript(ctx)
          if (cues.length === 0) throw new Error('empty transcript')
          await copyText(formatCues(cues, event.shiftKey))
          label(`Copied ${cues.length} lines`)
        } catch (err) {
          ctx.log('transcript copy failed', err)
          label('No transcript')
        } finally {
          busy = false
          button.disabled = false
          setTimeout(() => label('Transcript'), 2000)
        }
      })

      row.append(button)
      ctx.onCleanup(() => button.remove())
    })
  },
})
