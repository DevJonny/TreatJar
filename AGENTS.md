# AGENTS.md

Guidance for AI coding agents working in this repository.

## Commands

```sh
npm run dev                       # http://localhost:5173/TreatJar/
npm run dev -- --host             # expose on LAN to test on a real phone
npm run build && npm run preview  # the only way to exercise the service worker
npm run check                     # svelte-check — runs with --fail-on-warnings
npm test                          # vitest

npx vitest run tests/jar.test.ts        # one file
npx vitest run -t "both progress modes" # one test by name
npx vitest                              # watch mode
```

CI runs check → test → build on every push to `main`, then deploys to GitHub
Pages. All three must pass.

## What this is

A reward chart. A grown-up adds a token to a themed jar when a child earns a
treat; the tokens pile up under real physics. Reaching the jar's target
triggers a celebration, then the jar is "cashed in" and starts a new round.

Client-side only: one Svelte 5 page, no router, no SSR, no server. Data lives
in `localStorage` and, optionally, in a private Google Drive app folder.

## Architecture

```
src/lib/*.ts        pure logic — unit tested directly, never through the DOM
src/lib/sync/       Google Drive: auth, file access, merge, orchestration
src/components/     dumb and presentational
src/App.svelte      routing and wiring
src/lib/store.svelte.ts   the single source of truth
```

### Seven things that will bite you

**1. Progress is one calculation, not two.** Dinosaur/space/sweets jars count
tokens; money jars count pence. There is no branch for this. Every token type
carries a `value`, count themes set it to `1`, and progress is the summed value
of the round's live tokens against `jar.target`. If you find yourself writing
`if (theme.progress.mode === 'value')` anywhere outside *formatting*, stop —
you are about to grow a second code path that will drift.

Money is **integer pence everywhere**. `£0.10 + £0.20 !== £0.30` in binary
floating point, and a jar that can never quite reach its target is a bug a
child notices before you do. `progress.format` in `themes.ts` is the only place
a number becomes text.

**2. The merge is per-token, and that is the whole point.** `mergeById` merges
individual entities, not whole jars. Mum's phone and Dad's phone both add
tokens on the same evening; whole-jar last-write-wins would silently drop one.
Because every add mints a fresh id, concurrent adds are not a conflict at all —
LWW only ever arbitrates two edits to the *same* token, where the later one is
genuinely right.

This is the one place this codebase deliberately diverges from the DiceCalc
sync layer it was ported from. Do not "simplify" it back.

**3. Removal is a tombstone; cashing in does not delete.** A removed token
keeps its record and gains a `removal`. A completed round is closed, not
emptied. Both exist so that history is a *pure function of the token list* —
there is no second collection to fall out of step, and a removal merges like
any other edit. `pruneRounds` is what stops this growing forever.

**4. Body positions are never persisted; seeds are.** A token stores a `seed`
and the pile is re-derived from it. Persisting coordinates would restore
tokens outside the glass on a different-sized screen. On load the world is
settled *headlessly* and then drawn once, so the jar appears already full
instead of raining tokens down the screen on every open.

**5. The anti-launch lid must sit above the spawn scatter.** Tokens are
scattered up to `tokenSize * SCATTER` above the jar on first settle, and there
is a static lid above that to stop a lively collision throwing one off-screen
forever. If the lid is ever placed *below* the top of the scatter band, tokens
land on top of it and never enter the jar — and nothing in the UI shows it,
because the count and the progress bar are both still correct. Only the pile is
short. `tests/physics.test.ts` asserts every token settles inside the visible
box for exactly this reason; keep those bounds tight.

Consequently `computeTokenSize()` must run **before** `buildWalls()`, since the
lid's height derives from token size.

**6. The render loop stops when every body is asleep, and must keep doing so.**
`enableSleeping` is on and the rAF loop exits at `isAtRest()`. A settled jar
costs zero frames. Remove that and the app burns battery forever while showing
a completely static picture.

**7. Never rely on ResizeObserver alone for the canvas size.** Its callbacks
are delivered as part of the rendering steps — the same pipeline as
`requestAnimationFrame`. Anything that suppresses those leaves the canvas at
its 300x150 default with nothing ever drawn in it. `JarCanvas` measures once
synchronously on mount and *then* observes.

## Accessibility is a hard rule

The canvas is invisible to assistive tech, so every jar renders a parallel text
story: a `role="img"` label on the glass, an `aria-live` region announcing each
change, a visually-hidden list of the tokens, and the progress as real text
next to the bar. Nothing may be reachable only by looking at the pile.

Beyond that: WCAG AA contrast, 48px touch targets (`--tap`), `100dvh` never
`100vh`, and every token type identified by **silhouette and text label**, not
by colour alone.

`prefers-reduced-motion` is honoured with a user override in Settings. Reduced
motion skips the fall entirely — headless settle, then one redraw.

## Verification caveat

`agent-browser` does **not** fire `requestAnimationFrame` in this environment.
Two consequences:

- `agent-browser screenshot` hangs on this app. To see the pile, read the
  canvas directly instead:
  `agent-browser eval "document.querySelector('canvas').toDataURL('image/png')"`
  and base64-decode the result.
- Always verify with `?reduced=1` in the URL, which forces the synchronous
  path. Read state from the `aria-live` region and the visually-hidden list,
  never from the canvas.

Most bugs in this codebase were found by driving the built app and inspecting
the DOM, not by reading code.

## Svelte 5 rules that have already caused bugs here

- **Persist at the call site, not from an effect.** `$state` objects are
  proxies, so an effect cannot tell a user edit from a restore and will write
  defaults over saved values on mount.
- **A form seeded from a prop must `untrack` what it seeds from.**
  `JarConfigForm` does; without it, any unrelated change to the jar while the
  form is open silently discards what the user has half-typed.
- **`bind:value` on `<input type="number">` yields `number | null`.** Empty
  fields and a lone `-` both arrive as `null`. State behind such a binding must
  be typed that way.
- **Do not read a prop right after calling its update callback.** Props have
  not flowed back down yet. `JarView` derives its announcement rather than
  capturing it at the call site, which is why the count is not off by one.

## Adding a theme

Add one entry to `THEMES` in `src/lib/themes.ts`. It is data, not code:
four token types with an SVG path, a hand-authored convex hull, a fill, a
scale and a value, plus a palette and a progress format. Then add its id to
`THEME_IDS` in `types.ts`.

Physics bodies use `vertices`, not `path` — matter.js needs convexity, and a
decomposed silhouette makes a body that snags on the walls. `Vertices.hull`
cleans up what you write, so approximate points are fine.

Keep the smallest `value` in a value theme large enough that the target cannot
exceed ~120 tokens. `projectedTokenCount` and `tests/themes.test.ts` enforce
this; it is why the money theme has no coppers.

## Sync setup

Sync is optional and additive — everything else works without it. It needs a
Google OAuth client id in `VITE_GOOGLE_CLIENT_ID`; see README.md. When unset,
`googleAuth.isConfigured()` is false and the UI says so instead of failing.

## Commits

All commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`), imperative mood.
