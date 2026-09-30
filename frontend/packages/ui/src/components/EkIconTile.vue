<!--
  frontend/src/components/ds/EkIconTile.vue

  DS-v2 — ikon kapsülü: yuvarlatılmış kare, açık ton zemin + ton rengi ikon.
  Kart başlığı, KPI kartı, menü/arama sonucu ve boş durumda AYNI biçimde
  kullanılır (tekrarlayan motif). Boyut ↔ ikon eşlemesi `iconTile` token'ı:
  sm 28/16 · md 36/18 · lg 44/24. Dekoratiftir (`aria-hidden`); anlamı
  yanındaki metin taşır.
-->
<template>
  <span class="ek-icon-tile" :class="[`ek-icon-tile--${tone}`, `ek-icon-tile--${size}`]" aria-hidden="true">
    <v-icon :icon="icon" class="ek-icon-tile__icon" />
  </span>
</template>

<script setup lang="ts">
export type EkTone = 'action' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand'

withDefaults(
  defineProps<{
    icon: string
    tone?: EkTone
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { tone: 'action', size: 'md' },
)
</script>

<style scoped>
.ek-icon-tile {
  --ek-tile-bg: var(--ek-color-action-subtle);
  --ek-tile-fg: var(--ek-color-action);
  --ek-tile-border: var(--ek-color-action-border);
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-tile-bg);
  color: var(--ek-tile-fg);
  box-shadow: inset 0 0 0 1px var(--ek-tile-border);
}

.ek-icon-tile__icon {
  font-size: var(--ek-icon-tile-md-icon);
}

.ek-icon-tile--sm {
  width: var(--ek-icon-tile-sm);
  height: var(--ek-icon-tile-sm);
}

.ek-icon-tile--sm .ek-icon-tile__icon {
  font-size: var(--ek-icon-tile-sm-icon);
}

.ek-icon-tile--lg {
  width: var(--ek-icon-tile-lg);
  height: var(--ek-icon-tile-lg);
  border-radius: var(--ek-radius-card);
}

.ek-icon-tile--lg .ek-icon-tile__icon {
  font-size: var(--ek-icon-tile-lg-icon);
}

.ek-icon-tile--success {
  --ek-tile-bg: var(--ek-color-success-subtle);
  --ek-tile-fg: var(--ek-color-success);
  --ek-tile-border: var(--ek-color-success-border);
}

.ek-icon-tile--warning {
  --ek-tile-bg: var(--ek-color-warning-subtle);
  --ek-tile-fg: var(--ek-color-warning);
  --ek-tile-border: var(--ek-color-warning-border);
}

.ek-icon-tile--error {
  --ek-tile-bg: var(--ek-color-error-subtle);
  --ek-tile-fg: var(--ek-color-error);
  --ek-tile-border: var(--ek-color-error-border);
}

.ek-icon-tile--info {
  --ek-tile-bg: var(--ek-color-info-subtle);
  --ek-tile-fg: var(--ek-color-info);
  --ek-tile-border: var(--ek-color-info-border);
}

.ek-icon-tile--neutral {
  --ek-tile-bg: var(--ek-color-neutral-subtle);
  --ek-tile-fg: var(--ek-color-neutral);
  --ek-tile-border: var(--ek-color-neutral-border);
}

/* Light'ta brand = chrome (aynı lacivert, değişmedi); dark'ta brand açık tondur → marka karosu krom zeminde kalır (AA). */
.ek-icon-tile--brand {
  --ek-tile-bg: var(--ek-color-chrome);
  --ek-tile-fg: var(--ek-color-chrome-text);
  --ek-tile-border: var(--ek-color-chrome);
}
</style>
