import { defineMod } from '../core/define'
import { redirectOnArrival } from '../core/redirect'

const CHANNEL = '/@mattiapomelli'

export default defineMod({
  id: 'youtube-home-to-channel',
  name: 'Skip the feed',
  description: 'Opening YouTube lands on your channel instead of the home feed. The logo still opens it.',
  // `www` only: bare and `m.` hosts redirect here, and `*.` would catch Music and Studio.
  matches: ['*://www.youtube.com/', '*://www.youtube.com/?*'],
  run(ctx) {
    redirectOnArrival(ctx, CHANNEL)
  },
})
