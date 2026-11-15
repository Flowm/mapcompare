<script setup lang="ts">
/**
 * A small chip over the map that opens its explanation on tap.
 *
 * The explanation used to live in `title`, which a touch screen never shows: the licence note,
 * why a Time was substituted, what a refused tile means. A popover reaches both, so the chip is a
 * button and what it says on hover is what it says on a phone.
 *
 * The popover portals to <body>, which keeps it whole in swipe mode, where the top pane's
 * clip-path would otherwise cut it at the seam.
 */

withDefaults(defineProps<{ color?: "success" | "warning" | "error" | "neutral"; mono?: boolean }>(), { color: "neutral", mono: false });
</script>

<template>
  <UPopover :content="{ side: 'top', align: 'end', collisionPadding: 8 }">
    <UButton
      size="xs"
      variant="subtle"
      :color="color"
      class="bg-ink-950/75 rounded px-1.5 py-1 text-[10px] leading-none font-normal backdrop-blur pointer-coarse:px-2 pointer-coarse:py-1.5 pointer-coarse:text-xs"
      :class="[mono && 'font-mono', color === 'neutral' && 'text-default']"
    >
      <slot />
    </UButton>

    <template #content>
      <div class="text-default max-w-72 space-y-2 p-3 text-xs leading-relaxed">
        <slot name="detail" />
      </div>
    </template>
  </UPopover>
</template>
