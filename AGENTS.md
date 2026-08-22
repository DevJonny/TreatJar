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
src/lib/jarShape.ts geometry of the glass; physics gets `cavity`, the SVG gets the paths
src/lib/sync/       Google Drive: auth, file access, merge, orchestration
src/components/     dumb and presentational
src/App.svelte      routing and wiring
src/lib/store.svelte.ts   the single source of truth
```

### Nine things that will bite you

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

**5. Nothing may come to rest where it cannot be seen.** This is the failure
mode this file exists to warn you about, because the UI never shows it: the
count is right, the progress bar is right, and only the pile is short.

A token enters the world one of two ways, and they are not interchangeable.
The **layout** (`LAYOUT_*`) is for tokens restored from storage: a loose grid
filling the glass from the floor up, which the settle collapses into a heap.
The **drop** (`DROP_*`) is for a token a grown-up just added: released over the
mouth, barely tilted, from rest. `DROP_HEIGHT` is deliberately just above the
rim — everything above the glass is clipped, so spawning higher does not
lengthen the fall, it only means the token is already moving fast by the time
anyone can see it.

Two rules keep both of them inside the glass:

- The **anti-launch lid** must sit above everything the world spawns —
  `lidHeight()` derives from `layoutReach()` for exactly this reason. A lid
  below a spawn point is worse than no lid at all: tokens land on top of it and
  never enter the jar.
- The starting grid must be **denser than it looks like it should be**
  (`LAYOUT_Y` is well under 1). Tokens interlock once settled, so a grid of
  non-overlapping boxes covers several times the area of the finished pile —
  space them a whole token apart and you build a column taller than the jar,
  which arches, jams, and strands tokens above the glass.

Consequently `computeTokenSize()` must run **before** `buildWalls()`, since the
lid's height derives from token size. `tests/physics.test.ts` asserts every
token settles inside the visible box; keep those bounds tight.

**6. The render loop stops when every body is asleep, and must keep doing so.**
`enableSleeping` is on and the rAF loop exits at `isAtRest()`. A settled jar
costs zero frames. Remove that and the app burns battery forever while showing
a completely static picture.

**7. Never rely on ResizeObserver alone for the canvas size.** Its callbacks
are delivered as part of the rendering steps — the same pipeline as
`requestAnimationFrame`. Anything that suppresses those leaves the canvas at
its 300x150 default with nothing ever drawn in it. `JarCanvas` measures once
synchronously on mount and *then* observes.

Two more ways the same nothing-is-drawn bug gets in, both of which have already
happened here:

- **`height: 100%` on the jar.** Its parent is a flex item whose own height is
  still being resolved, so the percentage computes to `auto`; the element is
  only filled once measured, so `auto` means zero for ever. It stretches — it
  does not claim a percentage.
- **Wrapping the canvas in `{#if measured}`.** `bind:this` is applied by an
  effect created when that block renders, which lands *after* the effect that
  wants to size the canvas. The markup is rendered unconditionally.

**8. A jar at its target must look full.** That is the reward: a child who can
see the pile is near the top does not have to read the progress bar. Token size
is therefore derived from the target — ten treats are drawn big, a hundred
small — by `tokenSizeFor`, working forwards from the pile: `capacity` tokens,
each covering `footprint` of its own square, must add up to `FILL_AT_TARGET` of
the glass. `footprint` comes from the theme's own hulls, so coins and
stegosauruses fill to the same height.

Two corrections stop that estimate lying:

- `packedFootprint` — big tokens bridge rather than nest, standing the pile
  taller than its area says. Without it a ten-token jar overflows.
- `fitCavity` — past a point no token size can fill a full-height jar, so the
  **jar gets shorter instead** and stands on the bottom of the space it has.
  A five-treat jar is a small jar, and it fills up.

These constants are calibrated against measured pile heights, not derived.
If you change one, re-measure: `tests/physics.test.ts` settles real piles and
asserts they reach the top and never spill.

**9. The glass and the walls are the same jar.** `jarShape` owns the silhouette;
`cavity` is the only part tokens occupy and is what the world is built from.
The neck and shoulders are drawn *above* the pile, never around it — piling
into a curve needs walls that follow it, and see rule 5. The canvas covers the
whole jar and is clipped to `inside`, so a token at the brim shows through the
shoulders instead of being sliced off at the cavity's edge.

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

- **An effect that reads the token list will run when a treat is added.**
  `JarCanvas` has two effects: one that builds and re-fits the world, and one
  that reconciles tokens. The first reads the list `untrack`ed on purpose. Let
  it track, and adding a treat re-settles the whole pile headlessly before the
  second effect can start the fall — the drop, the only animation this app has,
  silently stops happening while everything still looks correct.

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
