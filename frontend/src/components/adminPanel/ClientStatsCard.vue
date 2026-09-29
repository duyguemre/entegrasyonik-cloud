<template>
  <EkKpiCard :label="title" :value="formattedValue" :secondary-value="formattedSubValue" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EkKpiCard from '@/components/ds/EkKpiCard.vue';
import { formatNumber, formatMoney } from '@/composables/format';

// ADR-0015 Karar 3.5 — istatistik kartı EkKpiCard'a devredildi (pastel zemin, fiyat etiketi
// ve renk varyantları kaldırıldı). Tüketici: AdminClientDetailComponent.
const props = defineProps<{
  title: string;
  value: number;
  subValue?: number;
  /** Para birimi kodu (varsayılan: format.ts varsayılanı). */
  subUnit?: string;
}>();

const formattedValue = computed(() => formatNumber(props.value ?? 0));
const formattedSubValue = computed(() =>
  props.subValue === undefined ? undefined : formatMoney(props.subValue ?? 0, props.subUnit)
);
</script>
