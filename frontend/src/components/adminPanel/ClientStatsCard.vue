<!--
  frontend/src/components/adminPanel/ClientStatsCard.vue

  ADR-0015 Karar 3.5/6.1 — B3: bu bileşen artık `EkKpiCard`'ın İNCE bir
  sarmalayıcısıdır (tek tüketici: AdminClientDetailComponent.vue). Eski pastel
  zemin (teal/rose/indigo degrade) ve "etiket biçimli" (fiş/bilet görünümlü)
  tutar rozeti Karar 3.5 tarafından AÇIKÇA YASAKLANDIĞI için kaldırıldı.
  `icon`/`colorClass` prop'ları API UYUMLULUĞU için KORUNUR (çağıran dosya
  değişmez) ama `EkKpiCard`'ın kendisi ikon SUNMADIĞI için artık render
  edilmez (bkz. dashboard `StatisticsComponent`/`NavigationLinksComponent`
  AYNI ikon'suz kural).
-->
<template>
  <EkKpiCard :label="title" :value="formattedValue" :secondary-value="formattedSubValue" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EkKpiCard from '@/components/ds/EkKpiCard.vue';
import { formatNumber, formatMoney } from '@/composables/format';

const props = defineProps<{
  title: string;
  value: number;
  /** API uyumluluğu için korunur — `EkKpiCard` ikon SUNMAZ (Karar 3.5), artık render edilmez. */
  icon?: string;
  colorClass?: 'teal-card' | 'rose-card' | 'highlight-card';
  subValue?: number;
  subUnit?: string;
}>();

const formattedValue = computed(() => formatNumber(props.value ?? 0));
const formattedSubValue = computed(() =>
  props.subValue === undefined ? undefined : formatMoney(props.subValue, props.subUnit || 'TRY'),
);
</script>
