import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

async function loadModule(entryPoint) {
  const result = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const { default: mod } = await loadModule('src/mods/x-feed-to-profile.ts')
const { matchesAny } = await loadModule('src/core/match.ts')

const urls = [
  ['https://x.com/', true],
  ['https://x.com/home', true],
  ['https://x.com/home?foo=1', true],
  ['https://x.com/?lang=en', true],
  ['https://twitter.com/', true],
  ['https://twitter.com/home', true],
  ['https://x.com/mattiapomelli', false],
  ['https://x.com/homedepot', false],
  ['https://x.com/messages', false],
  ['https://x.com/explore', false],
  ['https://x.com/i/flow/login', false],
  ['https://pro.x.com/', false],
  ['https://x.com/search?q=home', false],
]

for (const [url, redirects] of urls) {
  test(`${url} ${redirects ? 'redirects' : 'does not redirect'}`, () => {
    assert.equal(matchesAny(mod.matches, url), redirects)
  })
}

test('run() stops the feed page, then replaces it with the profile without a history entry', () => {
  const calls = []
  const stubs = {
    location: {
      replace: (url) => calls.push(['replace', url]),
      assign: (url) => calls.push(['assign', url]),
    },
    window: { stop: () => calls.push(['stop']) },
  }
  const saved = Object.fromEntries(
    Object.keys(stubs).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  for (const [key, value] of Object.entries(stubs)) {
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  try {
    mod.run({
      url: 'https://x.com/home',
      signal: new AbortController().signal,
      css() {},
      log() {},
      onCleanup() {},
      onElement() {},
      onDomChange() {},
    })
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
  assert.deepEqual(calls, [['stop'], ['replace', '/mattiapomelli']])
})
