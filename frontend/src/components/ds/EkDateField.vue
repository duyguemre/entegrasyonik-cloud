<!--
  frontend/src/components/ds/EkDateField.vue

  DS-v2 — tarih alanı, HER ZAMAN tr-TR biçiminde (GG.AA.YYYY). Tarayıcının
  yerel `type="date"` denetimi işletim sistemi diline göre (ör. AA/GG/YYYY)
  çizildiği için kullanılmaz.
    - yazarken noktalar kendiliğinden eklenir (29092026 → 29.09.2026)
    - geçersiz tarih alan terk edilince açıklayıcı hata metniyle işaretlenir
    - takvim düğmesi (alanın başında) sayfa içi küçük bir takvim açar (tam sayfa
      popup DEĞİL): Türkçe ay/gün adları, hafta pazartesi başlar; `min`/`max` iletilir
    - alan temizlenebilir (filtre panelleri)
  Model: `valueFormat="iso-date"` → "YYYY-AA-GG" metni; `"date"` → `Date`. Verilmezse
  gelen değerin türü korunur (metin gelirse metin, aksi halde `Date`).
  Diğer tüm v-text-field özellikleri (hint, density…) iletilir.
    <EkDateField v-model="filters.startDate" label="Başlangıç" :max="filters.endDate" />
-->
<template>
  <v-text-field
    v-bind="$attrs"
    :label="label"
    :model-value="text"
    placeholder="GG.AA.YYYY"
    inputmode="numeric"
    autocomplete="off"
    maxlength="10"
    :clearable="clearable"
    :error-messages="errorMessages"
    @update:model-value="onType"
    @click:clear="clear"
    @blur="commit"
  >
    <template #prepend-inner>
      <v-menu v-model="open" :close-on-content-click="false" location="bottom start" :offset="8">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" type="button" class="ek-date__btn" :aria-label="`Takvimi aç${labelSuffix}`">
            <v-icon icon="mdi-calendar-outline" aria-hidden="true" />
          </button>
        </template>
        <v-date-picker
          class="ek-date__picker"
          :model-value="pickerValue"
          :min="toIso(min) || undefined"
          :max="toIso(max) || undefined"
          first-day-of-week="1"
          show-adjacent-months
          hide-header
          color="primary"
          @update:model-value="onPick"
        />
      </v-menu>
    </template>
  </v-text-field>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue'

defineOptions({ inheritAttrs: false })

type DateValue = Date | string | null | undefined

const props = withDefaults(
  defineProps<{
    modelValue?: DateValue
    label?: string
    min?: DateValue
    max?: DateValue
    valueFormat?: 'date' | 'iso-date'
    clearable?: boolean
    invalidText?: string
  }>(),
  {
    modelValue: null,
    label: undefined,
    min: undefined,
    max: undefined,
    valueFormat: undefined,
    clearable: true,
    invalidText: 'Geçerli bir tarih girin (GG.AA.YYYY).',
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: Date | string | null] }>()
const attrs = useAttrs()

const open = ref(false)
const text = ref(isoToTr(toIso(props.modelValue)))
const invalid = ref(false)
const errorMessages = computed(() => (invalid.value ? [props.invalidText] : (attrs['error-messages'] as string[] | string | undefined)))
const labelSuffix = computed(() => (props.label ? `: ${props.label}` : ''))
const asText = computed(() => props.valueFormat === 'iso-date' || (!props.valueFormat && typeof props.modelValue === 'string'))

watch(
  () => props.modelValue,
  (value) => {
    const iso = toIso(value)
    if (iso !== trToIso(text.value)) text.value = isoToTr(iso)
    invalid.value = false
  },
)

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Date | ISO metni → "YYYY-MM-DD" (yerel gün; saat dilimi kayması yok). */
function toIso(value: DateValue): string {
  if (!value) return ''
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
  }
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isoToTr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** "GG.AA.YYYY" → "YYYY-MM-DD"; takvimde olmayan gün (31.02) için boş. */
function trToIso(value: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
  if (!m) return ''
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  return real ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

function out(iso: string): Date | string | null {
  if (!iso) return null
  if (asText.value) return iso
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y, mo - 1, d)
}

/** Yalnızca rakamları alır, 2. ve 4. rakamdan sonra nokta koyar. */
function mask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.')
}

function onType(value: string | null) {
  text.value = mask(value ?? '')
  invalid.value = false
  const iso = trToIso(text.value)
  const current = toIso(props.modelValue)
  if (iso && iso !== current) emit('update:modelValue', out(iso))
  if (!text.value && current) emit('update:modelValue', asText.value ? '' : null)
}

function clear() {
  text.value = ''
  invalid.value = false
  emit('update:modelValue', asText.value ? '' : null)
}

function commit() {
  invalid.value = !!text.value && !trToIso(text.value)
}

const pickerValue = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIso(props.modelValue))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
})

function onPick(value: unknown) {
  const date = value instanceof Date ? value : undefined
  if (!date) return
  const iso = toIso(date)
  text.value = isoToTr(iso)
  invalid.value = false
  emit('update:modelValue', out(iso))
  open.value = false
}
</script>

<style scoped>
.ek-date__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: calc(var(--ek-space-1) * -1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-date__btn:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-action);
}

.ek-date__btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ek-color-border-focus);
}

.ek-date__picker {
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}
</style>
