# Site Customizer

One Chrome extension for all my per-site tweaks, instead of one extension per tweak.
Each tweak is a "mod": a small TypeScript file that declares which URLs it applies to
and what it does. The popup toggles them individually, per-site, or all at once.

## Install

```sh
npm install
npm run build
```

Then `chrome://extensions` → enable Developer mode → **Load unpacked** → pick `dist/`.

`npm run dev` rebuilds on save. Chrome picks up content-script changes on page reload;
changes to `manifest.json` need the reload button on the extensions page.

## Writing a mod

Drop a file in `src/mods/` and add one line to `src/mods/index.ts`. That's the whole
registration step — the build reads that list to generate the manifest's match patterns,
so the content script is only injected on sites you actually customize.

```ts
import { defineMod } from '../core/define'

export default defineMod({
  id: 'hn-wide',              // stable: it is the storage key for the toggle
  name: 'Full-width comments',
  description: 'Shown under the name in the popup.',
  matches: ['*://news.ycombinator.com/item*'],
  run(ctx) {
    ctx.css('.comment-tree { width: 100%; }')
  },
})
```

### The `ctx` API

| | |
| --- | --- |
| `ctx.css(text)` | Inject a stylesheet. Removed when the mod stops. |
| `ctx.onElement(sel, fn)` | Run `fn` once per element matching `sel`, now and as they appear. |
| `ctx.waitFor(sel, {timeout})` | Promise for the first element matching `sel`. |
| `ctx.onCleanup(fn)` | Undo something when the mod stops. |
| `ctx.signal` | `AbortSignal`, aborted on stop — pass it to `fetch`. |
| `ctx.url`, `ctx.log(...)` | The URL the mod started for; namespaced console logging. |

`onElement` is the workhorse: on an SPA the page rerenders constantly, so "find the
element once" almost never works. Every mod shares a single `MutationObserver` whose
scans are coalesced into one animation frame.

### Lifecycle

A mod runs exactly when it's enabled *and* the current URL matches. Toggling it off, or
navigating away, calls every cleanup it registered — no page reload needed. Soft
navigations restart mods, so `run()` can assume it's looking at a fresh page.

Content scripts are injected per *origin* rather than per match pattern. You can land on
`youtube.com` and navigate to a video without a fresh injection, which is exactly when a
pattern-scoped injection would fail to appear.

## Included mod

**Copy transcript button** (`youtube.com/watch`) — adds a Transcript button to the
button row under the video. Click copies the transcript as prose; shift-click copies it
with timestamps.

It tries YouTube's caption tracks first (fast, complete), and falls back to reading the
on-page transcript panel if that breaks. The first path leans on undocumented internals
and will break eventually; the fallback only breaks if the visible UI does.

## Layout

```
src/core/     mod runtime: matching, storage, lifecycle, shared observer
src/mods/     one folder or file per mod + the registry
src/popup/    the toggle UI
scripts/      build (generates dist/manifest.json), icon generation
```
