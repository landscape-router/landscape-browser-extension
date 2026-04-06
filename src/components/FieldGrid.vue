<script setup lang="ts">
defineProps<{
  rows: Array<[string, string | undefined]>;
}>();
</script>

<template>
  <div class="field-grid">
    <template v-for="([label, value], index) in rows" :key="`${label}-${index}`">
      <div class="field-label">{{ label }}</div>
      <div class="field-value">{{ value || '-' }}</div>
    </template>
  </div>
</template>
