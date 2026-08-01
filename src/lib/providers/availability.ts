import type { ApiKeyName, Provider } from "./types";

/**
 * Whether a provider can currently be used, and if not, why — in words the UI shows.
 *
 * Pure: keys arrive as a parameter. `src/lib/**` never imports `src/env.ts`; the composable
 * `useApiKeys` is the seam that merges build-time env values with the user's localStorage
 * overrides and passes the result in here.
 */

export type ApiKeys = Partial<Record<ApiKeyName, string | undefined>>;

/** `VITE_X=` with nothing after it yields "", not undefined, so blank must count as unset. */
export function hasKey(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ProviderStatus {
  provider: Provider;
  enabled: boolean;
  /** Present iff `!enabled`. `message` is rendered visibly, not only as a tooltip. */
  disabled?: {
    code: "missing-key";
    key: ApiKeyName;
    keyUrl?: string;
    freeTier?: string;
    message: string;
  };
}

export function providerStatus(provider: Provider, keys: ApiKeys): ProviderStatus {
  const required = provider.requiresKey;
  if (required && !hasKey(keys[required])) {
    return {
      provider,
      enabled: false,
      disabled: {
        code: "missing-key",
        key: required,
        keyUrl: provider.keyUrl,
        freeTier: provider.freeTier,
        message: `Needs ${required} — set it in .env.development or paste a key in Settings.`,
      },
    };
  }
  return { provider, enabled: true };
}

export function providerStatuses(providers: readonly Provider[], keys: ApiKeys): ProviderStatus[] {
  return providers.map((p) => providerStatus(p, keys));
}

/**
 * Groups providers by operator for the picker, preserving registry order within each group
 * and ordering the groups by first appearance. Enabled and disabled entries stay
 * interleaved in registry order on purpose: hiding or sinking unavailable providers would
 * destroy the discovery value, which is most of what this app is for.
 */
export function groupByOperator(statuses: readonly ProviderStatus[]): { operator: string; entries: ProviderStatus[] }[] {
  const groups = new Map<string, ProviderStatus[]>();
  for (const status of statuses) {
    const existing = groups.get(status.provider.operator);
    if (existing) existing.push(status);
    else groups.set(status.provider.operator, [status]);
  }
  return [...groups].map(([operator, entries]) => ({ operator, entries }));
}
