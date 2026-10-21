import type { ModContext } from './types'

type Navigation = {
  activation: NavigationActivation | null
  currentEntry: NavigationHistoryEntry | null
}

/** An arrival is a fresh navigation into this page, with no in-page navigation since. */
function isArrival(): boolean {
  const nav = (globalThis as { navigation?: Navigation }).navigation
  const activation = nav?.activation
  return (
    activation?.entry === nav?.currentEntry &&
    (activation?.navigationType === 'push' || activation?.navigationType === 'replace')
  )
}

/** On a fresh arrival, leave the page for `url` before it renders, without adding a history entry. */
export function redirectOnArrival(ctx: ModContext, url: string): void {
  if (!isArrival()) return
  ctx.css('html { visibility: hidden !important; }')
  // Keeps the site's app from booting and fetching the feed while the target loads.
  // It must come before replace(), which it would otherwise cancel.
  window.stop()
  location.replace(url)
}
