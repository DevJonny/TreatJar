<script lang="ts">
  /** A bottom sheet. Phones first, so it rises from the thumb end of the screen. */
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
  }
  let { open, title, onclose, children }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    // showModal() also traps focus and wires Escape, which is most of the
    // accessibility work a hand-rolled overlay would have to redo badly.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} onclose={onclose} onclick={(e) => { if (e.target === dialog) onclose(); }}>
  <div class="body">
    <header>
      <h2>{title}</h2>
      <button class="close" onclick={onclose} aria-label="Close">✕</button>
    </header>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    border: none;
    padding: 0;
    background: transparent;
    max-width: 100vw;
    max-height: 100dvh;
    width: 100%;
    margin: auto auto 0;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  .body {
    background: var(--surface-1);
    color: var(--text-primary);
    border-radius: 20px 20px 0 0;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
    max-height: 86dvh;
    overflow-y: auto;
    margin: 0 auto;
    width: min(560px, 100%);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .close {
    min-width: var(--tap);
    min-height: var(--tap);
    border: none;
    background: transparent;
    border-radius: 50%;
    font-size: 1rem;
  }
</style>
