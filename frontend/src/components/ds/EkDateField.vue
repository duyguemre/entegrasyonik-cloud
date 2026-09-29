<!--
  frontend/src/components/ds/EkDateField.vue

  DS-v2 — tarih alanı, HER ZAMAN tr-TR biçiminde (GG.AA.YYYY). Tarayıcının
  yerel `type="date"` denetimi işletim sistemi diline göre (ör. AA/GG/YYYY)
  çizildiği için kullanılmaz.
    - v-model: ISO gün (`YYYY-MM-DD`) veya boş dize — saat dilimi kayması yok
    - yazarken noktalar kendiliğinden eklenir (29092026 → 29.09.2026)
    - geçersiz tarih alan terk edilince açıklayıcı hata metniyle işaretlenir
    - takvim düğmesi (alanın başında) Vuetify takvimini açar: Türkçe ay/gün
      adları, hafta pazartesi başlar
  Diğer tüm v-text-field özellikleri (label, hint, density…) iletilir.
    <EkDateField v-model="orderDate" label="Sipariş tarihi" />
-->
<template>
  <v-text-field
    v-bind="$attrs"
    :model-value="text"
    placeholder="GG.AA.YYYY"
    inputmode="numeric"
    autocomplete="off"
    maxlength="10"
    :error-messages="invalid ? [invalidText] : $attrs['error-messages'] as string[] | undefined"
    @update:model-value="onType"
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

const props = withDefaults(defineProps<{ modelValue?: string; invalidText?: string }>(), {
  modelValue: '',
  invalidText: 'Geçerli bir tarih girin (GG.AA.YYYY).',
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const attrs = useAttrs()

const open = ref(false)
const text = ref(isoToTr(props.modelValue))
const invalid = ref(false)
const labelSuffix = computed(() => (typeof attrs.label === 'string' ? `: ${attrs.label}` : ''))

watch(
  () => props.modelValue,
  (iso) => {
    if (iso !== trToIso(text.value)) text.value = isoToTr(iso)
    invalid.value = false
  },
)

function isoToTr(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
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

/** Yalnızca rakamları alır, 2. ve 4. rakamdan sonra nokta koyar. */
function mask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('.')
}

function onType(value: string) {
  text.value = mask(value ?? '')
  invalid.value = false
  const iso = trToIso(text.value)
  if (iso && iso !== props.modelValue) emit('update:modelValue', iso)
  if (!text.value && props.modelValue) emit('update:modelValue', '')
}

function commit() {
  invalid.value = !!text.value && !trToIso(text.value)
}

const pickerValue = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(props.modelValue)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
})

function onPick(value: unknown) {
  const date = value instanceof Date ? value : undefined
  if (!date) return
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  text.value = isoToTr(iso)
  invalid.value = false
  emit('update:modelValue', iso)
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
