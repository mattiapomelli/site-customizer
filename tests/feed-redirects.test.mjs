import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

async function loadModule(entryPoint) {
  const result = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const { default: xFeedToProfile } = await loadModule('src/mods/x-feed-to-profile.ts')
const { default: youtubeHomeToChannel } = await loadModule('src/mods/youtube-home-to-channel.ts')
const { matchesAny } = await loadModule('src/core/match.ts')

const cases = [
  [
    xFeedToProfile,
    '/mattiapomelli',
    [
      'https://x.com/',
      'https://x.com/home',
      'https://x.com/home?foo=1',
      'https://x.com/?lang=en',
      'https://twitter.com/',
      'https://twitter.com/home',
    ],
    [
      'https://x.com/mattiapomelli',
      'https://x.com/homedepot',
      'https://x.com/messages',
      'https://x.com/explore',
      'https://x.com/i/flow/login',
      'https://pro.x.com/',
      'https://x.com/search?q=home',
    ],
  ],
  [
    youtubeHomeToChannel,
    '/@mattiapomelli',
    [
      'https://www.youtube.com/',
      'https://www.youtube.com/?app=desktop',
      'https://www.youtube.com/?bp=wgUCEAE%3D',
    ],
    [
      'https://www.youtube.com/@mattiapomelli',
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      'https://www.youtube.com/feed/subscriptions',
      'https://www.youtube.com/results?search_query=home',
      'https://www.youtube.com/shorts/abc',
      'https://music.youtube.com/',
      'https://studio.youtube.com/',
    ],
  ],
]

function run(mod, url, navigation) {
  const calls = []
  const stubs = {
    location: {
      replace: (target) => calls.push(['replace', target]),
      assign: (target) => calls.push(['assign', target]),
    },
    window: { stop: () => calls.push(['stop']) },
    navigation,
  }
  const saved = Object.fromEntries(
    Object.keys(stubs).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  for (const [key, value] of Object.entries(stubs)) {
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  try {
    mod.run({
      url,
      signal: new AbortController().signal,
      css: () => calls.push(['hide']),
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
  return calls
}

/** A page reached by `navigationType`, then navigated within if `inPage`. */
function navigation(navigationType, { inPage = false } = {}) {
  const entry = {}
  return { activation: { navigationType, entry }, currentEntry: inPage ? {} : entry }
}

for (const [mod, target, redirecting, staying] of cases) {
  for (const url of redirecting) {
    test(`${mod.id}: ${url} redirects`, () => {
      assert.equal(matchesAny(mod.matches, url), true)
    })
  }
  for (const url of staying) {
    test(`${mod.id}: ${url} does not redirect`, () => {
      assert.equal(matchesAny(mod.matches, url), false)
    })
  }

  for (const navigationType of ['push', 'replace']) {
    test(`${mod.id}: a fresh ${navigationType} arrival hides and stops the page, then replaces it with ${target}`, () => {
      assert.deepEqual(run(mod, redirecting[0], navigation(navigationType)), [
        ['hide'],
        ['stop'],
        ['replace', target],
      ])
    })
  }

  for (const navigationType of ['reload', 'traverse']) {
    test(`${mod.id}: a ${navigationType} leaves the feed alone`, () => {
      assert.deepEqual(run(mod, redirecting[0], navigation(navigationType)), [])
    })
  }

  test(`${mod.id}: an in-page navigation to the feed leaves it alone`, () => {
    assert.deepEqual(run(mod, redirecting[0], navigation('push', { inPage: true })), [])
  })
}
