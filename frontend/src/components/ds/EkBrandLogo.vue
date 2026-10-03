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
  kararıdır (ADR-0015 Açık Soru 1); S15: site ile ortak özgün "E" monogramı.
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
      <rect class="ek-brand-logo__tile" x="0" y="0" width="32" height="32" rx="9"></rect>
      <circle class="ek-brand-logo__halo" cx="18.5" cy="16" r="5"></circle>
      <path class="ek-brand-logo__stroke" d="M20 9.5H13C10.8 9.5 9.5 10.8 9.5 13V19C9.5 21.2 10.8 22.5 13 22.5H20M9.5 16H15.5"></path>
      <circle class="ek-brand-logo__hub" cx="18.5" cy="16" r="3"></circle>
      <circle class="ek-brand-logo__node" cx="22" cy="9.5" r="2.25"></circle>
      <circle class="ek-brand-logo__node" cx="22" cy="22.5" r="2.25"></circle>
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

.ek-brand-logo__halo {
  fill: var(--ek-color-secondary);
  opacity: 0.22;
}

.ek-brand-logo__stroke {
  fill: none;
  stroke: var(--ek-color-background);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ek-brand-logo--inverse .ek-brand-logo__stroke {
  stroke: var(--ek-color-primary);
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
