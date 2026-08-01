<script setup lang="ts">
import { computed, ref } from "vue";

import { useApiKeys } from "@/composables/useApiKeys";
import { useAppState } from "@/composables/useAppState";
import { useClock } from "@/composables/useClock";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { groupByOperator, providerStatuses } from "@/lib/providers/availability";
import { licenceInfo } from "@/lib/providers/licence";
import { getProvider, PROVIDERS } from "@/lib/providers/registry";
import type { ApiKeyName, Provider } from "@/lib/providers/types";
import { resolveVariant, variantValues } from "@/lib/providers/variants";

/**
 * The whole catalogue, and the whole deck, in one column.
 *
 * This is the app's second job made into a surface: anyone can put two images side by side, the
 * useful part is knowing that the sharper one is the one you are not allowed to use. So everything
 * wordy lives here — notes, licence tiers, which panes use what, the API keys and the sources
 * table — and the per-pane pickers stay one-line switchers.
 *
 * It does three things a per-pane popover cannot:
 *
 *   - shows every pane at once, so a four-up deck reads without opening four menus
 *   - copies one pane's exact layer onto another (`→2`), and swaps a pair
 *   - lists the layers that need an API key, with the reason and a way to add one
 *
 * It is closable, and that only works because the pickers do the everyday job on their own. With
 * the panel shut the app is still fully usable and the map gets the width back.
 */

const emit = defineEmits<{ "open-keys": [key?: ApiKeyName]; "open-sources": [] }>();

const { panes, setPaneLayer, swapPanes } = useAppState();
const { keys } = useApiKeys();
const { now } = useClock();
const { activePane, closePanel, focusPane } = useLayerPanel();

const query = ref("");

const statuses = computed(() => providerStatuses(PROVIDERS, keys.value));
const gatedCount = computed(() => statuses.value.filter((s) => !s.enabled).length);

const groups = computed(() => {
  const term = query.value.trim().toLowerCase();
  const matching = term === "" ? statuses.value : statuses.value.filter((s) => `${s.provider.label} ${s.provider.operator} ${s.provider.note}`.toLowerCase().includes(term));
  return groupByOperator(matching);
});

/** `activePane` outlives the pane it pointed at when the mode shrinks the deck. */
const target = computed(() => Math.min(activePane.value, panes.value.length - 1));

const DOT_CLASS = { ok: "bg-tier-open", warn: "bg-tier-terms", bad: "bg-tier-restricted" } as const;
const TEXT_CLASS = { ok: "text-tier-open", warn: "text-tier-terms", bad: "text-tier-restricted" } as const;

/** Which panes show a given layer — the badges that make a four-up deck legible. */
function panesUsing(providerId: string): number[] {
  return panes.value.flatMap((pane, index) => (pane.providerId === providerId ? [index] : []));
}

function otherPanes(index: number): number[] {
  return panes.value.map((_, i) => i).filter((i) => i !== index);
}

function variantsFor(index: number) {
  const provider = getProvider(panes.value[index]?.providerId ?? "");
  return provider?.variant ? variantValues(provider.variant) : [];
}

function currentVariant(index: number): string {
  const provider = getProvider(panes.value[index]?.providerId ?? "");
  return provider?.variant ? resolveVariant(provider.variant, panes.value[index]?.variant, now.value) : "";
}

function pickVariant(index: number, event: Event) {
  setPaneLayer(index, { providerId: panes.value[index]!.providerId, variant: (event.target as HTMLSelectElement).value });
}

/** Copies a pane's whole layer, vintage included: the point is an identical second view. */
function copyTo(from: number, to: number) {
  const source = panes.value[from];
  if (!source) return;
  setPaneLayer(to, { providerId: source.providerId, variant: source.variant });
}

function assign(provider: Provider) {
  setPaneLayer(target.value, { providerId: provider.id });
}
</script>

