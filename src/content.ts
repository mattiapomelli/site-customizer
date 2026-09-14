import { mods } from './mods'
import { runMod, type RunningMod } from './core/context'
import { getSettings, isModActive, onSettingsChanged, type Settings } from './core/storage'

const running = new Map<string, RunningMod>()
let settings: Settings | null = null
let lastUrl = location.href

/** Bring the set of running mods in line with the current settings + URL. */
function reconcile(): void {
  if (!settings) return
  const url = location.href

  for (const mod of mods) {
    const shouldRun = isModActive(settings, mod, url)
    const isRunning = running.has(mod.id)
    if (shouldRun === isRunning) continue

    if (shouldRun) {
      running.set(mod.id, runMod(mod, url))
    } else {
      running.get(mod.id)?.stop()
      running.delete(mod.id)
    }
  }
}

/** Mods are keyed on the URL they started for, so a soft navigation restarts them. */
function onNavigate(): void {
  if (location.href === lastUrl) return
  lastUrl = location.href
  for (const mod of running.values()) mod.stop()
  running.clear()
  reconcile()
}

function watchNavigation(): void {
  addEventListener('popstate', onNavigate)
  addEventListener('hashchange', onNavigate)

  // Same-document navigations the page pushes itself (YouTube, GitHub, ...).
  // The Navigation API reacts immediately where it is exposed to isolated
  // worlds; the poll is the backstop, and costs one string compare a second.
  const nav = (globalThis as { navigation?: EventTarget }).navigation
  nav?.addEventListener('navigate', () => setTimeout(onNavigate, 0))
  setInterval(onNavigate, 1000)
}

async function main(): Promise<void> {
  settings = await getSettings()
  reconcile()
  watchNavigation()
  onSettingsChanged((next) => {
    settings = next
    reconcile()
  })
}

void main()
