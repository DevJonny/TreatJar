<script lang="ts">
  import TokenGlyph from './TokenGlyph.svelte';
  import { theme } from '../lib/themes.ts';
  import { formatProgress, formatTarget, isComplete, progressFraction, visibleTokens } from '../lib/jar.ts';
  import type { Jar, Token } from '../lib/types.ts';

  interface Props {
    jars: Jar[];
    tokens: Token[];
    onopen: (id: string) => void;
    oncreate: () => void;
    onsettings: () => void;
  }
  let { jars, tokens, onopen, oncreate, onsettings }: Props = $props();

  const forJar = (jar: Jar) => tokens.filter((t) => t.jarId === jar.id);
</script>

<section>
  <header>
    <h1>Treat Jars</h1>
    <button class="icon" onclick={onsettings} aria-label="Settings">⚙</button>
  </header>

  {#if jars.length === 0}
    <div class="empty">
      <p class="big" aria-hidden="true">🫙</p>
      <h2>No jars yet</h2>
      <p>Make a jar for each child, pick a theme, and start filling it with treats.</p>
    </div>
  {:else}
    <ul>
      {#each jars as jar (jar.id)}
        {@const def = theme(jar.themeId)}
        {@const jarTokens = forJar(jar)}
        {@const done = isComplete(jar, jarTokens)}
        <li>
          <button onclick={() => onopen(jar.id)} style:background={def.palette.background} style:color={def.palette.ink}>
            <span class="top">
              <span class="name">{jar.name}</span>
              <span class="count">{formatProgress(jar, jarTokens)} / {formatTarget(jar)}{done ? ' 🎉' : ''}</span>
            </span>
            <span class="track"><span class="fill" style:width="{progressFraction(jar, jarTokens) * 100}%" style:background={def.palette.accent}></span></span>
            <span class="glyphs">
              <!-- Visible, so the strip cannot be emptied by tokens orphaned in
                   an old theme quietly eating the eight slots. -->
              {#each visibleTokens(jar, jarTokens).slice(-8) as t (t.id)}
                {@const d = def.tokens.find((x) => x.id === t.tokenTypeId)}
                {#if d}<TokenGlyph token={d} size={20} />{/if}
              {/each}
              <span class="theme">{def.label}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <button class="create" onclick={oncreate}>+ New jar</button>
</section>

<style>
  section { min-height: 100dvh; display: flex; flex-direction: column; gap: 12px; padding: 12px 12px calc(12px + env(safe-area-inset-bottom)); }
  header { display: flex; align-items: center; }
  h1 { flex: 1; margin: 0; font-size: 1.25rem; }
  .icon { min-width: var(--tap); min-height: var(--tap); border: none; background: transparent; border-radius: 50%; font-size: 1.1rem; color: inherit; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; flex: 1 1 auto; }
  li button { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 14px; border: 1px solid var(--border); border-radius: 18px; text-align: left; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .name { font-weight: 700; font-size: 1.05rem; }
  .count { font-variant-numeric: tabular-nums; font-size: 0.88rem; }
  .track { display: block; height: 8px; border-radius: 99px; background: rgba(0,0,0,0.14); overflow: hidden; }
  .fill { display: block; height: 100%; }
  .glyphs { display: flex; align-items: center; gap: 2px; }
  .theme { margin-left: auto; font-size: 0.76rem; opacity: 0.75; }
  .empty { flex: 1 1 auto; display: grid; place-content: center; text-align: center; color: var(--text-secondary); gap: 4px; }
  .empty .big { font-size: 3rem; margin: 0; }
  .empty h2 { margin: 0; color: var(--text-primary); font-size: 1.05rem; }
  .create { min-height: var(--tap); border-radius: var(--radius); border: 1px dashed var(--border); background: var(--surface-2); font-weight: 600; }
</style>
