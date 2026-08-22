<script lang="ts">
  import JarCanvas from './JarCanvas.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import { theme } from '../lib/themes.ts';
  import { projectedTokenCount } from '../lib/jar.ts';
  import { sharedPile, sharedProgress, type SharedJar } from '../lib/share.ts';

  interface Props { shared: SharedJar; reducedMotion: boolean; onmakeown: () => void; }
  let { shared, reducedMotion, onmakeown }: Props = $props();

  const def = $derived(theme(shared.themeId));
  const pile = $derived(sharedPile(shared));
  const total = $derived(sharedProgress(shared));
  const fraction = $derived(Math.min(1, total / shared.target));
  // The shared jar's own target, not its token count: the jar is drawn to fit
  // what it is saving up for, so a snapshot of a nearly empty jar must not
  // arrive looking full.
  const capacity = $derived(projectedTokenCount(shared.themeId, shared.target));
  const label = $derived(`${shared.name}'s jar, ${def.progress.format(total)} of ${def.progress.format(shared.target)}`);
  const when = $derived(
    new Date(shared.sharedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  );
</script>

<section style:background={def.palette.background} style:color={def.palette.ink}>
  <p class="banner">Snapshot shared {when} — this is a picture of the jar, not a live view.</p>

  <h1>{shared.name}</h1>

  <ProgressBar
    {fraction}
    label="{def.progress.format(total)} / {def.progress.format(shared.target)}"
    accent={def.palette.accent}
    complete={total >= shared.target}
  />

  <div class="stage">
    <JarCanvas tokens={pile} themeId={shared.themeId} {capacity} {reducedMotion} {label} />
  </div>

  <button onclick={onmakeown} style:background={def.palette.accent}>Make your own jar</button>
</section>

<style>
  section { min-height: 100dvh; display: flex; flex-direction: column; gap: 12px; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); }
  .banner { margin: 0; padding: 8px 12px; border-radius: var(--radius); background: rgba(255,255,255,0.65); font-size: 0.8rem; text-align: center; color: #1b1a17; }
  h1 { margin: 0; font-size: 1.3rem; text-align: center; }
  .stage { flex: 1 1 auto; min-height: 220px; display: flex; justify-content: center; }
  button { min-height: var(--tap); border: none; border-radius: var(--radius); color: #fff; font-weight: 650; }
</style>