<template>
  <aside class="border-ink-700 bg-ink-950 flex w-[18rem] shrink-0 flex-col border-l" aria-label="Layer manager">
    <div class="border-ink-800 flex shrink-0 items-center gap-1 border-b px-2.5 py-1.5">
      <h2 class="text-ink-200 flex-1 text-xs font-medium">Layers</h2>
      <button type="button" class="text-ink-400 hover:text-ink-50 rounded px-1 text-xs" title="Hide the panel — each pane keeps its own picker" @click="closePanel">×</button>
    </div>

    <div class="border-ink-800 shrink-0 border-b p-1.5">
      <div class="flex items-center justify-between px-1 pb-1">
        <span class="text-ink-400 text-[10px] font-semibold tracking-wide uppercase">Panes</span>
        <button v-if="panes.length === 2" type="button" class="text-ink-400 hover:text-ink-50 text-[10px]" title="Swap the two panes" @click="swapPanes(0, 1)">swap ⇅</button>
      </div>

      <div v-for="(pane, index) in panes" :key="index" class="rounded px-1.5 py-1" :class="index === target ? 'bg-accent/15' : ''">
        <button type="button" class="flex w-full items-center gap-1.5 text-left" :aria-pressed="index === target" @click="focusPane(index)">
          <span class="rounded px-1 font-mono text-[10px]" :class="index === target ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-200'">{{ index + 1 }}</span>
          <span class="text-ink-50 min-w-0 flex-1 truncate text-xs">{{ getProvider(pane.providerId)?.label ?? pane.providerId }}</span>
          <span v-if="getProvider(pane.providerId)" class="shrink-0 text-[10px]" :class="TEXT_CLASS[licenceInfo(getProvider(pane.providerId)!.licence.tier).severity]">
            {{ licenceInfo(getProvider(pane.providerId)!.licence.tier).label }}
          </span>
        </button>

        <div v-if="variantsFor(index).length > 0 || panes.length > 1" class="mt-0.5 flex items-center gap-1 pl-5">
          <select
            v-if="variantsFor(index).length > 0"
            :value="currentVariant(index)"
            :aria-label="`Vintage for pane ${index + 1}`"
            class="border-ink-700 bg-ink-900 text-ink-50 focus:border-accent rounded border px-1 py-0.5 font-mono text-[10px] focus:outline-none"
            @change="pickVariant(index, $event)"
          >
            <option v-for="value in variantsFor(index)" :key="value.value" :value="value.value">{{ value.label }}</option>
          </select>

          <button
            v-for="other in otherPanes(index)"
            :key="other"
            type="button"
            class="border-ink-700 text-ink-400 hover:text-ink-50 hover:border-ink-500 rounded border px-1 py-0.5 font-mono text-[10px]"
            :title="`Copy this layer onto pane ${other + 1}`"
            @click="copyTo(index, other)"
          >
            →{{ other + 1 }}
          </button>
        </div>
      </div>
    </div>

    <div class="shrink-0 p-1.5">
      <input
        v-model="query"
        type="search"
        placeholder="Filter layers…"
        class="bg-ink-900 text-ink-50 placeholder:text-ink-600 border-ink-700 focus:border-accent w-full rounded border px-2 py-1 text-xs focus:outline-none"
      />
      <p class="text-ink-600 mt-1 px-0.5 text-[10px]">Clicking a layer sets pane {{ target + 1 }}.</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pb-2">
      <div v-for="group in groups" :key="group.operator">
        <p class="bg-ink-900/95 text-ink-400 sticky top-0 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur">{{ group.operator }}</p>

        <!-- Gated layers stay listed, greyed. Hiding them here would remove the discovery this app
             exists for: knowing a layer exists, and what it would cost, is most of the value. The
             per-pane pickers can afford to hide them precisely because this list does not. -->
        <button
          v-for="entry in group.entries"
          :key="entry.provider.id"
          type="button"
          class="hover:bg-ink-800 block w-full px-2.5 py-1.5 text-left"
          :class="[panes[target]?.providerId === entry.provider.id ? 'bg-accent/10' : '', entry.enabled ? '' : 'opacity-55']"
          :title="entry.enabled ? undefined : entry.disabled!.message"
          @click="entry.enabled ? assign(entry.provider) : emit('open-keys', entry.disabled!.key)"
        >
          <span class="flex items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full" :class="DOT_CLASS[licenceInfo(entry.provider.licence.tier).severity]" />
            <span class="text-ink-50 min-w-0 flex-1 truncate text-xs">{{ entry.provider.label }}</span>
            <span v-for="paneIndex in panesUsing(entry.provider.id)" :key="paneIndex" class="bg-accent text-ink-950 shrink-0 rounded px-1 font-mono text-[10px]">
              {{ paneIndex + 1 }}
            </span>
            <span v-if="entry.disabled" class="border-ink-600 text-ink-200 shrink-0 rounded border px-1 text-[10px]">key ↗</span>
          </span>
          <span class="mt-0.5 flex items-baseline justify-between gap-2">
            <span class="text-ink-400 line-clamp-2 text-[11px] leading-snug">{{ entry.provider.note }}</span>
            <span class="shrink-0 text-[10px]" :class="TEXT_CLASS[licenceInfo(entry.provider.licence.tier).severity]">{{ licenceInfo(entry.provider.licence.tier).label }}</span>
          </span>
        </button>
      </div>

      <p v-if="groups.length === 0" class="text-ink-400 px-2.5 py-3 text-xs">No layer matches “{{ query }}”.</p>
    </div>

    <!-- Keys and sources belong to the catalogue, not to the app header: one is why some rows above
         are greyed out, the other is the long form of the licence word on every row. Pinned, so
         they stay reachable while the list scrolls. -->
    <div class="border-ink-800 flex shrink-0 items-center gap-1 border-t p-1.5">
      <button type="button" class="text-ink-200 hover:bg-ink-800 rounded px-2 py-1 text-xs transition-colors" @click="emit('open-keys')">
        API keys<span v-if="gatedCount > 0" class="text-ink-400 ml-1">{{ gatedCount }}</span>
      </button>
      <button type="button" class="text-ink-200 hover:bg-ink-800 rounded px-2 py-1 text-xs transition-colors" @click="emit('open-sources')">Sources &amp; licences</button>
    </div>
  </aside>
</template>
