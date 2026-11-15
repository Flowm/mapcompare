<script setup lang="ts">
import { useAppState } from "@/composables/useAppState";

const { labels, setLabels } = useAppState();
</script>

<template>
  <UTooltip text="Map labels from OpenFreeMap">
    <UButton
      icon="i-lucide-tags"
      label="Labels"
      size="sm"
      :color="labels ? 'primary' : 'neutral'"
      :variant="labels ? 'solid' : 'outline'"
      :aria-pressed="labels"
      :ui="{ label: 'max-lg:sr-only' }"
      @click="setLabels(!labels)"
    />
  </UTooltip>
</template>
