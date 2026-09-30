<!--
  frontend/src/components/layout/ShellNoticeBanner.vue

  FE-CFG-2 (ADR-0031) — backoffice'ten yönetilen platform şeritleri: DUYURU (`announcement.*`) ve BAKIM
  (`maintenance.*`). Veri `stores/publicConfig.ts`, sunum modeli `shellNotice.ts`. Abonelik bandıyla
  (`ShellSubscriptionBanner`) aynı dil: üst barın altında tam genişlik, ton zemini + solda 3px ton çizgisi, ikon + başlık.

  - Duyuru: sakin; kapatılabilir (kapatma metnin özetine göre hatırlanır — aynı metin tekrar gösterilmez).
  - Bakım: kapatılamaz; uygulamayı KİLİTLEMEZ (yalnız bilgi verir).
  - Metin DÜZ metindir (`v-html` yok). Erişilebilirlik: bölge `aria-label` + metin `role=status` (polite).
  - `compact`: tek satır (odak modu), metin taşarsa … ile kesilir.
  Yalnız semantik token (ham renk yok → dark hazır).
-->
<template>
  <section
    class="ek-notice"
    :class="[`ek-notice--${model.tone}`, { 'is-compact': compact }]"
    :aria-label="model.title"
    :data-testid="`${model.kind}-banner`"
    :data-tone="model.tone"
  >
    <EkIconTile v-if="!compact" class="ek-notice__tile" :icon="model.icon" :tone="model.tone" size="sm" />
    <v-icon v-else class="ek-notice__icon" :icon="model.icon" aria-hidden="true" />

    <p class="ek-notice__text" role="status">
      <strong class="ek-notice__title">{{ model.title }}</strong>
      <span class="ek-notice__sep" aria-hidden="true">·</span>
      <span class="ek-notice__message">{{ model.text }}</span>
    </p>

    <EkTooltip v-if="model.dismissible" text="Duyuruyu kapat">
      <EkButton
        class="ek-notice__close"
        tone="ghost"
        size="sm"
        icon-only
        icon="mdi-close"
        aria-label="Duyuruyu kapat"
        data-testid="announcement-dismiss"
        @click="$emit('dismiss')"
      />
    </EkTooltip>
  </section>
</template>

<script setup lang="ts">
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import type { ShellNoticeModel } from './shellNotice'

withDefaults(defineProps<{ model: ShellNoticeModel; compact?: boolean }>(), { compact: false })
defineEmits<{ dismiss: [] }>()
</script>

<style scoped>
.ek-notice {
  --ek-notice-bg: var(--ek-color-info-subtle);
  --ek-notice-border: var(--ek-color-info-border);
  --ek-notice-accent: var(--ek-color-info);
  --ek-notice-ink: var(--ek-color-info-emphasis);
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: var(--ek-app-row-h);
  padding: var(--ek-space-1) var(--ek-space-3);
  background: var(--ek-notice-bg);
  border-bottom: 1px solid var(--ek-notice-border);
  box-shadow: inset 3px 0 0 var(--ek-notice-accent);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-notice--warning {
  --ek-notice-bg: var(--ek-color-warning-subtle);
  --ek-notice-border: var(--ek-color-warning-border);
  --ek-notice-accent: var(--ek-color-warning);
  --ek-notice-ink: var(--ek-color-warning-emphasis);
}

.ek-notice--error {
  --ek-notice-bg: var(--ek-color-error-subtle);
  --ek-notice-border: var(--ek-color-error-border);
  --ek-notice-accent: var(--ek-color-error);
  --ek-notice-ink: var(--ek-color-error-emphasis);
}

.ek-notice__tile {
  flex: 0 0 auto;
}

.ek-notice__icon {
  flex: 0 0 auto;
  font-size: var(--ek-icon-sm);
  color: var(--ek-notice-accent);
}

.ek-notice__text {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.ek-notice__title {
  color: var(--ek-notice-ink);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-notice__sep {
  margin: 0 var(--ek-space-2);
  color: var(--ek-notice-ink);
}

.ek-notice__close {
  flex: 0 0 auto;
  color: var(--ek-notice-ink);
}

.ek-notice.is-compact {
  min-height: var(--ek-control-h-sm);
  padding-top: 0;
  padding-bottom: 0;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-notice.is-compact .ek-notice__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Dar ekran: başlık kendi satırında, metin altında tam genişlikte akar; kapatma sağ üstte. */
@media (max-width: 767px) {
  .ek-notice:not(.is-compact) {
    align-items: flex-start;
    padding-top: var(--ek-space-2);
    padding-bottom: var(--ek-space-2);
  }

  .ek-notice:not(.is-compact) .ek-notice__title {
    display: block;
  }

  .ek-notice:not(.is-compact) .ek-notice__sep {
    display: none;
  }

  .ek-notice:not(.is-compact) .ek-notice__tile,
  .ek-notice:not(.is-compact) .ek-notice__close {
    margin-top: calc(var(--ek-space-1) * -1);
  }
}
</style>
