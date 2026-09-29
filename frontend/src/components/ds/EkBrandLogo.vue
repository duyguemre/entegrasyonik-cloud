<!--
  frontend/src/components/ds/EkBrandLogo.vue

  ADR-0015 Karar 1.4 — uygulamanın ürün logosu; sitenin işaret+kelime
  markasıyla AYNI geometri (`src/design/brand/logo-mark.svg`, drift testiyle
  `site/src/components/Logo.astro`'ya kilitli — tests/theme/logo-drift.test.ts).

  Kullanım:
    <EkBrandLogo />                          — tam (işaret + "Entegrasyonik")
    <EkBrandLogo variant="mark" />           — yalnız işaret (ör. kenar menü ray modu)
    <EkBrandLogo tone="inverse" />           — koyu zemin üzerinde (ör. giriş paneli)
    <EkBrandLogo :size="20" />               — işaret piksel boyutu (varsayılan 32)

  Erişilebilirlik: kök `role="img"` + `aria-label="Entegrasyonik"` taşır;
  içteki SVG dekoratiftir (`aria-hidden`). Nihai logo/renk uyumu insan
  kararıdır (ADR-0015 Açık Soru 1); bugün site ile ortak yer tutucu kullanılır.
-->
<template>
  <span class="ek-brand-logo" :class="`ek-brand-logo--${tone}`" role="img" aria-label="Entegrasyonik">
    <svg
      class="ek-brand-logo__mark"
      :width="size"
      :height="size"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect class="ek-brand-logo__tile" x="0" y="0" width="32" height="32" rx="8"></rect>
      <circle class="ek-brand-logo__hub" cx="16" cy="16" r="5"></circle>
      <circle class="ek-brand-logo__node" cx="16" cy="6.5" r="2.5"></circle>
      <circle class="ek-brand-logo__node" cx="24.2" cy="20.8" r="2.5"></circle>
      <circle class="ek-brand-logo__node" cx="7.8" cy="20.8" r="2.5"></circle>
    </svg>
    <span v-if="variant === 'full'" class="ek-brand-logo__word">Entegrasyonik</span>
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'default' | 'inverse'
    variant?: 'full' | 'mark'
    size?: number
  }>(),
  {
    tone: 'default',
    variant: 'full',
    size: 32,
  },
)
</script>

<style scoped>
.ek-brand-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-primary);
}

.ek-brand-logo--inverse {
  color: var(--ek-color-background);
}

.ek-brand-logo__mark {
  flex: none;
}

.ek-brand-logo__tile {
  fill: var(--ek-color-primary);
}

.ek-brand-logo--inverse .ek-brand-logo__tile {
  fill: var(--ek-color-background);
}

.ek-brand-logo__hub {
  fill: var(--ek-color-secondary);
}

.ek-brand-logo__node {
  fill: var(--ek-color-background);
}

.ek-brand-logo--inverse .ek-brand-logo__node {
  fill: var(--ek-color-primary);
}

.ek-brand-logo__word {
  font-size: var(--ek-font-size-xl);
  font-weight: var(--ek-font-weight-bold);
  line-height: 1;
  white-space: nowrap;
}
</style>
