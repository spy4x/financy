import type { OfflineShellOptions } from "@spy4x/platform/browser/offline-shell"

/**
 * What the service worker caches. `/config.json` (the runtime settings) is stored with the page
 * because the app reads it before it renders. `/api` and `/ws` (the route Traefik sends to the API)
 * are never touched: the data comes from the offline layer's IndexedDB store, not from this cache.
 * The cache is named after the build, so a deploy drops the old one.
 */
export function shellOptions(buildId: string): OfflineShellOptions {
  return {
    cacheName: `shell-${buildId}`,
    shellUrls: [`/`, `/config.json`],
    neverCache: [`/api`, `/ws`],
  }
}
