import { type Ref, shallowRef, watch } from "vue";

import { loadTimeDomain } from "@/api/discovery";
import { canDiscover } from "@/lib/layers/discovery";
import { declaredTimeDomain, type TimeDomain } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";

import { useClock } from "./useClock";

/**
 * Which Times a Layer has, as one state every reader shares: the pane that renders it and the
 * controls that pick one. Declared domains resolve synchronously, so a vintage list never flashes
 * empty on a Layer switch; discovered ones go through `loading` once and then come from the cache.
 *
 * `layerId` is carried on every state so a reader can tell an answer about the Layer it is showing
 * from one about the Layer it just left.
 */
export type TimeDomainState =
  | { state: "static"; layerId: string | undefined }
  | { state: "loading"; layerId: string }
  | { state: "ready"; layerId: string; domain: TimeDomain }
  | { state: "error"; layerId: string; message: string };

export interface TimeDomainDeps {
  now: Ref<Date>;
  /** Asks a Layer's service which Times it has. Memoised in the default wiring, not here. */
  loadTimeDomain: (layer: Layer, now: Date) => Promise<TimeDomain | undefined>;
}

export function defaultTimeDomainDeps(): TimeDomainDeps {
  return { now: useClock().now, loadTimeDomain };
}

/**
 * Watches the Layer object itself, not anything derived from a pane: a pane's Time changing must
 * not re-ask the service, and only a Layer switch or the clock moving can change the answer.
 */
export function useTimeDomain(layer: Ref<Layer | undefined>, deps: TimeDomainDeps = defaultTimeDomainDeps()) {
  const domain = shallowRef<TimeDomainState>({ state: "static", layerId: undefined });
  let generation = 0;

  watch(
    [() => layer.value, deps.now],
    ([target, now]) => {
      const request = ++generation;
      if (!target?.time) {
        domain.value = { state: "static", layerId: target?.id };
        return;
      }
      if (!canDiscover(target)) {
        domain.value = { state: "ready", layerId: target.id, domain: declaredTimeDomain(target.time, now) };
        return;
      }
      domain.value = { state: "loading", layerId: target.id };
      deps
        .loadTimeDomain(target, now)
        .then((found) => {
          if (request !== generation) return;
          domain.value = found ? { state: "ready", layerId: target.id, domain: found } : { state: "static", layerId: target.id };
        })
        .catch((error: unknown) => {
          if (request !== generation) return;
          domain.value = { state: "error", layerId: target.id, message: error instanceof Error ? error.message : String(error) };
        });
    },
    { immediate: true },
  );

  return { domain };
}
