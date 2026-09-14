import type { Mod } from './types'
import { matchesAny } from './match'

const KEY = 'settings'

export interface Settings {
  /** Master switch. */
  enabled: boolean
  /** Mod id -> enabled. Absent means "use the mod's default". */
  mods: Record<string, boolean>
  /** Hostname -> enabled. Absent means enabled. */
  sites: Record<string, boolean>
}

const DEFAULTS: Settings = { enabled: true, mods: {}, sites: {} }

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY)
  return { ...DEFAULTS, ...(stored[KEY] as Partial<Settings> | undefined) }
}

async function update(patch: (s: Settings) => Settings): Promise<Settings> {
  const next = patch(await getSettings())
  await chrome.storage.sync.set({ [KEY]: next })
  return next
}

export const setGlobalEnabled = (enabled: boolean) => update((s) => ({ ...s, enabled }))

export const setModEnabled = (id: string, enabled: boolean) =>
  update((s) => ({ ...s, mods: { ...s.mods, [id]: enabled } }))

export const setSiteEnabled = (hostname: string, enabled: boolean) =>
  update((s) => ({ ...s, sites: { ...s.sites, [hostname]: enabled } }))

export function onSettingsChanged(fn: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes[KEY]) {
      fn({ ...DEFAULTS, ...(changes[KEY].newValue as Partial<Settings> | undefined) })
    }
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export const isModEnabled = (settings: Settings, mod: Mod): boolean =>
  settings.mods[mod.id] ?? mod.defaultEnabled ?? true

export const isSiteEnabled = (settings: Settings, hostname: string): boolean =>
  settings.sites[hostname] ?? true

/** The single source of truth for "should this mod be running right now?". */
export function isModActive(settings: Settings, mod: Mod, url: string): boolean {
  if (!settings.enabled) return false
  if (!matchesAny(mod.matches, url)) return false
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }
  return isSiteEnabled(settings, hostname) && isModEnabled(settings, mod)
}
