<script lang="ts">
  interface Props { fraction: number; label: string; accent: string; complete: boolean; }
  let { fraction, label, accent, complete }: Props = $props();
</script>

<!-- The bar is decorative; the real value is the text beside it and the
     role="progressbar" attributes, so progress is never colour-only. -->
<div class="wrap">
  <p class="label" class:complete>{label}</p>
  <div
    class="track"
    role="progressbar"
    aria-valuenow={Math.round(fraction * 100)}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label="Progress towards the target"
  >
    <span style:width="{fraction * 100}%" style:background={accent}></span>
  </div>
</div>

<style>
  .wrap { width: 100%; max-width: 340px; margin: 0 auto; }
  .label { margin: 0 0 6px; text-align: center; font-weight: 650; font-variant-numeric: tabular-nums; }
  .label.complete::after { content: ' 🎉'; }
  .track { height: 12px; border-radius: 99px; background: rgba(0, 0, 0, 0.14); overflow: hidden; }
  .track span { display: block; height: 100%; border-radius: 99px; transition: width 260ms ease; }
  @media (prefers-reduced-motion: reduce) { .track span { transition: none; } }
</style>
