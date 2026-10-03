import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { build } from 'esbuild'
import { parseHTML } from 'linkedom'

async function loadModule(entryPoint) {
  const result = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const { createSenderResolver, originalMessageUrl, replyToAddress } = await loadModule('src/mods/gmail-copy-email/sender.ts')
const { default: mod } = await loadModule('src/mods/gmail-copy-email.ts')
const pageUrl = 'https://mail.google.com/mail/u/2/?example=1#inbox/thread-not-message'
const group = 'support@example.com'
const sender = 'francis@example.net'
const headers = (address = sender) => `From: "'Francis Tamer' via support" <${group}>\r\nReply-To: Francis Tamer <${address}>\r\nTo: support@recipient.example\r\n\r\nBody with unrelated@example.org`

function message(id = 'a123', name = "'Francis Tamer' via support", email = group) {
  return `<div class="adn" data-legacy-message-id="${id}"><div><span class="gD" email="${email}">${name}</span><span>&lt;${email}&gt;</span></div><span class="g2" email="support@recipient.example">support</span></div>`
}

function fixture(html = message()) {
  return parseHTML(`<html><body>${html}</body></html>`).document
}

function collapsedMessage(id = 'a123') {
  return `<div class="kv">
    <div class="adf ads"><span class="gD" email="${group}">'Francis Tamer' via support</span></div>
    <div class="adn ads" data-message-id="#msg-f:123456" data-legacy-message-id="${id}" style="display:none"></div>
  </div>`
}

function unloadedMessage() {
  return `<div class="kv"><div class="adf ads"><span class="gD" email="${group}">'Francis Tamer' via support</span></div></div>`
}

afterEach(() => mock.restoreAll())

test('copies the person in Reply-To, excluding the group and recipient', () => {
  assert.equal(replyToAddress(headers(), group), sender)
  assert.equal(replyToAddress(headers(`${group}>, "Tamer, Francis" <${sender}`), group), sender)
})

test('accepts folded headers, plus addresses, and quoted display names', () => {
  const source = `fRoM: "Support" <${group}>\nRePlY-To:\n\t"Tamer, Francis" <francis+support@example.net>\n\nBody`
  assert.equal(replyToAddress(source, group), 'francis+support@example.net')
})

test('never takes addresses from the body, an ambiguous list, or another message', () => {
  for (const source of [
    `From: ${group}\nTo: ${sender}\n\nReply-To: ${sender}`,
    headers(group),
    headers(`${sender}>, Other <other@example.net`),
    headers().replace('Reply-To:', `Reply-To: other@example.net\r\nReply-To:`),
    headers().replace(group, 'other-group@example.com'),
    '<html><body>Please sign in</body></html>',
  ]) assert.throws(() => replyToAddress(source, group))
})

test('uses each message ID and preserves the active account/delegation path', () => {
  const doc = fixture(message('a123') + message('b456'))
  const spans = doc.querySelectorAll('.gD')
  const first = originalMessageUrl(spans[0], pageUrl)
  const second = originalMessageUrl(spans[1], 'https://mail.google.com/mail/b/delegate/u/1/#inbox/thread')
  assert.equal(first.searchParams.get('th'), 'a123')
  assert.equal(first.pathname, '/mail/u/2/')
  assert.equal(first.hash, '')
  assert.equal(first.searchParams.get('example'), null)
  assert.equal(second.searchParams.get('th'), 'b456')
  assert.equal(second.pathname, '/mail/b/delegate/u/1/')
  spans[0].closest('.adn').removeAttribute('data-legacy-message-id')
  spans[0].closest('.adn').setAttribute('data-message-id', '#msg-f:123456')
  assert.equal(originalMessageUrl(spans[0], pageUrl).searchParams.get('permmsgid'), 'msg-f:123456')
})

test('regular senders copy instantly without fetching message source', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', () => assert.fail('unexpected request'))
  const span = fixture(message('a123', 'Francis Tamer', sender)).querySelector('.gD')
  assert.equal(await createSenderResolver(pageUrl, new AbortController().signal)(span), sender)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('collapsed headers resolve their own message without opening it or reading a neighbor', async () => {
  const doc = fixture(`<div role="list">${collapsedMessage('a123')}${collapsedMessage('b456')}</div>`)
  const spans = doc.querySelectorAll('.gD')
  const requests = []
  const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url.searchParams.get('th'))
    return new Response(headers(url.searchParams.get('th') === 'a123' ? sender : 'second@example.net'))
  })
  const resolve = createSenderResolver(pageUrl, new AbortController().signal)
  assert.equal(await resolve(spans[0]), sender)
  assert.equal(await resolve(spans[1]), 'second@example.net')
  assert.deepEqual(requests, ['a123', 'b456'])
  assert.equal(doc.querySelectorAll('.kv').length, 2)
  assert.equal(doc.querySelector('.adn').style.display, 'none')

  // Expanding/collapsing the same message reuses the per-message lookup.
  const root = spans[0].closest('.kv')
  root.className = 'h7'
  root.querySelector('.adn').append(spans[0])
  assert.equal(await resolve(spans[0]), sender)
  assert.equal(fetchMock.mock.callCount(), 2)
})

