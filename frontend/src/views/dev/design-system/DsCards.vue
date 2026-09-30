<!-- Vitrin §7 — kart ve KPI kartı: aynı başlık motifi, aynı değer tipografisi. -->
<template>
  <div class="ds-kpis">
    <EkMetricCard
      label="Bugünkü sipariş"
      :value="formatNumber(128)"
      description="Dün aynı saatte 110"
      icon="mdi-cart-outline"
      :trend="{ direction: 'up', text: formatPercent(0.164) }"
      interactive
    />
    <EkMetricCard
      label="Bugünkü ciro"
      :value="formatMoney(184920)"
      description="İade düşülmüş net tutar"
      icon="mdi-cash-multiple"
      tone="success"
      :trend="{ direction: 'up', text: formatPercent(0.082) }"
    />
    <EkMetricCard
      label="Kargo bekleyen"
      :value="formatNumber(12)"
      description="3'ü bugün kargo süresini aşıyor"
      icon="mdi-truck-alert-outline"
      tone="warning"
      :trend="{ direction: 'up', text: '4 sipariş', positive: false }"
    />
    <EkMetricCard label="Hatalı aktarım" value="—" icon="mdi-alert-octagon-outline" tone="error" loading />
  </div>

  <div class="ds-cards">
    <EkCard title="Bekleyen aksiyonlar" subtitle="Bugün tamamlanması gerekenler" icon="mdi-clipboard-text-clock-outline" to-label="Tüm aksiyonlara git">
      <template #actions><EkBadge text="Yeni" tone="error" /></template>
      <ul class="ds-actions">
        <li v-for="a in actions" :key="a.title" class="ds-actions__item">
          <EkIconTile :icon="a.icon" :tone="a.tone" size="sm" />
          <span class="ds-actions__text">
            <span class="ds-actions__title">{{ a.title }}</span>
            <span class="ds-actions__meta">{{ a.meta }}</span>
          </span>
          <EkStatusChip :tone="a.status.tone" :label="a.status.label" />
        </li>
      </ul>
    </EkCard>

    <EkCard title="Pazaryeri bağlantıları" subtitle="Son eşitleme durumu" icon="mdi-storefront-outline" icon-tone="brand" to-label="Entegrasyonlara git">
      <dl class="ds-kv">
        <div v-for="c in channels" :key="c.name" class="ds-kv__item">
          <dt>{{ c.name }}</dt>
          <dd>
            <span class="ds-kv__value">{{ c.value }}</span>
            <EkStatusChip :tone="c.tone" :label="c.label" dot />
          </dd>
        </div>
      </dl>
      <template #footer>
        <EkButton tone="ghost" size="sm" icon="mdi-sync">Şimdi eşitle</EkButton>
      </template>
    </EkCard>
  </div>
</template>

<script setup lang="ts">
import { EkMetricCard, EkCard, EkIconTile, EkBadge, EkButton, EkStatusChip } from '@entegrasyonik/ui/components'
import type { StatusTone } from '@/design/status-map'
import { formatMoney, formatNumber, formatPercent } from '@entegrasyonik/ui/format'

const actions: Array<{ title: string; meta: string; icon: string; tone: 'warning' | 'error' | 'info'; status: { tone: StatusTone; label: string } }> = [
  { title: '12 sipariş kargo bekliyor', meta: 'Trendyol · Hepsiburada', icon: 'mdi-truck-outline', tone: 'warning', status: { tone: 'warning', label: 'Bugün' } },
  { title: '3 iade talebi yanıt bekliyor', meta: 'En eskisi 2 gün önce', icon: 'mdi-undo-variant', tone: 'error', status: { tone: 'danger', label: 'Gecikmiş' } },
  { title: '48 ürünün fiyatı güncellenecek', meta: 'Toplu işlem kuyrukta', icon: 'mdi-tag-arrow-up-outline', tone: 'info', status: { tone: 'info', label: 'İşleniyor' } },
]

const channels: Array<{ name: string; value: string; tone: StatusTone; label: string }> = [
  { name: 'TRENDYOL', value: '3 dk önce', tone: 'success', label: 'Bağlı' },
  { name: 'HEPSİBURADA', value: '12 dk önce', tone: 'success', label: 'Bağlı' },
  { name: 'N11', value: '2 saat önce', tone: 'warning', label: 'Gecikmeli' },
  { name: 'PAZARAMA', value: 'Kimlik hatası', tone: 'danger', label: 'Kopuk' },
]
</script>

<style scoped>
.ds-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ek-space-4);
}

.ds-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--ek-space-4);
}

.ds-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ds-actions__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.ds-actions__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.ds-actions__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ds-actions__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4) var(--ek-space-5);
  margin: 0;
}

.ds-kv__item dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.ds-kv__item dd {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-1);
  margin: var(--ek-space-1) 0 0;
}

.ds-kv__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-font-weight-bold);
}
</style>
