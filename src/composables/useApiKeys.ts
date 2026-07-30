import { computed } from "vue";

import { API_KEYS } from "@/env";
import type { ApiKeys } from "@/lib/providers/availability";

/**
 * The seam that keeps `src/lib/**` pure.
 *
 * Nothing under `lib/` may import `src/env.ts`; instead the resolved keys are passed in as a
 * parameter. This composable is the only place the two meet.
 *
 * A user-supplied localStorage override layer is added on top of this in a later commit.
 */
export function useApiKeys() {
  const keys = computed<ApiKeys>(() => ({ ...API_KEYS }));
  return { keys };
}
