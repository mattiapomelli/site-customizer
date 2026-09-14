import { mods } from '../mods'
import { matchesAny } from '../core/match'
import {
  getSettings,
  isModEnabled,
  isSiteEnabled,
  setGlobalEnabled,
  setModEnabled,
  setSiteEnabled,
  type Settings,
} from '../core/storage'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const globalToggle = $<HTMLInputElement>('global')
const siteSection = $<HTMLElement>('site')
const siteToggle = $<HTMLInputElement>('site-toggle')
const hostnameEl = $<HTMLElement>('hostname')
const list = $<HTMLUListElement>('mods')
const empty = $<HTMLElement>('empty')

function row(title: string, sub: string, checked: boolean, onChange: (v: boolean) => void) {
  const li = document.createElement('li')
  li.className = 'row'
  li.innerHTML = `
    <div class="labels">
      <span class="title"></span>
      <span class="sub"></span>
    </div>
    <label class="switch"><input type="checkbox" /><span class="track"></span></label>`

  li.querySelector<HTMLElement>('.title')!.textContent = title
  li.querySelector<HTMLElement>('.sub')!.textContent = sub

  const input = li.querySelector<HTMLInputElement>('input')!
  input.checked = checked
  input.addEventListener('change', () => onChange(input.checked))
  return li
}

function render(settings: Settings, url: string | undefined): void {
  globalToggle.checked = settings.enabled
  document.body.classList.toggle('off', !settings.enabled)

  let hostname: string | null = null
  try {
    if (url) hostname = new URL(url).hostname
  } catch {
    hostname = null
  }

  if (hostname) {
    hostnameEl.textContent = hostname
    siteToggle.checked = isSiteEnabled(settings, hostname)
    siteToggle.onchange = () => void setSiteEnabled(hostname, siteToggle.checked)
    siteSection.hidden = false
  }

  const active = url ? mods.filter((m) => matchesAny(m.matches, url)) : []
  list.replaceChildren(
    ...active.map((mod) =>
      row(mod.name, mod.description ?? '', isModEnabled(settings, mod), (enabled) => {
        void setModEnabled(mod.id, enabled)
      }),
    ),
  )

  empty.hidden = active.length > 0
  empty.textContent = hostname
    ? `No mods for ${hostname} yet.`
    : 'Open a site to see its mods.'
}

async function main(): Promise<void> {
  const [settings, [tab]] = await Promise.all([
    getSettings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ])

  render(settings, tab?.url)

  globalToggle.addEventListener('change', async () => {
    const next = await setGlobalEnabled(globalToggle.checked)
    render(next, tab?.url)
  })
}

void main()
