<!--
  MetricStrip — genel bakışın önemli metrikleri. ORTAK kaynak: BoTileGrid + BoStat (yalnız BoStat taşıyan ızgara tek
  karta birleşir — backoffice.css "STAT ŞERİDİ"); diğer sayfaların sayı kutularıyla aynı tasarım.
-->
<template>
  <BoTileGrid :min="200" dense aria-label="Önemli metrikler" role="region" data-testid="overview-kpis">
    <BoStat v-for="({ key, ...m }) in items" :key="key" v-bind="m" :data-kpi="key" />
  </BoTileGrid>
</template>

<script setup lang="ts">
import BoStat from '@bo/components/r2/BoStat.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'

export interface Metric {
  key: string
  label: string
  value: string | number
  hint?: string
  info?: string
  tone?: 'neutral' | 'critical' | 'warning' | 'success' | 'info'
  delta?: { text: string; dir: 'up' | 'down' | 'flat' }
  series?: number[]
  to?: string | Record<string, unknown>
  loading?: boolean
}

defineProps<{ items: Metric[] }>()
</script>
