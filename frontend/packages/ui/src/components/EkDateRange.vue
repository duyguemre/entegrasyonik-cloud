<!--
  frontend/packages/ui/src/components/EkDateRange.vue

  FR3 madde 10 (fe-r3a) — TARİH ARALIĞI FİLTRESİ, TEK KAYNAK. Tarih sütunu olan her listede aynı görünüm ve davranış:
    [📅 Başlangıç GG.AA.YYYY] [📅 Bitiş GG.AA.YYYY] [⧉ hazır aralıklar ⌄]
  - İki `EkDateField` birbirini sınırlar (başlangıç ≤ bitiş); alanlar temizlenebilir.
  - Hazır aralıklar menüsü: Bugün · Son 7 gün · Son 30 gün · Bu ay · Geçen ay (seçili olan işaretli) · Temizle.
  - Filtre ızgarasında İKİ kolon kaplar (`ek-span-2`; mobilde tam genişlik). Model biçimi `valueFormat` ile
    (`iso-date` "YYYY-AA-GG" · `date` Date) — ekranın backend sözleşmesi değişmez.
    <EkDateRange v-model:start="filters.startDate" v-model:end="filters.endDate" value-format="iso-date" />
-->
<template>
  <fieldset class="ek-date-range ek-span-2" :aria-label="label">
    <EkDateField
      class="ek-date-range__field"
      :model-value="start"
      :label="startLabel"
      :value-format="valueFormat"
      :max="end || undefined"
      @update:model-value="(v) => emit('update:start', v)"
    />
    <EkDateField
      class="ek-date-range__field"
      :model-value="end"
      :label="endLabel"
      :value-format="valueFormat"
      :min="start || undefined"
      @update:model-value="(v) => emit('update:end', v)"
    />
    <v-menu v-model="open" location="bottom end" :offset="6">
      <template #activator="{ props: menuProps }">
        <button v-bind="menuProps" type="button" class="ek-date-range__presets" :class="{ 'is-open': open }"
          :aria-label="`${label}: hazır aralıklar`" :title="`${label}: hazır aralıklar`">
          <v-icon icon="mdi-calendar-range-outline" aria-hidden="true" />
          <v-icon class="ek-date-range__chevron" icon="mdi-chevron-down" aria-hidden="true" />
        </button>
      </template>
      <EkMenuPanel autofocus :groups="groups" :label="`${label}: hazır aralıklar`" @select="onPreset" @close="open = false" />
    </v-menu>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EkDateField from './EkDateField.vue'
import EkMenuPanel, { type EkMenuGroup, type EkMenuItem } from './EkMenuPanel.vue'
import { dateRangePresets, matchPreset, normalizeDay } from './dateRange'

type DateValue = Date | string | null | undefined

const props = withDefaults(
  defineProps<{
    start?: DateValue
    end?: DateValue
    /** Grubun erişilebilir adı (ör. "Sipariş tarihi"). */
    label?: string
    startLabel?: string
    endLabel?: string
    valueFormat?: 'date' | 'iso-date'
  }>(),
  { start: null, end: null, label: 'Tarih aralığı', startLabel: 'Başlangıç', endLabel: 'Bitiş', valueFormat: 'iso-date' },
)

const emit = defineEmits<{ 'update:start': [value: DateValue]; 'update:end': [value: DateValue] }>()
const open = ref(false)

const selected = computed(() => matchPreset(normalizeDay(props.start), normalizeDay(props.end)))
const groups = computed<EkMenuGroup[]>(() => [
  {
    items: dateRangePresets().map((p) => ({ key: p.key, label: p.label, icon: selected.value === p.key ? 'mdi-check' : 'mdi-calendar-blank-outline' })),
  },
  { items: [{ key: '__clear', label: 'Tarihi temizle', icon: 'mdi-close', disabled: !props.start && !props.end }] },
])

const out = (iso: string): DateValue => {
  if (props.valueFormat === 'date') {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return iso
}

function onPreset(item: EkMenuItem) {
  open.value = false
  if (item.key === '__clear') {
    emit('update:start', null)
    emit('update:end', null)
    return
  }
  const preset = dateRangePresets().find((p) => p.key === item.key)
  if (!preset) return
  emit('update:start', out(preset.start))
  emit('update:end', out(preset.end))
}
</script>

<style scoped>
.ek-date-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: var(--ek-space-2);
  align-items: start;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.ek-date-range__field {
  min-width: 0;
}

.ek-date-range__presets {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  height: var(--ek-control-h-field);
  padding: 0 var(--ek-space-1) 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-icon-md);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-date-range__chevron {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
  transition: transform var(--ek-motion-reveal);
}

.ek-date-range__presets.is-open .ek-date-range__chevron {
  transform: rotate(180deg);
}

.ek-date-range__presets:hover,
.ek-date-range__presets.is-open {
  border-color: var(--ek-color-border-strong);
  color: var(--ek-color-content-strong);
}

.ek-date-range__presets:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

</style>
