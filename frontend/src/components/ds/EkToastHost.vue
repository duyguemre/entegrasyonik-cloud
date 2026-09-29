<!--
  frontend/src/components/ds/EkToastHost.vue

  ADR-0015 Karar 6.1 — TEK toast konteyneri; `useToast()`'un paylaşılan
  durumunu render eder. Kabukta (`SecureLayout`, A3) TEK ÖRNEK olarak
  eklenir — bu görev yalnızca bileşeni hazırlar, kabuğa BAĞLAMAZ.

  Konum: sağ alt (mobilde alt orta — CSS media query). `aria-live="polite"`
  (hata `assertive`, `role="alert"`). Ton `success/info/warning/error`
  (`status-map.ts` renkleriyle AYNI, `neutral` toast'ta YOK).

  Kullanım (A3'te kabuğa eklenecek):
    <EkToastHost />
-->
<template>
  <div class="ek-toast-host">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="ek-toast"
      :class="`ek-toast--${toast.tone}`"
      role="alert"
      :aria-live="toast.tone === 'error' ? 'assertive' : 'polite'"
    >
      <v-icon :icon="toneIcon(toast.tone)" size="18" aria-hidden="true" />
      <span class="ek-toast__message">{{ toast.message }}</span>
      <button v-if="toast.actionLabel" type="button" class="ek-toast__action" @click="onAction(toast)">
        {{ toast.actionLabel }}
      </button>
      <button type="button" class="ek-toast__close" aria-label="Kapat" @click="dismissToast(toast.id)">
        <v-icon icon="mdi-close" size="16" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast, type Toast, type ToastTone } from '@/composables/useToast'

const { toasts, dismissToast } = useToast()

const TONE_ICONS: Record<ToastTone, string> = {
  success: 'mdi-check-circle-outline',
  info: 'mdi-information-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-circle-outline',
}

function toneIcon(tone: ToastTone): string {
  return TONE_ICONS[tone]
}

function onAction(toast: Toast) {
  toast.onAction?.()
  dismissToast(toast.id)
}
</script>

<style scoped>
.ek-toast-host {
  position: fixed;
  right: var(--ek-space-6);
  bottom: var(--ek-space-6);
  z-index: 2400;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: 360px;
  max-width: calc(100vw - var(--ek-space-6) * 2);
}

@media (max-width: 767px) {
  .ek-toast-host {
    right: 50%;
    transform: translateX(50%);
    bottom: var(--ek-space-4);
    width: calc(100vw - var(--ek-space-4) * 2);
  }
}

.ek-toast {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  box-shadow: var(--ek-shadow-lg);
  color: var(--ek-color-content-strong);
}

.ek-toast--success {
  color: var(--ek-color-success);
}
.ek-toast--info {
  color: var(--ek-color-info);
}
.ek-toast--warning {
  color: var(--ek-color-warning);
}
.ek-toast--error {
  color: var(--ek-color-error);
}

.ek-toast__message {
  flex: 1 1 auto;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-strong);
}

.ek-toast__action {
  flex: none;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.ek-toast__close {
  flex: none;
  display: inline-flex;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ek-color-content-muted);
  padding: 0;
}
</style>
