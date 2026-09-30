<!--
  frontend/src/components/ds/EkBrandLoader.vue

  DS-v2 Aşama 6b — Standart 8: ENTEGRASYONİK YÜKLEME İŞARETİ. Logo geometrisinden (EkBrandLogo / logo-mark.svg)
  türetilmiş sakin animasyon: iki entegrasyon düğümü sırayla yanar → merkez göbeğe "veri akar" (halka nefes alır)
  → E çizgisi kendini tamamlar. 1,8 sn döngü, yalnız opaklık/ölçek/çizgi ofseti (yerleşim kayması yok).
  `prefers-reduced-motion` → STATİK işaret (hareket yok), metin aynı. Dönen çember kullanılmaz.
  Erişilebilirlik: `role=status` + görünür/görünmez etiket ("Yükleniyor…" ya da işin adı).

    <EkBrandLoader label="Siparişler yükleniyor…" />
    <EkBrandLoader :size="32" hide-label />
-->
<template>
  <div class="ek-brand-loader" :class="`ek-brand-loader--${tone}`" role="status" aria-live="polite">
    <svg class="ek-brand-loader__mark" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect class="ek-brand-loader__tile" x="0" y="0" width="32" height="32" rx="9" />
      <circle class="ek-brand-loader__halo" cx="18.5" cy="16" r="5" />
      <path class="ek-brand-loader__stroke" pathLength="100" d="M20 9.5H13C10.8 9.5 9.5 10.8 9.5 13V19C9.5 21.2 10.8 22.5 13 22.5H20M9.5 16H15.5" />
      <circle class="ek-brand-loader__hub" cx="18.5" cy="16" r="3" />
      <circle class="ek-brand-loader__node ek-brand-loader__node--a" cx="22" cy="9.5" r="2.25" />
      <circle class="ek-brand-loader__node ek-brand-loader__node--b" cx="22" cy="22.5" r="2.25" />
    </svg>
    <span :class="hideLabel ? 'ek-sr-only' : 'ek-brand-loader__label'">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    size?: number
    hideLabel?: boolean
    /** default: açık yüzey üzerinde · inverse: koyu zemin (üst bar) */
    tone?: 'default' | 'inverse'
  }>(),
  { label: 'Yükleniyor…', size: 48, hideLabel: false, tone: 'default' },
)
</script>

<style scoped>
.ek-brand-loader {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-default);
}

.ek-brand-loader__mark {
  flex: none;
  overflow: visible;
}

.ek-brand-loader__tile {
  fill: var(--ek-color-brand);
}

.ek-brand-loader__halo {
  fill: var(--ek-color-secondary);
  opacity: 0.22;
  transform-box: fill-box;
  transform-origin: center;
  animation: ek-bl-halo 1.8s ease-in-out infinite;
}

.ek-brand-loader__stroke {
  fill: none;
  stroke: var(--ek-color-background);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 100;
  animation: ek-bl-stroke 1.8s ease-in-out infinite;
}

.ek-brand-loader__hub {
  fill: var(--ek-color-secondary);
  transform-box: fill-box;
  transform-origin: center;
  animation: ek-bl-hub 1.8s ease-in-out infinite;
}

.ek-brand-loader__node {
  fill: var(--ek-color-chrome-text);
  opacity: 0.45;
  animation: ek-bl-node 1.8s ease-in-out infinite;
}

.ek-brand-loader__node--b {
  animation-delay: 0.3s;
}

.ek-brand-loader__label {
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
  text-align: center;
  max-width: 280px;
}

.ek-brand-loader--inverse .ek-brand-loader__label {
  color: var(--ek-color-chrome-text);
}

@keyframes ek-bl-node {
  0%, 100% { opacity: 0.45; }
  30% { opacity: 1; }
}

@keyframes ek-bl-halo {
  0%, 20% { opacity: 0.12; transform: scale(0.9); }
  50% { opacity: 0.32; transform: scale(1.25); }
  100% { opacity: 0.12; transform: scale(0.9); }
}

@keyframes ek-bl-hub {
  0%, 30% { transform: scale(1); }
  50% { transform: scale(1.12); }
  70%, 100% { transform: scale(1); }
}

@keyframes ek-bl-stroke {
  0% { stroke-dashoffset: 100; }
  55%, 80% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -100; }
}

@media (prefers-reduced-motion: reduce) {
  .ek-brand-loader__halo,
  .ek-brand-loader__stroke,
  .ek-brand-loader__hub,
  .ek-brand-loader__node {
    animation: none;
  }

  .ek-brand-loader__stroke {
    stroke-dasharray: none;
  }

  .ek-brand-loader__node {
    opacity: 1;
  }
}
</style>