test('collapsed lookup supports IDs on the message wrapper and sync IDs on hidden content', () => {
  const doc = fixture(collapsedMessage())
  const span = doc.querySelector('.gD')
  const root = span.closest('.kv')
  const content = root.querySelector('.adn')
  root.setAttribute('data-legacy-message-id', 'b456')
  content.removeAttribute('data-legacy-message-id')
  assert.equal(originalMessageUrl(span, pageUrl).searchParams.get('th'), 'b456')
  root.removeAttribute('data-legacy-message-id')
  assert.equal(originalMessageUrl(span, pageUrl).searchParams.get('permmsgid'), 'msg-f:123456')
})

test('missing collapsed-message metadata never resolves another message in the conversation', () => {
  const doc = fixture(`<div role="list"><div class="kv"><div class="adf"><span class="gD" email="${group}">Sender via support</span></div></div>${collapsedMessage('b456')}</div>`)
  assert.throws(() => originalMessageUrl(doc.querySelector('.gD'), pageUrl), /Expand this message/)
})

for (const replaceHeader of [false, true]) {
  test(`opens an unloaded message and copies after ${replaceHeader ? 'header replacement' : 'metadata arrives'}`, async () => {
    const doc = fixture(unloadedMessage() + collapsedMessage('b456'))
    const span = doc.querySelector('.gD')
    const root = span.closest('.kv')
    let opened = 0
    root.querySelector('.adf').addEventListener('click', () => {
      opened++
      setImmediate(() => {
        root.className = 'h7'
        if (replaceHeader) root.innerHTML = message('a123')
        else root.setAttribute('data-legacy-message-id', 'a123')
      })
    })
    mock.method(globalThis, 'fetch', async (url) => {
      assert.equal(url.searchParams.get('th'), 'a123')
      return new Response(headers())
    })
    const resolve = createSenderResolver(pageUrl, new AbortController().signal)
    assert.equal(await resolve(span), sender)
    assert.equal(opened, 1)
    assert.equal(span.isConnected, !replaceHeader)
    assert.equal(doc.querySelectorAll('.kv').length, 1, 'neighbor remains collapsed')
  })
}

test('cancels a pending expansion when the mod stops', async () => {
  const doc = fixture(unloadedMessage())
  const span = doc.querySelector('.gD')
  const controller = new AbortController()
  const fetchMock = mock.method(globalThis, 'fetch', () => assert.fail('unexpected request'))
  const pending = createSenderResolver(pageUrl, controller.signal)(span)
  controller.abort()
  await assert.rejects(pending, /lookup stopped/)
  span.closest('.kv').setAttribute('data-legacy-message-id', 'a123')
  await new Promise(setImmediate)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('a message that never loads times out without copying another sender', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  mock.method(globalThis, 'fetch', () => assert.fail('unexpected request'))
  const doc = fixture(unloadedMessage() + collapsedMessage('b456'))
  const pending = createSenderResolver(pageUrl, new AbortController().signal)(doc.querySelector('.gD'))
  t.mock.timers.tick(5000)
  await assert.rejects(pending, /Message did not load/)
})

test('resolves and caches by message, even when both messages have the same group From', async () => {
  const spans = fixture(message('a123') + message('b456')).querySelectorAll('.gD')
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'same-origin')
    return new Response(headers(url.searchParams.get('th') === 'a123' ? sender : 'second@example.net'))
  })
  const resolve = createSenderResolver(pageUrl, new AbortController().signal)
  assert.deepEqual(await Promise.all([resolve(spans[0]), resolve(spans[0])]), [sender, sender])
  assert.equal(await resolve(spans[1]), 'second@example.net')
  assert.equal(fetchMock.mock.callCount(), 2)
})

test('a failed lookup never falls back to the group and can be retried', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }))
  const span = fixture().querySelector('.gD')
  const resolve = createSenderResolver(pageUrl, new AbortController().signal)
  await assert.rejects(resolve(span), /Could not read/)
  fetchMock.mock.mockImplementation(async () => new Response(headers()))
  assert.equal(await resolve(span), sender)
  assert.equal(fetchMock.mock.callCount(), 2)
})

test('stops reading after headers and cancels the remaining message download', async () => {
  let cancelled = false
  const chunks = [`From: ${group}\r\nReply-`, `To: ${sender}\r\n\r`, '\nBody']
  mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(new TextEncoder().encode(chunk))
    },
    cancel() { cancelled = true },
  })))
  assert.equal(await createSenderResolver(pageUrl, new AbortController().signal)(fixture().querySelector('.gD')), sender)
  assert.equal(cancelled, true)
})

