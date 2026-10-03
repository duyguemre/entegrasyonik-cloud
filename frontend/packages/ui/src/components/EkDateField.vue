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
            <v-icon icon="mdi-calendar-outline" size="18" aria-hidden="true" />
          </button>
        </template>
        <!-- FE-LOCAL-1047: takvim — ana sayfa diliyle: mikro etiket + seçili gün başlığı, düz yüzey, çerçeveli gezinme
             düğmeleri, köşeli gün hücreleri (bugün = eylem çerçevesi, seçili = dolu eylem rengi), altta "Bugün" kısayolu. -->
        <div class="ek-date__pop">
          <div class="ek-date__pop-head">
            <span class="ek-date__pop-label">{{ label || 'Tarih' }}</span>
            <span class="ek-date__pop-value ek-num">{{ text && !invalid ? text : 'Gün seçin' }}</span>
          </div>
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
          <div class="ek-date__pop-foot">
            <button type="button" class="ek-date__pop-btn" :disabled="!todayAllowed" @click="onPick(new Date())">
              <v-icon icon="mdi-calendar-today-outline" size="16" aria-hidden="true" /><span>Bugün</span>
            </button>
            <button v-if="clearable" type="button" class="ek-date__pop-btn is-quiet" :disabled="!text" @click="clear(); open = false">Temizle</button>
          </div>
        </div>
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

/** "Bugün" kısayolu min/max aralığının dışındaysa kapalı. */
const todayAllowed = computed(() => {
  const today = toIso(new Date())
  const lo = toIso(props.min)
  const hi = toIso(props.max)
  return (!lo || today >= lo) && (!hi || today <= hi)
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

.ek-date__pop {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
}

.ek-date__pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-date__pop-label {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-date__pop-label::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ek-date__pop-value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-date__pop-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-date__pop-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: 28px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-date__pop-btn.is-quiet {
  border-color: transparent;
  background: transparent;
  color: var(--ek-color-content-muted);
}

.ek-date__pop-btn:hover:not(:disabled) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-date__pop-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ek-date__pop-btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* Vuetify takvimi: kendi gölgesi/çerçevesi yok (kabuk `ek-date__pop`); iç parçalar tasarım diline çekilir. */
.ek-date__picker {
  width: 304px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.ek-date__picker :deep(.v-date-picker-controls) {
  gap: var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-1);
}

.ek-date__picker :deep(.v-date-picker-controls .v-btn) {
  border-radius: var(--ek-radius-tile);
  color: var(--ek-color-content-default);
  letter-spacing: 0;
  text-transform: none;
}

/* Ay / yıl başlığı: yarı kalın, tıklanınca ay-yıl seçimi. */
.ek-date__picker :deep(.v-date-picker-controls__month-btn),
.ek-date__picker :deep(.v-date-picker-controls__mode-btn) {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* Önceki / sonraki ay: çerçeveli ikon kutuları (ikon kapsülleriyle aynı aile). */
.ek-date__picker :deep(.v-date-picker-controls__month) {
  gap: var(--ek-space-1);
}

.ek-date__picker :deep(.v-date-picker-controls__month .v-btn) {
  width: 28px;
  height: 28px;
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

.ek-date__picker :deep(.v-date-picker-controls__month .v-btn:hover) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-date__picker :deep(.v-date-picker-month) {
  padding: 0 var(--ek-space-3) var(--ek-space-3);
}

.ek-date__picker :deep(.v-date-picker-month__days) {
  row-gap: 2px;
  column-gap: 2px;
}

/* Gün adları: mikro büyük harf etiket. */
.ek-date__picker :deep(.v-date-picker-month__weekday) {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-date__picker :deep(.v-date-picker-month__day) {
  width: 38px;
  height: 36px;
}

.ek-date__picker :deep(.v-date-picker-month__day .v-btn) {
  width: 34px;
  height: 34px;
  border-radius: var(--ek-radius-tile);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  font-variant-numeric: tabular-nums;
  box-shadow: none;
}

.ek-date__picker :deep(.v-date-picker-month__day .v-btn:hover) {
  background: var(--ek-color-surface-muted);
}

.ek-date__picker :deep(.v-date-picker-month__day--adjacent .v-btn) {
  color: var(--ek-color-content-muted);
  opacity: 0.6;
}

/* Bugün: eylem renginde ince çerçeve + açık zemin. */
.ek-date__picker :deep(.v-date-picker-month__day .v-btn.v-btn--variant-outlined) {
  border: 1px solid var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

/* Seçili gün: dolu eylem rengi (tek vurgu). */
.ek-date__picker :deep(.v-date-picker-month__day--selected .v-btn) {
  border: 0;
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-weight: var(--ek-font-weight-semibold);
  opacity: 1;
}

/* Ay / yıl seçim ızgaraları. */
.ek-date__picker :deep(.v-date-picker-months__content),
.ek-date__picker :deep(.v-date-picker-years__content) {
  gap: var(--ek-space-1);
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-3);
}

.ek-date__picker :deep(.v-date-picker-months__content .v-btn),
.ek-date__picker :deep(.v-date-picker-years__content .v-btn) {
  border-radius: var(--ek-radius-tile);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  letter-spacing: 0;
  text-transform: none;
}

.ek-date__picker :deep(.v-date-picker-months__content .v-btn--active),
.ek-date__picker :deep(.v-date-picker-years__content .v-btn--active) {
  border: 1px solid var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}
</style>
