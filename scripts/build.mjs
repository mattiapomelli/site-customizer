import { build, context } from 'esbuild'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const watch = process.argv.includes('--watch')
// The dev-only auto-reload worker ships with `npm run dev`, never with `npm run build`.
const dev = watch
const outdir = 'dist'

const shared = {
  bundle: true,
  // Content scripts are classic scripts — MV3 has no module support there.
  format: 'iife',
  target: 'chrome110',
  logLevel: 'info',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
}

/**
 * Read the mod registry to find which sites we actually touch, so the content
 * script is only injected there instead of on every page.
 */
async function loadMods() {
  const file = join(tmpdir(), `sc-mods-${Date.now()}.mjs`)
  // ESM here regardless of the extension bundle format — we import it back.
  await build({
    entryPoints: ['src/mods/index.ts'],
    outfile: file,
    ...shared,
    format: 'esm',
    minify: false,
    logLevel: 'silent',
  })
  try {
    const { mods } = await import(pathToFileURL(file).href)
    return mods
  } finally {
    rmSync(file, { force: true })
  }
}

/** `*://*.youtube.com/watch*` -> `*://*.youtube.com/*` */
const toOrigin = (pattern) =>
  pattern === '<all_urls>' ? pattern : pattern.replace(/^([^:]+:\/\/[^/]+)\/.*$/, '$1/*')

async function writeManifest() {
  const mods = await loadMods()
  const origins = [...new Set(mods.flatMap((m) => m.matches).map(toOrigin))]

  const manifest = {
    manifest_version: 3,
    name: 'Site Customizer',
    description: 'Personal tweaks for the sites you use, each one toggleable.',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'clipboardWrite'],
    ...(dev ? { background: { service_worker: 'dev-reload.js' } } : {}),
    host_permissions: origins,
    action: {
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
    },
    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    content_scripts: [
      // Injected per-origin, not per-pattern: on an SPA you can land on the
      // homepage and navigate to a matching URL without a fresh injection.
      // Each mod still activates only on its own `matches`.
      { matches: origins, js: ['content.js'], run_at: 'document_start', all_frames: false },
    ],
  }

  writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`manifest: ${mods.length} mod(s) across ${origins.length} origin(s)`)
}

function copyStatic() {
  cpSync('src/popup/popup.html', join(outdir, 'popup.html'))
  cpSync('src/popup/popup.css', join(outdir, 'popup.css'))
  cpSync('icons', join(outdir, 'icons'), { recursive: true })
}

/** Keep the manifest and static files in sync on every rebuild. */
const syncPlugin = {
  name: 'sync-static',
  setup(pluginBuild) {
    pluginBuild.onEnd(async (result) => {
      if (result.errors.length > 0) return
      copyStatic()
      await writeManifest()
      // Stamped last: the worker treats a new id as "everything else is on disk".
      if (dev) writeFileSync(join(outdir, 'build-id'), String(Date.now()))
    })
  },
}

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

const options = {
  entryPoints: {
    content: 'src/content.ts',
    popup: 'src/popup/popup.ts',
    ...(dev ? { 'dev-reload': 'src/dev/reload.ts' } : {}),
  },
  outdir,
  ...shared,
  plugins: [syncPlugin],
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('watching — the extension reloads itself on each rebuild')
} else {
  await build(options)
}
