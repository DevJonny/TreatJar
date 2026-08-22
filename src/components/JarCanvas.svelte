<script lang="ts">
  /**
   * The jar: glass drawn as SVG, the pile drawn on a canvas between the two
   * halves of it.
   *
   * Three layers, back to front — the tinted body of the jar, the canvas, and
   * then every part of the glass that should sit *in front* of the tokens:
   * sheen, highlights, the rim of the wall. That order is what makes the pile
   * look like it is inside something rather than painted on top of a picture.
   *
   * The component owns the element, the frame loop and the viewport; all the
   * physics lives in lib/physics.ts and all the geometry in lib/jarShape.ts, so
   * both can be tested without a DOM.
   */
  import { onMount, untrack } from 'svelte';
  import { JarWorld, fitCavity, type PileToken } from '../lib/physics.ts';
  import { jarHeightForCavity, jarShape } from '../lib/jarShape.ts';
  import { theme } from '../lib/themes.ts';
  import type { ThemeId } from '../lib/types.ts';

  interface Props {
    tokens: PileToken[];
    themeId: ThemeId;
    capacity: number;
    reducedMotion?: boolean;
    label: string;
  }

  let { tokens, themeId, capacity, reducedMotion = false, label }: Props = $props();

  // Gradient ids are global to the document, so two jars on one page would
  // otherwise share — and fight over — the same definitions.
  const uid = $props.id();

  let wrap = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let world: JarWorld | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  /** The inside face of the glass — nothing may be painted outside it. */
  let clip: Path2D | null = null;
  let known = new Set<string>();
  let size = $state({ w: 0, h: 0 });

  const palette = $derived(theme(themeId).palette);

  /**
   * The jar is drawn to fit its target, not to fill the space.
   *
   * A small target gets big tokens, but only up to a point — past that the jar
   * itself gets shorter, so that "at target" always means "full to the top".
   * It is stood on the bottom of the space it is given, like a jar on a shelf.
   */
  const shape = $derived.by(() => {
    const w = Math.max(size.w, 1);
    const available = jarShape(w, Math.max(size.h, 1));
    const fit = fitCavity(themeId, capacity, available.cavity.width, available.cavity.height);
    const height = Math.min(size.h, jarHeightForCavity(w, fit.height));
    return jarShape(w, height);
  });

  function paint(): void {
    if (!world || !ctx) return;
    ctx.clearRect(0, 0, shape.width, shape.height);
    ctx.save();
    // Tokens live in cavity coordinates; the canvas covers the whole jar. The
    // clip is what lets a token at the top of a full jar show through the
    // shoulders instead of being sliced off at the cavity's edge.
    if (clip) ctx.clip(clip);
    ctx.translate(shape.cavity.x, shape.cavity.y);
    world.draw(ctx);
    ctx.restore();
  }

  function resizeCanvas(): void {
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(shape.width * dpr);
    canvas.height = Math.round(shape.height * dpr);
    ctx = canvas.getContext('2d');
    // Draw in CSS pixels; the transform absorbs the device ratio so nothing
    // else in this file has to think about it.
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    clip = new Path2D(shape.inside);
  }

  function measure(el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w !== size.w || h !== size.h) size = { w, h };
  }

  onMount(() => {
    const el = wrap;
    if (!el) return;

    // Measure once, synchronously. ResizeObserver alone is not enough: its
    // callbacks are delivered as part of the rendering steps, the same
    // pipeline as requestAnimationFrame. Anything that suppresses those — a
    // background tab, and notably the browser automation used to verify this
    // project — leaves the jar stuck at the canvas default of 300x150 with
    // nothing ever drawn in it.
    measure(el);

    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);

    return () => {
      observer.disconnect();
      world?.destroy();
      world = null;
    };
  });

  // Build, or re-fit, the world when the box, the theme or the target changes.
  //
  // The token list is read UNTRACKED on purpose. Adding a treat must not reach
  // this effect: it would settle the new token into the pile headlessly, and
  // the drop — the one animation this app has — would never be seen. Token
  // changes belong to the effect below and nowhere else.
  $effect(() => {
    const { w, h } = size;
    const t = themeId;
    const cap = capacity;
    if (w === 0 || h === 0) return;

    untrack(() => {
      resizeCanvas();
      const cavity = shape.cavity;

      if (!world) {
        world = new JarWorld({ width: cavity.width, height: cavity.height, themeId: t, capacity: cap });
      } else {
        // A resize, a new target or a new theme all change how a token is
        // drawn, so the pile is rebuilt from its seeds and settled again
        // rather than left hanging where the old walls used to be.
        world.resize(cavity.width, cavity.height);
        world.setCapacity(cap);
        world.setTheme(t);
      }
      world.setTokens(tokens);
      world.settle();
      known = new Set(tokens.map((k) => k.id));
      paint();
    });
  });

  // Reconcile on token change. Only a genuine addition earns an animation.
  $effect(() => {
    const list = tokens;

    untrack(() => {
      if (!world) return;

      const ids = new Set(list.map((k) => k.id));
      const added = list.some((k) => !known.has(k.id));
      known = ids;

      world.setTokens(list, { animateNew: added });

      // reducedMotion is read here rather than tracked: what matters is its
      // value at the moment a treat is added, which is exactly what an
      // untracked read gives. Tracking it would restart this for a setting
      // change that has nothing to reconcile.
      if (added && !reducedMotion) {
        world.start(paint);
      } else {
        // Reduced motion, or a removal: no fall, just the settled result.
        world.settle(added ? 200 : 60);
        paint();
      }
    });
  });

  export function shake(): void {
    if (!world) return;
    world.shake();
    if (reducedMotion) {
      world.settle(200);
      paint();
    } else {
      world.start(paint);
    }
  }
