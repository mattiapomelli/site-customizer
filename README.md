# Site Customizer

One Chrome extension for all my per-site tweaks, instead of one extension per tweak.
Each tweak is a "mod": a small TypeScript file that declares which URLs it applies to
and what it does. The popup toggles them individually, per-site, or all at once.

## Install

```sh
npm install
npm run build
```

```sh
npm run dev
```

Then `chrome://extensions` → enable Developer mode → **Load unpacked** → pick `dist/`.

`npm run dev` rebuilds on save *and* reloads the extension for you: the watch build
stamps `dist/build-id`, a dev-only service worker polls it, and on a change it calls
`chrome.runtime.reload()` and then reloads any tab a content script runs on. No trip to
chrome://extensions after the first load.

That worker exists only in `npm run dev`. `npm run build` omits the bundle and the
`background` manifest key entirely, so nothing dev-only ships in a real build. Switching
between the two changes the manifest, which needs one manual reload to take effect.

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

It calls `youtubei/v1/get_panel` with `panelId: PAmodern_transcript_view` — the same
request YouTube's own transcript panel makes. No auth header, no cookies, and no page
scrape: the only input is the video id, encoded into the `params` protobuf by hand.

There is deliberately no fallback. Two other routes were tried and both are dead ends,
not merely fragile:

- The `timedtext` caption URL answers **200 with an empty body** for auto-generated
  tracks, which need a proof-of-origin token only the player holds.
- Clicking "Show transcript" from a content script **never opens the panel**, even as a
  real trusted click at the right coordinates.

`get_transcript`, the endpoint most write-ups still reference, now answers
`FAILED_PRECONDITION`. Keeping either path as a fallback would add latency and code that
can never succeed.

## Layout

```
src/core/     mod runtime: matching, storage, lifecycle, shared observer
src/mods/     one folder or file per mod + the registry
src/popup/    the toggle UI
scripts/      build (generates dist/manifest.json), icon generation
```
