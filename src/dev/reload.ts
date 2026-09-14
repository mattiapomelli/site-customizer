/**
 * Dev-only auto-reload. Bundled and registered as a service worker *only* by
 * `npm run dev` — `npm run build` leaves it out of the manifest entirely.
 *
 * The watch build stamps `dist/build-id` after it finishes writing everything
 * else. This worker polls that file; when it changes, the extension reloads
 * itself and then reloads any tab a content script runs on, so a rebuild lands
 * in the browser without touching chrome://extensions.
 */

const POLL_MS = 1000
const PENDING = '__dev_pending_tab_reload'

async function readBuildId(): Promise<string | null> {
  try {
    const res = await fetch(chrome.runtime.getURL('build-id'), { cache: 'no-store' })
    return res.ok ? await res.text() : null
  } catch {
    // Mid-write, or the file is briefly missing. Try again next tick.
    return null
  }
}

async function reloadInjectedTabs(): Promise<void> {
  const matches = (chrome.runtime.getManifest().content_scripts ?? []).flatMap(
    (cs) => cs.matches ?? [],
  )
  if (matches.length === 0) return

  const tabs = await chrome.tabs.query({ url: matches })
  await Promise.all(tabs.map((tab) => (tab.id == null ? null : chrome.tabs.reload(tab.id))))
  console.log(`[dev-reload] reloaded ${tabs.length} tab(s)`)
}

async function main(): Promise<void> {
  // We are starting up again after reloading ourselves: finish the job.
  const stored = await chrome.storage.local.get(PENDING)
  if (stored[PENDING]) {
    await chrome.storage.local.remove(PENDING)
    await reloadInjectedTabs()
  }

  let known = await readBuildId()
  console.log('[dev-reload] watching build', known)

  setInterval(async () => {
    // Doubles as the service worker keepalive: an extension API call every
    // tick resets the 30s idle timer that would otherwise kill this worker.
    void chrome.runtime.getPlatformInfo()

    const current = await readBuildId()
    if (current === null || current === known) return

    known = current
    console.log('[dev-reload] new build, reloading extension')
    await chrome.storage.local.set({ [PENDING]: true })
    chrome.runtime.reload()
  }, POLL_MS)
}

void main()
