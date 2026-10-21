import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

async function loadModule(entryPoint) {
  const result = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const { mods } = await loadModule('src/mods/index.ts')
const { matchesSite } = await loadModule('src/core/match.ts')

const listedOn = (url) => mods.filter((m) => matchesSite(m.matches, url)).map((m) => m.id)

test('the X redirect is listed on an X page it does not redirect', () => {
  assert.deepEqual(listedOn('https://x.com/mattiapomelli'), ['x-feed-to-profile'])
})

test('both YouTube mods are listed on a YouTube channel page', () => {
  assert.deepEqual(listedOn('https://www.youtube.com/@mattiapomelli'), [
    'youtube-transcript',
    'youtube-home-to-channel',
  ])
})

test('only the Gmail mod is listed on Gmail', () => {
  assert.deepEqual(listedOn('https://mail.google.com/mail/u/0/'), ['gmail-copy-email'])
})

test('redirect mods are not listed on sibling subdomains they never touch', () => {
  assert.deepEqual(listedOn('https://pro.x.com/'), [])
  assert.deepEqual(listedOn('https://music.youtube.com/'), ['youtube-transcript'])
})