test('does not copy a stale result when Gmail reuses the message element', async () => {
  let respond
  mock.method(globalThis, 'fetch', () => new Promise((resolve) => { respond = resolve }))
  const span = fixture().querySelector('.gD')
  const pending = createSenderResolver(pageUrl, new AbortController().signal)(span)
  await new Promise(setImmediate)
  span.closest('.adn').setAttribute('data-legacy-message-id', 'b456')
  respond(new Response(headers()))
  await assert.rejects(pending, /Message changed/)
})

test('mod cleanup aborts an in-flight lookup', async () => {
  mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const controller = new AbortController()
  const pending = createSenderResolver(pageUrl, controller.signal)(fixture().querySelector('.gD'))
  controller.abort()
  await assert.rejects(pending, /lookup stopped/)
})

test('one copy click finishes even when expanding replaces the clicked button', async () => {
  const doc = fixture(unloadedMessage())
  const root = doc.querySelector('.kv')
  const cleanups = []
  const controller = new AbortController()
  const oldDocument = globalThis.document
  const oldClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  globalThis.document = doc
  const copied = []
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => { copied.push(text) } },
  })
  mock.method(globalThis, 'fetch', async () => new Response(headers()))
  root.querySelector('.adf').addEventListener('click', () => {
    root.className = 'h7'
    root.innerHTML = message()
  })
  try {
    mod.run({
      url: pageUrl,
      signal: controller.signal,
      css() {},
      log() {},
      onCleanup(fn) { cleanups.push(fn) },
      onElement(selector, fn) { doc.querySelectorAll(selector).forEach(fn) },
    })
    const button = doc.querySelector('.sc-gmail-copy-email')
    button.click()
    await new Promise(setImmediate)
    assert.equal(button.isConnected, false, 'Gmail replaced the collapsed header')
    assert.deepEqual(copied, [sender])
    assert.equal(doc.querySelector('[role="status"]').textContent, `Copied ${sender}`)
    assert.equal(doc.querySelector('[role="status"]').parentElement, doc.body)
  } finally {
    controller.abort()
    cleanups.reverse().forEach((fn) => fn())
    globalThis.document = oldDocument
    if (oldClipboard) Object.defineProperty(globalThis.navigator, 'clipboard', oldClipboard)
    else delete globalThis.navigator.clipboard
  }
})

for (const [view, markup] of [['expanded', message()], ['collapsed', collapsedMessage()]]) {
  test(`${view} button copies Reply-To, reports failures, retries, and cleans up`, async () => {
    const doc = fixture(markup + `<div class="ajA">${message()}</div>`)
    // Some headers have a short contact name in the attribute and "via" in the text.
    doc.querySelector('.gD').setAttribute('name', 'Francis Tamer')
    const cleanups = []
    const controller = new AbortController()
    const oldDocument = globalThis.document
    const oldClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
    globalThis.document = doc
    const copied = []
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { copied.push(text) } },
    })
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }))
    try {
      mod.run({
        url: pageUrl,
        signal: controller.signal,
        css() {},
        log() {},
        onCleanup(fn) { cleanups.push(fn) },
        onElement(selector, fn) { doc.querySelectorAll(selector).forEach(fn) },
      })
      const buttons = doc.querySelectorAll('.sc-gmail-copy-email')
      assert.equal(buttons.length, 1, 'only the main sender header gets a button')
      const button = buttons[0]
      assert.equal(button.previousElementSibling.textContent,
        view === 'expanded' ? `<${group}>` : "'Francis Tamer' via support")
      button.click()
      await new Promise(setImmediate)
      assert.deepEqual(copied, [])
      assert.equal(button.dataset.error, 'true')
      assert.equal(button.disabled, false)
      const status = doc.querySelector('.sc-gmail-copy-email-status')
      assert.equal(status.getAttribute('role'), 'status')
      assert.equal(status.parentElement, doc.body, 'notification stays outside the message layout')
      assert.match(status.textContent, /Could not read the original message/)

      fetchMock.mock.mockImplementation(async () => new Response(headers()))
      button.click()
      await new Promise(setImmediate)
      assert.deepEqual(copied, [sender])
      assert.equal(button.dataset.error, undefined)
      assert.equal(doc.querySelector('.sc-gmail-copy-email-status').textContent, `Copied ${sender}`)
      assert.equal(button.dataset.copied, 'true')
      assert.equal(button.title, `Copied ${sender}`)
      assert.equal(button.getAttribute('aria-label'), `Copied ${sender}`)
    } finally {
      controller.abort()
      cleanups.reverse().forEach((fn) => fn())
      globalThis.document = oldDocument
      if (oldClipboard) Object.defineProperty(globalThis.navigator, 'clipboard', oldClipboard)
      else delete globalThis.navigator.clipboard
    }
    assert.equal(doc.querySelector('.sc-gmail-copy-email'), null)
    assert.equal(doc.querySelector('.sc-gmail-copy-email-status'), null)
  })
}
