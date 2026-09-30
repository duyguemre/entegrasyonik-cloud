<!--
  frontend/src/components/catalogPages/CatNameInput.vue

  B7 — satır içi ad girişi (yeni kategori/marka, yeniden adlandırma). Enter = kaydet, Esc = vazgeç; kural eski formlarla
  aynı (zorunlu, 2–160 karakter — `titleError`). Hata alanın altında (aria-describedby + aria-invalid); kaydederken
  düğme içi yükleme. Açılınca odak alana gelir, metin seçili.
-->
<template>
  <div class="cat-name" :class="{ 'is-compact': compact, 'is-invalid': !!error }" @keydown.esc.stop.prevent="emit('cancel')">
    <div class="cat-name__row">
      <v-icon v-if="icon" :icon="icon" size="18" class="cat-name__icon" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="value"
        class="cat-name__input"
        type="text"
        maxlength="160"
        autocomplete="off"
        spellcheck="false"
        :aria-label="label"
        :placeholder="placeholder"
        :aria-invalid="!!error || undefined"
        :aria-describedby="error ? errId : undefined"
        :disabled="busy"
        @keydown.enter.prevent="submit"
        @input="error = null"
      />
      <div class="cat-name__actions">
        <EkButton tone="primary" size="sm" :icon="icons.save" :loading="busy" @click="submit">{{ saveLabel }}</EkButton>
        <EkButton tone="ghost" size="sm" :icon="icons.close" icon-only :aria-label="cancelLabel" :disabled="busy" @click="emit('cancel')" />
      </div>
    </div>
    <p v-if="error" :id="errId" class="cat-name__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="cat-name__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import { icons } from '@/design/icons'
import { titleError } from './catalogModel'

const props = withDefaults(
  defineProps<{
    initial?: string
    label: string
    placeholder?: string
    hint?: string
    icon?: string
    compact?: boolean
    busy?: boolean
    saveLabel?: string
    cancelLabel?: string
  }>(),
  { initial: '', saveLabel: 'Kaydet', cancelLabel: 'Vazgeç' },
)
const emit = defineEmits<{ submit: [value: string]; cancel: [] }>()

const value = ref(props.initial)
const error = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const errId = `cat-name-err-${useId()}`

function submit() {
  const err = titleError(value.value)
  if (err) {
    error.value = err
    inputRef.value?.focus()
    return
  }
  if (value.value.trim() === props.initial.trim() && props.initial) {
    emit('cancel')
    return
  }
  emit('submit', value.value.trim())
}

onMounted(() => {
  inputRef.value?.focus()
  inputRef.value?.select()
})

defineExpose({ focus: () => inputRef.value?.focus(), setError: (m: string) => (error.value = m) })
</script>

<style scoped>
.cat-name {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.cat-name__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  min-height: var(--ek-control-h-lg);
  padding: 0 var(--ek-space-1) 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-action);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-focus-ring);
}

.cat-name.is-compact .cat-name__row {
  min-height: var(--ek-control-h-md);
  padding-left: var(--ek-space-2);
}

.cat-name.is-invalid .cat-name__row {
  border-color: var(--ek-color-error);
  box-shadow: none;
}

.cat-name__icon {
  flex: none;
  color: var(--ek-color-content-muted);
}

.cat-name__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-body-size);
}

.cat-name__input::placeholder {
  color: var(--ek-color-content-muted);
}

.cat-name__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.cat-name__error,
.cat-name__hint {
  margin: 0;
  padding-left: var(--ek-space-3);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cat-name__error {
  color: var(--ek-color-error-emphasis);
}

.cat-name__hint {
  color: var(--ek-color-content-muted);
}
</style>
