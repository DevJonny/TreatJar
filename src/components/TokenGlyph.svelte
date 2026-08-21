<script lang="ts">
  /** A token's silhouette as inline SVG — the same path the canvas draws. */
  import type { TokenTypeDef } from '../lib/types.ts';

  interface Props { token: TokenTypeDef; size?: number; }
  let { token, size = 28 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <path d={token.path} fill={token.fill} stroke="rgba(0,0,0,0.3)" stroke-width="3" />
</svg>
