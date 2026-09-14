/**
 * One MutationObserver for the whole page, shared by every mod.
 * Scans are coalesced into a single animation frame so busy SPAs
 * (YouTube mutates constantly) cost one querySelectorAll per selector per frame.
 */

interface Watcher {
  selector: string
  fn: (el: Element) => void
  seen: WeakSet<Element>
}

const watchers = new Set<Watcher>()
let observer: MutationObserver | null = null
let scheduled = false

function scan(): void {
  scheduled = false
  for (const w of watchers) {
    for (const el of document.querySelectorAll(w.selector)) {
      if (w.seen.has(el)) continue
      w.seen.add(el)
      try {
        w.fn(el)
      } catch (err) {
        console.error('[site-customizer] watcher failed', w.selector, err)
      }
    }
  }
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(scan)
}

function start(): void {
  if (observer) return
  observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

function stopIfIdle(): void {
  if (watchers.size > 0 || !observer) return
  observer.disconnect()
  observer = null
}

/** Watch for elements matching `selector`. Returns an unsubscribe function. */
export function watch<T extends Element>(selector: string, fn: (el: T) => void): () => void {
  const watcher: Watcher = { selector, fn: fn as (el: Element) => void, seen: new WeakSet() }
  watchers.add(watcher)
  start()
  schedule()
  return () => {
    watchers.delete(watcher)
    stopIfIdle()
  }
}
