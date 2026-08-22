<script lang="ts">
  import Sheet from './Sheet.svelte';
  import SyncStatusBar from './SyncStatusBar.svelte';
  import { install } from '../lib/install.svelte.ts';
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

  <!-- Mounted unconditionally, and deliberately OUTSIDE the section below. A
       live region only announces changes that happen while it is on the page,
       so putting it inside a block that disappears at the same moment the
       message is written announces nothing at all. -->
  <p class="visually-hidden" aria-live="polite">{install.said}</p>

  <!-- Nothing is rendered when there is nothing to offer, rather than a section
       explaining that installing is unavailable. -->
  {#if install.offer !== 'none'}
    <fieldset>
      <legend>Home screen</legend>
      {#if install.offer === 'installed'}
        <p class="hint">Treat Jar is on your home screen. It works without a signal.</p>
      {:else if install.offer === 'prompt'}
        <p class="hint">Keep Treat Jar on your home screen — it opens full screen and works without a signal.</p>
        <button class="install" onclick={() => install.prompt()}>Install Treat Jar</button>
      {:else if install.offer === 'spent'}
        <!-- The browser hands the prompt over once. It cannot be asked again
             this visit, so say where it went rather than vanishing. -->
        <p class="hint">
          You can still add Treat Jar to your home screen from your browser's menu — look for
          <strong>Install</strong> or <strong>Add to Home screen</strong>.
        </p>
      {:else}
        <!-- iOS has no install API at all, so the steps are the feature. -->
        <p class="hint">To keep Treat Jar on your home screen:</p>
        <ol class="steps">
          <li>Tap the Share button in the browser bar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>.</li>
        </ol>
      {/if}
    </fieldset>
  {/if}

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
  .install { width: 100%; font-weight: 650; }
  .steps { margin: 0; padding-left: 1.2em; font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px; }
  code { font-size: 0.78rem; background: var(--surface-3); padding: 1px 4px; border-radius: 4px; }
</style>
