<!--
  frontend/src/components/layout/ConfirmationDialogComponent.vue

  Eski onay diyaloğu API'si — DS-v2 Aşama 2'de `EkDialog` kabuğuna taşındı
  (başlık bandı + ikon kapsülü · içerik · eylem çubuğu). Çağıranlar
  DEĞİŞMEDİ: props/olaylar/slot aynı. `color` artık yalnızca anlamı seçer
  (`dialogTone.ts`): tehlikeli renkler (danger/error…) → `tone="danger"`
  (üst error şeridi, error onay düğmesi, varsayılan odak Vazgeç).
  G-01: `message` düz metin ya da güvenli `MessagePart[]` — HTML KABUL ETMEZ.
-->
<template>
  <EkDialog
    :model-value="modelValue"
    :title="title"
    :description="subtitle"
    :icon="icon"
    :icon-tone="toneFromColor(color)"
    :tone="danger ? 'danger' : 'default'"
    width="sm"
    :max-width="maxWidth"
    :attach="attach"
    :persistent="persistent"
    :retain-focus="false"
    :confirm-label="confirmText || $t('common.confirm')"
    :confirm-icon="confirmIcon"
    :cancel-label="cancelText || $t('common.cancel')"
    :confirm-loading="loading"
    class="ek-confirmation-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
    @close="emit('cancel')"
  >
    <slot>
      <div class="ek-confirmation-dialog__message">
        <template v-if="Array.isArray(message)">
          <template v-for="(part, index) in message" :key="index">
            <br v-if="part.type === 'break'" />
            <b v-else-if="part.type === 'emphasis'">{{ part.text }}</b>
            <small v-else-if="part.type === 'note'">{{ part.text }}</small>
            <template v-else>{{ part.text }}</template>
          </template>
        </template>
        <template v-else>{{ message }}</template>
      </div>
    </slot>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkDialog } from '@entegrasyonik/ui/components'
import type { MessagePart } from './messageParts'
import { isDangerColor, toneFromColor } from './dialogTone'

interface Props {
  modelValue: boolean
  title?: string
  subtitle?: string
  /** Düz metin (her zaman metin olarak basılır) veya güvenli parça dizisi (kalın/satır sonu/not). HTML KABUL ETMEZ. */
  message?: string | MessagePart[]
  icon?: string
  confirmIcon?: string
  color?: string // 'danger', 'error', 'warning', 'info', 'success'
  confirmText?: string
  cancelText?: string
  /** Eski API — DS-v2'de Vazgeç her zaman ikincil (nötr çerçeveli); yok sayılır. */
  cancelColor?: string
  maxWidth?: string | number
  persistent?: boolean
  loading?: boolean
  attach?: string | boolean | Element
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'mdi-alert-octagon-outline',
  color: 'danger',
  persistent: true,
  cancelColor: undefined,
  loading: false,
  attach: false,
  title: '',
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const danger = computed(() => isDangerColor(props.color))
</script>

<style scoped>
.ek-confirmation-dialog__message {
  color: var(--ek-color-content-default);
}

.ek-confirmation-dialog__message small {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
</style>
