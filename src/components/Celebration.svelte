<script lang="ts">
  import { theme } from '../lib/themes.ts';
  import type { ThemeId } from '../lib/types.ts';

  interface Props {
    jarName: string;
    themeId: ThemeId;
    reducedMotion: boolean;
    oncashin: () => void;
    onlater: () => void;
  }
  let { jarName, themeId, reducedMotion, oncashin, onlater }: Props = $props();

  const accent = $derived(theme(themeId).palette.accent);
  // Confetti is CSS-only and skipped entirely under reduced motion — the
  // announcement and the buttons carry the whole message without it.
  const bits = Array.from({ length: 24 }, (_, i) => i);
</script>

<div class="overlay" role="alertdialog" aria-modal="true" aria-labelledby="celebrate-title">
  {#if !reducedMotion}
    <div class="confetti" aria-hidden="true">
      {#each bits as i (i)}
        <span style:--i={i} style:background={i % 3 === 0 ? accent : i % 3 === 1 ? '#f0c14b' : '#e2725b'}></span>
      {/each}
    </div>
  {/if}

  <div class="card">
    <p class="big" aria-hidden="true">🎉</p>
    <h2 id="celebrate-title">{jarName} filled the jar!</h2>
    <p>Time for the treat. Cashing in empties the jar and starts a new round — the history is kept.</p>
    <div class="actions">
      <button class="primary" style:background={accent} onclick={oncashin}>Cash in &amp; empty</button>
      <button onclick={onlater}>Not yet</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,0.5); padding: 16px; z-index: 20; }
  .card { background: var(--surface-1); color: var(--text-primary); border-radius: 20px; padding: 24px; text-align: center; max-width: 360px; }
  .big { font-size: 3rem; margin: 0 0 4px; }
  h2 { margin: 0 0 8px; font-size: 1.2rem; }
  p { margin: 0 0 16px; color: var(--text-secondary); font-size: 0.9rem; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  button { min-height: var(--tap); border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-2); }
  .primary { color: #fff; border: none; font-weight: 600; }
  .confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .confetti span {
    position: absolute; top: -12px; left: calc(var(--i) * 4.1%);
    width: 9px; height: 14px; border-radius: 2px; opacity: 0.9;
    animation: fall 2.4s linear infinite;
    animation-delay: calc(var(--i) * -0.13s);
  }
  @keyframes fall {
    to { transform: translateY(105vh) rotate(540deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .confetti { display: none; }
  }
</style>
