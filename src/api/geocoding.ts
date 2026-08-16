import type { Place } from "@/lib/destination";

/**
 * Place search, served by Open-Meteo's geocoding endpoint over GeoNames data.
 *
 * Four things about this API decide the shape of everything below, and all four are the kind of
 * detail that produces a confident crash rather than an error message:
 *
 *   - **`results` is absent, not empty, when nothing matches.** A miss returns
 *     `{"generationtime_ms":0.44}` and nothing else, so `json.results.length` throws on the most
 *     ordinary outcome there is.
 *   - **Errors come back as `{error: true, reason}`**, and not always with a matching status, so
 *     the body is what gets checked rather than `res.ok` alone.
 *   - **Under three characters there is nothing to find.** One character returns no results at
 *     all and two match only exact names, so `Be` finds places literally called "Be". The floor is
 *     the API's, not a guess.
 *   - **No custom request headers, ever.** A plain GET is a CORS simple request and is allowed;
 *     adding any header triggers a preflight, and `OPTIONS` on this endpoint answers 404 with no
 *     CORS headers at all. One helpful `Accept` header breaks place search completely.
 *
 * There is no reverse geocoding to pair with it (`/v1/reverse` is a 404), which is why a pasted
 * coordinate can never acquire a name.
 */

const ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

/** Below this the API has nothing useful to say, so the request is not worth making. */
export const GEOCODING_MIN_QUERY = 3;

/** Enough to separate the Springfields. Past this the list is only more Springfields. */
export const GEOCODING_RESULT_COUNT = 8;

/** The wire shape. Only the eight always-present fields are non-optional: "empty fields are not returned". */
interface WirePlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  feature_code: string;
  country_code: string;
  country?: string;
  admin1?: string;
  population?: number;
}

interface WireResponse {
  results?: WirePlace[];
  error?: boolean;
  reason?: string;
}

function toPlace(wire: WirePlace): Place {
  return {
    id: wire.id,
    name: wire.name,
    lat: wire.latitude,
    lon: wire.longitude,
    featureCode: wire.feature_code,
    countryCode: wire.country_code,
    country: wire.country,
    admin1: wire.admin1,
    population: wire.population,
  };
}

export interface SearchPlacesOptions {
  signal?: AbortSignal;
  count?: number;
  /** Test seam. Production passes nothing and gets the global. */
  fetchImpl?: typeof globalThis.fetch;
}

export async function searchPlaces(query: string, options: SearchPlacesOptions = {}): Promise<Place[]> {
  const { signal, count = GEOCODING_RESULT_COUNT, fetchImpl = globalThis.fetch } = options;

  const url = new URL(ENDPOINT);
  url.searchParams.set("name", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  // No headers. See the note above: one would take the whole feature down in the browser.
  const res = await fetchImpl(url.toString(), { signal });

  // The reason lives in the body, so it is read before the status is judged. A gateway failure is
  // not JSON at all, and then the status is the only thing left to report.
  let body: WireResponse | undefined;
  try {
    body = (await res.json()) as WireResponse;
  } catch {
    body = undefined;
  }

  if (body?.error === true) throw new Error(body.reason ?? "Place search failed");
  if (!res.ok || body === undefined) throw new Error(`Place search failed: ${res.status} ${res.statusText}`);

  return (body.results ?? []).map(toPlace);
}
