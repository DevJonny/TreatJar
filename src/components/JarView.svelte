<script lang="ts">
  import JarCanvas from './JarCanvas.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import HistoryList from './HistoryList.svelte';
  import AddTreatSheet from './AddTreatSheet.svelte';
  import RemoveSheet from './RemoveSheet.svelte';
  import { theme, tokenType } from '../lib/themes.ts';
  import {
    formatProgress, formatTarget, history, isComplete, liveTokens,
    progressFraction, projectedTokenCount,
  } from '../lib/jar.ts';
  import type { Jar, Round, Token } from '../lib/types.ts';

  interface Props {
    jar: Jar;
    rounds: Round[];
    tokens: Token[];
    reducedMotion: boolean;
    onadd: (tokenTypeId: string, reasonId: string | null, note: string | null) => void;
    onremove: (tokenId: string, kind: 'undo' | 'consequence', reasonText: string | null) => void;
    onundo: () => void;
    onshare: () => void;
    onedit: () => void;
    onback: () => void;
  }
  let { jar, rounds, tokens, reducedMotion, onadd, onremove, onundo, onshare, onedit, onback }: Props = $props();

  let addOpen = $state(false);
  let removeOpen = $state(false);
  let canvasRef = $state<ReturnType<typeof JarCanvas> | null>(null);
  /**
   * Announced to screen readers after each change, since the canvas cannot be.
   *
   * The count is DERIVED rather than captured at the call site: `tokens` is a
   * prop and has not been updated yet when onadd() returns, so reading it there
   * announces the previous total every single time.
   */
  let lastAction = $state('');

  const def = $derived(theme(jar.themeId));
  const live = $derived(liveTokens(tokens, jar.currentRoundId));
  const pile = $derived(live.map((t) => ({ id: t.id, tokenTypeId: t.tokenTypeId, seed: t.seed })));
  const capacity = $derived(projectedTokenCount(jar.themeId, jar.target));
  const complete = $derived(isComplete(jar, tokens));
  const label = $derived(`${jar.name}'s ${def.label.toLowerCase()} jar, ${formatProgress(jar, tokens)} of ${formatTarget(jar)}`);
  const log = $derived(history(jar, tokens, rounds));
  const announcement = $derived(
    lastAction === '' ? '' : `${lastAction} Now ${formatProgress(jar, tokens)} of ${formatTarget(jar)}.`,
  );

  function add(tokenTypeId: string, reasonId: string | null, note: string | null) {
    onadd(tokenTypeId, reasonId, note);
    lastAction = `Added ${tokenType(jar.themeId, tokenTypeId)?.label ?? 'token'}.`;
  }
  function remove(tokenId: string, kind: 'undo' | 'consequence', reasonText: string | null) {
    onremove(tokenId, kind, reasonText);
    lastAction = kind === 'undo' ? 'Token removed.' : 'Token taken away.';
  }
</script>

<section style:background={def.palette.background} style:color={def.palette.ink}>
  <header>
    <button class="icon" onclick={onback} aria-label="All jars">←</button>
    <h1>{jar.name}</h1>
    <button class="icon" onclick={onshare} aria-label="Share this jar">↗</button>
    <button class="icon" onclick={onedit} aria-label="Edit this jar">⚙</button>
  </header>

  <ProgressBar
    fraction={progressFraction(jar, tokens)}
    label="{formatProgress(jar, tokens)} / {formatTarget(jar)}"
    accent={def.palette.accent}
    {complete}
  />

  <div class="stage">
    <JarCanvas bind:this={canvasRef} tokens={pile} themeId={jar.themeId} {capacity} {reducedMotion} {label} />
  </div>

  <!-- The canvas is invisible to assistive tech, so the same information is
       here as real text. Nothing is reachable only by looking at the jar. -->
  <p class="visually-hidden" aria-live="polite">{announcement}</p>
  <ul class="visually-hidden">
    {#each live as t (t.id)}
      <li>{tokenType(jar.themeId, t.tokenTypeId)?.label ?? t.tokenTypeId}</li>
    {/each}
  </ul>

  <div class="controls">
    <button class="primary" style:background={def.palette.accent} onclick={() => (addOpen = true)}>+ Add a treat</button>
    <button onclick={() => (removeOpen = true)} disabled={live.length === 0}>Take one out</button>
    <button onclick={onundo} disabled={live.length === 0}>Undo</button>
    <button onclick={() => canvasRef?.shake()} disabled={live.length === 0}>Shake</button>
  </div>

  <details>
    <summary>History ({log.length})</summary>
    <HistoryList entries={log} />
  </details>
</section>

<AddTreatSheet open={addOpen} {jar} onclose={() => (addOpen = false)} onadd={add} />
<RemoveSheet open={removeOpen} {jar} {tokens} onclose={() => (removeOpen = false)} onremove={remove} />

<style>
  section { min-height: 100dvh; display: flex; flex-direction: column; gap: 12px; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); }
  header { display: flex; align-items: center; gap: 4px; }
  h1 { flex: 1; margin: 0; font-size: 1.2rem; text-align: center; }
  .icon { min-width: var(--tap); min-height: var(--tap); border: none; background: transparent; border-radius: 50%; font-size: 1.1rem; color: inherit; }
  .stage { flex: 1 1 auto; min-height: 200px; display: flex; justify-content: center; }
  .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .controls button { min-height: var(--tap); border-radius: var(--radius); border: 1px solid rgba(0,0,0,0.16); background: rgba(255,255,255,0.7); color: #1b1a17; }
  .controls button:disabled { opacity: 0.45; }
  .primary { grid-column: 1 / -1; color: #fff !important; border: none !important; font-weight: 650; font-size: 1.02rem; }
  details { background: rgba(255,255,255,0.55); border-radius: var(--radius); padding: 8px 12px; color: #1b1a17; }
  summary { min-height: var(--tap); display: flex; align-items: center; font-weight: 600; cursor: pointer; }
</style>
