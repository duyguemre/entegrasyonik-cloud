<!--
  frontend/src/components/ds/EkDateField.vue

  DS-v2 — tarih alanı (filtre panelleri için). Değer tr-TR GG.AA.YYYY gösterilir
  (`formatDate`), seçim küçük bir açılır takvimde (sayfa içi menü; tam sayfa popup
  DEĞİL). Alan temizlenebilir. `min`/`max` takvime iletilir.

  Model: varsayılan `Date` (v-date-picker'ın ürettiği); `valueFormat="iso-date"` →
  "YYYY-AA-GG" metni (ör. backend'in metin tarih beklediği filtreler).

  Kullanım:
    <EkDateField v-model="filters.startDate" label="Başlangıç" :max="filters.endDate" />
-->
<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: activatorProps }">
      <v-text-field
        v-bind="triggerProps(activatorProps)"
        :model-value="display"
        :label="label"
        prepend-inner-icon="mdi-calendar-blank-outline"
        readonly
        clearable
        @click:clear.stop="emit('update:modelValue', null)"
      />
    </template>
    <v-card class="ek-date-field__card">
      <v-date-picker
        :model-value="pickerValue"
        :min="min"
        :max="max"
        hide-header
        show-adjacent-months
        color="primary"
        @update:model-value="onPick"
      />
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDate } from '@/composables/format'

type DateValue = Date | string | null | undefined

const props = withDefaults(
  defineProps<{ modelValue?: DateValue; label: string; min?: DateValue; max?: DateValue; valueFormat?: 'date' | 'iso-date' }>(),
  { modelValue: null, min: undefined, max: undefined, valueFormat: 'date' },
)
const emit = defineEmits<{ 'update:modelValue': [value: Date | string | null] }>()
const open = ref(false)

const pickerValue = computed(() => (props.modelValue ? new Date(props.modelValue as any) : null))
const display = computed(() => (props.modelValue ? formatDate(props.modelValue as any) : ''))

// Menü tetikleyici öznitelikleri metin alanına bağlanır; `aria-expanded/haspopup/controls` yalnız
// combobox/düğme rolünde geçerlidir (axe aria-allowed-attr) — olay dinleyicileri korunur, ARIA durumu atılır.
function triggerProps(p: Record<string, unknown>) {
  const { 'aria-expanded': _e, 'aria-haspopup': _h, 'aria-controls': _c, ...rest } = p
  return rest
}

function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function onPick(value: unknown) {
  const d = value instanceof Date ? value : value ? new Date(value as string) : null
  emit('update:modelValue', d ? (props.valueFormat === 'iso-date' ? toIsoDate(d) : d) : null)
  open.value = false
}
</script>

<style scoped>
.ek-date-field__card {
  border-radius: var(--ek-radius-popover);
}
</style>
