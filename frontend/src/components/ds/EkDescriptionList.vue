<!--
  frontend/src/components/ds/EkDescriptionList.vue

  ADR-0015 Karar 6.1 — `EkDetailSheet` gövdesindeki tanım listesi: etiket
  (sm, content-muted) / değer (md, content-strong), 2 sütun ≥1024px.

  Kullanım:
    <EkDescriptionList :items="[
      { label: 'Sipariş No', value: order.orderNumber },
      { label: 'Tutar', value: formatMoney(order.total) },
    ]" />
-->
<template>
  <dl class="ek-description-list">
    <div v-for="item in items" :key="item.label" class="ek-description-list__row">
      <dt class="ek-description-list__label">{{ item.label }}</dt>
      <dd class="ek-description-list__value">
        <slot :name="item.label" :item="item">{{ item.value ?? '—' }}</slot>
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
export interface EkDescriptionListItem {
  label: string
  value?: string | number | null
}

defineProps<{
  items: EkDescriptionListItem[]
}>()
</script>

<style scoped>
.ek-description-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--ek-space-3) var(--ek-space-6);
  margin: 0;
}

@media (min-width: 1024px) {
  .ek-description-list {
    grid-template-columns: 1fr 1fr;
  }
}

.ek-description-list__row {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-description-list__label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-description-list__value {
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-strong);
  margin: 0;
}
</style>
