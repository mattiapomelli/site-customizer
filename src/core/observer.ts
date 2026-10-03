/**
 * One MutationObserver for the whole page, shared by every mod.
 * Scans are coalesced into a single animation frame so busy SPAs
 * (YouTube mutates constantly) cost one pass per subscriber per frame.
 */

const subscribers = new Set<() => void>()
let observer: MutationObserver | null = null
let scheduled = false

function scan(): void {
  scheduled = false
  for (const fn of subscribers) {
    try {
      fn()
    } catch (err) {
      console.error('[site-customizer] DOM subscriber failed', err)
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
  if (subscribers.size > 0 || !observer) return
  observer.disconnect()
  observer = null
}

/** Call `fn` now and after DOM changes, at most once per frame. Returns an unsubscribe function. */
export function onMutation(fn: () => void): () => void {
  subscribers.add(fn)
  start()
  schedule()
  return () => {
    subscribers.delete(fn)
    stopIfIdle()
  }
}

/** Watch for elements matching `selector`, once each. Returns an unsubscribe function. */
export function watch<T extends Element>(selector: string, fn: (el: T) => void): () => void {
  const seen = new WeakSet<Element>()
  return onMutation(() => {
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue
      seen.add(el)
      try {
        fn(el as T)
      } catch (err) {
        console.error('[site-customizer] watcher failed', selector, err)
      }
    }
  })
}
