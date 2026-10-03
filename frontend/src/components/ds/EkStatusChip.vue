<!--
  frontend/src/components/ds/EkStatusChip.vue

  ADR-0015 Karar 3.3/6.1 — durum rozeti, TEK KAYNAK. Ekranlar renk SEÇMEZ,
  yalnızca `tone` + `label` verir (çıplak `v-chip` + renk YASAKTIR — Karar
  6.1 "Durum rozeti" satırı). `tone`, `status-map.ts`'teki 5 anlamsal tondan
  biridir; `label` çağıran tarafından `$t(entry.labelKey)` ile çözülür (bu
  bileşen i18n'i KENDİSİ yapmaz — saf sunum bileşeni, test edilebilirlik).

  Görünüm: `subtle` zemin + ton metni, 20px yükseklik, xs 12/500, radius-full,
  isteğe bağlı 6px nokta. **Dolgu (solid) rozet yalnızca "yeni/okunmamış"
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
    <span v-if="dot" class="ek-status-chip__dot" aria-hidden="true"></span>
    {{ label }}
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
  align-items: center;
  gap: var(--ek-space-1);
  height: 20px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.ek-status-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-full);
  background-color: currentColor;
  flex: none;
}

/* ---- subtle (varsayılan): zemin = *-subtle token, metin = çekirdek ton ---- */
.ek-status-chip--subtle.ek-status-chip--success {
  background-color: var(--ek-color-success-subtle);
  color: var(--ek-color-success);
}
.ek-status-chip--subtle.ek-status-chip--warning {
  background-color: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning);
}
.ek-status-chip--subtle.ek-status-chip--danger {
  background-color: var(--ek-color-error-subtle);
  color: var(--ek-color-error);
}
.ek-status-chip--subtle.ek-status-chip--info {
  background-color: var(--ek-color-info-subtle);
  color: var(--ek-color-info);
}
.ek-status-chip--subtle.ek-status-chip--neutral {
  background-color: var(--ek-color-neutral-subtle);
  color: var(--ek-color-neutral);
}

/* ---- solid: yalnızca "yeni/okunmamış" sayaçları (Karar 3.3) ---- */
.ek-status-chip--solid {
  color: var(--ek-color-background);
}
.ek-status-chip--solid.ek-status-chip--success {
  background-color: var(--ek-color-success);
}
.ek-status-chip--solid.ek-status-chip--warning {
  background-color: var(--ek-color-warning);
}
.ek-status-chip--solid.ek-status-chip--danger {
  background-color: var(--ek-color-error);
}
.ek-status-chip--solid.ek-status-chip--info {
  background-color: var(--ek-color-info);
}
.ek-status-chip--solid.ek-status-chip--neutral {
  background-color: var(--ek-color-neutral);
}
</style>
