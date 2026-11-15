<script setup lang="ts">
import { useShare } from "@/composables/useShare";

const { share, copied } = useShare();
</script>

<template>
  <UTooltip text="Copy a link to this comparison">
    <UButton
      :icon="copied ? 'i-lucide-check' : 'i-lucide-link'"
      :label="copied ? 'Copied' : 'Share'"
      size="sm"
      :color="copied ? 'primary' : 'neutral'"
      variant="outline"
      @click="share()"
    />
  </UTooltip>
</template>
