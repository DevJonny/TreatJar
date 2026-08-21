<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import JarList from './components/JarList.svelte';
  import JarView from './components/JarView.svelte';
  import ReadOnlyJar from './components/ReadOnlyJar.svelte';
  import JarConfigForm from './components/JarConfigForm.svelte';
  import Sheet from './components/Sheet.svelte';
  import SettingsSheet from './components/SettingsSheet.svelte';
  import ShareSheet from './components/ShareSheet.svelte';
  import Celebration from './components/Celebration.svelte';
  import { store } from './lib/store.svelte.ts';
  import { readRoute, routeToHash, shareUrl, type Route } from './lib/hash.ts';
  import { decodeShare } from './lib/share.ts';
  import { encodeShare } from './lib/share.ts';
  import { isComplete } from './lib/jar.ts';

  let route = $state<Route>(readRoute());
  let editing = $state<'new' | 'existing' | null>(null);
  let settingsOpen = $state(false);
  let sharePayload = $state<string | null>(null);
  let dismissedCelebration = $state<string | null>(null);

  // A shared link is resolved before any local state is touched: the viewer
  // may not be the owner, and opening someone else's link must never write to
  // this device's jars.
  const shared = $derived(route.kind === 'shared' ? decodeShare(route.payload) : null);

  const activeJar = $derived(
    route.kind === 'jar' ? store.jar(route.jarId) : store.jar(store.activeJarId),
  );

  const celebrating = $derived(
    activeJar !== null &&
      isComplete(activeJar, store.tokensFor(activeJar)) &&
      dismissedCelebration !== activeJar.currentRoundId,
  );

  function go(next: Route) {
    route = next;
    // Assigning location.hash pushes history, so Back unwinds navigation for
    // free without any bookkeeping of our own.
    if (location.hash !== routeToHash(next)) location.hash = routeToHash(next);
  }

  onMount(() => {
    const onHash = () => (route = readRoute());
    window.addEventListener('hashchange', onHash);
    store.initSync();
    return () => window.removeEventListener('hashchange', onHash);
  });

  // Any open overlay belongs to the screen that opened it. Leaving one up
  // across a navigation is how a share sheet ends up floating over someone
  // else's shared jar after a Back press.
  $effect(() => {
    route;
    untrack(() => {
      sharePayload = null;
      editing = null;
      settingsOpen = false;
    });
  });

  // Colour scheme is applied to the document root, not a component.
  $effect(() => {
    const choice = store.prefs.theme;
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
  });

  function openShare() {
    if (!activeJar) return;
    sharePayload = encodeShare(activeJar, store.tokensFor(activeJar));
  }
</script>

{#if route.kind === 'shared'}
  {#if shared}
    <ReadOnlyJar {shared} reducedMotion={store.reducedMotion} onmakeown={() => go({ kind: 'list' })} />
  {:else}
    <!-- A mangled or truncated link lands here rather than on a blank page. -->
    <section class="broken">
      <h1>That link didn't work</h1>
      <p>It may have been cut short when it was copied. Ask for a fresh one.</p>
      <button onclick={() => go({ kind: 'list' })}>Go to my jars</button>
    </section>
  {/if}
{:else if route.kind === 'jar' && activeJar}
  <JarView
    jar={activeJar}
    rounds={store.rounds}
    tokens={store.tokensFor(activeJar)}
    reducedMotion={store.reducedMotion}
    onadd={(t, r, n) => store.addToken(activeJar, t, r, n)}
    onremove={(id, kind, why) => store.removeToken(id, kind, why)}
    onundo={() => store.undoLast(activeJar)}
    onshare={openShare}
    onedit={() => (editing = 'existing')}
    onback={() => go({ kind: 'list' })}
  />
{:else}
  <JarList
    jars={store.liveJars}
    tokens={store.tokens}
    onopen={(id) => { store.setActive(id); go({ kind: 'jar', jarId: id }); }}
    oncreate={() => (editing = 'new')}
    onsettings={() => (settingsOpen = true)}
  />
{/if}

{#if celebrating && activeJar}
  <Celebration
    jarName={activeJar.name}
    themeId={activeJar.themeId}
    reducedMotion={store.reducedMotion}
    oncashin={() => store.cashIn(activeJar)}
    onlater={() => (dismissedCelebration = activeJar.currentRoundId)}
  />
{/if}

<Sheet
  open={editing !== null}
  title={editing === 'new' ? 'New jar' : 'Edit jar'}
  onclose={() => (editing = null)}
>
  {#key editing}
    <JarConfigForm
      jar={editing === 'existing' ? activeJar : null}
      oncancel={() => (editing = null)}
      onsave={(input) => {
        if (editing === 'existing' && activeJar) {
          store.updateJar(activeJar.id, {
            name: input.name,
            themeId: input.themeId,
            target: input.target,
            reasons: input.reasons.map((r, i) => ({
              id: activeJar.reasons[i]?.id ?? `r${Date.now()}${i}`,
              label: r.label,
              tokenTypeId: r.tokenTypeId,
            })),
          });
        } else {
          const jar = store.createJar(input);
          go({ kind: 'jar', jarId: jar.id });
        }
        editing = null;
      }}
    />
  {/key}
</Sheet>

<SettingsSheet
  open={settingsOpen}
  prefs={store.prefs}
  syncStatus={store.syncStatus}
  syncError={store.syncError}
  syncConfigured={store.syncConfigured}
  onclose={() => (settingsOpen = false)}
  onprefs={(patch) => store.setPrefs(patch)}
  onconnect={() => void store.connectDrive()}
  ondisconnect={() => store.disconnectDrive()}
  onsync={() => void store.syncNow()}
/>

<ShareSheet
  open={sharePayload !== null}
  url={sharePayload ? shareUrl(sharePayload) : ''}
  jarName={activeJar?.name ?? ''}
  onclose={() => (sharePayload = null)}
/>

<style>
  .broken { min-height: 100dvh; display: grid; place-content: center; text-align: center; gap: 10px; padding: 24px; }
  .broken h1 { margin: 0; font-size: 1.2rem; }
  .broken p { margin: 0; color: var(--text-secondary); }
  .broken button { min-height: var(--tap); padding: 0 18px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface-2); }
</style>
