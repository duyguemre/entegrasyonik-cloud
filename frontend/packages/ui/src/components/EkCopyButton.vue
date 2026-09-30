<!--
  EkCopyButton — kimlik kopyalama (mağaza no, istek kimliği/correlationId, iş kimliği…). Yalnız ikon; erişilebilir ad
  "<label> kopyala". Başarıda 1,5 sn onay ikonu + `aria-live` duyurusu ("Kopyalandı"); pano izni yoksa "Kopyalanamadı".
  Satır içi kullanım: değer metninin hemen sağında, satır tıklamasını tetiklemez (`click.stop`).

    <code>{{ row.reqId }}</code><EkCopyButton :value="row.reqId" label="İstek kimliği" />
-->
<template>
  <button
    type="button"
    class="ek-copy"
    :class="{ 'is-done': state === 'done', 'is-failed': state === 'failed' }"
    :aria-label="`${label} kopyala`"
    :title="`${label} kopyala`"
    @click.stop.prevent="copy"
  >
    <v-icon :size="14" :icon="state === 'done' ? 'mdi-check' : state === 'failed' ? 'mdi-alert-circle-outline' : 'mdi-content-copy'" aria-hidden="true" />
    <span class="ek-sr-only" aria-live="polite">{{ state === 'done' ? 'Kopyalandı' : state === 'failed' ? 'Kopyalanamadı' : '' }}</span>
  </button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{ value: string | number; label?: string }>(), { label: 'Değeri' })
const emit = defineEmits<{ copied: [value: string] }>()
const state = ref<'idle' | 'done' | 'failed'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  const text = String(props.value)
  try {
    await navigator.clipboard.writeText(text)
    state.value = 'done'
    emit('copied', text)
  } catch {
    state.value = 'failed'
  }
  clearTimeout(timer)
  timer = setTimeout(() => (state.value = 'idle'), 1500)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.ek-copy {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: var(--ek-space-1);
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  vertical-align: middle;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-copy:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-copy:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-copy.is-done {
  color: var(--ek-color-success-emphasis);
}

.ek-copy.is-failed {
  color: var(--ek-color-error-emphasis);
}
</style>
