<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { useViewport } from "@/composables/useViewport";
import { LAYERS } from "@/lib/layers/registry";
import type { ApiKeyName } from "@/lib/layers/types";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ focusKey?: ApiKeyName }>();

const { sources, overrides, setKey, clearKey } = useApiKeys();

const { isCompact } = useViewport();

/** One row per key, listing which layers it unlocks. */
const rows = computed(() => {
  const byKey = new Map<ApiKeyName, { name: ApiKeyName; layers: typeof LAYERS; keyUrl?: string; freeTier?: string }>();
  for (const layer of LAYERS) {
    const name = layer.requiresKey;
    if (!name) continue;
    const existing = byKey.get(name);
    if (existing) existing.layers = [...existing.layers, layer];
    else byKey.set(name, { name, layers: [layer], keyUrl: layer.keyUrl, freeTier: layer.freeTier });
  }
  return [...byKey.values()];
});

const drafts = ref<Partial<Record<ApiKeyName, string>>>({});
/** Nuxt UI's UInput exposes the native element as `inputRef`. */
const inputs = ref<Record<string, { inputRef?: HTMLInputElement } | undefined>>({});

watch(
  open,
  async (isOpen) => {
    if (!isOpen) return;
    drafts.value = { ...overrides.value };
    // Opened from a specific provider's "Add key" button: land on that field rather than making
    // the user hunt for it in the list. Two ticks: the modal mounts its content, then the fields.
    await nextTick();
    await nextTick();
    if (props.focusKey) inputs.value[props.focusKey]?.inputRef?.focus();
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
  <UModal v-model:open="open" title="API keys" :fullscreen="isCompact" :ui="{ content: 'sm:max-w-[38rem]' }">
    <template #body>
      <div class="space-y-4">
        <p class="text-ink-400 text-xs leading-relaxed">
          Every key is optional — the app ships over twenty keyless layers without them. Keys unlock the commercial providers so you can compare them too.
        </p>

        <div v-for="row in rows" :key="row.name" class="border-ink-700/70 rounded border p-3">
          <div class="flex items-baseline justify-between gap-2">
            <code class="text-ink-200 font-mono text-xs">{{ row.name }}</code>
            <span class="text-ink-400 shrink-0 text-[10px]">{{ row.freeTier }}</span>
          </div>

          <p class="text-ink-400 mt-1 text-[11px]">Unlocks {{ row.layers.map((p) => p.label).join(", ") }}</p>

          <div class="mt-2 flex items-center gap-1.5">
            <UInput
              :ref="(el) => (inputs[row.name] = (el as { inputRef?: HTMLInputElement } | null) ?? undefined)"
              v-model="drafts[row.name]"
              type="password"
              autocomplete="off"
              spellcheck="false"
              size="sm"
              :placeholder="sources[row.name] === 'build' ? 'Override the built-in key…' : 'Paste a key…'"
              class="min-w-0 flex-1"
              :ui="{ base: 'font-mono' }"
              @change="save(row.name)"
              @keydown.enter.prevent="save(row.name)"
            />
            <UButton size="sm" color="neutral" variant="outline" label="Save" @click="save(row.name)" />
            <UButton v-if="sources[row.name] === 'user'" size="sm" color="neutral" variant="ghost" label="Clear" @click="clear(row.name)" />
          </div>

          <p class="mt-1.5 text-[11px]" :class="sources[row.name] === 'none' ? 'text-ink-400' : 'text-success'">
            {{ SOURCE_TEXT[sources[row.name]] }}
          </p>

          <a v-if="row.keyUrl" :href="row.keyUrl" target="_blank" rel="noreferrer noopener" class="text-primary mt-1 inline-block text-[11px] hover:underline">Get a key ↗</a>
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
    </template>
  </UModal>
</template>
