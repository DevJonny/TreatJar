<script lang="ts">
  import type { HistoryEntry } from '../lib/jar.ts';

  interface Props { entries: HistoryEntry[]; limit?: number; }
  let { entries, limit = 40 }: Props = $props();

  const shown = $derived(entries.slice(0, limit));

  const when = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
</script>

{#if shown.length === 0}
  <p class="empty">Nothing yet. Add the first treat!</p>
{:else}
  <ol>
    {#each shown as e (e.id)}
      <li class:removed={e.kind === 'removed'}>
        <span class="mark" aria-hidden="true">{e.kind === 'added' ? '+' : '−'}</span>
        <span class="what">
          <span class="line">
            <strong>{e.tokenLabel}</strong>
            <!-- The kind is spelled out, not just signalled by the +/− colour. -->
            <span class="kind">
              <!-- A theme change is not something the child did. Wording it as
                   "taken away" would put punishments she never earned into her
                   own history, one per treat. -->
              {#if e.kind === 'added'}added
              {:else if e.removalKind === 'undo'}removed (mistake)
              {:else if e.removalKind === 'themeChange'}jar started again
              {:else}taken away{/if}
            </span>
          </span>
          {#if e.reasonLabel}<span class="reason">{e.reasonLabel}</span>{/if}
          {#if e.note}<span class="note">“{e.note}”</span>{/if}
        </span>
        <time datetime={e.at}>{when(e.at)}</time>
      </li>
    {/each}
  </ol>
{/if}

<style>
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: var(--radius); background: var(--surface-2); }
  .mark { font-weight: 700; color: var(--success); min-width: 1ch; }
  .removed .mark { color: var(--danger); }
  .what { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  .kind { font-size: 0.78rem; color: var(--text-secondary); }
  .reason, .note { font-size: 0.82rem; color: var(--text-secondary); }
  time { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
  .empty { color: var(--text-secondary); text-align: center; padding: 12px; }
</style>
