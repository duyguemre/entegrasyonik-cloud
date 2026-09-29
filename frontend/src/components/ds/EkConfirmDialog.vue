<!--
  frontend/src/components/ds/EkConfirmDialog.vue

  ADR-0015 Karar 3.8/6.1 — onay diyaloğu, TEK KAYNAK. DS-v2 (Aşama 2): `EkDialog`
  kabuğu (sm 440). Başlık BİR SORU CÜMLESİDİR ("… silinsin mi?"), açıklama
  sonucu anlatır, eylemler SAĞDA: Vazgeç · [Onayla]. Yıkıcıysa (`danger`) ikon
  kapsülü + üst şerit + onay düğmesi `error`, etikette FİİL bulunur ("Sil"),
  varsayılan odak **Vazgeç** üzerindedir (yanlışlıkla Enter ile silme yok).
  Varsayılan slot (isteğe bağlı) gövdeye ek bilgi koyar (ör. etkilenen kayıtlar).

  API geri uyumlu; yeni (isteğe bağlı): `icon`, `confirmIcon`, `attach`.
  Rol: `alertdialog` (onay isteyen kesinti — eski sürümle aynı).

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
  <EkDialog
    v-model="isOpen"
    role="alertdialog"
    :title="title"
    :description="description"
    :icon="resolvedIcon"
    :tone="danger ? 'danger' : 'default'"
    width="sm"
    :attach="attach"
    :confirm-label="confirmLabel"
    :confirm-icon="resolvedConfirmIcon"
    :cancel-label="cancelLabel"
    :confirm-loading="loading"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  >
    <template v-if="$slots.default" v-slot:default><slot /></template>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkDialog from './EkDialog.vue'

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
    icon?: string
    confirmIcon?: string
    attach?: string | boolean | Element
  }>(),
  {
    confirmLabel: 'Onayla',
    cancelLabel: 'Vazgeç',
    danger: false,
    loading: false,
    attach: false,
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

const resolvedIcon = computed(() => props.icon ?? (props.danger ? 'mdi-alert-octagon-outline' : 'mdi-help-circle-outline'))
const resolvedConfirmIcon = computed(() => props.confirmIcon)
</script>
