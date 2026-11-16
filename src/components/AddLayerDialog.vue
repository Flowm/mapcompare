<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables/useToast";
import { computed, ref, watch } from "vue";

import { useAppState } from "@/composables/useAppState";
import { useCatalogue } from "@/composables/useCatalogue";
import { useLayerInspection } from "@/composables/useLayerInspection";
import { useLayerPanel } from "@/composables/useLayerPanel";
import { useViewport } from "@/composables/useViewport";
import { ADDED_LIMITS, framing, isRegional } from "@/lib/layers/added";
import { WALK } from "@/lib/layers/addedInspect";
import { CATEGORY_LABELS } from "@/lib/layers/availability";
import { licenceClasses, licenceInfo } from "@/lib/layers/licence";
import type { Category } from "@/lib/layers/types";

/**
 * Adds a Layer from a URL: a STAC catalogue, collection or item, a Cloud-Optimised GeoTIFF, or an
 * XYZ tile template.
 *
 * Inspecting first and adding second, because a URL is rarely one Layer: a catalogue has several
 * collections, a collection several assets. What inspection cannot know — a template's depth and
 * tile size, which Category a picture belongs to — is offered for correction before it is added.
 */

const open = defineModel<boolean>("open", { required: true });

const { isCompact } = useViewport();
const { panes, setPaneLayer, goTo } = useAppState();
const { activePane } = useLayerPanel();
const { saveLayer } = useCatalogue();
const toast = useToast();

const { inspecting, error, candidates, partial, run, reset } = useLayerInspection();

const url = ref("");
const chosen = ref(0);
/** Why the chosen candidate, as edited, could not be saved. */
const saveError = ref<string>();

/** The editable parts of the chosen candidate. */
const label = ref("");
const category = ref<Category>("satellite");
const maxzoom = ref(18);
const tileSize = ref<256 | 512>(256);

const target = computed(() => Math.min(activePane.value, panes.value.length - 1));
const candidate = computed(() => candidates.value[chosen.value]);
/** The name as typed, else the source's own. */
const name = computed(() => label.value.trim() || candidate.value?.layer.label || "");

const CATEGORY_ITEMS = (Object.entries(CATEGORY_LABELS) as [Category, string][]).map(([value, text]) => ({ value, label: text }));
/**
 * What a URL can be, the one with Times first. Said up front rather than discovered by trial and
 * error: each becomes a different kind of Layer. How `inspectUrl` tells them apart is in the template.
 */
const FORMATS = [
  {
    name: "STAC collection",
    example: "https://…/collection.json",
    becomes: "A layer with Times: each item is one picture, and the Time control steps through them. One layer per GeoTIFF asset.",
    icon: "i-lucide-calendar-range",
  },
  {
    name: "STAC catalogue",
    example: "https://…/catalog.json",
    becomes: `Followed through its child links, up to ${WALK.depth} levels deep. The first ${WALK.collections} collections found are offered as choices.`,
    icon: "i-lucide-folder-tree",
  },
  {
    name: "STAC item",
    example: "https://…/item.json",
    becomes: "One fixed picture per GeoTIFF asset.",
    icon: "i-lucide-file-json",
  },
  {
    name: "Cloud-Optimised GeoTIFF",
    example: "https://…/scene.tif",
    becomes: "One fixed picture. Its max zoom is read from the file.",
    icon: "i-lucide-image",
  },
  {
    name: "XYZ tiles",
    example: "https://…/{z}/{x}/{y}.png",
    becomes: "One fixed tiled map. The placeholders may be in any order. Check the tile size and max zoom, which a template does not state.",
    icon: "i-lucide-grid-3x3",
  },
];

const TILE_SIZES = [
  { value: 256, label: "256 px" },
  { value: 512, label: "512 px" },
];

watch(candidates, () => (chosen.value = 0));

watch(candidate, (next) => {
  saveError.value = undefined;
  if (!next) return;
  label.value = next.layer.label;
  category.value = next.layer.category;
  maxzoom.value = next.layer.maxzoom;
  if (next.layer.kind === "xyz") tileSize.value = next.layer.tileSize;
});

// A reopened dialog starts clean, but keeps the URL: retrying a typo is the common case.
watch(open, (isOpen) => {
  if (isOpen) reset();
});

