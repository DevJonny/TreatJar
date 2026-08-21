<script lang="ts">
  import Sheet from './Sheet.svelte';
  import TokenGlyph from './TokenGlyph.svelte';
  import { theme, tokenType } from '../lib/themes.ts';
  import type { Jar } from '../lib/types.ts';

  interface Props {
    open: boolean;
    jar: Jar;
    onclose: () => void;
    onadd: (tokenTypeId: string, reasonId: string | null, note: string | null) => void;
  }
  let { open, jar, onclose, onadd }: Props = $props();

  let note = $state('');
  let showAll = $state(false);

  const tokens = $derived(theme(jar.themeId).tokens);

  function commit(tokenTypeId: string, reasonId: string | null) {
    onadd(tokenTypeId, reasonId, note.trim() || null);
    note = '';
    showAll = false;
    onclose();
  }
</script>

<Sheet {open} title="Add a treat" {onclose}>
  {#if jar.reasons.length > 0}
    <ul class="reasons">
      {#each jar.reasons as reason (reason.id)}
        {@const def = tokenType(jar.themeId, reason.tokenTypeId)}
        <li>
          <button onclick={() => commit(reason.tokenTypeId, reason.id)}>
            {#if def}<TokenGlyph token={def} />{/if}
            <span class="text">
              <span class="reason">{reason.label}</span>
              <span class="token">{def?.label ?? reason.tokenTypeId}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if jar.reasons.length === 0 || showAll}
    <p class="heading" id="pick-any">Pick any token</p>
    <ul class="grid" aria-labelledby="pick-any">
      {#each tokens as t (t.id)}
        <li>
          <button onclick={() => commit(t.id, null)}>
            <TokenGlyph token={t} size={34} />
            <span>{t.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <button class="link" onclick={() => (showAll = true)}>Pick a different token…</button>
  {/if}

  <label class="note">
    <span>Note (optional)</span>
    <input bind:value={note} placeholder="What was it for?" maxlength="80" />
  </label>
</Sheet>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .reasons { display: flex; flex-direction: column; gap: 8px; }
  .reasons button {
    display: flex; align-items: center; gap: 12px; width: 100%;
    min-height: var(--tap); padding: 10px 14px; text-align: left;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2);
  }
  .text { display: flex; flex-direction: column; }
  .reason { font-weight: 600; }
  .token { font-size: 0.82rem; color: var(--text-secondary); }
  .heading { margin: 16px 0 8px; font-weight: 600; font-size: 0.9rem; color: var(--text-secondary); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; }
  .grid button {
    display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%;
    min-height: 84px; padding: 10px 6px; font-size: 0.82rem;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2);
  }
  .link { margin-top: 12px; background: none; border: none; padding: 12px 0; color: var(--text-secondary); text-decoration: underline; min-height: var(--tap); }
  .note { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; font-size: 0.85rem; color: var(--text-secondary); }
  .note input { min-height: var(--tap); padding: 0 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font: inherit; }
</style>
