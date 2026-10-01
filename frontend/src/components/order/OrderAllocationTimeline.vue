<!--
  Sipariş kalemi stok tahsis zaman çizgisi — C1.1 / F-01 (ADR-0004).

  Sipariş detayına (`OrderDetailComponent`, EkDetailSheet gövdesi) bağlıdır; en az bir kalemde tahsis
  durumu varsa görünür. Kullanım: <OrderAllocationTimeline :items="order.items" />
  Kaynak: `OrderService/getOrders` → `orders[].items[]` (allocationState, lastAllocationAppliedAt,
  oversoldEscalatedAt — docs/API_TENANT_SURFACE.md §2.1) veya getStockOverview `recentOrders[].items[]`.
  Backend tahsis GEÇMİŞİNİ siparişte tutmaz; yalnızca SON geçiş zamanı ve aşırı satış bildirimi
  zamanı bilinir — ara durumlar/zamanlar UYDURULMAZ. Durumsuz kalem (eski sipariş) "—" gösterir.
-->
<template>
  <section class="ek-alloc" :aria-labelledby="headingId">
    <h2 :id="headingId" class="ek-alloc__heading" :class="{ 'ek-sr-only': embedded }">{{ title }}</h2>

    <p v-if="entries.length === 0" class="ek-alloc__empty">Bu siparişte kalem yok.</p>

    <ol v-else class="ek-alloc__items">
      <li v-for="entry in entries" :key="entry.key" class="ek-alloc__item">
        <div class="ek-alloc__head">
          <div class="ek-alloc__product">
            <span class="ek-alloc__name">{{ entry.productName || '—' }}</span>
            <span class="ek-alloc__meta ek-num">
              {{ entry.sku ? `Stok kodu ${entry.sku} · ` : '' }}{{ formatNumber(entry.quantity) }} adet
            </span>
          </div>
          <EkStatusChip
            v-if="entry.state"
            :tone="ALLOCATION_STATE_TONE[entry.state].tone"
            :label="$t(ALLOCATION_STATE_TONE[entry.state].labelKey)"
          />
          <span v-else class="ek-alloc__none">Stok durumu yok</span>
        </div>

        <ol v-if="entry.events.length" class="ek-alloc__events">
          <li v-for="event in entry.events" :key="event.kind" class="ek-alloc__event" :class="`ek-alloc__event--${event.kind}`">
            <span class="ek-alloc__dot" aria-hidden="true"></span>
            <span class="ek-alloc__event-label">{{ EVENT_LABEL[event.kind] }}</span>
            <time class="ek-alloc__time ek-num" :datetime="event.at">{{ formatDateTime(event.at) }}</time>
          </li>
        </ol>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import { ALLOCATION_STATE_TONE } from '@/design/status-map'
import { formatDateTime, formatNumber } from '@entegrasyonik/ui/format'
import { buildAllocationTimeline, type AllocationEventKind } from '@/composables/useStockHealthApi'

const props = withDefaults(defineProps<{ items: Array<Record<string, any>> | null | undefined; title?: string; /** FR3-12: bölüm kartının (EkDetailPanel) içinde — görünür başlığı kart taşır. */ embedded?: boolean }>(), {
  title: 'Stok tahsisi',
})

const EVENT_LABEL: Record<AllocationEventKind, string> = {
  applied: 'Son tahsis güncellemesi',
  escalated: 'Aşırı satış için manuel işlem bildirildi',
}

const headingId = `ek-alloc-${useId()}`
const entries = computed(() => buildAllocationTimeline(props.items))
</script>

<style scoped>
.ek-alloc {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-alloc__heading {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-alloc__items,
.ek-alloc__events {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-alloc__item {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) 0;
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-alloc__item:first-child {
  border-top: 0;
  padding-top: 0;
}

.ek-alloc__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.ek-alloc__product {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ek-alloc__name {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-alloc__meta,
.ek-alloc__none,
.ek-alloc__no-events,
.ek-alloc__empty,
.ek-alloc__time {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-alloc__events {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin-left: var(--ek-space-1);
  padding-left: var(--ek-space-4);
  border-left: 2px solid var(--ek-color-border-default);
}

.ek-alloc__event {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ek-space-2);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.ek-alloc__dot {
  position: absolute;
  top: 5px;
  left: calc(-1 * var(--ek-space-4) - 6px);
  width: 10px;
  height: 10px;
  border: 2px solid var(--ek-color-surface);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-info);
}

.ek-alloc__event--escalated .ek-alloc__dot {
  background: var(--ek-color-error);
}
</style>
