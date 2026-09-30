<!--
  frontend/src/components/ds/EkToastHost.vue

  ADR-0015 Karar 6.1 + Aşama 6b (Standart 1) — TEK toast konteyneri (App.vue, tek örnek; uygulama geneli olduğu için
  çalışma alanı sekmesinin DIŞINDA). `useToast()` durumunu çizer; eski snackbar çağrıları da buraya düşer.
  Görünüm: yüzey kart + 3px ton şeridi + ton ikon kapsülü · [başlık] ileti · [eylem] · × · alt kenarda süre çizgisi.
  Tonlar EkAlert/EkProblemState ile AYNI (info/success/warning/error). Üzerine gelince/odakta süre durur.
  Konum: sağ alt (mobilde alt, tam genişlik). Erişilebilirlik: kap `aria-live=polite`; hata toast'ı `role=alert`.
  Hareket: opaklık + 8px kayma (`--ek-duration-base`); `prefers-reduced-motion` → yok.
-->
<template>
  <div class="ek-toast-host" aria-live="polite" aria-relevant="additions">
    <TransitionGroup name="ek-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="ek-toast"
        :class="`ek-toast--${toast.tone}`"
        :role="toast.tone === 'error' ? 'alert' : 'status'"
        @mouseenter="pauseToast(toast.id)"
        @mouseleave="resumeToast(toast.id)"
        @focusin="pauseToast(toast.id)"
        @focusout="resumeToast(toast.id)"
      >
        <span class="ek-toast__icon" aria-hidden="true"><v-icon :icon="TONE_ICONS[toast.tone]" /></span>
        <div class="ek-toast__body">
          <p v-if="toast.title" class="ek-toast__title">{{ toast.title }}</p>
          <p class="ek-toast__message">{{ toast.message }}</p>
          <button v-if="toast.actionLabel" type="button" class="ek-toast__action" @click="onAction(toast)">
            {{ toast.actionLabel }}
          </button>
        </div>
        <button type="button" class="ek-toast__close" aria-label="Bildirimi kapat" @click="dismissToast(toast.id)">
          <v-icon :icon="icons.close" aria-hidden="true" />
        </button>
        <span v-if="toast.timeout > 0" :ref="(el) => bindTimer(toast, el as HTMLElement | null)" class="ek-toast__timer" aria-hidden="true"></span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useToast, type Toast, type ToastTone } from '@/composables/useToast'
import { icons } from '@/design/icons'

const { toasts, dismissToast, pauseToast, resumeToast } = useToast()

const TONE_ICONS: Record<ToastTone, string> = {
  success: 'mdi-check-circle-outline',
  info: 'mdi-information-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-circle-outline',
}

// Süre çizgisi: Web Animations (satır içi stil yok); duraklatma toast durumunu izler.
const timers = new Map<number, Animation>()
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function bindTimer(toast: Toast, el: HTMLElement | null) {
  if (!el) {
    timers.get(toast.id)?.cancel()
    timers.delete(toast.id)
    return
  }
  let anim = timers.get(toast.id)
  if (!anim && !reduced && el.animate) {
    anim = el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: toast.timeout, fill: 'forwards' })
    timers.set(toast.id, anim)
  }
  if (anim) toast.paused ? anim.pause() : anim.play()
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
  z-index: var(--ek-z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: 380px;
  max-width: calc(100vw - var(--ek-space-6) * 2);
  pointer-events: none;
}

@media (max-width: 599px) {
  .ek-toast-host {
    right: var(--ek-space-3);
    left: var(--ek-space-3);
    bottom: var(--ek-space-3);
    width: auto;
    max-width: none;
  }
}

.ek-toast {
  --ek-toast-accent: var(--ek-color-info);
  --ek-toast-subtle: var(--ek-color-info-subtle);
  --ek-toast-emphasis: var(--ek-color-info-emphasis);
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-left: 3px solid var(--ek-toast-accent);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
  color: var(--ek-color-content-default);
  overflow: hidden;
  pointer-events: auto;
}

.ek-toast--success { --ek-toast-accent: var(--ek-color-success); --ek-toast-subtle: var(--ek-color-success-subtle); --ek-toast-emphasis: var(--ek-color-success-emphasis); }
.ek-toast--warning { --ek-toast-accent: var(--ek-color-warning); --ek-toast-subtle: var(--ek-color-warning-subtle); --ek-toast-emphasis: var(--ek-color-warning-emphasis); }
.ek-toast--error { --ek-toast-accent: var(--ek-color-error); --ek-toast-subtle: var(--ek-color-error-subtle); --ek-toast-emphasis: var(--ek-color-error-emphasis); }

.ek-toast__icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-icon-tile-sm);
  height: var(--ek-icon-tile-sm);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-toast-subtle);
  color: var(--ek-toast-emphasis);
  font-size: var(--ek-icon-sm);
}

.ek-toast__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 3px;
}

.ek-toast__title {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-toast__message {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
  overflow-wrap: anywhere;
}

.ek-toast__action {
  align-self: flex-start;
  margin-top: var(--ek-space-1);
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-action);
  cursor: pointer;
  border-radius: var(--ek-radius-sm);
}

.ek-toast__close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  margin: calc(var(--ek-space-1) * -1) 0 0;
  border: none;
  border-radius: var(--ek-radius-control);
  background: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-toast__close:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ek-toast__action:focus-visible,
.ek-toast__close:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-toast__timer {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: var(--ek-toast-accent);
  opacity: 0.55;
  transform-origin: left center;
}

.ek-toast-enter-active,
.ek-toast-leave-active {
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard), transform var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-toast-enter-from,
.ek-toast-leave-to {
  opacity: 0;
  transform: translateY(var(--ek-motion-distance-md, 8px));
}

@media (prefers-reduced-motion: reduce) {
  .ek-toast-enter-active,
  .ek-toast-leave-active { transition: none; }
  .ek-toast__timer { display: none; }
}
</style>
