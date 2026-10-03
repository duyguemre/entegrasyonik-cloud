<!--
  frontend/src/components/productDefinitions/definitions/MappingCoverageDashboard.vue

  FE-LOCAL-1052 — Kategoriler ve Markalar ekranlarının ORTAK "Özet" görünümü (Liste | Özet anahtarıyla listenin yerine
  açılır). Sayılar ekranın zaten bellekte tuttuğu veriden gelir (ek istek yok, tahmin yok).
    1) Özet şeridi — ekranın verdiği hücreler (toplam, eşli, eksik …); tıklanabilir hücre `select` yayar
    2) Kanal eşleme kapsamı — her bağlı kanal için "eşli / toplam" + oran çubuğu
-->
<template>
  <div class="mcd">
    <ListDashSection label="Özet">
      <ListSummaryStrip :cells="cells" :loading="loading" label="Özet" @select="(key) => emit('select', key)" />
    </ListDashSection>

    <ListDashSection label="Kanal eşleme kapsamı">
      <EkCard title="Kanallara göre eşleme" :subtitle="subtitle" icon="mdi-swap-horizontal" icon-tone="action" :heading-level="3">
        <p v-if="!channels.length" class="mcd__empty">{{ emptyText }}</p>
        <ul v-else class="mcd__list">
          <li v-for="c in channels" :key="c.code" class="mcd__row" :class="channelClass(c.code)">
            <EkChannelBadge :code="c.code" :name="c.title" size="sm" class="mcd__badge" />
            <span class="mcd__bar" role="img" :aria-label="`${c.title}: ${fmt(c.mapped)} / ${fmt(c.total)} eşli`">
              <span class="mcd__bar-fill" :style="{ flexGrow: c.mapped }"></span>
              <span class="mcd__bar-rest" :style="{ flexGrow: Math.max(0, c.total - c.mapped) }"></span>
            </span>
            <span class="mcd__nums ek-num"><strong>{{ fmt(c.mapped) }}</strong> / {{ fmt(c.total) }} eşli</span>
            <EkStatusChip v-if="c.total > 0 && c.mapped >= c.total" tone="success" label="Tamam" />
            <EkStatusChip v-else-if="c.total > 0" tone="warning" :label="`${fmt(c.total - c.mapped)} eksik`" />
            <EkStatusChip v-else tone="neutral" label="Kayıt yok" />
          </li>
        </ul>
      </EkCard>
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { EkCard, EkChannelBadge, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import { channelClass } from '@entegrasyonik/ui/tokens'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'

export interface MappingChannelCoverage {
  code: string
  title: string
  /** Bu kanalda eşli kayıt sayısı / eşlenebilir toplam kayıt. */
  mapped: number
  total: number
}

withDefaults(
  defineProps<{
    cells: ListSummaryCell[]
    channels: MappingChannelCoverage[]
    subtitle?: string
    loading?: boolean
    emptyText?: string
  }>(),
  { subtitle: undefined, loading: false, emptyText: 'Bağlı kanal yok — eşleme için önce bir kanal bağlayın.' },
)
const emit = defineEmits<{ select: [key: string] }>()

const fmt = (n: number) => formatNumber(n ?? 0)
</script>

<style scoped>
.mcd {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.mcd__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mcd__row {
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(80px, 1fr) minmax(110px, auto) minmax(90px, auto);
  align-items: center;
  gap: var(--ek-space-4);
  min-height: 48px;
  padding: var(--ek-space-2) 0;
}

.mcd__row + .mcd__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.mcd__badge {
  justify-self: start;
}

.mcd__row > :last-child {
  justify-self: end;
}

/* Oran çubuğu: eşli kısım eylem renginde, kalan sakin zemin (düz renk; degrade yok). */
.mcd__bar {
  display: flex;
  height: 8px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.mcd__bar-fill {
  flex-basis: 0;
  background: var(--ek-color-action);
}

.mcd__bar-rest {
  flex-basis: 0;
}

.mcd__nums {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-table-size);
  text-align: right;
  white-space: nowrap;
}

.mcd__nums strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.mcd__empty {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

@media (max-width: 767px) {
  .mcd__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .mcd__bar {
    grid-column: 1 / -1;
    order: 3;
  }
}
</style>
