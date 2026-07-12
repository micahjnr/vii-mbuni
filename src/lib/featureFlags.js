// src/lib/featureFlags.js
//
// Central place for features that are OFF by default because they carry
// legal/app-store risk in some countries (betting/gambling-adjacent content
// in particular faces ad-network bans, stricter app-store review, and
// outright restrictions in the UK, several EU states, and parts of the US).
//
// Set these in your .env / Netlify environment variables to turn a feature
// back on for a specific deployment or audience:
//   VITE_ENABLE_BETTING=true

export const FEATURE_FLAGS = {
  // Football "Daily Accumulator" tips page. Off by default for new/worldwide
  // deployments — turn on only after checking local betting-content rules
  // and your target app store's policy for tipster/prediction content.
  betting: import.meta.env.VITE_ENABLE_BETTING === 'true',
}