function add() {
  const picked = candidate.value;
  if (!picked) return;
  const zoom = Math.round(maxzoom.value || ADDED_LIMITS.minZoom);
  const layer = picked.layer.kind === "xyz" ? { ...picked.layer, tileSize: tileSize.value } : picked.layer;
  if (!saveLayer({ ...layer, label: name.value, category: category.value, maxzoom: zoom })) {
    saveError.value = `This layer cannot be saved: its name must be at most ${ADDED_LIMITS.label} characters and its max zoom ${ADDED_LIMITS.minZoom}–${ADDED_LIMITS.maxZoom}, or its source gives a credit or address this app cannot keep.`;
    return;
  }
  setPaneLayer(target.value, { layerId: picked.layer.id });
  if (isRegional(picked.bbox)) goTo(framing(picked.bbox, zoom));
  toast.add({ title: `Added to pane ${target.value + 1}`, description: name.value, icon: "i-lucide-layers" });
  open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" title="Add a layer" :fullscreen="isCompact" :ui="{ content: 'sm:max-w-[36rem]' }">
    <template #body>
      <div class="space-y-4">
        <form class="space-y-1.5" @submit.prevent="run(url)">
          <div class="flex items-center gap-1.5">
            <UInput
              v-model="url"
              type="url"
              autofocus
              autocomplete="off"
              spellcheck="false"
              placeholder="https://…/catalog.json"
              aria-label="Layer URL"
              class="min-w-0 flex-1"
              :ui="{ base: 'font-mono text-xs' }"
            />
            <UButton type="submit" label="Inspect" :loading="inspecting" :disabled="url.trim() === ''" />
          </div>
        </form>

        <!-- Only until something is found: then the result says which format it was. -->
        <section v-if="!candidate" aria-labelledby="add-layer-formats" class="space-y-2">
          <h3 id="add-layer-formats" class="text-muted text-[10px] font-semibold tracking-wide uppercase">Supported formats</h3>
          <dl class="border-default divide-default divide-y rounded border">
            <div v-for="format in FORMATS" :key="format.name" class="flex gap-2.5 px-2.5 py-2">
              <UIcon :name="format.icon" class="text-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <dt class="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span class="text-highlighted text-xs font-medium">{{ format.name }}</span>
                  <code class="text-dimmed truncate font-mono text-[10px]">{{ format.example }}</code>
                </dt>
                <dd class="text-muted mt-0.5 text-[11px] leading-snug">{{ format.becomes }}</dd>
              </div>
            </div>
          </dl>

          <div class="text-muted space-y-1 text-[11px] leading-snug">
            <p>
              <span class="text-toned font-medium">How a URL is read:</span> with <code>{z}</code>, <code>{x}</code> and <code>{y}</code> it is a tile template; ending in
              <code>.tif</code> or <code>.tiff</code> it is a GeoTIFF; anything else is fetched and read as STAC JSON.
            </p>
            <p>
              <span class="text-toned font-medium">Every source needs:</span> GeoTIFFs in Web Mercator (EPSG:3857); a host that allows cross-origin requests, and range requests for
              GeoTIFFs; STAC items linked from the collection itself, since a STAC API that pages its items is not supported yet.
            </p>
          </div>
        </section>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />

        <div v-if="candidates.length > 1" class="space-y-1">
          <p class="text-muted text-[10px] font-semibold tracking-wide uppercase">Found {{ candidates.length }} layers</p>
          <p v-if="partial" class="text-warning text-[11px] leading-snug">
            This source has more than one inspection reads, so only the first {{ WALK.collections }} collections are offered. Paste a collection's own URL to add one further in.
          </p>
          <div class="border-default max-h-48 overflow-y-auto rounded border" role="radiogroup" aria-label="Layers found">
            <button
              v-for="(c, index) in candidates"
              :key="c.layer.id"
              type="button"
              role="radio"
              :aria-checked="index === chosen"
              class="hover:bg-elevated block w-full px-2.5 py-1.5 text-left"
              :class="index === chosen ? 'bg-primary/15' : ''"
              @click="chosen = index"
            >
              <span class="text-highlighted block truncate text-xs">{{ c.layer.label }}</span>
              <span class="text-muted block truncate text-[11px]">{{ c.summary }}</span>
            </button>
          </div>
        </div>

        <div v-if="candidate" class="border-default space-y-3 rounded border p-3">
          <div>
            <p class="text-muted text-[11px]">{{ candidate.summary }}</p>
            <p class="text-muted mt-1 text-[11px] leading-snug">{{ candidate.layer.note }}</p>
            <p class="mt-1 text-[11px] leading-snug">
              <span :class="licenceClasses(candidate.layer).text">{{ licenceInfo(candidate.layer.licence.tier).label }}</span>
              <span class="text-muted"> · {{ candidate.layer.licence.note }}</span>
            </p>
          </div>

          <UFormField label="Name" size="sm">
            <UInput v-model="label" :maxlength="ADDED_LIMITS.label" class="w-full" />
          </UFormField>

          <div class="flex flex-wrap gap-3">
            <UFormField label="Type" size="sm" class="min-w-32 flex-1">
              <USelect v-model="category" :items="CATEGORY_ITEMS" class="w-full" />
            </UFormField>
            <UFormField label="Max zoom" size="sm" class="w-32">
              <UInputNumber v-model="maxzoom" :min="ADDED_LIMITS.minZoom" :max="ADDED_LIMITS.maxZoom" class="w-full" />
            </UFormField>
            <UFormField v-if="candidate.layer.kind === 'xyz'" label="Tile size" size="sm" class="w-28">
              <USelect v-model="tileSize" :items="TILE_SIZES" class="w-full" />
            </UFormField>
          </div>

          <UAlert v-if="saveError" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="saveError" />

          <p class="text-dimmed text-[11px] leading-snug">
            Saved in this browser. A link to a comparison that shows it carries it along: whoever opens the link sees it for that session, and can keep it.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
        <UButton icon="i-lucide-plus" :label="`Add to pane ${target + 1}`" :disabled="!candidate" @click="add" />
      </div>
    </template>
  </UModal>
</template>
