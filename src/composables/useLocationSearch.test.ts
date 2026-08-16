import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import type { Place } from "@/lib/destination";

import { type LocationSearchDeps, useLocationSearch } from "./useLocationSearch";

function place(name: string, id = 1): Place {
  return { id, name, lat: 48.1, lon: 11.5, featureCode: "PPL", countryCode: "DE", population: 100_000 };
}

/** Long enough for a 5 ms debounce to have fired and its promise chain to have run out. */
async function settle() {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 25));
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

function harness(overrides: Partial<LocationSearchDeps> = {}) {
  const search = vi.fn(async () => [place("Berlin")]);
  const deps: LocationSearchDeps = { search, debounceMs: 5, ...overrides };
  return { search, ...useLocationSearch(deps) };
}

describe("what the panel shows", () => {
  it("starts on the curated list", () => {
    expect(harness().outcome.value).toEqual({ kind: "presets" });
  });

  it("returns to it when the query is cleared", async () => {
    const h = harness();
    h.query.value = "Berlin";
    await settle();
    h.query.value = "";
    await nextTick();
    expect(h.outcome.value).toEqual({ kind: "presets" });
  });

  it("says nothing useful can happen below three characters", async () => {
    const h = harness();
    h.query.value = "Be";
    await settle();
    expect(h.outcome.value).toEqual({ kind: "too-short" });
    // The API returns nothing at one character and exact names only at two, so this is not a guess.
    expect(h.search).not.toHaveBeenCalled();
  });

  it("searches once the query is long enough", async () => {
    const h = harness();
    h.query.value = "Berlin";
    await nextTick();
    expect(h.outcome.value).toEqual({ kind: "loading" });

    await settle();
    expect(h.search).toHaveBeenCalledWith("Berlin", expect.objectContaining({ signal: expect.anything() }));
    expect(h.outcome.value).toMatchObject({ kind: "places" });
  });

  it("distinguishes an empty answer from a failed one", async () => {
    const empty = harness({ search: vi.fn(async () => []) });
    empty.query.value = "Zzzqqx";
    await settle();
    expect(empty.outcome.value).toEqual({ kind: "no-matches", query: "Zzzqqx" });

    const broken = harness({ search: vi.fn(() => Promise.reject(new Error("Daily API request limit exceeded"))) });
    broken.query.value = "Berlin";
    await settle();
    expect(broken.outcome.value).toEqual({ kind: "error", message: "Daily API request limit exceeded" });
  });
});

describe("coordinates never touch the network", () => {
  it("answers a pasted coordinate synchronously", async () => {
    const h = harness();
    h.query.value = "48.173508, 11.532206";
    await settle();
    expect(h.outcome.value).toMatchObject({ kind: "coordinate", coordinate: { lat: 48.173508, lon: 11.532206 } });
    expect(h.search).not.toHaveBeenCalled();
  });

  it("answers a broken coordinate too, rather than searching for it", async () => {
    const h = harness();
    h.query.value = "32N 691650 5334754";
    await settle();
    expect(h.outcome.value).toMatchObject({ kind: "invalid-coordinate" });
    expect(h.search).not.toHaveBeenCalled();
  });

  it("still searches for something merely numeric, since postal codes are queries", async () => {
    const h = harness();
    h.query.value = "80331";
    await settle();
    expect(h.search).toHaveBeenCalledWith("80331", expect.anything());
  });
});

describe("staleness", () => {
  it("ignores a response that arrives after a newer search has started", async () => {
    const gates: ((places: Place[]) => void)[] = [];
    const h = harness({ search: () => new Promise<Place[]>((resolve) => gates.push(resolve)) });

    h.query.value = "Berlin";
    await settle();
    h.query.value = "Munich";
    await settle();
    expect(gates).toHaveLength(2);

    // The first request comes back last, carrying the wrong answer for what is now in the box.
    gates[0]!([place("Berlin", 1)]);
    await settle();
    expect(h.outcome.value).toEqual({ kind: "loading" });

    gates[1]!([place("Munich", 2)]);
    await settle();
    expect(h.outcome.value).toMatchObject({ kind: "places", places: [{ name: "Munich" }] });
  });

  it("drops a scheduled search when the query falls back below the threshold", async () => {
    // Deleting `Berl` back to `Be` leaves a debounced call for a query that no longer exists.
    const h = harness();
    h.query.value = "Berl";
    await nextTick();
    h.query.value = "Be";
    await settle();

    expect(h.search).not.toHaveBeenCalled();
    expect(h.outcome.value).toEqual({ kind: "too-short" });
  });

  it("aborts a request in flight when the query changes", async () => {
    const signals: AbortSignal[] = [];
    const h = harness({
      search: (_query, { signal }) => {
        signals.push(signal);
        return new Promise<Place[]>(() => {});
      },
    });

    h.query.value = "Berlin";
    await settle();
    h.query.value = "Munich";
    await settle();

    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });
});

describe("reset", () => {
  it("clears the box and ignores whatever was still in flight", async () => {
    const gates: ((places: Place[]) => void)[] = [];
    const h = harness({ search: () => new Promise<Place[]>((resolve) => gates.push(resolve)) });

    h.query.value = "Berlin";
    await settle();
    h.reset();

    expect(h.query.value).toBe("");
    expect(h.outcome.value).toEqual({ kind: "presets" });

    gates[0]!([place("Berlin")]);
    await settle();
    expect(h.outcome.value).toEqual({ kind: "presets" });
  });
});
