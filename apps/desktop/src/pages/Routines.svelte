<script lang="ts">
  import DataState from "../DataState.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import type { DesktopController } from "../desktop-controller.svelte";
  import { request } from "../api";
  import { describeRoutineTrigger } from "@wisp/protocol/routines";
  let { app }: { app: DesktopController } = $props();
</script>

{#if app.loading || !app.status}<DataState {app} />{:else}
  <section class="card">
    <h2>
      {app.status.routines.length
        ? "Create another routine in game"
        : "No routines yet"}
    </h2>
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
          <ActionProgress {app} target={routine.characterKey + routine.id} />
          <button
            disabled={!!app.busy}
            onclick={() =>
              app.work(
                "Updating routine",
                () =>
                  request("/routines/action", {
                    characterKey: routine.characterKey,
                    id: routine.id,
                    operation: routine.enabled ? "pause" : "resume",
                  }),
                "Routine updated.",
                routine.characterKey + routine.id,
              )}>{routine.enabled ? "Pause" : "Resume"}</button
          >
          <button
            class="quiet danger"
            disabled={!!app.busy}
            onclick={() => {
              app.confirm = {
                label: "Delete “" + routine.title + "”?",
                run: () =>
                  app.work(
                    "Deleting routine",
                    () =>
                      request("/routines/action", {
                        characterKey: routine.characterKey,
                        id: routine.id,
                        operation: "remove",
                      }),
                    "Routine deleted.",
                    routine.characterKey + routine.id,
                  ),
              };
            }}>Delete</button
          >
        </div>
      </div>
      <p>{routine.instruction}</p>
      <p class="muted">
        {routine.triggers.map(describeRoutineTrigger).join(" or ")}
      </p>
      <details class="routine-history">
        <summary
          >Run history ({(app.status?.routineRuns || []).filter(
            (r) =>
              r.routineId === routine.id &&
              r.characterKey === routine.characterKey,
          ).length})</summary
        >
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
                    routine.characterKey + routine.id,
                  )}>Open in game</button
              >{/if}
          </div>
        {:else}<p class="muted">No runs yet.</p>{/each}
      </details>
    </section>
  {/each}
{/if}
