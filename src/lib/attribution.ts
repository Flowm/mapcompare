/**
 * Collecting, de-duplicating and sanitizing the on-map credit.
 *
 * MapLibre's own AttributionControl is switched off for every pane. The forcing reason is swipe
 * mode: the control renders inside the map container, so the top pane's `clip-path` would clip its
 * credit away — a licensing problem, not a cosmetic one.
 *
 * Sanitizing is not optional. For style-URL providers these strings arrive from a fetched
 * third-party style.json, and they are rendered with `v-html` so their links stay clickable.
 */

/**
 * Loose on purpose so a real `StyleSpecification` is assignable: its source union includes kinds
 * like video that carry no `attribution` at all, which a stricter shape would reject.
 */
export interface StyleLike {
  sources?: Record<string, unknown>;
}

/**
 * What one pane must credit: the strings its providers declare, plus whatever the applied style
 * declares on top.
 *
 * The union is the whole point, and it is not belt-and-braces. Reading the style alone is not
 * enough, because a source may name a TileJSON `url` instead of inlining `attribution` — MapLibre
 * fetches that document into its own source cache, where nothing here can see it. Both MapTiler's
 * satellite style and OpenFreeMap Liberty are built that way, so a style-only credit rendered those
 * panes with NO attribution whatsoever.
 *
 * Reading the declared strings alone is not enough either: a fetched vendor style can name sources
 * we know nothing about, and the label overlay adds its own.
 *
 * `declared` comes first so that where the two say the same thing, the registry's wording — the one
 * checked against the vendor's terms — is what survives dedup.
 */
export function creditParts(declared: readonly string[], style: StyleLike | undefined): string[] {
  return dedupeAttribution([...declared, ...(style ? collectAttribution(style) : [])]);
}

/** Every distinct attribution string across a style's sources, in source order. */
export function collectAttribution(style: StyleLike): string[] {
  const parts: string[] = [];
  for (const source of Object.values(style.sources ?? {})) {
    if (typeof source !== "object" || source === null || !("attribution" in source)) continue;
    const attribution = (source as { attribution?: unknown }).attribution;
    if (typeof attribution === "string" && attribution.trim() !== "") parts.push(attribution.trim());
  }
  return parts;
}

/**
 * Collapses duplicates.
 *
 * Every raster pane hits this: the descriptor's credit and the credit inlined into the style
 * `buildRasterStyle` produces come from the same string, so `creditParts` sees it twice.
 * Comparison is done on normalised text so "© OpenStreetMap contributors" and
 * "©  OpenStreetMap  contributors" count as one, while the original markup is what gets returned.
 */
export function dedupeAttribution(parts: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = normalise(part);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function normalise(html: string): string {
  return html.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

/** Elements that may survive sanitizing. Everything else is unwrapped to its text. */
const ALLOWED_TAGS = new Set(["A", "B", "STRONG", "EM", "I", "SPAN"]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(["href", "target", "rel", "title"]),
  SPAN: new Set(["title"]),
  B: new Set(["title"]),
  STRONG: new Set(["title"]),
  EM: new Set(["title"]),
  I: new Set(["title"]),
};

/**
 * Allowlist sanitizer for attribution HTML.
 *
 * Deliberately an allowlist rather than a blocklist: the input is third-party and only ever needs
 * links and light emphasis, so anything unrecognised is reduced to its text rather than reasoned
 * about. Disallowed elements are unwrapped instead of deleted, so no credit text is ever lost —
 * losing it silently would be the licensing failure this whole module exists to prevent.
 */
export function sanitizeAttributionHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.querySelector("#root");
  if (!root) return "";
  sanitizeChildren(root, doc);
  return root.innerHTML;
}

function sanitizeChildren(parent: Element, doc: Document): void {
  // Snapshotted deliberately: `children` is a LIVE collection, and unwrapping a child mutates it
  // mid-iteration, which silently skips siblings.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const child of [...parent.children]) {
    sanitizeChildren(child, doc);

    if (!ALLOWED_TAGS.has(child.tagName)) {
      unwrap(child, doc);
      continue;
    }

    // Same reason: `attributes` is live, and removeAttribute mutates it.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const attr of [...child.attributes]) {
      const allowed = ALLOWED_ATTRS[child.tagName];
      if (!allowed?.has(attr.name.toLowerCase())) {
        child.removeAttribute(attr.name);
        continue;
      }
      if (attr.name.toLowerCase() === "href" && !isSafeHref(attr.value)) child.removeAttribute(attr.name);
    }

    // Any surviving link opens in a new tab without handing over window.opener.
    if (child.tagName === "A") {
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noreferrer noopener");
    }
  }
}

function unwrap(element: Element, doc: Document): void {
  const fragment = doc.createDocumentFragment();
  while (element.firstChild) fragment.append(element.firstChild);
  element.replaceWith(fragment);
}

function isSafeHref(value: string): boolean {
  // Whitespace and control characters are stripped before matching, because browsers ignore them
  // inside a scheme: "java\tscript:alert(1)", or the same with a newline, both defeat a naive
  // startsWith check. Written as explicit escapes rather than literal bytes so they stay visible.
  // oxlint-disable-next-line no-control-regex -- matching control characters IS the check here
  const cleaned = value.replaceAll(/[\s\u0000-\u001F]/g, "").toLowerCase();
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return true;
  // Relative and fragment hrefs cannot carry a scheme, so they are safe by construction.
  return cleaned.startsWith("/") || cleaned.startsWith("#");
}
