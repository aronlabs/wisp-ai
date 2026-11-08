<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import { request } from "../api";
  import { describeRoutineTrigger } from "@wisp/protocol/routines";
  let { app }: { app: DesktopController } = $props();
</script>

<section class="card">
  <h2>Ask Wisp to create a routine</h2>
  <p>
    Try “Every two levels, review my spells and rotation” or “When I change
    weapons, review my equipment.” Routines run while the character is
    connected, outside combat. Each run has its own conversation.
  </p>
</section>
{#each app.status?.routines || [] as routine (routine.characterKey + routine.id)}
  <section class="card">
    <div class="section-title">
      <div>
        <h2>{routine.title}</h2>
        <p>
          {routine.enabled ? "Active" : "Paused"} · {app.characterLabel(
            routine.characterKey,
          )}
        </p>
      </div>
      <div class="actions">
        <button
          disabled={!!app.busy}
          onclick={() =>
            app.work("Updating routine", () =>
              request("/routines/action", {
                characterKey: routine.characterKey,
                id: routine.id,
                operation: routine.enabled ? "pause" : "resume",
              }),
            )}>{routine.enabled ? "Pause" : "Resume"}</button
        >
        <button
          class="quiet danger"
          disabled={!!app.busy}
          onclick={() => {
            app.confirm = {
              label: "Delete “" + routine.title + "”?",
              run: async () => {
                await request("/routines/action", {
                  characterKey: routine.characterKey,
                  id: routine.id,
                  operation: "remove",
                });
                await app.refresh();
              },
            };
          }}>Delete</button
        >
      </div>
    </div>
    <p>{routine.instruction}</p>
    <p class="muted">
      {routine.triggers.map(describeRoutineTrigger).join(" or ")}
    </p>
    <h3>History</h3>
    {#each (app.status?.routineRuns || [])
      .filter((r) => r.routineId === routine.id && r.characterKey === routine.characterKey)
      .reverse() as run (run.id)}
      <div class="section-title">
        <div>
          <p>
            {new Date(run.startedAt).toLocaleString()} · {run.status ===
            "no_tip"
              ? "No updates"
              : run.status}
          </p>
          {#if run.status === "error" || run.status === "interrupted"}<p
              class="muted"
            >
              {run.summary}
            </p>{/if}
        </div>
        {#if run.status !== "no_tip"}<button
            disabled={!!app.busy || !app.status?.gameConnected}
            onclick={() =>
              app.work(
                "Opening run",
                () => request("/routines/open", { id: run.id }),
                "Conversation selected in WoW. Open /wisp to continue.",
              )}>Open in game</button
          >{/if}
      </div>
    {:else}<p class="muted">No runs yet.</p>{/each}
  </section>
{/each}
