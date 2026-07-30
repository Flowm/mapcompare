<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { PROVIDERS } from "@/lib/providers/registry";
import type { ApiKeyName } from "@/lib/providers/types";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ focusKey?: ApiKeyName }>();

const { sources, overrides, setKey, clearKey } = useApiKeys();

const dialog = ref<HTMLDialogElement>();

/** One row per key, listing which providers it unlocks. */
const rows = computed(() => {
  const byKey = new Map<ApiKeyName, { name: ApiKeyName; providers: typeof PROVIDERS; keyUrl?: string; freeTier?: string }>();
  for (const provider of PROVIDERS) {
    const name = provider.requiresKey;
    if (!name) continue;
    const existing = byKey.get(name);
    if (existing) existing.providers = [...existing.providers, provider];
    else byKey.set(name, { name, providers: [provider], keyUrl: provider.keyUrl, freeTier: provider.freeTier });
  }
  return [...byKey.values()];
});

const drafts = ref<Partial<Record<ApiKeyName, string>>>({});
const inputs = ref<Record<string, HTMLInputElement | undefined>>({});

watch(
  open,
  async (isOpen) => {
    if (!isOpen) {
      dialog.value?.close();
      return;
    }
    drafts.value = { ...overrides.value };
    dialog.value?.showModal();
    // Opened from a specific provider's "Add key" button: land on that field rather than making
    // the user hunt for it in the list.
    await nextTick();
    if (props.focusKey) inputs.value[props.focusKey]?.focus();
  },
  { immediate: true },
);

function save(name: ApiKeyName) {
  setKey(name, drafts.value[name] ?? "");
}

function clear(name: ApiKeyName) {
  drafts.value = { ...drafts.value, [name]: "" };
  clearKey(name);
}

const SOURCE_TEXT = {
  user: "Using your key, stored in this browser only.",
  build: "Using the key this site was built with. Paste your own to override it.",
  none: "Not set — these layers are unavailable.",
} as const;
</script>

<template>
  <dialog
    ref="dialog"
    class="border-ink-700 bg-ink-900 text-ink-50 backdrop:bg-ink-950/70 m-auto max-h-[85vh] w-[min(38rem,92vw)] overflow-y-auto rounded-lg border p-0 backdrop:backdrop-blur-sm"
    @close="open = false"
    @cancel="open = false"
  >
    <div class="border-ink-700 bg-ink-900 sticky top-0 flex items-center justify-between border-b px-4 py-3">
      <h2 class="text-sm font-semibold">API keys</h2>
      <button type="button" class="text-ink-400 hover:bg-ink-800 hover:text-ink-50 rounded px-2 py-1 text-xs" @click="open = false">Close</button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <p class="text-ink-400 text-xs leading-relaxed">
        Every key is optional — the app ships over twenty keyless layers without them. Keys unlock the commercial providers so you can compare them too.
      </p>

      <div v-for="row in rows" :key="row.name" class="border-ink-700/70 rounded border p-3">
        <div class="flex items-baseline justify-between gap-2">
          <code class="text-ink-200 font-mono text-xs">{{ row.name }}</code>
          <span class="text-ink-400 shrink-0 text-[10px]">{{ row.freeTier }}</span>
        </div>

        <p class="text-ink-400 mt-1 text-[11px]">Unlocks {{ row.providers.map((p) => p.label).join(", ") }}</p>

        <div class="mt-2 flex items-center gap-1.5">
          <input
            :ref="(el) => (inputs[row.name] = (el as HTMLInputElement | null) ?? undefined)"
            v-model="drafts[row.name]"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :placeholder="sources[row.name] === 'build' ? 'Override the built-in key…' : 'Paste a key…'"
            class="border-ink-600 bg-ink-950 text-ink-50 focus:border-accent min-w-0 flex-1 rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
            @change="save(row.name)"
            @keydown.enter.prevent="save(row.name)"
          />
          <button type="button" class="border-ink-600 text-ink-200 hover:bg-ink-800 rounded border px-2 py-1.5 text-xs" @click="save(row.name)">Save</button>
          <button
            v-if="sources[row.name] === 'user'"
            type="button"
            class="border-ink-600 text-ink-400 hover:bg-ink-800 rounded border px-2 py-1.5 text-xs"
            @click="clear(row.name)"
          >
            Clear
          </button>
        </div>

        <p class="mt-1.5 text-[11px]" :class="sources[row.name] === 'none' ? 'text-ink-400' : 'text-tier-open'">
          {{ SOURCE_TEXT[sources[row.name]] }}
        </p>

        <a v-if="row.keyUrl" :href="row.keyUrl" target="_blank" rel="noreferrer noopener" class="text-accent mt-1 inline-block text-[11px] hover:underline">Get a key ↗</a>
      </div>

      <!-- Stated plainly rather than buried: a browser-side map key is never actually secret, and
           telling users otherwise would be the dishonest part. -->
      <div class="border-ink-700/70 bg-ink-950/50 text-ink-400 rounded border p-3 text-[11px] leading-relaxed">
        <p class="text-ink-200 font-medium">About key safety</p>
        <p class="mt-1">
          Keys you paste here stay in this browser, on this device, and are sent only to the provider whose tiles you load. Note that <em>any</em> browser-side map key is visible
          to anyone who opens the network tab, including keys a site was built with. That is unavoidable for client-side maps; the real protection is an HTTP-referrer restriction
          in your provider's dashboard, which you should set.
        </p>
        <p class="mt-1">Shared links never carry keys.</p>
      </div>
    </div>
  </dialog>
</template>
