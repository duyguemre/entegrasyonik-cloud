<!--
  Katalog alanından üretilen tek ayar SATIRI (ayar listesi düzeni): solda ad · yardım · kaynak, sağda sabit genişlikte
  denetim (bool→anahtar, enum→seçim, int→sayı, text→metin). Değişen satır sol çizgi + "Değişti" ile işaretlenir.
-->
<template>
  <div class="bo-field" :class="{ 'is-changed': changed, 'is-bool': item.type === 'bool' }" :data-setting="item.key">
    <div class="bo-field__info">
      <label :id="labelId" :for="inputId" class="bo-field__label">{{ item.label.tr }}</label>
      <p :id="helpId" class="bo-field__help">{{ item.help.tr }}</p>
      <p class="bo-field__meta">
        <span class="bo-field__source" :class="{ 'is-default': effective?.source !== 'platform' }">{{ source }}</span>
        <EkStatusChip v-if="changed" tone="info" label="Değişti" />
      </p>
    </div>
    <div class="bo-field__control">
      <v-switch
        v-if="item.type === 'bool'"
        :id="inputId"
        :model-value="Boolean(modelValue)"
        color="primary"
        density="compact"
        hide-details
        inset
        :aria-labelledby="labelId"
        :aria-describedby="helpId"
        @update:model-value="(v) => emit('update:modelValue', Boolean(v))"
      />
      <v-select
        v-else-if="item.type === 'enum'"
        :id="inputId"
        :model-value="modelValue"
        :items="options"
        item-title="title"
        item-value="value"
        variant="outlined"
        density="compact"
        hide-details="auto"
        :error-messages="error || undefined"
        :aria-labelledby="labelId"
        :aria-describedby="helpId"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />
      <v-text-field
        v-else-if="item.type === 'int'"
        :id="inputId"
        :model-value="modelValue as number"
        type="number"
        inputmode="numeric"
        :min="item.safeRange?.min"
        :max="item.safeRange?.max"
        :suffix="item.unit === 'perMin' ? 'istek/dk' : (item.unit ?? undefined)"
        variant="outlined"
        density="compact"
        :hint="item.safeRange ? `Güvenli aralık ${item.safeRange.min}–${item.safeRange.max}` : undefined"
        persistent-hint
        :error-messages="error || undefined"
        :aria-labelledby="labelId"
        :aria-describedby="helpId"
        @update:model-value="(v) => emit('update:modelValue', v === '' || v === null ? null : Number(v))"
      />
      <v-text-field
        v-else
        :id="inputId"
        :model-value="String(modelValue ?? '')"
        :type="inputKind.type"
        :inputmode="inputKind.inputmode"
        :spellcheck="inputKind.plain ? false : undefined"
        :autocapitalize="inputKind.plain ? 'off' : undefined"
        :autocomplete="inputKind.plain ? 'off' : undefined"
        variant="outlined"
        density="compact"
        :maxlength="maxLength"
        :counter="counter ? maxLength : undefined"
        hide-details="auto"
        :error-messages="error || undefined"
        :aria-labelledby="labelId"
        :aria-describedby="helpId"
        @update:model-value="(v) => emit('update:modelValue', v ?? '')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import type { CatalogItem, EffectiveValue } from '@bo/api/contract'

const props = defineProps<{ item: CatalogItem; modelValue: unknown; effective?: EffectiveValue; changed: boolean; error?: string; counter?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const uid = useId()
const helpId = `bo-help-${uid}`
const labelId = `bo-label-${uid}`
const inputId = `bo-input-${uid}`

// Katalog enum seçeneklerini sözleşmede taşımaz; bilinen anahtarlar için sabit (backend katalog zod'uyla aynı).
const ENUM_OPTIONS: Record<string, Array<{ value: string | number; title: string }>> = {
  'announcement.level': [
    { value: 'info', title: 'Bilgi (info)' },
    { value: 'warning', title: 'Uyarı (warning)' },
  ],
  'ui.listPageSize': [10, 25, 50, 100].map((n) => ({ value: n, title: String(n) })),
  // PRC-R2 / PRC-OPEN S6 (açık karar): toplu öneri onayının kota sayımı.
  'pricing.suggestions.bulkApplyQuota': [
    { value: 'per_approval', title: 'Onay başına 1 eylem (per_approval)' },
    { value: 'per_item', title: 'Öneri başına 1 eylem (per_item)' },
  ],
}
const options = computed(() => ENUM_OPTIONS[props.item.key] ?? [{ value: props.item.default as string, title: String(props.item.default) }])
const maxLength = computed(() => (props.item.key === 'support.email' ? 120 : props.item.key === 'support.phone' ? 20 : 280))
/** BO-WDG: destek e-posta/telefon alanı uygun klavye + yazım denetimi kapalı (adres/numara "düzeltilmez"). */
const inputKind = computed(() =>
  props.item.key === 'support.email'
    ? { type: 'email', inputmode: 'email', plain: true }
    : props.item.key === 'support.phone'
      ? { type: 'tel', inputmode: 'tel', plain: true }
      : { type: 'text', inputmode: undefined, plain: false },
)
const source = computed(() => (props.effective?.source === 'platform' ? `Yayında (sürüm ${props.effective.revision ?? '—'})` : 'Varsayılan değer'))
</script>

<style scoped>
/* Satır: solda bilgi, sağda denetim (sabit genişlik); satırlar arası ince ayraç. */
.bo-field {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 340px);
  gap: var(--ek-space-2) var(--ek-space-5);
  align-items: start;
  min-width: 0;
  padding: var(--ek-space-4);
  transition: background-color var(--ek-motion-feedback);
}

.bo-field + .bo-field {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-field.is-bool {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.bo-field.is-changed {
  background: color-mix(in srgb, var(--ek-color-action) 4%, var(--ek-color-surface));
}

.bo-field.is-changed::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--ek-color-action);
}

.bo-field__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 6px;
}

.bo-field.is-bool .bo-field__info {
  padding-top: 0;
}

.bo-field__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-field__help {
  margin: 0;
  max-width: 60ch;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-field__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: var(--ek-space-1) 0 0;
  font-size: var(--ek-type-caption-size);
}

.bo-field__source {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
}

.bo-field__source.is-default {
  color: var(--ek-color-content-muted);
}

.bo-field__control {
  min-width: 0;
}

.bo-field.is-bool .bo-field__control {
  justify-self: end;
}

@media (max-width: 700px) {
  .bo-field,
  .bo-field.is-bool {
    grid-template-columns: minmax(0, 1fr);
  }

  .bo-field.is-bool {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}

/* ================= BO-LOCAL-01 — ayar satırı =================
   Değişen satır: sol kalın şerit YOK — eylem renginin düz açık zemini yeter ("Değişti" çipi metinle de söyler).
   Kaynak etiketi köşeli, ince çerçeveli. */
.bo-field.is-changed {
  background: var(--ek-color-action-subtle);
}

.bo-field.is-changed::before {
  display: none;
}

.bo-field__source {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}
</style>
