<script lang="ts">
  import type { SyncStatus } from '../lib/types.ts';

  interface Props {
    status: SyncStatus;
    error: string | null;
    configured: boolean;
    onconnect: () => void;
    onsync: () => void;
  }
  let { status, error, configured, onconnect, onsync }: Props = $props();

  const text = $derived(
    !configured
      ? 'Sync not set up'
      : status === 'not-signed-in'
        ? 'Not connected'
        : status === 'syncing'
          ? 'Syncing…'
          : status === 'synced'
            ? 'Synced to Drive'
            : status === 'error'
              ? (error ?? 'Sync problem')
              : 'Connected',
  );
</script>

<div class="bar" class:bad={status === 'error'}>
  <span class="dot" data-status={status} aria-hidden="true"></span>
  <span class="text">{text}</span>
  {#if configured}
    {#if status === 'not-signed-in'}
      <button onclick={onconnect}>Connect</button>
    {:else}
      <button onclick={onsync} disabled={status === 'syncing'}>Sync now</button>
    {/if}
  {/if}
</div>

<style>
  .bar { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-secondary); padding: 6px 10px; }
  .bad { color: var(--danger); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); flex: none; }
  .dot[data-status='synced'] { background: var(--success); }
  .dot[data-status='syncing'] { background: #d6a534; }
  .dot[data-status='error'] { background: var(--danger); }
  .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { min-height: 36px; padding: 0 10px; font-size: 0.78rem; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); }
  button:disabled { opacity: 0.5; }
</style>
