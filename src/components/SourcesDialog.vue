<script setup lang="ts">
import { ref, watch } from "vue";

import { BUILD_DATE, BUILD_SHA } from "@/env";
import { sanitizeAttributionHtml } from "@/lib/attribution";
import { licenceInfo } from "@/lib/providers/licence";
import { LICENCE_TIERS } from "@/lib/providers/licence";
import { PROVIDERS } from "@/lib/providers/registry";

const open = defineModel<boolean>("open", { required: true });
const dialog = ref<HTMLDialogElement>();

watch(open, (isOpen) => (isOpen ? dialog.value?.showModal() : dialog.value?.close()), { immediate: true });

const SEVERITY_CLASS = { ok: "text-tier-open", warn: "text-tier-terms", bad: "text-tier-restricted" } as const;

function coverage(maxzoom: number, note: string | undefined): string {
  return note ?? `to z${maxzoom}`;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="border-ink-700 bg-ink-900 text-ink-50 backdrop:bg-ink-950/70 m-auto max-h-[85vh] w-[min(56rem,94vw)] overflow-y-auto rounded-lg border p-0 backdrop:backdrop-blur-sm"
    @close="open = false"
    @cancel="open = false"
  >
    <div class="border-ink-700 bg-ink-900 sticky top-0 flex items-center justify-between border-b px-4 py-3">
      <h2 class="text-sm font-semibold">Sources &amp; licences</h2>
      <button type="button" class="text-ink-400 hover:bg-ink-800 hover:text-ink-50 rounded px-2 py-1 text-xs" @click="open = false">Close</button>
    </div>

    <div class="space-y-4 px-4 py-4">
      <p class="text-ink-400 text-xs leading-relaxed">
        There is no free, keyless, globally high-resolution, commercially usable satellite basemap. Every option below gives up exactly one of those four. That trade-off is what
        this app exists to show.
      </p>

      <div class="overflow-x-auto">
        <table class="w-full min-w-[46rem] border-collapse text-[11px]">
          <thead>
            <tr class="border-ink-700 text-ink-400 border-b text-left">
              <th class="py-1.5 pr-3 font-medium">Layer</th>
              <th class="py-1.5 pr-3 font-medium">Coverage &amp; resolution</th>
              <th class="py-1.5 pr-3 font-medium">Max zoom</th>
              <th class="py-1.5 pr-3 font-medium">Licence</th>
              <th class="py-1.5 font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="provider in PROVIDERS" :key="provider.id" class="border-ink-800/60 border-b align-top">
              <td class="py-2 pr-3">
                <span class="text-ink-50 font-medium">{{ provider.label }}</span>
                <span class="text-ink-600 block">{{ provider.operator }}</span>
              </td>
              <td class="text-ink-400 py-2 pr-3">{{ coverage(provider.maxzoom, provider.coverageNote) }}</td>
              <!-- Measured, not documented. Several providers advertise more than they serve. -->
              <td class="text-ink-400 py-2 pr-3 font-mono">z{{ provider.maxzoom }}</td>
              <td class="py-2 pr-3">
                <a
                  v-if="provider.licence.url"
                  :href="provider.licence.url"
                  target="_blank"
                  rel="noreferrer noopener"
                  class="hover:underline"
                  :class="SEVERITY_CLASS[licenceInfo(provider.licence.tier).severity]"
                >
                  {{ licenceInfo(provider.licence.tier).label }} ↗
                </a>
                <span v-else :class="SEVERITY_CLASS[licenceInfo(provider.licence.tier).severity]">{{ licenceInfo(provider.licence.tier).label }}</span>
                <span class="text-ink-600 mt-0.5 block leading-snug">{{ provider.licence.note }}</span>
              </td>
              <!-- eslint-disable-next-line vue/no-v-html -- sanitized; links must stay clickable -->
              <td class="credit text-ink-400 py-2 leading-snug" v-html="sanitizeAttributionHtml(provider.attribution)" />
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3 class="text-xs font-semibold">What the licence chips mean</h3>
        <dl class="mt-1.5 space-y-1 text-[11px] leading-relaxed">
          <div v-for="(info, tier) in LICENCE_TIERS" :key="tier" class="flex gap-2">
            <dt class="w-28 shrink-0" :class="SEVERITY_CLASS[info.severity]">{{ info.label }}</dt>
            <dd class="text-ink-400">{{ info.explanation }}</dd>
          </div>
        </dl>
      </div>

      <div class="text-ink-400 text-[11px] leading-relaxed">
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

      <p class="border-ink-800 text-ink-600 border-t pt-3 font-mono text-[10px]">build {{ BUILD_SHA }} · {{ BUILD_DATE }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.credit :deep(a) {
  color: inherit;
  text-decoration: underline;
}
</style>
