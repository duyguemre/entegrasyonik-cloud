<!--
  frontend/src/components/categories/CategoryNewRow.vue

  Ağaçta YERİNDE yeni kategori satırı: odaklı ad alanı, Enter kaydeder, Esc vazgeçer. Doğrulama eski kuralla aynı
  (zorunlu, 2–160 karakter); hata satır altında (ham API hatası değil).
-->
<template>
  <div class="cnr" :class="{ 'has-error': !!shownError }" role="group" :aria-label="label">
    <span v-for="n in level" :key="n" class="cnr__guide" aria-hidden="true" />
    <span class="cnr__tile" aria-hidden="true"><v-icon icon="mdi-plus" size="16" /></span>
    <div class="cnr__field">
      <input ref="inputRef" v-model="title" class="cnr__input" type="text" maxlength="160" autocomplete="off"
        :placeholder="placeholder" :aria-label="label" :aria-invalid="!!shownError" :disabled="busy"
        @keydown.enter.prevent="submit" @keydown.esc.prevent.stop="emit('cancel')" />
      <p v-if="shownError" class="cnr__error" role="alert">{{ shownError }}</p>
      <p v-else class="cnr__hint">Enter ile kaydet · Esc ile vazgeç</p>
    </div>
    <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Vazgeç" :disabled="busy" @click="emit('cancel')" />
    <EkButton tone="primary" size="sm" icon="mdi-check" icon-only aria-label="Kategoriyi ekle" :loading="busy" @click="submit" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'

const props = defineProps<{ level: number; label: string; placeholder: string; busy?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [title: string]; cancel: [] }>()

const title = ref('')
const touched = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const validation = computed(() => {
  const v = title.value.trim()
  if (!v) return 'Kategori adı gerekli.'
  if (v.length < 2 || v.length > 160) return 'Kategori adı 2–160 karakter olmalı.'
  return ''
})
const shownError = computed(() => props.error || (touched.value ? validation.value : ''))

function submit() {
  touched.value = true
  if (validation.value || props.busy) return
  emit('submit', title.value.trim())
}

onMounted(() => inputRef.value?.focus())
</script>

<style scoped>
.cnr {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  min-height: 52px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-action-subtle);
}

.cnr__guide {
  flex: none;
  align-self: stretch;
  width: var(--ek-space-5);
  margin-block: calc(-1 * var(--ek-space-2));
  border-inline-start: 1px solid var(--ek-color-border-subtle);
}

.cnr__tile {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-top: 2px;
  border-radius: var(--ek-radius-sm);
  background: color-mix(in srgb, var(--ek-color-action) 14%, var(--ek-color-surface));
  color: var(--ek-color-action);
}

.cnr__field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.cnr__input {
  width: 100%;
  height: var(--ek-control-h-field);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-action);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-body-size);
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cnr.has-error .cnr__input {
  border-color: var(--ek-color-error);
}

.cnr__hint,
.cnr__error {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cnr__hint {
  color: var(--ek-color-content-muted);
}

.cnr__error {
  color: var(--ek-color-error-emphasis);
}
</style>
