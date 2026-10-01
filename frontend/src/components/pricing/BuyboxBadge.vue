<!--
  PRC-R1 — ürün listesi satırı buybox rozeti (Trendyol, salt okuma). Renge yalnız güvenmez: ikon + metin; ekran okuyucu
  ayrıntıyı ("n / m varyant") okur. Özet `summarizeBuybox` ile ürün başına tek rozete indirgenir; `none` ise hiçbir şey çizilmez.
-->
<template>
  <span v-if="summary.kind !== 'none'" class="bbx" :data-buybox="summary.kind">
    <EkStatusChip
      :tone="summary.kind === 'losing' ? 'warning' : 'success'"
      :icon="summary.kind === 'losing' ? 'mdi-alert-outline' : 'mdi-check-circle-outline'"
      :label="summary.kind === 'losing' ? t('pricing.badge.losing') : t('pricing.badge.winning')"
    />
    <span v-if="detail" class="ek-sr-only">{{ detail }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import type { BuyboxBadgeSummary } from '@/composables/usePricingApi'

const props = defineProps<{ summary: BuyboxBadgeSummary }>()
const { t } = useI18n()
const detail = computed(() =>
  props.summary.kind === 'losing' && props.summary.total > 1
    ? t('pricing.badge.losingDetail', { losing: props.summary.losing, total: props.summary.total })
    : '',
)
</script>

<style scoped>
.bbx { display: inline-flex; margin-top: var(--ek-space-1); }
</style>
