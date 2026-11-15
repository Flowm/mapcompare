<script setup lang="ts">
import { useShare } from "@/composables/useShare";

const share = useShare();
</script>

<template>
  <UTooltip text="Copy a link to this exact comparison">
    <UButton icon="i-lucide-link" label="Share" size="sm" color="neutral" variant="outline" @click="share" />
  </UTooltip>
</template>
