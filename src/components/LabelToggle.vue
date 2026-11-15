<script setup lang="ts">
import { pressed } from "@/components/pressed";
import { useAppState } from "@/composables/useAppState";

const { labels, setLabels } = useAppState();
</script>

<template>
  <UTooltip text="Map labels from OpenFreeMap">
    <UButton icon="i-lucide-tags" label="Labels" size="sm" v-bind="pressed(labels)" @click="setLabels(!labels)" />
  </UTooltip>
</template>
