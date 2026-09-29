<!--
  frontend/src/components/ds/EkKpiRow.vue

  ADR-0015 Karar 3.5 — KPI kartları BİR SATIRDA eşit genişliktedir. Kırılım:
  masaüstü 4 sütun, tablet 2, mobil 1.

  Kullanım:
    <EkKpiRow>
      <EkKpiCard label="..." :value="..." />
      <EkKpiCard label="..." :value="..." />
    </EkKpiRow>
-->
<template>
  <div class="ek-kpi-row">
    <slot />
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.ek-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ek-space-4);
}

@media (max-width: 1279px) {
  .ek-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 767px) {
  .ek-kpi-row {
    grid-template-columns: 1fr;
  }
}
</style>
