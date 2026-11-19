<script setup lang="ts">
import { useCatalogue } from "@/composables/useCatalogue";
import { useViewport } from "@/composables/useViewport";
import { BUILD_DATE, BUILD_SHA } from "@/env";
import { sanitizeAttributionHtml } from "@/lib/attribution";
import { providerLabel } from "@/lib/layers/availability";
import { describeAttribution } from "@/lib/layers/buildStyle";
import { LICENCE_TIERS, licenceClasses, licenceInfo } from "@/lib/layers/licence";
import { SEVERITY_CLASSES } from "@/lib/severity";

const open = defineModel<boolean>("open", { required: true });
const { isCompact } = useViewport();
const { catalogue } = useCatalogue();

function coverage(maxzoom: number, note: string | undefined): string {
  return note ?? `to z${maxzoom}`;
}
</script>

<template>
  <UModal v-model:open="open" title="Sources &amp; licences" :fullscreen="isCompact" :ui="{ content: 'sm:max-w-[56rem]' }">
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-xs leading-relaxed">
          There is no free, keyless, globally high-resolution, commercially usable satellite basemap. Every option below gives up exactly one of those four. That trade-off is what
          this app exists to show.
        </p>

        <!-- Before the table, which uses these words in every row, rather than after it. -->
        <div>
          <h3 class="text-xs font-semibold">What the licence chips mean</h3>
          <dl class="mt-1.5 space-y-1 text-[11px] leading-relaxed">
            <div v-for="(info, tier) in LICENCE_TIERS" :key="tier" class="flex gap-2">
              <dt class="w-28 shrink-0" :class="SEVERITY_CLASSES[info.severity].text">{{ info.label }}</dt>
              <dd class="text-muted">{{ info.explanation }}</dd>
            </div>
          </dl>
        </div>

        <!-- Scrolls sideways only where it must, on a phone: a scrolling box would also stop the
             header row sticking to the top of the dialog. The header's negative top cancels the
             dialog body's padding, which a sticky element otherwise keeps clear of. -->
        <div class="overflow-x-auto sm:overflow-x-visible">
          <table class="w-full min-w-[46rem] border-collapse text-[11px]">
            <thead>
              <tr class="text-muted [&>th]:bg-default text-left [&>th]:sticky [&>th]:-top-4 [&>th]:z-10 [&>th]:shadow-[inset_0_-1px_0_var(--ui-border)] sm:[&>th]:-top-6">
                <th class="py-1.5 pr-3 font-medium">Layer</th>
                <th class="py-1.5 pr-3 font-medium">Coverage &amp; resolution</th>
                <th class="py-1.5 pr-3 font-medium whitespace-nowrap">Max zoom</th>
                <th class="py-1.5 pr-3 font-medium">Licence</th>
                <th class="py-1.5 font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="layer in catalogue" :key="layer.id" class="border-ink-800/60 border-b align-top">
                <td class="py-2 pr-3">
                  <span class="text-ink-50 font-medium">{{ layer.label }}</span>
                  <span class="text-muted block">{{ providerLabel(layer) }}</span>
                </td>
                <td class="text-muted py-2 pr-3">{{ coverage(layer.maxzoom, layer.coverageNote) }}</td>
                <!-- Measured, not documented. Several providers advertise more than they serve. -->
                <td class="text-muted py-2 pr-3 font-mono">z{{ layer.maxzoom }}</td>
                <td class="py-2 pr-3">
                  <a v-if="layer.licence.url" :href="layer.licence.url" target="_blank" rel="noreferrer noopener" class="hover:underline" :class="licenceClasses(layer).text">
                    {{ licenceInfo(layer.licence.tier).label }} ↗
                  </a>
                  <span v-else :class="licenceClasses(layer).text">{{ licenceInfo(layer.licence.tier).label }}</span>
                  <span class="text-muted mt-0.5 block leading-snug">{{ layer.licence.note }}</span>
                </td>
                <!-- eslint-disable-next-line vue/no-v-html -- sanitized; links must stay clickable -->
                <td class="credit text-muted py-2 leading-snug" v-html="sanitizeAttributionHtml(describeAttribution(layer))" />
              </tr>
            </tbody>
          </table>
        </div>

        <div class="text-muted text-[11px] leading-relaxed">
          <h3 class="text-ink-50 text-xs font-semibold">Coverage gotchas worth knowing</h3>
          <ul class="mt-1 list-inside list-disc space-y-1">
            <li>
              VersaTiles is European orthophotos to z17 over a ~10 m global layer that stops near z12, despite advertising z19. That is why panes can go blank when you zoom in far
              from Europe.
            </li>
            <li>Sentinel-2 cloudless stops at z14 natively; above that you are seeing upscaled 10 m pixels, and the pane badge says so.</li>
            <li>The NASA daily layers stop at z9. They are for weather and clouds, not detail.</li>
            <li>Esri answers requests well past its real resolution by upscaling, so its declared ceiling here is deliberately lower than what the server will hand out.</li>
          </ul>
        </div>

        <div class="text-muted text-[11px] leading-relaxed">
          <h3 class="text-ink-50 text-xs font-semibold">Place search</h3>
          <p class="mt-1">
            Location names come from
            <a href="https://www.geonames.org" target="_blank" rel="noreferrer noopener" class="underline">GeoNames</a>, served by
            <a href="https://open-meteo.com" target="_blank" rel="noreferrer noopener" class="underline">Open-Meteo</a>, under
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener" class="underline">CC BY 4.0</a>. Coordinates you type are read in the
            browser and never sent anywhere.
          </p>
        </div>

        <p class="border-ink-800 text-dimmed border-t pt-3 font-mono text-[10px]">build {{ BUILD_SHA }} · {{ BUILD_DATE }}</p>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.credit :deep(a) {
  color: inherit;
  text-decoration: underline;
}
</style>
