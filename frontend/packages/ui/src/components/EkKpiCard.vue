<!--
  frontend/src/components/ds/EkKpiCard.vue

  ADR-0015 Karar 3.5/6.1 — KPI/istatistik kartı. Etiket (sm 13/500 muted) →
  değer (3xl 28/600 strong, `.ek-num`) → isteğe bağlı değişim göstergesi
  (▲/▼ + yüzde, success/danger METİN rengi, zemin YOK) → isteğe bağlı
  ikincil değer. Kart: kenarlık, gölge YOK, iç boşluk 20px. Tıklanabilirse
  TAM kart bağlantıdır, hover'da yalnızca kenarlık `border-strong` olur
  (yükselme YOK). Pastel zemin/"etiket biçimli" tutar rozetleri YASAK.

  Dashboard'un tıkladığı `.large-stat-card` sınıfı, tıklanabilir kartta
  KORUNUR (ADR Ek A — spec kancası; A5'in dashboard'a bağladığı örnekte
  kullanılır, bu bileşen sınıfı HER ZAMAN ekler).

  Kullanım:
    <EkKpiRow>
      <EkKpiCard label="Bugünkü Sipariş" :value="128" />
      <EkKpiCard label="Ciro" value="₺45.900,00" change="12" change-direction="up" clickable @click="openOrders" />
    </EkKpiRow>
-->
<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="ek-kpi-card large-stat-card"
    :class="{ 'ek-kpi-card--clickable': clickable }"
    :type="clickable ? 'button' : undefined"
  >
    <span class="ek-kpi-card__label">{{ label }}</span>
    <span class="ek-kpi-card__value ek-num">{{ value }}</span>
    <span v-if="secondaryValue || change !== undefined" class="ek-kpi-card__footer">
      <span
        v-if="change !== undefined && change !== 0"
        class="ek-kpi-card__change"
        :class="changeDirection === 'down' ? 'ek-kpi-card__change--down' : 'ek-kpi-card__change--up'"
      >
        <v-icon :icon="changeDirection === 'down' ? 'mdi-arrow-down' : 'mdi-arrow-up'" size="14" aria-hidden="true" />
        %{{ Math.abs(change) }}
      </span>
      <span v-if="secondaryValue" class="ek-kpi-card__secondary ek-num">{{ secondaryValue }}</span>
    </span>
  </component>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    secondaryValue?: string | number
    /** Değişim yüzdesi; 0 veya undefined ise gösterilmez. */
    change?: number
    changeDirection?: 'up' | 'down'
    clickable?: boolean
  }>(),
  {
    changeDirection: 'up',
    clickable: false,
  },
)
</script>

<style scoped>
/* Aşama 3: EkMetricCard ile AYNI KPI dili — mikro etiket (BÜYÜK HARF) → `metric` değer → alt bilgi;
   kart = kenarlık + yumuşak gölge (brif "sayı vurguları aynı tipografiyle"). API değişmedi. */
.ek-kpi-card {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  text-align: left;
  font-family: inherit;
  transition: border-color var(--ek-motion-feedback);
}

.ek-kpi-card--clickable {
  cursor: pointer;
}

.ek-kpi-card--clickable:hover {
  border-color: var(--ek-color-border-strong);
}

.ek-kpi-card__label {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-kpi-card__value {
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
  color: var(--ek-color-content-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-kpi-card__footer {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-kpi-card__change {
  display: inline-flex;
  align-items: center;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
}

.ek-kpi-card__change--up {
  color: var(--ek-color-success);
}

.ek-kpi-card__change--down {
  color: var(--ek-color-error);
}

.ek-kpi-card__secondary {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}
</style>
