import type { Mod, ModContext } from './types'
import { watch } from './observer'

export interface RunningMod {
  stop(): void
}

/** Start a mod and return a handle that tears down everything it created. */
export function runMod(mod: Mod, url: string): RunningMod {
  const controller = new AbortController()
  const cleanups: Array<() => void> = []
  const { signal } = controller

  const log = (...args: unknown[]) => console.debug(`[${mod.id}]`, ...args)

  const ctx: ModContext = {
    url,
    signal,

    onCleanup(fn) {
      if (signal.aborted) fn()
      else cleanups.push(fn)
    },

    css(text) {
      const style = document.createElement('style')
      style.dataset.siteCustomizer = mod.id
      style.textContent = text
      document.documentElement.append(style)
      ctx.onCleanup(() => style.remove())
    },

    onElement(selector, fn) {
      const unwatch = watch(selector, fn)
      ctx.onCleanup(unwatch)
    },

    waitFor(selector, opts = {}) {
      const { timeout = 10_000, root = document } = opts
      return new Promise((resolve, reject) => {
        const existing = root.querySelector(selector)
        if (existing) return resolve(existing as never)

        const done = (fn: () => void) => {
          clearTimeout(timer)
          unwatch()
          signal.removeEventListener('abort', onAbort)
          fn()
        }
        const onAbort = () => done(() => reject(new Error(`${mod.id}: stopped`)))
        const timer = setTimeout(
          () => done(() => reject(new Error(`${mod.id}: timed out waiting for ${selector}`))),
          timeout,
        )
        const unwatch = watch(selector, (el) => {
          if (root === document || root.contains(el)) done(() => resolve(el as never))
        })
        signal.addEventListener('abort', onAbort, { once: true })
      })
    },

    log,
  }

  Promise.resolve()
    .then(() => mod.run(ctx))
    .catch((err) => {
      // A stopped mod rejecting its pending waitFor is expected, not an error.
      if (!signal.aborted) console.error(`[site-customizer] ${mod.id} failed`, err)
    })

  return {
    stop() {
      if (signal.aborted) return
      controller.abort()
      for (const fn of cleanups.reverse()) {
        try {
          fn()
        } catch (err) {
          console.error(`[site-customizer] ${mod.id} cleanup failed`, err)
        }
      }
      cleanups.length = 0
    },
  }
}
