<script lang="ts">
  import type { DesktopController } from "./desktop-controller.svelte";
  let { app, target = "" }: { app: DesktopController; target?: string } =
    $props();
</script>

<span class="action-progress" role="status" aria-live="polite">
  {#if app.busy && app.busyTarget === target}<span class="spinner"
    ></span>{app.busy}…{/if}
</span>
