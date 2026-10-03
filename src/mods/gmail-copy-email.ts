import { defineMod } from '../core/define'
import { copyText } from '../core/clipboard'
import { createSenderResolver, messageContainer } from './gmail-copy-email/sender'

const CLASS = 'sc-gmail-copy-email'
/**
 * The sender of an open message. Gmail stores the address in an `email`
 * attribute. For group-forwarded "via" messages this is the group address;
 * resolveSender reads the original Reply-To instead. Recipients (.g2) and
 * the thread list are deliberately left out.
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
.${CLASS}[data-error="true"] { opacity: 1; color: #d93025; }
.${CLASS}:disabled { cursor: progress; }
.${CLASS}-status {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  box-sizing: border-box;
  max-width: min(360px, calc(100vw - 40px));
  padding: 12px 16px;
  border-radius: 8px;
  background: #303134;
  color: #fff;
  font: 14px/1.4 Arial, sans-serif;
  white-space: normal;
  overflow-wrap: anywhere;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
`

export default defineMod({
  id: 'gmail-copy-email',
  name: 'Copy sender address',
  description: "Icon next to the sender that copies their email address.",
  matches: ['*://mail.google.com/*'],

  run(ctx) {
    ctx.css(STYLES)
    const resolveSender = createSenderResolver(ctx.url, ctx.signal)
    const status = document.createElement('div')
    status.className = `${CLASS}-status`
    status.setAttribute('role', 'status')
    let statusTimer: ReturnType<typeof setTimeout> | undefined
    const clearStatus = () => {
      clearTimeout(statusTimer)
      status.remove()
    }
    const showStatus = (text: string) => {
      clearStatus()
      status.textContent = text
      document.body.append(status)
      statusTimer = setTimeout(clearStatus, 4000)
    }
    ctx.onCleanup(clearStatus)

    ctx.onElement<HTMLElement>(TARGET, (span) => {
      // The details popup repeats the From row; keep one button on the header.
      if (span.closest('.ajA')) return
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
      const label = 'Copy sender address'
      const setLabel = (text: string) => {
        button.title = text
        button.setAttribute('aria-label', text)
      }
      setLabel(label)
      button.innerHTML = icon(COPY)

      let timer: ReturnType<typeof setTimeout> | undefined
      button.addEventListener('click', async (event) => {
        // Gmail opens a contact card on clicks anywhere in this header.
        event.preventDefault()
        event.stopPropagation()
        if (button.disabled) return
        button.disabled = true
        clearTimeout(timer)
        clearStatus()
        delete button.dataset.copied
        delete button.dataset.error
        button.innerHTML = icon(COPY)
        setLabel('Finding sender address…')

        try {
          const message = messageContainer(span) ?? span
          const address = await resolveSender(span)
          if (ctx.signal.aborted || !message.isConnected) return
          await copyText(address)
          if (ctx.signal.aborted) return
          showStatus(`Copied ${address}`)
          setLabel(`Copied ${address}`)
          button.dataset.copied = 'true'
          button.innerHTML = icon(DONE)
          clearTimeout(timer)
          timer = setTimeout(() => {
            delete button.dataset.copied
            button.innerHTML = icon(COPY)
            setLabel(`Copy ${address}`)
          }, 1200)
        } catch (err) {
          if (ctx.signal.aborted) return
          ctx.log('copy failed', err)
          button.dataset.error = 'true'
          button.textContent = '!'
          const message = err instanceof Error ? err.message : 'Could not copy sender address; try again'
          setLabel(message)
          showStatus(message)
        } finally {
          button.disabled = false
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
