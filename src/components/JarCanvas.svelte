<script lang="ts">
  /**
   * The jar. Glass is CSS; the pile is a canvas driven by JarWorld.
   *
   * The component owns the element and the frame loop and nothing else — all
   * the physics lives in lib/physics.ts so it can be tested without a DOM.
   */
  import { onMount } from 'svelte';
  import { JarWorld, type PileToken } from '../lib/physics.ts';
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

  let wrap = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let world: JarWorld | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let known = new Set<string>();
  let size = $state({ w: 0, h: 0 });

  const palette = $derived(theme(themeId).palette);

  function paint(): void {
    if (world && ctx) world.draw(ctx);
  }

  function resizeCanvas(): void {
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx = canvas.getContext('2d');
    // Draw in CSS pixels; the transform absorbs the device ratio so nothing
    // else in this file has to think about it.
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  // Build (or re-fit) the world whenever the box or the theme changes.
  $effect(() => {
    const { w, h } = size;
    const t = themeId;
    if (w === 0 || h === 0) return;

    resizeCanvas();

    if (!world) {
      world = new JarWorld({ width: w, height: h, themeId: t, capacity });
      world.setTokens(tokens);
      world.settle();
      known = new Set(tokens.map((k) => k.id));
    } else {
      world.resize(w, h);
      world.setCapacity(capacity);
      // A resize invalidates every resting position, so re-settle rather than
      // leaving tokens hanging where the old walls used to be.
      world.setTokens(tokens);
      world.settle();
      known = new Set(tokens.map((k) => k.id));
    }
    paint();
  });

  // Reconcile on token change. Only a genuine addition earns an animation.
  $effect(() => {
    const list = tokens;
    if (!world) return;

    const ids = new Set(list.map((k) => k.id));
    const added = list.some((k) => !known.has(k.id));
    known = ids;

    world.setTokens(list, { animateNew: added });

    if (added && !reducedMotion) {
      world.start(paint);
    } else {
      // Reduced motion, or a removal: no fall, just the settled result.
      world.settle(added ? 200 : 60);
      paint();
    }
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

<div
  class="jar"
  style:--jar-tint={palette.jarTint}
  style:--jar-accent={palette.accent}
>
  <div class="rim" aria-hidden="true"></div>
  <!-- The role and label sit on the wrapper: a <canvas> may not take role="img",
       and its pixels are meaningless to assistive tech either way. The canvas
       itself is hidden, and the jar's real accessible content is the progress
       text and hidden token list the parent renders alongside it. -->
  <div class="glass" bind:this={wrap} role="img" aria-label={label}>
    <canvas bind:this={canvas} aria-hidden="true" style:width="100%" style:height="100%"></canvas>
  </div>
</div>

<style>
  .jar {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .rim {
    width: min(86%, 340px);
    height: 14px;
    border-radius: 8px;
    background: var(--jar-accent);
    opacity: 0.55;
    flex: none;
  }

  .glass {
    position: relative;
    width: min(80%, 320px);
    flex: 1 1 auto;
    min-height: 0;
    background: var(--jar-tint);
    border: 5px solid var(--jar-accent);
    border-top: none;
    border-radius: 6px 6px 34px 34px;
    overflow: hidden;
    /* A soft vertical highlight so the vessel reads as glass rather than a box. */
    box-shadow: inset 12px 0 24px -12px rgba(255, 255, 255, 0.75),
      inset -14px 0 22px -14px rgba(0, 0, 0, 0.18);
  }

  canvas {
    display: block;
  }
</style>
