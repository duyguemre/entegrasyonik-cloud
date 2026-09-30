<!--
  frontend/src/components/ds/EkStatusChip.vue

  ADR-0015 Karar 3.3/6.1 — durum rozeti, TEK KAYNAK. Ekranlar renk SEÇMEZ,
  yalnızca `tone` + `label` verir (çıplak `v-chip` + renk YASAKTIR — Karar
  6.1 "Durum rozeti" satırı). `tone`, `status-map.ts`'teki 5 anlamsal tondan
  biridir; `label` çağıran tarafından `$t(entry.labelKey)` ile çözülür (bu
  bileşen i18n'i KENDİSİ yapmaz — saf sunum bileşeni, test edilebilirlik).

  Görünüm (Aşama 5 — premium çip dili, TÜM çiplerle ortak): `subtle` zemin + 1px `*-border` kenarlık +
  `*-emphasis` metin (AA), `--ek-app-chip-h-sm` (22px) yükseklik, caption 12/16 yarı kalın, hap yarıçap,
  isteğe bağlı 6px nokta veya 14px ikon (optik ortalı). **Dolgu (solid) rozet yalnızca "yeni/okunmamış"
  sayaçlarında** kullanılır (`variant="solid"`). Renk tek başına anlam
  taşımaz; `label` HER ZAMAN metin olarak görünür (WCAG 1.4.1).

  Kullanım:
    <EkStatusChip :tone="entry.tone" :label="$t(entry.labelKey)" />
    <EkStatusChip tone="danger" label="3 yeni" variant="solid" />
    <EkStatusChip tone="info" label="İşleniyor" :dot="true" />

  `status-map.ts` ile birlikte örnek uçtan uca akış:
    import { ORDER_STATUS_TONE } from '@/design/status-map'
    const entry = ORDER_STATUS_TONE[order.internalStatus]
    <EkStatusChip :tone="entry.tone" :label="$t(entry.labelKey)" />
-->
<template>
  <span
    class="ek-status-chip"
    :class="[`ek-status-chip--${tone}`, `ek-status-chip--${variant}`]"
  >
    <v-icon v-if="icon" class="ek-status-chip__icon" :icon="icon" aria-hidden="true" />
    <span v-else-if="dot" class="ek-status-chip__dot" aria-hidden="true"></span>
    <span class="ek-status-chip__label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import type { StatusTone } from '@/design/status-map'

withDefaults(
  defineProps<{
    tone: StatusTone
    label: string
    /** Dolgu (solid) yalnızca "yeni/okunmamış" sayaçları içindir (Karar 3.3). */
    variant?: 'subtle' | 'solid'
    dot?: boolean
    /** Başta 14px ikon (MDI); verilirse nokta yerine çizilir. */
    icon?: string
  }>(),
  {
    variant: 'subtle',
    dot: false,
  },
)
</script>

<style scoped>
.ek-status-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  height: var(--ek-app-chip-h-sm);
  padding: 0 var(--ek-space-2);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
}

.ek-status-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-full);
  background-color: currentColor;
  flex: none;
}

.ek-status-chip__icon {
  flex: none;
  margin-left: -2px;
  font-size: var(--ek-icon-xs);
}

/* ---- subtle (varsayılan): zemin *-subtle, kenarlık *-border, metin *-emphasis (AA) ---- */
.ek-status-chip--subtle.ek-status-chip--success {
  background-color: var(--ek-color-success-subtle);
  border-color: var(--ek-color-success-border);
  color: var(--ek-color-success-emphasis);
}
.ek-status-chip--subtle.ek-status-chip--warning {
  background-color: var(--ek-color-warning-subtle);
  border-color: var(--ek-color-warning-border);
  color: var(--ek-color-warning-emphasis);
}
.ek-status-chip--subtle.ek-status-chip--danger {
  background-color: var(--ek-color-error-subtle);
  border-color: var(--ek-color-error-border);
  color: var(--ek-color-error-emphasis);
}
.ek-status-chip--subtle.ek-status-chip--info {
  background-color: var(--ek-color-info-subtle);
  border-color: var(--ek-color-info-border);
  color: var(--ek-color-info-emphasis);
}
.ek-status-chip--subtle.ek-status-chip--neutral {
  background-color: var(--ek-color-neutral-subtle);
  border-color: var(--ek-color-neutral-border);
  color: var(--ek-color-neutral-emphasis);
}

/* ---- solid: yalnızca "yeni/okunmamış" sayaçları (Karar 3.3) ---- */
.ek-status-chip--solid.ek-status-chip--success {
  background-color: var(--ek-color-success);
  border-color: var(--ek-color-success);
  color: var(--ek-color-success-contrast);
}
.ek-status-chip--solid.ek-status-chip--warning {
  background-color: var(--ek-color-warning);
  border-color: var(--ek-color-warning);
  color: var(--ek-color-warning-contrast);
}
.ek-status-chip--solid.ek-status-chip--danger {
  background-color: var(--ek-color-error);
  border-color: var(--ek-color-error);
  color: var(--ek-color-error-contrast);
}
.ek-status-chip--solid.ek-status-chip--info {
  background-color: var(--ek-color-info);
  border-color: var(--ek-color-info);
  color: var(--ek-color-info-contrast);
}
.ek-status-chip--solid.ek-status-chip--neutral {
  background-color: var(--ek-color-neutral);
  border-color: var(--ek-color-neutral);
  color: var(--ek-color-neutral-contrast);
}
</style>
