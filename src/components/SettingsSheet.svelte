<script lang="ts">
  import Sheet from './Sheet.svelte';
  import SyncStatusBar from './SyncStatusBar.svelte';
  import type { MotionChoice, Preferences, ThemeChoice } from '../lib/prefs.ts';
  import type { SyncStatus } from '../lib/types.ts';

  interface Props {
    open: boolean;
    prefs: Preferences;
    syncStatus: SyncStatus;
    syncError: string | null;
    syncConfigured: boolean;
    onclose: () => void;
    onprefs: (patch: Partial<Preferences>) => void;
    onconnect: () => void;
    ondisconnect: () => void;
    onsync: () => void;
  }
  let {
    open, prefs, syncStatus, syncError, syncConfigured,
    onclose, onprefs, onconnect, ondisconnect, onsync,
  }: Props = $props();

  const themes: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  const motions: { value: MotionChoice; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'reduced', label: 'Reduced' },
  ];
</script>

<Sheet {open} title="Settings" {onclose}>
  <fieldset>
    <legend>Appearance</legend>
    <div class="row">
      {#each themes as t (t.value)}
        <button class:selected={prefs.theme === t.value} aria-pressed={prefs.theme === t.value} onclick={() => onprefs({ theme: t.value })}>{t.label}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Motion</legend>
    <p class="hint">Reduced motion drops the tokens straight into place instead of letting them tumble.</p>
    <div class="row">
      {#each motions as m (m.value)}
        <button class:selected={prefs.motion === m.value} aria-pressed={prefs.motion === m.value} onclick={() => onprefs({ motion: m.value })}>{m.label}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Google Drive</legend>
    {#if syncConfigured}
      <p class="hint">Jars are kept in a private app folder in your Drive, so your other devices see the same jars. Nobody else can read it.</p>
      <SyncStatusBar status={syncStatus} error={syncError} configured={syncConfigured} {onconnect} {onsync} />
      {#if syncStatus !== 'not-signed-in'}
        <button class="danger" onclick={ondisconnect}>Disconnect Drive</button>
      {/if}
    {:else}
      <p class="hint">
        Sync is not set up in this build. It needs a Google OAuth client id in
        <code>VITE_GOOGLE_CLIENT_ID</code> — see the README. Everything else works without it.
      </p>
    {/if}
  </fieldset>
</Sheet>

<style>
  fieldset { border: none; margin: 0 0 18px; padding: 0; }
  legend { font-weight: 650; font-size: 0.92rem; padding: 0; margin-bottom: 6px; }
  .hint { margin: 0 0 8px; font-size: 0.82rem; color: var(--text-secondary); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  button { min-height: var(--tap); padding: 0 14px; border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
  .selected { border-color: var(--text-primary); font-weight: 650; }
  .danger { margin-top: 10px; color: var(--danger); border-color: currentColor; width: 100%; }
  code { font-size: 0.78rem; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; }
</style>
