import { ref, shallowRef } from "vue";

import { inspect as inspectFromNetwork } from "@/api/addedLayers";
import type { Candidate, Inspection } from "@/lib/layers/addedInspect";

/**
 * One inspection of a URL at a time, as the add dialog shows it: whether one is running, what it
 * found, and why it failed. The seam between the dialog and `api/`, which components never reach
 * directly.
 */
export function useLayerInspection(inspect: (url: string) => Promise<Inspection> = inspectFromNetwork) {
  const inspecting = ref(false);
  const error = ref<string>();
  const candidates = shallowRef<Candidate[]>([]);
  /** The source had more than one inspection reads; only the first collections are offered. */
  const partial = ref(false);

  /** Increments on every run and reset, so a slow answer about a URL the user has moved on from is dropped. */
  let generation = 0;

  function reset() {
    generation += 1;
    inspecting.value = false;
    error.value = undefined;
    candidates.value = [];
    partial.value = false;
  }

  async function run(url: string) {
    if (url.trim() === "") return;
    reset();
    const request = generation;
    inspecting.value = true;
    try {
      const found = await inspect(url);
      if (request !== generation) return;
      candidates.value = found.candidates;
      partial.value = found.partial;
    } catch (e) {
      if (request !== generation) return;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (request === generation) inspecting.value = false;
    }
  }

  return { inspecting, error, candidates, partial, run, reset };
}
