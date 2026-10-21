import type { ModContext } from './types'

/** Leave the page for `url` before it renders, without adding a history entry. */
export function redirect(ctx: ModContext, url: string): void {
  ctx.css('html { visibility: hidden !important; }')
  // Keeps the site's app from booting and fetching the feed while the target loads.
  // It must come before replace(), which it would otherwise cancel.
  window.stop()
  location.replace(url)
}
