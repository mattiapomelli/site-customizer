import { defineMod } from '../core/define'
import { copyText } from '../core/clipboard'

const CLASS = 'sc-gmail-copy-email'
/**
 * The sender of an open message. Gmail stores the address in an `email`
 * attribute, so there is no "Name <addr>" text to parse. Recipients (.g2) are
 * deliberately left out, as is the thread list, which would put an icon on
 * every row.
 */
const TARGET = 'span.gD[email]'
/**
 * Gmail shows "<addr@example.com>" next to the name on an open message, in its
 * own element. Found by content rather than class name, since the class was
 * not what it looked like and would churn anyway. Returns null on a collapsed
 * message, which shows no address at all.
 */
function findAddressElement(span: HTMLElement, email: string): Element | null {
  const parent = span.parentElement
  if (!parent) return null
  for (const el of parent.children) {
    if (el === span || el.contains(span) || el.classList.contains(CLASS)) continue
    if (el.textContent?.includes(email)) return el
  }
  return null
}

const COPY =
  '<path d="M13 1H3a1 1 0 0 0-1 1v10h2V3h9V1Zm2 3H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Zm-1 11H7V6h7v9Z"/>'
const DONE = '<path d="M7.6 13.4 3.2 9l1.4-1.4 3 3 6.8-6.8L15.8 5 7.6 13.4Z"/>'
const icon = (path: string) => `<svg viewBox="0 0 18 18" aria-hidden="true">${path}</svg>`

const STYLES = `
.${CLASS} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 3px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  /* Inherit so it follows Gmail's light and dark themes for free. */
  color: inherit;
  opacity: 0.4;
  cursor: pointer;
  vertical-align: middle;
  transition: opacity 100ms ease, background 100ms ease;
}
.${CLASS}:hover { opacity: 1; background: rgba(127, 127, 127, 0.2); }
.${CLASS} svg { width: 14px; height: 14px; fill: currentColor; display: block; }
.${CLASS}[data-copied="true"] { opacity: 1; color: #188038; }
`

export default defineMod({
  id: 'gmail-copy-email',
  name: 'Copy sender address',
  description: "Icon next to the sender that copies their email address.",
  matches: ['*://mail.google.com/*'],

  run(ctx) {
    ctx.css(STYLES)

    ctx.onElement<HTMLElement>(TARGET, (span) => {
      const email = span.getAttribute('email')
      if (!email?.includes('@')) return

      // Sit after the visible address when there is one, so the button is not
      // wedged between the name and the address.
      const anchor = findAddressElement(span, email) ?? span
      if (anchor.nextElementSibling?.classList.contains(CLASS)) return
      ctx.log(anchor === span ? 'no address shown, anchoring to name' : 'anchoring after', anchor)

      const button = document.createElement('button')
      button.className = CLASS
      button.type = 'button'
      button.title = `Copy ${email}`
      button.setAttribute('aria-label', `Copy ${email}`)
      button.innerHTML = icon(COPY)

      let timer: ReturnType<typeof setTimeout> | undefined
      button.addEventListener('click', async (event) => {
        // Gmail opens a contact card on clicks anywhere in this header.
        event.preventDefault()
        event.stopPropagation()

        try {
          await copyText(email)
          button.dataset.copied = 'true'
          button.innerHTML = icon(DONE)
          clearTimeout(timer)
          timer = setTimeout(() => {
            delete button.dataset.copied
            button.innerHTML = icon(COPY)
          }, 1200)
        } catch (err) {
          ctx.log('copy failed', err)
        }
      })

      anchor.after(button)
      ctx.onCleanup(() => {
        clearTimeout(timer)
        button.remove()
      })
    })
  },
})
