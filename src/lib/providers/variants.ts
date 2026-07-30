import { clampDate, parseUtcDate, yesterdayUTC } from "../dates";
import type { Provider, VariantSpec, VariantValue } from "./types";

/**
 * Resolution of the `VariantSpec` families (EOX vintages, Wayback snapshots, GIBS dates).
 *
 * The clock is always a parameter, never `Date.now()`, so date resolution is deterministic
 * under test. Everything here is pure.
 */

/** The choices to offer in the picker. Date variants are open-ended, so they have none. */
export function variantValues(spec: VariantSpec): readonly VariantValue[] {
  return spec.values ?? [];
}

/** The concrete value to use when a URL or a fresh selection names none. */
export function defaultVariant(spec: VariantSpec, now: Date): string {
  if (spec.default !== "latest") return spec.default;
  if (spec.kind === "date") return yesterdayUTC(now);
  // For fixed lists, "latest" means the last entry — the registry keeps them in
  // chronological order, oldest first.
  return spec.values?.at(-1)?.value ?? "";
}

export function isValidVariant(spec: VariantSpec, value: string, now: Date): boolean {
  if (spec.kind === "date") {
    const parsed = parseUtcDate(value);
    if (!parsed) return false;
    return value >= (spec.earliest ?? "1900-01-01") && value <= yesterdayUTC(now);
  }
  return (spec.values ?? []).some((v) => v.value === value);
}

/**
 * Turns a requested variant into one that is definitely usable.
 *
 * Out-of-window dates are clamped rather than rejected, so an old shared link still shows
 * something adjacent to what its author saw instead of falling back to today. Unknown fixed
 * values fall back to the default, because there is nothing sensible to clamp them to.
 */
export function resolveVariant(spec: VariantSpec, requested: string | undefined, now: Date): string {
  if (requested === undefined || requested === "") return defaultVariant(spec, now);
  if (isValidVariant(spec, requested, now)) return requested;
  if (spec.kind === "date") return clampDate(requested, spec.earliest ?? "1900-01-01", yesterdayUTC(now));
  return defaultVariant(spec, now);
}

/** The human label for a resolved variant. Dates are their own label. */
export function variantLabel(spec: VariantSpec, value: string): string {
  return spec.values?.find((v) => v.value === value)?.label ?? value;
}

/**
 * What the vintage chip shows for a pane: the resolved variant's label where the provider
 * has one, otherwise the provider's static vintage.
 */
export function vintageFor(provider: Provider, variant: string | undefined): string | undefined {
  if (provider.variant && variant !== undefined) return variantLabel(provider.variant, variant);
  return provider.vintage;
}
