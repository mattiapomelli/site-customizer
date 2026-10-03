/** A deliberately conservative mailbox parser: ambiguous addresses must not be copied. */
function mailboxes(value: string): string[] {
  // Commas in quoted display names are not address separators.
  const parts: string[] = []
  let start = 0
  let quoted = false
  for (let i = 0; i < value.length; i++) {
    if (quoted && value[i] === '\\') i++
    else if (value[i] === '"') quoted = !quoted
    else if (!quoted && value[i] === ',') {
      parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  if (quoted) throw new Error('Gmail did not provide an unambiguous sender address')
  parts.push(value.slice(start))
  return parts.map((part) => {
    const address = (part.match(/<([^<>]+)>\s*$/)?.[1] ?? part).trim()
    if (!/^[^\s<>(),;:"\\@]+@[^\s<>(),;:"\\@]+$/.test(address)) {
      throw new Error('Gmail did not provide an unambiguous sender address')
    }
    return address
  })
}

export function replyToAddress(source: string, from: string): string {
  // Only the outer message's headers count, never quoted/forwarded body content.
  const end = source.search(/\r?\n\r?\n/)
  const headers = (end < 0 ? source : source.slice(0, end)).replace(/\r?\n[\t ]+/g, ' ')
  const values = (name: string) => [...headers.matchAll(new RegExp(`^${name}:[\\t ]*(.*)$`, 'gim'))]
    .map((match) => match[1]!.trim())
  const fromHeaders = values('from')
  const replyHeaders = values('reply-to')
  if (fromHeaders.length !== 1 || replyHeaders.length !== 1) {
    throw new Error('Original sender address unavailable in this message')
  }
  const fromAddresses = mailboxes(fromHeaders[0]!)
  if (fromAddresses.length !== 1 || fromAddresses[0]!.toLowerCase() !== from.toLowerCase()) {
    throw new Error('Gmail returned a different message sender')
  }
  const addresses = new Map(mailboxes(replyHeaders[0]!)
    .filter((address) => address.toLowerCase() !== from.toLowerCase())
    .map((address) => [address.toLowerCase(), address]))
  if (addresses.size !== 1) {
    throw new Error('Original sender address unavailable or ambiguous')
  }
  return [...addresses.values()][0]!
}

export function messageContainer(span: HTMLElement): HTMLElement | null {
  // Gmail puts the collapsed header (.adf) and expanded content (.adn) in
  // separate branches of one message. IDs may remain on the hidden branch.
  // These state classes belong to the individual message, not the thread:
  // https://github.com/InboxSDK/InboxSDK/blob/master/src/platform-implementation-js/dom-driver/gmail/views/gmail-message-view.ts
  return span.closest<HTMLElement>('[role="listitem"], .h7, .kv, .kQ, .kx')
    ?? span.closest<HTMLElement>('.adn, .adf')
}

export function originalMessageUrl(span: HTMLElement, pageUrl: string): URL {
  const message = messageContainer(span)
  const idElement = message?.matches('[data-legacy-message-id], [data-message-id]')
    ? message
    : message?.querySelector('[data-legacy-message-id], [data-message-id]')
  const legacyId = idElement?.getAttribute('data-legacy-message-id')
  const syncId = idElement?.getAttribute('data-message-id')?.replace(/^#/, '')
  const url = new URL(pageUrl)
  // Preserve the account/delegation path; the route hash is a thread, not a message ID.
  url.search = ''
  url.hash = ''
  url.searchParams.set('view', 'att')
  if (legacyId && /^[a-f0-9]+$/i.test(legacyId)) url.searchParams.set('th', legacyId)
  else if (syncId && /^msg-[af]:[\w-]+$/.test(syncId)) url.searchParams.set('permmsgid', syncId)
  else throw new Error('Expand this message before copying its sender address')
  url.searchParams.set('attid', '0')
  url.searchParams.set('disp', 'comp')
  url.searchParams.set('safe', '1')
  url.searchParams.set('zw', '')
  return url
}

async function loadMessageUrl(span: HTMLElement, pageUrl: string, signal: AbortSignal): Promise<URL> {
  try {
    return originalMessageUrl(span, pageUrl)
  } catch {
    // Gmail may not create any message metadata until the first expansion.
  }
  const message = messageContainer(span)
  const header = span.closest<HTMLElement>('.adf')
  if (!message || !header || !message.contains(header)) {
    throw new Error('Open this message, then try copying again')
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const Observer = span.ownerDocument.defaultView!.MutationObserver
    const observer = new Observer(check)
    const timer = setTimeout(() => finish(new Error('Message did not load; try copying again')), 5000)
    const onAbort = () => finish(new Error('Sender lookup stopped; try again'))
    function finish(result: URL | Error) {
      if (settled) return
      settled = true
      observer.disconnect()
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (result instanceof URL) resolve(result)
      else reject(result)
    }
    function check() {
      if (!message!.isConnected) return finish(new Error('Message changed; try copying again'))
      try {
        // Expansion can replace the sender span. Keep tracking the same message.
        finish(originalMessageUrl(message!, pageUrl))
      } catch {
        // Wait for Gmail to attach the ID, including attribute-only updates.
      }
    }
    observer.observe(message, { childList: true, subtree: true, attributes: true })
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) return onAbort()
    try {
      header.click()
      check()
    } catch {
      finish(new Error('Open this message, then try copying again'))
    }
  })
}

async function readHeaders(url: URL, signal: AbortSignal): Promise<string> {
  // Gmail's original-message download, also used by gmail.js's email_source API.
  // https://github.com/KartikTalwar/gmail.js/blob/master/src/gmail.js
  // Read only through the header separator, avoiding large message attachments.
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timer = setTimeout(abort, 10_000)
  try {
    const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('Could not read the original message; try again')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let headers = ''
    try {
      while (headers.length < 128 * 1024) {
        const { done, value } = await reader.read()
        if (done) break
        headers += decoder.decode(value, { stream: true })
        const end = headers.search(/\r?\n\r?\n/)
        if (end >= 0) return headers.slice(0, end)
      }
      throw new Error('Could not read the original message headers')
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error('Sender lookup stopped; try again')
    throw err
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function createSenderResolver(pageUrl: string, signal: AbortSignal) {
  // Key by message, never by the shared group address or conversation.
  const cache = new Map<string, Promise<string>>()
  return async (span: HTMLElement): Promise<string> => {
    const from = span.getAttribute('email')?.trim()
    if (!from?.includes('@')) throw new Error('Sender address unavailable')
    const name = `${span.getAttribute('name') ?? ''} ${span.textContent ?? ''}`
    if (!/\s+via\s+/i.test(name)) return from

    const message = messageContainer(span)
    const url = await loadMessageUrl(span, pageUrl, signal)
    if (signal.aborted || !message?.isConnected) throw new Error('Sender lookup stopped; try again')
    const key = `${url.href}\n${from}`
    let address = cache.get(key)
    if (!address) {
      address = readHeaders(url, signal).then((headers) => replyToAddress(headers, from))
      cache.set(key, address)
      address.catch(() => cache.delete(key))
    }
    const resolved = await address
    const currentSpan = message.contains(span) ? span : message.querySelector<HTMLElement>('span.gD[email]')
    if (currentSpan?.getAttribute('email')?.trim() !== from || originalMessageUrl(message, pageUrl).href !== url.href) {
      throw new Error('Message changed; try copying again')
    }
    return resolved
  }
}