</script>

<!-- The role and label sit on the wrapper: a <canvas> may not take role="img",
     and its pixels are meaningless to assistive tech either way. The canvas
     itself is hidden, and the jar's real accessible content is the progress
     text and hidden token list the parent renders alongside it. -->
<!-- Rendered unconditionally, even before the box has been measured. Hiding
     this behind an {#if} looks tidier but breaks the canvas: bind:this is
     applied by an effect created when the block renders, which lands AFTER the
     effect that wants to size the canvas, so the canvas keeps its 300x150
     default and nothing is ever drawn in it. -->
<div class="jar" bind:this={wrap} role="img" aria-label={label}>
  <div class="vessel" style:height="{shape.height}px">
  <svg
    class="glass"
    width={shape.width}
    height={shape.height}
    viewBox="0 0 {shape.width} {shape.height}"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="{uid}-tint" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color={palette.accent} stop-opacity="0.20" />
        <stop offset="0.35" stop-color={palette.accent} stop-opacity="0.07" />
        <stop offset="0.8" stop-color={palette.accent} stop-opacity="0.10" />
        <stop offset="1" stop-color={palette.accent} stop-opacity="0.26" />
      </linearGradient>
    </defs>
    <path d={shape.glass} fill={palette.jarTint} />
    <path d={shape.inside} fill="url(#{uid}-tint)" />
  </svg>

  <canvas
    bind:this={canvas}
    aria-hidden="true"
    style:width="{shape.width}px"
    style:height="{shape.height}px"
  ></canvas>

  <svg
    class="glass front"
    width={shape.width}
    height={shape.height}
    viewBox="0 0 {shape.width} {shape.height}"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="{uid}-sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.22" />
        <stop offset="0.12" stop-color="#fff" stop-opacity="0.07" />
        <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
        <stop offset="0.88" stop-color="#000" stop-opacity="0.05" />
        <stop offset="1" stop-color="#000" stop-opacity="0.15" />
      </linearGradient>
      <linearGradient id="{uid}-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.18" />
      </linearGradient>
      <linearGradient id="{uid}-lid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.45" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0.05" />
        <stop offset="1" stop-color="#000" stop-opacity="0.25" />
      </linearGradient>
      <clipPath id="{uid}-inside"><path d={shape.inside} /></clipPath>
    </defs>

    <g clip-path="url(#{uid}-inside)">
      <path d={shape.inside} fill="url(#{uid}-sheen)" />
      <rect
        x="0"
        y={shape.height * 0.82}
        width={shape.width}
        height={shape.height * 0.18}
        fill="url(#{uid}-floor)"
      />
      <!-- Two specular streaks: one broad, one hairline. Real glass has a
           hard-edged reflection of whatever is lighting the room. -->
      <rect
        x={shape.cavity.x + shape.cavity.width * 0.09}
        y={shape.cavity.y - shape.height * 0.06}
        width={shape.cavity.width * 0.075}
        height={shape.height * 0.86}
        rx={shape.cavity.width * 0.037}
        fill="#fff"
        opacity="0.34"
      />
      <rect
        x={shape.cavity.x + shape.cavity.width * 0.21}
        y={shape.cavity.y - shape.height * 0.06}
        width={shape.cavity.width * 0.028}
        height={shape.height * 0.86}
        rx={shape.cavity.width * 0.014}
        fill="#fff"
        opacity="0.22"
      />
      <rect
        x={shape.cavity.x + shape.cavity.width * 0.88}
        y={shape.cavity.y - shape.height * 0.06}
        width={shape.cavity.width * 0.04}
        height={shape.height * 0.86}
        rx={shape.cavity.width * 0.02}
        fill="#fff"
        opacity="0.18"
      />
    </g>

    <path d={shape.inside} fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.5" />
    <path
      d={shape.glass}
      fill="none"
      stroke={palette.accent}
      stroke-opacity="0.5"
      stroke-width={shape.wall}
    />

    <rect
      x={shape.collar.x}
      y={shape.collar.y}
      width={shape.collar.width}
      height={shape.collar.height}
      rx="2"
      fill={palette.accent}
      opacity="0.55"
    />
    <rect
      x={shape.lid.x}
      y={shape.lid.y}
      width={shape.lid.width}
      height={shape.lid.height}
      rx={Math.min(6, shape.lid.height / 2)}
      fill={palette.accent}
    />
    <rect
      x={shape.lid.x}
      y={shape.lid.y}
      width={shape.lid.width}
      height={shape.lid.height}
      rx={Math.min(6, shape.lid.height / 2)}
      fill="url(#{uid}-lid)"
    />
  </svg>
  </div>
</div>

<style>
  .jar {
    position: relative;
    width: min(88%, 340px);
    /* Height comes from stretching inside the stage, NOT from height: 100%.
       A percentage height against a flex parent whose own height is still
       being resolved computes to auto — and since this element's content is
       only rendered once it has been measured, auto here means zero for ever:
       an empty jar with no canvas in it at all. */
    align-self: stretch;
    min-height: 0;
  }

  /* The jar stands on the bottom of whatever space it is given. */
  .vessel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .glass,
  canvas {
    position: absolute;
    inset: 0;
    display: block;
  }

  /* Everything in front of the pile is decoration; taps belong to the jar. */
  .front {
    pointer-events: none;
  }
</style>
