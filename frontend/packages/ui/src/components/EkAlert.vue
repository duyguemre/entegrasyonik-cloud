<!--
  frontend/src/components/ds/EkAlert.vue

  DS-v2 Aşama 6b — Standart 1: TEK SATIR İÇİ UYARI / BİLGİ BANDI (ham `v-alert` yerine). Dört ton, tek görünüm:
      ▌[ikon] Başlık                                   [#actions] [×]
      ▌       Metin (varsayılan slot ya da `text`)
  Ton = anlam: info (bilgi/işleniyor) · success (tamamlandı) · warning (dikkat, işlem kısıtlı) · error (başarısız).
  Zemin ton `subtle`, 3px sol şerit ton rengi, metin `content-strong`/`content-default` (AA). Renk tek başına anlam
  taşımaz: ikon + başlık her zaman var. `role`: error/warning → `alert` (yalnız `live` ile), aksi `status`.

    <EkAlert tone="warning" title="Platform ile fark var" text="…"><template #actions>…</template></EkAlert>
-->
<template>
  <div class="ek-alert" :class="[`ek-alert--${tone}`, { 'ek-alert--dense': dense }]" :role="live ? (tone === 'error' || tone === 'warning' ? 'alert' : 'status') : undefined">
    <v-icon class="ek-alert__icon" :icon="icon ?? TONE_ICON[tone]" aria-hidden="true" />
    <div class="ek-alert__body">
      <p v-if="title" class="ek-alert__title">{{ title }}</p>
      <div v-if="text || $slots.default" class="ek-alert__text"><slot>{{ text }}</slot></div>
    </div>
    <div v-if="$slots.actions" class="ek-alert__actions"><slot name="actions" /></div>
    <EkButton v-if="dismissible" class="ek-alert__close" tone="ghost" size="sm" :icon="icons.close" icon-only aria-label="Uyarıyı kapat" @click="emit('dismiss')" />
  </div>
</template>

<script setup lang="ts">
import EkButton from './EkButton.vue'
import { icons } from '../icons'

export type EkAlertTone = 'info' | 'success' | 'warning' | 'error'

withDefaults(
  defineProps<{
    tone?: EkAlertTone
    title?: string
    text?: string
    icon?: string
    dense?: boolean
    dismissible?: boolean
    /** Ekran okuyucuya anında duyur (dinamik olarak beliren uyarılar). */
    live?: boolean
  }>(),
  { tone: 'info', dense: false, dismissible: false, live: false },
)

const emit = defineEmits<{ dismiss: [] }>()

const TONE_ICON: Record<EkAlertTone, string> = {
  info: 'mdi-information-outline',
  success: 'mdi-check-circle-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-circle-outline',
}
</script>

<style scoped>
.ek-alert {
  --ek-alert-bg: var(--ek-color-info-subtle);
  --ek-alert-border: var(--ek-color-info-border);
  --ek-alert-accent: var(--ek-color-info);
  --ek-alert-emphasis: var(--ek-color-info-emphasis);
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-alert-border);
  border-left: 3px solid var(--ek-alert-accent);
  border-radius: var(--ek-radius-control);
  background: var(--ek-alert-bg);
  color: var(--ek-color-content-default);
}

.ek-alert--success { --ek-alert-bg: var(--ek-color-success-subtle); --ek-alert-border: var(--ek-color-success-border); --ek-alert-accent: var(--ek-color-success); --ek-alert-emphasis: var(--ek-color-success-emphasis); }
.ek-alert--warning { --ek-alert-bg: var(--ek-color-warning-subtle); --ek-alert-border: var(--ek-color-warning-border); --ek-alert-accent: var(--ek-color-warning); --ek-alert-emphasis: var(--ek-color-warning-emphasis); }
.ek-alert--error { --ek-alert-bg: var(--ek-color-error-subtle); --ek-alert-border: var(--ek-color-error-border); --ek-alert-accent: var(--ek-color-error); --ek-alert-emphasis: var(--ek-color-error-emphasis); }

.ek-alert--dense {
  padding: var(--ek-space-2) var(--ek-space-3);
  gap: var(--ek-space-2);
}

.ek-alert__icon {
  flex: none;
  font-size: var(--ek-icon-md);
  color: var(--ek-alert-emphasis);
  margin-top: 1px;
}

.ek-alert__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-alert__title {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-alert-emphasis);
}

.ek-alert__text {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
  overflow-wrap: anywhere;
}

.ek-alert__text :deep(p) {
  margin: 0;
}

.ek-alert__actions {
  flex: none;
  display: flex;
  gap: var(--ek-space-2);
  align-items: center;
  align-self: center;
}

.ek-alert__close {
  flex: none;
  margin: calc(var(--ek-space-1) * -1) calc(var(--ek-space-2) * -1) 0 0;
}

@media (max-width: 599px) {
  .ek-alert {
    flex-wrap: wrap;
  }

  .ek-alert__actions {
    flex-basis: 100%;
    justify-content: flex-end;
  }
}

/* FE-LOCAL-1053 — uygulamanın tasarım diliyle: sol kalın şerit yok; tonun ince çerçevesi dört kenarda, kutu köşesi. */
.ek-alert {
  border-left: 1px solid var(--ek-alert-border);
  border-radius: var(--ek-radius-tile);
}
</style>
