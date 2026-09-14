/** Copy text, falling back to execCommand when the async API is unavailable. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Clipboard API needs a focused document; fall through.
  }

  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  document.body.append(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('copy failed')
}
