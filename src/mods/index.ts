import type { Mod } from '../core/types'
import gmailCopyEmail from './gmail-copy-email'
import xFeedToProfile from './x-feed-to-profile'
import youtubeHomeToChannel from './youtube-home-to-channel'
import youtubeTranscript from './youtube-transcript'

/**
 * Every mod, in popup display order.
 * Adding a mod = drop a file in this folder and add one line here.
 * The build reads this list to generate the manifest's match patterns,
 * so the content script only loads on sites you actually customize.
 */
export const mods: Mod[] = [
  youtubeTranscript,
  gmailCopyEmail,
  xFeedToProfile,
  youtubeHomeToChannel,
]
