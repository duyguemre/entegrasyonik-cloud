<!--
  EkReasonDialog — gerekçe isteyen hassas işlem diyaloğu (ADR-0026 Karar 4.6; backoffice step-up + reason işlemleri).

  Sunumsal: API çağırmaz. Onayda kırpılmış gerekçeyi `confirm(reason)` ile verir; üst bileşen isteği yapar,
  `busy`/`error` ile geri bildirir. Gerekçe alanı `minLength`..`maxLength` (varsayılan 10..500) karakter; alt sınıra
  ulaşılmadan onay düğmesi kapalıdır ve kalan karakter sayısı ipucunda görünür (sayaç `aria-live` değil — ipucu
  alanı ekran okuyucuya `aria-describedby` ile bağlı).
  `stepUp` açıksa "yeniden doğrulama istenebilir" bilgisi gösterilir. `items` sonucu anlatan kısa maddelerdir
  (etki özeti). Varsayılan slot: gerekçenin ÜSTÜNE ek alanlar (ör. gün sayısı, hedef plan).

  Kullanım:
    <EkReasonDialog v-model="open" title="İş yeniden denensin mi?" :items="['İş kuyruğun başına alınır.']"
      confirm-label="Yeniden dene" step-up :busy="busy" :error="error" @confirm="run" />
-->
<template>
  <EkDialog
    v-model="isOpen"
    :title="title"
    :description="description"
    :icon="icon ?? (danger ? 'mdi-alert-outline' : 'mdi-shield-check-outline')"
    :tone="danger ? 'danger' : 'default'"
    :width="width"
    as-form
    :persistent="busy"
    :confirm-label="confirmLabel"
    :confirm-icon="confirmIcon"
    :confirm-loading="busy"
    :confirm-disabled="!valid || confirmDisabled"
    @confirm="submit"
    @cancel="emit('cancel')"
  >
    <div class="ek-reason">
      <ul v-if="items?.length" class="ek-reason__items" :class="{ 'is-danger': danger }">
        <li v-for="(item, i) in items" :key="i">
          <v-icon :icon="danger ? 'mdi-alert-circle-outline' : 'mdi-information-outline'" aria-hidden="true" />
          <span>{{ item }}</span>
        </li>
      </ul>
      <slot />
      <v-textarea
        v-model="reason"
        :label="reasonLabel"
        :placeholder="placeholder"
        rows="3"
        auto-grow
        :maxlength="maxLength"
        :counter="maxLength"
        :hint="hint"
        persistent-hint
        :error-messages="fieldError || undefined"
        :disabled="busy"
        autofocus
        data-testid="reason"
      />
      <p v-if="stepUp" class="ek-reason__stepup">
        <v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />
        Son 5 dakika içinde kimlik doğrulaması yapılmadıysa parola ve doğrulama kodu istenir.
      </p>
      <p v-if="error" class="ek-reason__error" role="alert">{{ error }}</p>
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EkDialog from './EkDialog.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    description?: string
    icon?: string
    /** Sonuç maddeleri (etki özeti). */
    items?: string[]
    confirmLabel?: string
    confirmIcon?: string
    /** Yıkıcı işlem: kırmızı ton, uyarı maddeleri. */
    danger?: boolean
    /** Adım-yükseltmesi bilgisi. */
    stepUp?: boolean
    busy?: boolean
    /** Sunucu/işlem hatası (sade dil). */
    error?: string | null
    /** Ek alanlar geçersizse onayı kapatır. */
    confirmDisabled?: boolean
    reasonLabel?: string
    placeholder?: string
    minLength?: number
    maxLength?: number
    width?: 'sm' | 'md' | 'lg'
  }>(),
  {
    confirmLabel: 'Onayla',
    danger: false,
    stepUp: false,
    busy: false,
    error: null,
    confirmDisabled: false,
    reasonLabel: 'Gerekçe',
    placeholder: 'ör. Destek kaydı DK-1234: müşteri talebi',
    minLength: 10,
    maxLength: 500,
    width: 'md',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [reason: string]
  cancel: []
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const reason = ref('')
const touched = ref(false)
const length = computed(() => reason.value.trim().length)
const valid = computed(() => length.value >= props.minLength && length.value <= props.maxLength)
const hint = computed(() =>
  length.value < props.minLength ? `En az ${props.minLength} karakter (${length.value}/${props.minLength}). Denetim kaydına yazılır.` : 'Denetim kaydına bu metin yazılır.',
)
const fieldError = computed(() => (touched.value && !valid.value && length.value > 0 ? `Gerekçe en az ${props.minLength} karakter olmalı.` : ''))

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reason.value = ''
      touched.value = false
    }
  },
)
watch(reason, () => (touched.value = true))

function submit() {
  if (!valid.value || props.busy || props.confirmDisabled) return
  emit('confirm', reason.value.trim())
}
</script>

<style scoped>
.ek-reason {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-reason__items {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-label-size);
  list-style: none;
}

.ek-reason__items.is-danger {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ek-reason__items li {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.ek-reason__items :deep(.v-icon) {
  margin-top: 1px;
  font-size: var(--ek-icon-sm);
}

.ek-reason__stepup {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-reason__stepup :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.ek-reason__error {
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}
</style>
