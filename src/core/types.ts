/** Everything a mod gets handed when it runs. */
export interface ModContext {
  /** The URL the mod was started for. */
  readonly url: string
  /** Aborted when the mod is stopped (toggled off, or navigated away). */
  readonly signal: AbortSignal
  /** Inject CSS. Removed automatically when the mod stops. */
  css(text: string): void
  /** Resolve once an element matching `selector` exists. Rejects on timeout or stop. */
  waitFor<T extends Element = Element>(
    selector: string,
    opts?: { timeout?: number; root?: ParentNode },
  ): Promise<T>
  /** Call `fn` for every current and future element matching `selector`, once each. */
  onElement<T extends Element = Element>(selector: string, fn: (el: T) => void): void
  /** Run `fn` when the mod stops. */
  onCleanup(fn: () => void): void
  log(...args: unknown[]): void
}

export interface Mod {
  /** Stable, unique. Used as the storage key — renaming resets the toggle. */
  id: string
  /** Shown in the popup. */
  name: string
  description?: string
  /** Chrome match patterns, e.g. `*://*.youtube.com/watch*`. */
  matches: string[]
  /** Default when the user has never toggled it. Defaults to true. */
  defaultEnabled?: boolean
  run(ctx: ModContext): void | Promise<void>
}
