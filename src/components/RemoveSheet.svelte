<script lang="ts">
  import Sheet from './Sheet.svelte';
  import TokenGlyph from './TokenGlyph.svelte';
  import { tokenType } from '../lib/themes.ts';
  import { visibleTokens } from '../lib/jar.ts';
  import type { Jar, Token } from '../lib/types.ts';

  interface Props {
    open: boolean;
    jar: Jar;
    tokens: Token[];
    onclose: () => void;
    onremove: (tokenId: string, kind: 'undo' | 'consequence', reasonText: string | null) => void;
  }
  let { open, jar, tokens, onclose, onremove }: Props = $props();

  let reasonText = $state('');
  // `visibleTokens`, not `liveTokens`: a token orphaned by a theme change is
  // not in the jar as far as the pile and the progress bar are concerned, so
  // offering it here would let a grown-up "take out" something nobody can see,
  // to no visible effect.
  const visible = $derived(
    visibleTokens(jar, tokens).slice().sort((a, b) => b.addedUtc.localeCompare(a.addedUtc)),
  );

  function take(tokenId: string, kind: 'undo' | 'consequence') {
    onremove(tokenId, kind, kind === 'consequence' ? reasonText.trim() || null : null);
    reasonText = '';
    onclose();
  }
</script>

<Sheet {open} title="Take a token out" {onclose}>
  {#if visible.length === 0}
    <p class="empty">The jar is empty — there is nothing to take out.</p>
  {:else}
    <label class="note">
      <span>Why? (optional, saved to the history)</span>
      <input bind:value={reasonText} placeholder="e.g. Wouldn't share" maxlength="80" />
    </label>

    <p class="heading" id="which">Which token?</p>
    <ul aria-labelledby="which">
      {#each visible as t (t.id)}
        {@const def = tokenType(jar.themeId, t.tokenTypeId)}
        <li>
          <span class="who">
            {#if def}<TokenGlyph token={def} />{/if}
            <span>{def?.label ?? t.tokenTypeId}</span>
          </span>
          <span class="actions">
            <button onclick={() => take(t.id, 'undo')}>Mistake</button>
            <button class="danger" onclick={() => take(t.id, 'consequence')}>Take away</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</Sheet>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
  .who { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; gap: 6px; }
  .actions button { min-height: var(--tap); padding: 0 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-1); font-size: 0.85rem; }
  .danger { color: var(--danger); border-color: currentColor; }
  .heading { margin: 16px 0 8px; font-weight: 600; font-size: 0.9rem; color: var(--text-secondary); }
  .empty { color: var(--text-secondary); }
  .note { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: var(--text-secondary); }
  .note input { min-height: var(--tap); padding: 0 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font: inherit; }
</style>
