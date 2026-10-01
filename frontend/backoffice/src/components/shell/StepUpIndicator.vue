<!--
  StepUpIndicator — üst bardaki adım-yükseltmesi (step-up) durumu (ADR-0026 Karar 4.6). Hassas işlemler son 5 dakika
  içinde parola + doğrulama kodu ister. Doğrulanmışsa kalan süre (dd:ss) yeşil; değilse kilit. Menüden önceden
  "Şimdi doğrula" (işlem sırasında diyalogla kesilmemek için).
-->
<template>
  <v-menu location="bottom end" :offset="6">
    <template #activator="{ props: menu }">
      <button
        v-bind="menu"
        type="button"
        class="bo-stepup"
        :class="{ 'is-active': active }"
        :aria-label="active ? `Hassas işlemler açık, ${remainingText} kaldı` : 'Hassas işlemler kilitli — kimlik doğrulama gerekir'"
        data-testid="stepup-indicator"
      >
        <v-icon :icon="active ? 'mdi-shield-check' : 'mdi-shield-lock-outline'" aria-hidden="true" />
        <span v-if="!compact" class="bo-stepup__text">{{ active ? `Doğrulandı · ${remainingText}` : 'Hassas işlemler kilitli' }}</span>
        <span v-else-if="active" class="bo-stepup__text ek-num">{{ remainingText }}</span>
      </button>
    </template>
    <div class="bo-stepup-menu">
      <p class="bo-stepup-menu__title">{{ active ? 'Hassas işlemler açık' : 'Hassas işlemler kilitli' }}</p>
      <p class="bo-stepup-menu__text">
        Geçici erişim, iş yeniden deneme, plan değişikliği ve yönetici işlemleri son 5 dakika içinde parola ve
        doğrulama koduyla kimlik doğrulaması ister.
      </p>
      <p v-if="active" class="bo-stepup-menu__text">Doğrulama <strong class="ek-num">{{ remainingText }}</strong> sonra sona erer.</p>
      <EkButton v-else tone="primary" size="sm" icon="mdi-shield-key-outline" block @click="verifyNow">Şimdi doğrula</EkButton>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { session } from '@bo/auth/session'
import { requestReauth } from '@bo/auth/reauth'

defineProps<{ compact?: boolean }>()

const WINDOW_MS = 5 * 60 * 1000
const now = ref(Date.now())
const reauthAt = computed(() => (session.state.user?.reauthAt ? Date.parse(session.state.user.reauthAt) : 0))
const remaining = computed(() => Math.max(0, reauthAt.value + WINDOW_MS - now.value))
const active = computed(() => remaining.value > 0)
const remainingText = computed(() => {
  const s = Math.ceil(remaining.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

// Saniyelik sayaç yalnız pencere açıkken çalışır.
let timer: ReturnType<typeof setInterval> | undefined
watch(
  reauthAt,
  () => {
    now.value = Date.now()
    clearInterval(timer)
    if (active.value)
      timer = setInterval(() => {
        now.value = Date.now()
        if (!active.value) clearInterval(timer)
      }, 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(timer))

async function verifyNow() {
  if (await requestReauth()) await session.refresh()
}
</script>

<style scoped>
.bo-stepup {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-full);
  background: transparent;
  color: var(--ek-color-chrome-text-muted);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-stepup .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-stepup:hover {
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
}

.bo-stepup:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: 1px;
}

.bo-stepup.is-active {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.bo-stepup__text {
  font-variant-numeric: tabular-nums;
}

.bo-stepup-menu {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: 300px;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
}

.bo-stepup-menu__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-stepup-menu__text {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.bo-stepup-menu__text strong {
  color: var(--ek-color-content-strong);
}

/* MOB-06: telefonda görsel hap 32 px kalır, dokunma alanı 44 px (görünmez ::after). */
@media (max-width: 599.98px) {
  .bo-stepup {
    position: relative;
    height: 32px;
    margin-inline: 2px;
    padding: 0 var(--ek-space-2);
  }

  .bo-stepup::after {
    content: '';
    position: absolute;
    inset: -6px -4px;
  }
}
</style>
