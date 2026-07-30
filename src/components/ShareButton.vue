<script setup lang="ts">
import { ref } from "vue";

import { useAppState } from "@/composables/useAppState";

const { sharePermalink } = useAppState();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function share() {
  const url = sharePermalink();
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
  } catch {
    // Clipboard access can be denied or unavailable over plain http. The URL bar already
    // shows the permalink at this point, so there is nothing to recover from.
    copied.value = false;
  }
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <button
    type="button"
    class="border-ink-700 bg-ink-900 hover:bg-ink-800 rounded border px-2 py-1.5 text-xs transition-colors"
    :class="copied ? 'text-accent' : 'text-ink-200'"
    title="Copy a link to this exact comparison"
    @click="share"
  >
    {{ copied ? "Copied" : "Share" }}
  </button>
</template>
