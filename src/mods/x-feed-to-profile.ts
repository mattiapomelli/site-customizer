import { defineMod } from '../core/define'
import { redirectOnArrival } from '../core/redirect'

const PROFILE = '/mattiapomelli'
const HOSTS = ['x.com', 'twitter.com']
// `/home?*`, not `/home*`, which would also match profiles such as `/homedepot`.
const FEED_PATHS = ['/', '/?*', '/home', '/home?*']

export default defineMod({
  id: 'x-feed-to-profile',
  name: 'Skip the feed',
  description: 'Opening X lands on your profile instead of the timeline. Home still opens it.',
  matches: HOSTS.flatMap((host) => FEED_PATHS.map((path) => `*://${host}${path}`)),
  run(ctx) {
    redirectOnArrival(ctx, PROFILE)
  },
})
