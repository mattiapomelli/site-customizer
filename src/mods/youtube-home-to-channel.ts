import { defineMod } from '../core/define'
import { redirect } from '../core/redirect'

const CHANNEL = '/@mattiapomelli'

export default defineMod({
  id: 'youtube-home-to-channel',
  name: 'Skip the feed',
  description: 'Opening YouTube, or clicking its logo, lands on your channel instead of the home feed.',
  // `www` only: bare and `m.` hosts redirect here, and `*.` would catch Music and Studio.
  matches: ['*://www.youtube.com/', '*://www.youtube.com/?*'],
  run(ctx) {
    redirect(ctx, CHANNEL)
  },
})
