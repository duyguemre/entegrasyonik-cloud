<!--
  frontend/src/components/ds/EkConfirmDialog.vue

  ADR-0015 Karar 3.8/6.1 — onay diyaloğu, TEK KAYNAK (mevcut
  `ConfirmationDialogComponent`/`ActionDialogComponent`'in yeniden stillenmiş
  hâli — API BENZER, yeni ekranlar BUNU kullanır). 400px, başlık BİR SORU
  CÜMLESİDİR ("… silinsin mi?"), gövde sonucu açıklar, eylemler SAĞDA:
  Vazgeç · [Onayla]. Yıkıcı ise onay düğmesi `error` dolgu, etiketinde FİİL
  bulunur ("Sil"), varsayılan odak **Vazgeç** üzerindedir (yanlışlıkla
  yıkıcı eylemi tetiklememek için).

  Kullanım:
    <EkConfirmDialog
      v-model="showConfirm"
      title="'E2E Örnek Mağaza' silinsin mi?"
      description="Bu işlem geri alınamaz; mağazaya ait tüm veriler silinir."
      confirm-label="Sil"
      danger
      @confirm="handleDelete"
    />
-->
<template>
  <v-dialog v-model="isOpen" max-width="400" role="alertdialog">
    <v-card>
      <v-card-title class="ek-confirm-dialog__title">{{ title }}</v-card-title>
      <v-card-text v-if="description" class="ek-confirm-dialog__description">{{ description }}</v-card-text>
      <v-card-actions class="ek-confirm-dialog__actions">
        <v-spacer />
        <v-btn variant="outlined" autofocus @click="onCancel">
          {{ cancelLabel }}
        </v-btn>
        <v-btn :color="danger ? 'error' : 'primary'" :loading="loading" @click="onConfirm">
          {{ confirmLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /** Bir soru cümlesi: "'X' silinsin mi?" */
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    /** Yıkıcı eylem: onay düğmesi `error` dolgu olur. */
    danger?: boolean
    loading?: boolean
  }>(),
  {
    confirmLabel: 'Onayla',
    cancelLabel: 'Vazgeç',
    danger: false,
    loading: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

function onCancel() {
  emit('cancel')
  isOpen.value = false
}

function onConfirm() {
  emit('confirm')
}
</script>

<style scoped>
.ek-confirm-dialog__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-confirm-dialog__description {
  color: var(--ek-color-content-muted);
}

.ek-confirm-dialog__actions {
  padding: var(--ek-space-4);
}
</style>
