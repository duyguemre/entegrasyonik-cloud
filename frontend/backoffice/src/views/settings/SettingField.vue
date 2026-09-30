<!-- Katalog alanından üretilen tek ayar girdisi (bool→anahtar, enum→seçim, int→sayı, text→metin). Kaynak + değişti vurgusu. -->
<template>
  <div class="bo-field" :class="{ 'is-changed': changed }" :data-setting="item.key">
    <v-switch
      v-if="item.type === 'bool'"
      :model-value="Boolean(modelValue)"
      :label="item.label.tr"
      color="primary"
      density="compact"
      hide-details
      inset
      :aria-describedby="helpId"
      @update:model-value="(v) => emit('update:modelValue', Boolean(v))"
    />
    <v-select
      v-else-if="item.type === 'enum'"
      :model-value="modelValue"
      :items="options"
      item-title="title"
      item-value="value"
      :label="item.label.tr"
      density="compact"
      hide-details="auto"
      :error-messages="error || undefined"
      :aria-describedby="helpId"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
    <v-text-field
      v-else-if="item.type === 'int'"
      :model-value="modelValue as number"
      type="number"
      inputmode="numeric"
      :min="item.safeRange?.min"
      :max="item.safeRange?.max"
      :suffix="item.unit ?? undefined"
      :label="item.label.tr"
      density="compact"
      :hint="item.safeRange ? `${item.safeRange.min}–${item.safeRange.max}` : undefined"
      persistent-hint
      :error-messages="error || undefined"
      :aria-describedby="helpId"
      @update:model-value="(v) => emit('update:modelValue', v === '' || v === null ? null : Number(v))"
    />
    <v-text-field
      v-else
      :model-value="String(modelValue ?? '')"
      :label="item.label.tr"
      density="compact"
      :maxlength="maxLength"
      :counter="counter ? maxLength : undefined"
      hide-details="auto"
      :error-messages="error || undefined"
      :aria-describedby="helpId"
      @update:model-value="(v) => emit('update:modelValue', v ?? '')"
    />
    <p :id="helpId" class="bo-field__help">{{ item.help.tr }}</p>
    <p class="bo-field__meta">
      <span>{{ source }}</span>
      <EkStatusChip v-if="changed" tone="info" label="Değişti" />
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import type { CatalogItem, EffectiveValue } from '@bo/api/contract'

const props = defineProps<{ item: CatalogItem; modelValue: unknown; effective?: EffectiveValue; changed: boolean; error?: string; counter?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const helpId = `bo-help-${useId()}`

// Katalog enum seçeneklerini sözleşmede taşımaz; bilinen anahtarlar için sabit (backend katalog zod'uyla aynı).
const ENUM_OPTIONS: Record<string, Array<{ value: string | number; title: string }>> = {
  'announcement.level': [
    { value: 'info', title: 'Bilgi (info)' },
    { value: 'warning', title: 'Uyarı (warning)' },
  ],
  'ui.listPageSize': [10, 25, 50, 100].map((n) => ({ value: n, title: String(n) })),
}
const options = computed(() => ENUM_OPTIONS[props.item.key] ?? [{ value: props.item.default as string, title: String(props.item.default) }])
const maxLength = computed(() => (props.item.key === 'support.email' ? 120 : props.item.key === 'support.phone' ? 20 : 280))
const source = computed(() => (props.effective?.source === 'platform' ? `Yayında (sürüm ${props.effective.revision ?? '—'})` : 'Varsayılan değer'))
</script>

<style scoped>
.bo-field {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-3);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-lg);
}
.bo-field.is-changed {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle);
}
.bo-field__help {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-field__meta {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>
