<!--
  frontend/src/components/ds/EkKbd.vue

  DS-v2 — klavye tuşu göstergesi. Menü kısayolu, tooltip ve arama açılırının
  alt ipucu şeridinde AYNI biçimde kullanılır. `keys` birden fazla tuş
  alırsa aralarına ince "+" konur (ör. ['Ctrl', 'K']).
  `tone="chrome"` üst bar (lacivert) üzerinde kullanım içindir.
-->
<template>
  <span class="ek-kbd" :class="`ek-kbd--${tone}`">
    <template v-for="(key, index) in list" :key="key + index">
      <span v-if="index > 0" class="ek-kbd__plus" aria-hidden="true">+</span>
      <kbd class="ek-kbd__key">{{ key }}</kbd>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    keys: string | string[]
    tone?: 'default' | 'chrome' | 'inverse'
  }>(),
  { tone: 'default' },
)

const list = computed(() => (Array.isArray(props.keys) ? props.keys : [props.keys]))
</script>

<style scoped>
.ek-kbd {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-kbd__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-bottom-width: 2px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-sans);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1;
}

.ek-kbd--chrome {
  color: var(--ek-color-chrome-text-muted);
}

.ek-kbd--chrome .ek-kbd__key {
  border-color: var(--ek-color-chrome-border);
  background: var(--ek-color-chrome);
  color: var(--ek-color-chrome-text);
}

.ek-kbd--inverse {
  color: var(--ek-color-content-inverse);
}

.ek-kbd--inverse .ek-kbd__key {
  border-color: var(--ek-color-content-muted);
  background: var(--ek-color-surface-inverse);
  color: var(--ek-color-content-inverse);
}
</style>
