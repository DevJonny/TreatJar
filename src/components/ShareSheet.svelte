<script lang="ts">
  import Sheet from './Sheet.svelte';

  interface Props { open: boolean; url: string; jarName: string; onclose: () => void; }
  let { open, url, jarName, onclose }: Props = $props();

  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be refused outright; the input below is selectable
      // so there is always a manual path.
      copied = false;
    }
  }
</script>

<Sheet {open} title="Share {jarName}'s jar" {onclose}>
  <p class="blurb">
    This link shows the jar exactly as it looks right now — a snapshot, not a live view. Whoever
    opens it can see the pile and the target, but cannot add or remove anything, and does not need
    to sign in. Share again later to show the newer version.
  </p>
  <p class="privacy">The link carries the jar's name, theme and tokens. Reasons, notes and history stay on your device.</p>

  <input readonly value={url} onfocus={(e) => e.currentTarget.select()} aria-label="Share link" />
  <button class="copy" onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
</Sheet>

<style>
  .blurb { margin: 0 0 10px; font-size: 0.9rem; color: var(--text-secondary); }
  .privacy { margin: 0 0 14px; font-size: 0.8rem; color: var(--text-muted); }
  input { width: 100%; min-height: var(--tap); padding: 0 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-2); color: var(--text-primary); font: inherit; font-size: 0.8rem; }
  .copy { width: 100%; min-height: var(--tap); margin-top: 10px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-2); font-weight: 600; }
</style>
