/**
 * Pull a JSON object literal out of a script blob, starting at `marker`.
 * Brace-counting (string- and escape-aware) instead of a regex, because the
 * payloads contain braces inside strings.
 */
export function extractJsonAfter(source: string, marker: string): unknown {
  const start = source.indexOf(marker)
  if (start === -1) return null

  const open = source.indexOf('{', start + marker.length)
  if (open === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = open; i < source.length; i++) {
    const ch = source[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(source.slice(open, i + 1))
      } catch {
        return null
      }
    }
  }

  return null
}
