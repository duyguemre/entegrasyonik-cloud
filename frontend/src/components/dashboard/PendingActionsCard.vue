<!--
  Bekleyen aksiyonlar — `getOrderDashboardInsights.pending` (backend sayımları, anlık):
    shippingCount  internalStatus=APPROVED                               → Sipariş listesi (Onaylandı)
    invoiceCount   APPROVED ve flags.isInvoiceGenerated≠true             → Sipariş listesi (Onaylandı)*
    claimCount     iade internalStatus ∈ WAITING/SHIPPED/DELIVERED        → İade listesi (aynı durumlar)
    messageCount   status=WAITING_SELLER, reddedilmemiş                   → Mesajlar (WAITING_SELLER)
  * Sipariş listesinde "fatura kesilmemiş" filtresi yok; en yakın filtre (Onaylandı) açılır.
  Kullanıcının menüsünde olmayan ekranın satırı bağlantısız (yalnız bilgi) gösterilir.
-->
<template>
  <EkCard
    title="Bekleyen aksiyonlar"
    :subtitle="subtitle"
    icon="mdi-clipboard-clock-outline"
    icon-tone="warning"
    :heading-level="2"
    :to-label="canOpen('orderList') ? 'Onaylı siparişleri aç' : undefined"
    flush
    class="dash-pending"
    @open="open('orderList', { internalStatuses: ['APPROVED'] })"
  >
    <ul v-if="loading" class="dash-pending__list" aria-hidden="true">
      <li v-for="n in 4" :key="n" class="dash-pending__skeleton"><span></span><span></span></li>
    </ul>
    <div v-else-if="error" class="dash-pending__pad">
      <EkErrorState size="inline" message="Bekleyen aksiyonlar yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    </div>
    <ul v-else class="dash-pending__list">
      <li v-for="row in rows" :key="row.key">
        <component
          :is="row.linkable ? 'button' : 'div'"
          :type="row.linkable ? 'button' : undefined"
          class="dash-pending__row"
          :class="{ 'dash-pending__row--link': row.linkable }"
          :data-pending="row.key"
          @click="row.linkable && row.go()"
        >
          <EkIconTile :icon="row.icon" :tone="row.count > 0 ? row.tone : 'neutral'" size="md" />
          <span class="dash-pending__text">
            <span class="dash-pending__title">{{ row.title }}</span>
            <span class="dash-pending__desc">{{ row.desc }}</span>
          </span>
          <EkStatusChip v-if="row.count === 0" tone="success" label="Bekleyen yok" />
          <span v-else class="dash-pending__count ek-num">{{ fmt(row.count) }}</span>
          <v-icon v-if="row.linkable" icon="mdi-chevron-right" class="dash-pending__chevron" aria-hidden="true" />
        </component>
      </li>
    </ul>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkIconTile, type EkTone, EkStatusChip, EkErrorState } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { OrderInsights } from './dashboardTypes'

const props = defineProps<{ data: OrderInsights | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { canOpen, open } = useDashboardNavigation()
const fmt = (v: number) => formatNumber(v ?? 0)

const rows = computed(() => {
  const p = props.data?.pending
  return [
    {
      key: 'shipping',
      icon: 'mdi-truck-fast-outline',
      tone: 'warning' as EkTone,
      title: 'Kargoya verilecek',
      desc: 'Onaylı, kargolanmamış sipariş',
      count: p?.shippingCount ?? 0,
      linkable: canOpen('orderList'),
      go: () => open('orderList', { internalStatuses: ['APPROVED'] }),
    },
    {
      key: 'invoice',
      icon: 'mdi-receipt-text-outline',
      tone: 'info' as EkTone,
      title: 'Faturası kesilecek',
      desc: 'Onaylı, faturasız sipariş',
      count: p?.invoiceCount ?? 0,
      linkable: canOpen('orderList'),
      go: () => open('orderList', { internalStatuses: ['APPROVED'] }),
    },
    {
      key: 'claim',
      icon: 'mdi-undo-variant',
      tone: 'error' as EkTone,
      title: 'İade talepleri',
      desc: 'İşlem bekleyen iade',
      count: p?.claimCount ?? 0,
      linkable: canOpen('claimList'),
      go: () => open('claimList', { internalStatuses: ['WAITING', 'DELIVERED', 'SHIPPED'] }),
    },
    {
      key: 'message',
      icon: 'mdi-message-question-outline',
      tone: 'action' as EkTone,
      title: 'Yanıt bekleyen soru',
      desc: 'Müşteri soruları',
      count: p?.messageCount ?? 0,
      linkable: canOpen('messageList'),
      go: () => open('messageList', { status: 'WAITING_SELLER' }),
    },
  ]
})

const openTotal = computed(() => rows.value.reduce((a, r) => a + r.count, 0))
const subtitle = computed(() => {
  if (props.loading || props.error || !props.data) return 'Sizi bekleyen işler'
  return openTotal.value === 0 ? 'Şu an bekleyen iş yok' : `${fmt(openTotal.value)} kayıt işlem bekliyor`
})
</script>

<style scoped>
.dash-pending__pad {
  padding: var(--ek-space-5);
}

.dash-pending__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--ek-space-2);
  list-style: none;
}

.dash-pending__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 60px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
}

.dash-pending__row--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-pending__row--link:hover {
  background: var(--ek-color-surface-muted);
}

.dash-pending__row--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dash-pending__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.dash-pending__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.dash-pending__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-pending__count {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-bold);
}

.dash-pending__chevron {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.dash-pending__skeleton {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 60px;
  padding: 0 var(--ek-space-3);
}

.dash-pending__skeleton span:first-child {
  width: 36px;
  height: 36px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.dash-pending__skeleton span:last-child {
  flex: 1;
  height: 16px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}
</style>
