import { useLocalStorage } from "@vueuse/core";
import { computed } from "vue";

import { API_KEYS } from "@/env";
import { type ApiKeys, hasKey } from "@/lib/providers/availability";
import { API_KEY_NAMES, type ApiKeyName } from "@/lib/providers/types";

/**
 * The seam that keeps `src/lib/**` pure: nothing under `lib/` imports `src/env.ts`, and resolved
 * keys are passed in as a parameter instead.
 *
 * Keys can come from two places, and a user-supplied one wins:
 *
 *   1. A `VITE_*` var compiled into the bundle at build time.
 *   2. A value the user pastes into Settings, stored in this browser only.
 *
 * User-first precedence is deliberate. It lets someone unlock a provider the deployed site ships
 * no key for, and equally lets them blank a built-in key so their browsing stops spending the
 * site's quota. Clearing an override falls back to the build-time value.
 */

/** Overrides live under one key so the whole set clears together. */
const overrides = useLocalStorage<Partial<Record<ApiKeyName, string>>>("mapcompare:keys", {});

export type KeySource = "user" | "build" | "none";

export function keySource(name: ApiKeyName, stored: Partial<Record<ApiKeyName, string>>): KeySource {
  if (hasKey(stored[name])) return "user";
  if (hasKey(API_KEYS[name])) return "build";
  return "none";
}

export function useApiKeys() {
  const keys = computed<ApiKeys>(() => {
    const resolved: ApiKeys = {};
    for (const name of API_KEY_NAMES) {
      const override = overrides.value[name]?.trim() ?? "";
      resolved[name] = override === "" ? API_KEYS[name] : override;
    }
    return resolved;
  });

  const sources = computed<Record<ApiKeyName, KeySource>>(() => {
    const out = {} as Record<ApiKeyName, KeySource>;
    for (const name of API_KEY_NAMES) out[name] = keySource(name, overrides.value);
    return out;
  });

  return {
    keys,
    sources,
    overrides,

    setKey(name: ApiKeyName, value: string) {
      const trimmed = value.trim();
      if (trimmed === "") {
        // An empty input means "no override", not "an empty key" — so it falls back to the build
        // value rather than disabling the provider.
        const { [name]: _removed, ...rest } = overrides.value;
        overrides.value = rest;
        return;
      }
      overrides.value = { ...overrides.value, [name]: trimmed };
    },

    clearKey(name: ApiKeyName) {
      const { [name]: _removed, ...rest } = overrides.value;
      overrides.value = rest;
    },
  };
}
