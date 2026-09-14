/**
 * Chrome match patterns -> RegExp.
 * Supports `<all_urls>` and `scheme://host/path` with `*` wildcards.
 * https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
 */

const ALL_URLS = /^(?:https?|file|ftp):\/\//
const PATTERN = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]*)(\/.*)$/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const cache = new Map<string, RegExp | null>()

function compile(pattern: string): RegExp | null {
  if (pattern === '<all_urls>') return ALL_URLS

  const m = PATTERN.exec(pattern)
  if (!m) return null
  const [, scheme = '', host = '', path = ''] = m

  const schemeRe = scheme === '*' ? 'https?' : escape(scheme)
  const hostRe =
    host === '*'
      ? '[^/]+'
      : host.startsWith('*.')
        ? `(?:[^/]+\\.)?${escape(host.slice(2))}`
        : escape(host)
  // `*` is the only wildcard in paths; everything else is literal.
  const pathRe = escape(path).replace(/\\\*/g, '.*')

  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`)
}

function toRegExp(pattern: string): RegExp | null {
  if (!cache.has(pattern)) cache.set(pattern, compile(pattern))
  return cache.get(pattern) ?? null
}

export function matchesPattern(pattern: string, url: string): boolean {
  return toRegExp(pattern)?.test(url) ?? false
}

export function matchesAny(patterns: readonly string[], url: string): boolean {
  return patterns.some((p) => matchesPattern(p, url))
}
