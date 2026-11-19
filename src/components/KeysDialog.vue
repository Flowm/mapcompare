<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables/useToast";
import { computed, ref, watch } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { useViewport } from "@/composables/useViewport";
import { providerLabel } from "@/lib/layers/availability";
import { LAYERS } from "@/lib/layers/registry";
import type { ApiKeyName } from "@/lib/layers/types";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ focusKey?: ApiKeyName }>();

const { sources, overrides, setKey, clearKey } = useApiKeys();

const { isCompact } = useViewport();
const toast = useToast();

/**
 * One row per key, listing which layers it unlocks. Headed by who issues the key, which is what a
 * reader looks for; the env var name is for whoever builds the site.
 */
const rows = computed(() => {
  const byKey = new Map<ApiKeyName, { name: ApiKeyName; provider: string; layers: typeof LAYERS; keyUrl?: string; freeTier?: string }>();
  for (const layer of LAYERS) {
    const name = layer.requiresKey;
    if (!name) continue;
    const existing = byKey.get(name);
    if (existing) existing.layers = [...existing.layers, layer];
    else byKey.set(name, { name, provider: providerLabel(layer), layers: [layer], keyUrl: layer.keyUrl, freeTier: layer.freeTier });
  }
  return [...byKey.values()];
});

/** Counted, so the sentence stays true as layers are added. */
const keylessCount = LAYERS.filter((l) => !l.requiresKey).length;
const setCount = computed(() => rows.value.filter((row) => sources.value[row.name] !== "none").length);

const drafts = ref<Partial<Record<ApiKeyName, string>>>({});
/** Keys shown in clear, to check a paste. Never persisted. */
const revealed = ref(new Set<ApiKeyName>());

function toggleReveal(name: ApiKeyName) {
  const next = new Set(revealed.value);
  if (!next.delete(name)) next.add(name);
  revealed.value = next;
}

/** Whether the field differs from what is stored, so Save is only offered when it would do something. */
function isDirty(name: ApiKeyName): boolean {
  return (drafts.value[name] ?? "").trim() !== (overrides.value[name] ?? "").trim();
}

/**
 * Each key's input is found by id, not by a component ref. A ref on a Nuxt UI component is only
 * typed through the generated components.d.ts, which a fresh checkout (CI) does not have. The
 * field's label follows the id, so this is also what links the two.
 */
const inputId = (name: ApiKeyName) => `api-key-${name}`;

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    drafts.value = { ...overrides.value };
    revealed.value = new Set();
  },
  { immediate: true },
);

/**
 * Opened from a specific provider's "Add key" button: land on that field rather than making the
 * user hunt for it in the list. Done in the dialog's own opening-focus hook, which runs once the
 * content is mounted, so the dialog does not move focus to its close button afterwards.
 */
function focusRequestedKey(event: Event) {
  const field = props.focusKey ? document.getElementById(inputId(props.focusKey)) : null;
  if (!field) return;
  event.preventDefault();
  field.focus();
}

function providerOf(name: ApiKeyName): string {
  return rows.value.find((row) => row.name === name)?.provider ?? name;
}

/** Runs on Enter, on the button and when the field loses focus, so only a change says anything. */
function save(name: ApiKeyName) {
  if (!isDirty(name)) return;
  const value = drafts.value[name] ?? "";
  setKey(name, value);
  toast.add({ title: value.trim() === "" ? `${providerOf(name)} key removed` : `${providerOf(name)} key saved`, description: "In this browser only.", icon: "i-lucide-key-round" });
}

function clear(name: ApiKeyName) {
  drafts.value = { ...drafts.value, [name]: "" };
  clearKey(name);
  toast.add({ title: `${providerOf(name)} key removed`, icon: "i-lucide-key-round" });
}

const SOURCE_TEXT = {
  user: "Using your key, stored in this browser only.",
  build: "Using the key this site was built with. Paste your own to override it.",
  none: "Not set — these layers are unavailable.",
} as const;
</script>

<template>
  <UModal v-model:open="open" title="API keys" :fullscreen="isCompact" :ui="{ content: 'sm:max-w-[38rem]' }" :content="{ onOpenAutoFocus: focusRequestedKey }">
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-xs leading-relaxed">
          Every key is optional: {{ keylessCount }} layers work without one. Keys unlock the commercial providers so you can compare them too.
          <span class="text-toned">{{ setCount }} of {{ rows.length }} set.</span>
        </p>

        <div v-for="row in rows" :key="row.name" class="border-ink-700/70 rounded border p-3">
          <UFormField
            :hint="row.freeTier"
            :description="`Unlocks ${row.layers.map((p) => p.label).join(', ')}`"
            size="sm"
            :ui="{ description: 'text-[11px]', hint: 'text-[10px]' }"
          >
            <template #label>
              <span class="text-highlighted text-sm font-medium">{{ row.provider }}</span>
              <code class="text-dimmed ml-2 font-mono text-[10px]">{{ row.name }}</code>
            </template>

            <div class="flex items-center gap-1.5">
              <UInput
                :id="inputId(row.name)"
                v-model="drafts[row.name]"
                :type="revealed.has(row.name) ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                :placeholder="sources[row.name] === 'build' ? 'Override the built-in key…' : 'Paste a key…'"
                class="min-w-0 flex-1"
                :ui="{ base: 'font-mono' }"
                @change="save(row.name)"
                @keydown.enter.prevent="save(row.name)"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="revealed.has(row.name) ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="revealed.has(row.name) ? `Hide the ${row.provider} key` : `Show the ${row.provider} key`"
                    :aria-pressed="revealed.has(row.name)"
                    class="-mr-1"
                    @mousedown.prevent
                    @click="toggleReveal(row.name)"
                  />
                </template>
              </UInput>
              <UButton color="neutral" variant="outline" label="Save" :disabled="!isDirty(row.name)" @click="save(row.name)" />
              <UButton v-if="sources[row.name] === 'user'" color="neutral" variant="ghost" label="Clear" @click="clear(row.name)" />
            </div>

            <template #help>
              <span class="text-[11px]" :class="sources[row.name] === 'none' ? 'text-muted' : 'text-success'">{{ SOURCE_TEXT[sources[row.name]] }}</span>
              <a v-if="row.keyUrl" :href="row.keyUrl" target="_blank" rel="noreferrer noopener" class="text-primary ml-2 text-[11px] hover:underline">Get a key ↗</a>
            </template>
          </UFormField>
        </div>

        <!-- Stated plainly rather than buried: a browser-side map key is never actually secret, and
             telling users otherwise would be the dishonest part. -->
        <div class="border-ink-700/70 bg-ink-950/50 text-muted rounded border p-3 text-[11px] leading-relaxed">
          <p class="text-default font-medium">About key safety</p>
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
