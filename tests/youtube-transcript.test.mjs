import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { parseHTML } from 'linkedom'

async function loadModule(entryPoint) {
  const result = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const { default: mod } = await loadModule('src/mods/youtube-transcript/index.ts')

const share = '<yt-button-view-model><button><div><svg></svg></div><div>Share</div></button></yt-button-view-model>'
const save = '<yt-button-view-model><button><div><svg></svg></div><div>Save</div></button></yt-button-view-model>'

function run(doc) {
  let onDomChange = null
  const cleanups = []
  const oldDocument = globalThis.document
  const oldHTMLElement = globalThis.HTMLElement
  globalThis.document = doc
  globalThis.HTMLElement = doc.defaultView.HTMLElement
  mod.run({
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    signal: new AbortController().signal,
    css() {},
    log() {},
    onCleanup(fn) { cleanups.push(fn) },
    onElement() { assert.fail('the button must not depend on seeing a new element') },
    onDomChange(fn) { onDomChange = fn },
  })
  return {
    domChanged: () => onDomChange(),
    stop() {
      cleanups.reverse().forEach((fn) => fn())
      globalThis.document = oldDocument
      globalThis.HTMLElement = oldHTMLElement
    },
  }
}

test('the button comes back when YouTube re-renders the row but keeps the Share button', () => {
  const { document: doc } = parseHTML(
    `<html><body><ytd-watch-metadata><div id="top-level-buttons-computed">${share}${save}</div></ytd-watch-metadata></body></html>`,
  )
  const row = doc.querySelector('#top-level-buttons-computed')
  const shareButton = row.querySelector('button')
  const mod = run(doc)
  try {
    mod.domChanged()
    const button = row.querySelector('.sc-yt-transcript')
    assert.ok(button, 'button is added on the first video')
    assert.equal(button.textContent, 'Transcript')

    // Next video in a playlist: the row's children are re-stamped, with the
    // existing Share button reused rather than recreated.
    row.replaceChildren(shareButton.parentElement, ...parseHTML(save).document.childNodes)
    assert.equal(row.querySelector('.sc-yt-transcript'), null)

    mod.domChanged()
    assert.equal(row.querySelectorAll('.sc-yt-transcript').length, 1, 'button is back, once')
    assert.equal(row.querySelector('.sc-yt-transcript'), button, 'same button, so a copy in flight keeps its label')

    mod.domChanged()
    assert.equal(row.querySelectorAll('.sc-yt-transcript').length, 1, 'no duplicates on later mutations')
  } finally {
    mod.stop()
  }
  assert.equal(doc.querySelector('.sc-yt-transcript'), null, 'cleanup removes the button')
})

test('waits for the Share button before adding anything', () => {
  const { document: doc } = parseHTML(
    '<html><body><ytd-watch-metadata><div id="top-level-buttons-computed"></div></ytd-watch-metadata></body></html>',
  )
  const row = doc.querySelector('#top-level-buttons-computed')
  const mod = run(doc)
  try {
    mod.domChanged()
    assert.equal(row.querySelector('.sc-yt-transcript'), null)
    row.innerHTML = share
    mod.domChanged()
    assert.ok(row.querySelector('.sc-yt-transcript'))
  } finally {
    mod.stop()
  }
})
