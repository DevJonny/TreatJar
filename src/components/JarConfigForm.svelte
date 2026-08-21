<script lang="ts">
  import { untrack } from 'svelte';
  import TokenGlyph from './TokenGlyph.svelte';
  import { THEMES, theme } from '../lib/themes.ts';
  import { validateTarget, TOKEN_COUNT_MAX } from '../lib/jar.ts';
  import { THEME_IDS, type Jar, type ThemeId } from '../lib/types.ts';

  interface Draft { label: string; tokenTypeId: string }

  interface Props {
    /** Existing jar to edit, or null to create a new one. */
    jar?: Jar | null;
    onsave: (input: { name: string; themeId: ThemeId; target: number; reasons: Draft[] }) => void;
    oncancel: () => void;
  }
  let { jar = null, onsave, oncancel }: Props = $props();

  // Seeded once, on purpose. `untrack` says so explicitly: re-reading `jar`
  // reactively here would discard whatever the user has half-typed the moment
  // anything else about the jar changed underneath the open form.
  let name = $state(untrack(() => jar?.name ?? ''));
  let themeId = $state<ThemeId>(untrack(() => jar?.themeId ?? 'dinosaurs'));
  // `bind:value` on <input type="number"> yields number | null: an empty field
  // and a half-typed "-" both arrive as null, so the state must allow it.
  let target = $state<number | null>(
    untrack(() => jar?.target ?? THEMES.dinosaurs.progress.targetPresets[1]!),
  );
  let reasons = $state<Draft[]>(
    untrack(() => jar?.reasons.map((r) => ({ label: r.label, tokenTypeId: r.tokenTypeId })) ?? []),
  );

  const def = $derived(theme(themeId));
  const verdict = $derived(validateTarget(themeId, target ?? 0));
  const nameOk = $derived(name.trim().length > 0);
  const canSave = $derived(nameOk && verdict.ok);

  /**
   * Switching theme rewrites the reasons' token types. Leaving them pointing at
   * the old theme's ids would give every shortcut a blank glyph and add tokens
   * the jar cannot draw.
   */
  function switchTheme(next: ThemeId) {
    const before = theme(themeId).tokens;
    const after = THEMES[next].tokens;
    reasons = reasons.map((r) => {
      const i = before.findIndex((t) => t.id === r.tokenTypeId);
      return { ...r, tokenTypeId: after[i >= 0 ? i : 0]!.id };
    });
    themeId = next;
    if (target !== null && !validateTarget(next, target).ok) {
      target = THEMES[next].progress.targetPresets[1]!;
    }
  }

  function addReason() {
    reasons = [...reasons, { label: '', tokenTypeId: def.tokens[0]!.id }];
  }
  function removeReason(i: number) {
    reasons = reasons.filter((_, n) => n !== i);
  }

  function save() {
    if (!canSave || target === null) return;
    onsave({
      name: name.trim(),
      themeId,
      target,
      reasons: reasons.filter((r) => r.label.trim().length > 0),
    });
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); save(); }}>
  <label class="field">
    <span>Whose jar is it?</span>
    <input bind:value={name} placeholder="e.g. Ellie" maxlength="40" required />
  </label>

  <fieldset>
    <legend>Theme</legend>
    <div class="themes">
      {#each THEME_IDS as id (id)}
        <button
          type="button"
          class="theme"
          class:selected={themeId === id}
          aria-pressed={themeId === id}
          onclick={() => switchTheme(id)}
        >
          <span class="swatch">
            {#each THEMES[id].tokens.slice(0, 4) as t (t.id)}<TokenGlyph token={t} size={20} />{/each}
          </span>
          <span>{THEMES[id].label}</span>
        </button>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>Target {def.progress.mode === 'value' ? '(how much to save up)' : '(how many tokens)'}</legend>
    <div class="presets">
      {#each def.progress.targetPresets as preset (preset)}
        <button type="button" class:selected={target === preset} aria-pressed={target === preset} onclick={() => (target = preset)}>
          {def.progress.format(preset)}
        </button>
      {/each}
    </div>
    <label class="field custom">
      <span>{def.progress.mode === 'value' ? 'Or an amount in pence' : 'Or a number'}</span>
      <input type="number" bind:value={target} min="1" step="1" />
    </label>
    {#if target !== null && !verdict.ok}
      <p class="warn error">
        That would put {verdict.projected} tokens in the jar. The most it can hold is {TOKEN_COUNT_MAX}.
      </p>
    {:else if verdict.ok && verdict.warn}
      <p class="warn">That is up to {verdict.projected} tokens — a very full jar.</p>
    {/if}
  </fieldset>

  <fieldset>
    <legend>One-tap reasons</legend>
    <p class="hint">Shortcuts for the treats you give most often. You can always pick a token by hand instead.</p>
    {#each reasons as reason, i (i)}
      <div class="reason">
        <input bind:value={reason.label} placeholder="e.g. Tidied room" maxlength="40" aria-label="Reason {i + 1}" />
        <select bind:value={reason.tokenTypeId} aria-label="Token for reason {i + 1}">
          {#each def.tokens as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
        </select>
        <button type="button" class="remove" onclick={() => removeReason(i)} aria-label="Remove reason {i + 1}">✕</button>
      </div>
    {/each}
    <button type="button" class="add" onclick={addReason}>+ Add a reason</button>
  </fieldset>

  <div class="actions">
    <button type="submit" class="primary" disabled={!canSave} style:background={def.palette.accent}>
      {jar ? 'Save changes' : 'Create jar'}
    </button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</form>

<style>
  form { display: flex; flex-direction: column; gap: 18px; }
  fieldset { border: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  legend { font-weight: 650; font-size: 0.92rem; padding: 0; margin-bottom: 4px; }
  .field { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: var(--text-secondary); }
  input, select { min-height: var(--tap); padding: 0 12px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-1); color: var(--text-primary); font: inherit; }
  .themes { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
  .theme { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; min-height: 76px; border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface-2); font-size: 0.85rem; }
  .swatch { display: flex; gap: 2px; }
  .selected { border-color: var(--text-primary); font-weight: 650; }
  .presets { display: flex; flex-wrap: wrap; gap: 8px; }
  .presets button { min-height: var(--tap); padding: 0 14px; border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
  .custom { margin-top: 4px; }
  .warn { margin: 0; font-size: 0.82rem; color: var(--text-secondary); }
  .warn.error { color: var(--danger); }
  .hint { margin: 0 0 4px; font-size: 0.82rem; color: var(--text-secondary); }
  .reason { display: flex; gap: 6px; align-items: center; }
  .reason input { flex: 1 1 auto; min-width: 0; }
  .reason select { flex: 0 1 auto; }
  .remove { min-width: var(--tap); min-height: var(--tap); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
  .add { min-height: var(--tap); border: 1px dashed var(--border); border-radius: var(--radius); background: transparent; color: var(--text-secondary); }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .actions button { min-height: var(--tap); border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-2); }
  .primary { color: #fff; border: none; font-weight: 650; }
  .primary:disabled { opacity: 0.45; }
</style>
