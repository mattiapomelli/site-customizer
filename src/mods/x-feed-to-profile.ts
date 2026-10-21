import { defineMod } from '../core/define'

const PROFILE = '/mattiapomelli'
const HOSTS = ['x.com', 'twitter.com']
// `/home?*`, not `/home*`, which would also match profiles such as `/homedepot`.
const FEED_PATHS = ['/', '/?*', '/home', '/home?*']

export default defineMod({
  id: 'x-feed-to-profile',
  name: 'Skip the feed',
  description: 'Opening X, or its Home tab, lands on your profile instead of the timeline.',
  matches: HOSTS.flatMap((host) => FEED_PATHS.map((path) => `*://${host}${path}`)),
  run(ctx) {
    ctx.css('html { visibility: hidden !important; }')
    // Keeps X's app from booting and fetching the timeline while the profile loads.
    // It must come before replace(), which it would otherwise cancel.
    window.stop()
    location.replace(PROFILE)
  },
})
