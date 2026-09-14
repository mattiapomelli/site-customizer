import type { Mod } from './types'

/** Identity helper — exists purely so mod files get type inference and checking. */
export function defineMod(mod: Mod): Mod {
  return mod
}

export type { Mod, ModContext } from './types'
