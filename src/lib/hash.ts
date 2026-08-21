/**
 * URL state.
 *
 * The hash carries which jar is open, and whether we are viewing a shared
 * snapshot. It is a hash rather than a path because GitHub Pages serves static
 * files with no rewrite rule — a real path would 404 on reload.
 *
 *   #/                  the jar list
 *   #/jar/{id}          one jar
 *   #/s/{payload}       a read-only shared snapshot
 */

export type Route =
  | { kind: 'list' }
  | { kind: 'jar'; jarId: string }
  | { kind: 'shared'; payload: string };

export const LIST: Route = { kind: 'list' };

/** Anything unrecognised reads as the list, so a mangled URL is never a blank page. */
export function readRoute(hash: string = location.hash): Route {
  const shared = /^#\/s\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (shared) return { kind: 'shared', payload: shared[1]! };

  const jar = /^#\/jar\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (jar) return { kind: 'jar', jarId: jar[1]! };

  return LIST;
}

export function routeToHash(route: Route): string {
  switch (route.kind) {
    case 'jar':
      return `#/jar/${route.jarId}`;
    case 'shared':
      return `#/s/${route.payload}`;
    case 'list':
      return '#/';
  }
}

export function shareUrl(payload: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/s/${payload}`;
}
