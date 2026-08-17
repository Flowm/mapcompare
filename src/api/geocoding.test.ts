import { describe, expect, it, vi } from "vitest";

import { searchPlaces } from "./geocoding";

const BERLIN = {
  id: 2950159,
  name: "Berlin",
  latitude: 52.52437,
  longitude: 13.41053,
  elevation: 74,
  feature_code: "PPLC",
  country_code: "DE",
  country: "Germany",
  admin1: "State of Berlin",
  timezone: "Europe/Berlin",
  population: 3426354,
};

function stub(body: unknown, init: { ok?: boolean; status?: number; nonJson?: boolean } = {}) {
  const { ok = true, status = 200, nonJson = false } = init;
  // Typed parameters so the recorded call arguments stay inspectable below.
  return vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok,
    status,
    statusText: "Test",
    json: nonJson
      ? () => {
          throw new SyntaxError("Unexpected token < in JSON");
        }
      : async () => body,
  }));
}

function search(fetchImpl: ReturnType<typeof stub>, query = "Berlin") {
  return searchPlaces(query, { fetchImpl: fetchImpl as unknown as typeof globalThis.fetch });
}

describe("searchPlaces", () => {
  it("keeps only the fields that identify a place or place the camera", async () => {
    const places = await search(stub({ results: [BERLIN] }));
    expect(places).toEqual([
      { id: 2950159, name: "Berlin", lat: 52.52437, lon: 13.41053, featureCode: "PPLC", countryCode: "DE", country: "Germany", admin1: "State of Berlin", population: 3426354 },
    ]);
  });

  it("survives a miss, which omits `results` entirely rather than sending an empty array", async () => {
    // The single most likely way to crash against this API: `json.results.length` on a no-match.
    expect(await search(stub({ generationtime_ms: 0.44 }))).toEqual([]);
  });

  it("tolerates the optional fields being absent, since empty fields are not returned", async () => {
    const bare = { id: 1, name: "Be", latitude: 1, longitude: 2, feature_code: "PPL", country_code: "NG" };
    const [place] = await search(stub({ results: [bare] }));
    expect(place).toMatchObject({ name: "Be", country: undefined, admin1: undefined, population: undefined });
  });

  it("reports the reason from the body, which is where this API puts it", async () => {
    await expect(search(stub({ error: true, reason: "Parameter count must be between 1 and 100." }, { ok: false, status: 400 }))).rejects.toThrow(
      "Parameter count must be between 1 and 100.",
    );
  });

  it("reports an error body even when the status says otherwise", async () => {
    await expect(search(stub({ error: true, reason: "Not Found" }))).rejects.toThrow("Not Found");
  });

  it("falls back to the status when the body is not JSON at all", async () => {
    await expect(search(stub(undefined, { ok: false, status: 502, nonJson: true }))).rejects.toThrow("502");
  });

  it("asks for the query, a bounded count, and json", async () => {
    const fetchImpl = stub({ results: [] });
    await search(fetchImpl, "Springfield");

    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search");
    expect(url.searchParams.get("name")).toBe("Springfield");
    expect(url.searchParams.get("count")).toBe("8");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("sends no request headers, because a preflight to this endpoint 404s without CORS", async () => {
    // Guard, not a style point: one `Accept` header takes place search down in the browser
    // entirely, and it would pass every test that did not check for this.
    const fetchImpl = stub({ results: [] });
    await search(fetchImpl);
    expect(fetchImpl.mock.calls[0]![1] ?? {}).not.toHaveProperty("headers");
  });

  it("passes the abort signal through", async () => {
    const fetchImpl = stub({ results: [] });
    const controller = new AbortController();
    await searchPlaces("Berlin", { signal: controller.signal, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch });
    expect(fetchImpl.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });
});
