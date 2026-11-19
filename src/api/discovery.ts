import { canDiscover, discoverTimes } from "@/lib/layers/discovery";
import { declaredTimeDomain, discoveredTimeDomain, type TimeDomain } from "@/lib/layers/time";
import type { Layer } from "@/lib/layers/types";

/**
 * Asking services which Times they have.
 *
 * Declared rules computed from the clock turned out wrong in practice: PACE lags four days, GOES
 * keeps a rolling 90 days with missing slots, the satvis mosaic keeps five hours. So a Layer whose
 * kind can ask, asks, and falls back to its declared series only when the service cannot be
 * reached. See docs/adr/0003.
 *
 * Documents are cached per URL for the session, so every GIBS Layer shares one capabilities fetch
 * (about 207 KB gzipped), and a failed fetch is forgotten so it can be retried.
 */

const documents = new Map<string, Promise<string>>();
const domains = new Map<string, Promise<TimeDomain | undefined>>();

/** Shared with layer inspection, so adding a STAC Layer warms the cache its panes then read. */
export function fetchText(url: string): Promise<string> {
  const cached = documents.get(url);
  if (cached) return cached;
  const host = new URL(url).host;
  const pending = fetch(url).then(
    (res) => {
      if (!res.ok) throw new Error(`${[res.status, res.statusText].filter(Boolean).join(" ")} from ${host}`);
      return res.text();
    },
    // A rejected fetch says only "Failed to fetch" (Chrome) or "Load failed" (Safari), and the
    // browser will not tell which of the two usual causes it was, so name both.
    (error: unknown) => {
      throw new Error(`Could not reach ${host}. The host may be down, or it does not allow requests from other sites (CORS).`, { cause: error });
    },
  );
  pending.catch(() => documents.delete(url));
  documents.set(url, pending);
  return pending;
}

/** Test seam, and a way to force a refetch. */
export function clearDiscoveryCache(): void {
  documents.clear();
  domains.clear();
}

/**
 * Every Time a Layer can show right now, or undefined for a static Layer.
 *
 * Memoised per Layer and clock, so panes and the controls describing them share one parse of a
 * multi-megabyte document and agree on the answer.
 *
 * Throws only when nothing at all can be drawn: a STAC Layer has no declared fallback, because a
 * rule cannot say which file holds which hour.
 */
export function loadTimeDomain(layer: Layer, now: Date): Promise<TimeDomain | undefined> {
  const key = `${layer.id}@${now.getTime()}`;
  const cached = domains.get(key);
  if (cached) return cached;
  const pending = resolveDomain(layer, now);
  pending.catch(() => domains.delete(key));
  domains.set(key, pending);
  return pending;
}

async function resolveDomain(layer: Layer, now: Date): Promise<TimeDomain | undefined> {
  if (!layer.time) return undefined;
  if (!canDiscover(layer)) return declaredTimeDomain(layer.time, now);

  let failure: unknown;
  try {
    const domain = discoveredTimeDomain(await discoverTimes(layer, fetchText), layer.time.precision, now);
    if (domain) return domain;
  } catch (error) {
    failure = error;
  }
  if (layer.kind === "stac") {
    const reason = failure instanceof Error ? failure.message : "it lists no pictures";
    throw new Error(`Could not read the catalogue: ${reason}`);
  }
  return declaredTimeDomain(layer.time, now);
}
