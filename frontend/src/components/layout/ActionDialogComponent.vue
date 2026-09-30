<!--
  frontend/src/components/layout/ActionDialogComponent.vue

  Eski "işlem/form/detay" diyaloğu API'si — DS-v2 Aşama 2'de `EkDialog`
  kabuğuna taşındı (başlık bandı + ikon kapsülü · [ipucu notu] · içerik ·
  eylem çubuğu). Çağıranlar DEĞİŞMEDİ: props/olaylar/slot aynı.
    - `color` yalnızca ikon kapsülünün ANLAM tonunu seçer (`dialogTone.ts`).
    - `confirmButtomColor` tehlikeli bir renkse onay düğmesi `danger` olur;
      aksi hâlde onay her zaman birincil (tek vurgu rengi kuralı).
    - Vazgeç/Temizle düğmesi eskisi gibi yalnızca `cancel` yayar (diyaloğu
      KENDİSİ kapatmaz — filtre "Temizle" akışları buna dayanıyor); × düğmesi
      `close` + `update:modelValue(false)` yayar.
    - Onay düğmesinin kendisi "Kapat" ise başlıktaki × gizlenir (aynı adlı iki
      düğme olmasın — erişilebilir ad çakışması).
    - `attach` noktasız verilse de sekme kabı sınıfı olarak çözülür (EkDialog).
-->
<template>
  <EkDialog
    :model-value="modelValue"
    :title="title"
    :description="subtitle || undefined"
    :icon="icon"
    :icon-tone="toneFromColor(color)"
    :tone="isDangerColor(confirmButtomColor) ? 'danger' : 'default'"
    :max-width="maxWidth"
    :attach="attach || false"
    persistent
    :retain-focus="false"
    :hide-actions="!showFooter"
    :hide-cancel="hideCancel"
    :hide-close="confirmIsClose"
    :cancel-closes="false"
    :confirm-label="confirmText"
    :cancel-label="cancelText"
    :confirm-disabled="isConfirmDisabled"
    :confirm-loading="isLoading || loading"
    class="ek-action-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
    @close="emit('close')"
  >
    <div v-if="hint" class="ek-action-dialog__hint">
      <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
      <span>{{ hint }}</span>
    </div>
    <slot></slot>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkDialog from '@/components/ds/EkDialog.vue'
import { isDangerColor, toneFromColor } from './dialogTone'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: 'Toplu İşlem Merkezi' },
  icon: { type: String, default: 'mdi-view-dashboard-outline' },
  color: { type: String, default: 'primary' },
  confirmButtomColor: { type: String, default: 'primary' },
  hint: { type: String, default: '' },
  maxWidth: { type: [String, Number], default: 580 },
  attach: { type: String, default: '' },
  showFooter: { type: Boolean, default: true },
  hideCancel: { type: Boolean, default: false },
  cancelText: { type: String, default: 'Temizle' },
  confirmText: { type: String, default: 'İşlemi Başlat' },
  isConfirmDisabled: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel', 'close', 'change'])

const confirmIsClose = computed(() => props.showFooter && props.confirmText.trim().toLocaleLowerCase('tr-TR') === 'kapat')
</script>

<style scoped>
.ek-action-dialog__hint {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: var(--ek-space-2) 0 var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-action-dialog__hint .v-icon {
  margin-top: 1px;
  color: var(--ek-color-info);
}
</style>
