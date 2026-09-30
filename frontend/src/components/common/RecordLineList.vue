<!--
  FR2-ORDERS 30/33 (fe-r2d) — kayıt detayında kalem listesi (sipariş kalemleri, iade edilen ürünler). Tablo yerine satır
  kartı: adet kapsülü · ürün adı + stok kodu/barkod (+ isteğe bağlı neden/not) · tutar (+ birim fiyat). Dar yan sayfada
  kolon sıkışması olmaz, aynı dil iki detayda. Pasif (iptal/iade) kalem soluk + tutar üstü çizili — hata rengi değil.
-->
<template>
  <ul class="ek-lines" :aria-label="label">
    <li v-for="line in lines" :key="line.key" class="ek-line" :class="{ 'is-inactive': !!line.inactiveLabel }">
      <span class="ek-line__qty ek-num" :aria-label="`${line.quantity ?? 0} adet`">{{ line.quantity ?? '—' }}×</span>
      <span class="ek-line__main">
        <span class="ek-line__name">{{ line.name || 'Ürün adı yok' }}</span>
        <span v-if="line.sku || line.barcode" class="ek-line__meta ek-num">
          <template v-if="line.sku">Stok kodu {{ line.sku }}</template><template v-if="line.sku && line.barcode"> · </template><template v-if="line.barcode">{{ line.barcode }}</template>
        </span>
        <span v-if="line.reason" class="ek-line__reason">
          <v-icon icon="mdi-comment-quote-outline" size="14" aria-hidden="true" /> {{ line.reason }}
        </span>
        <q v-if="line.note" class="ek-line__note">{{ line.note }}</q>
        <EkStatusChip v-if="line.inactiveLabel" class="ek-line__chip" :tone="line.inactiveTone ?? 'neutral'" :label="line.inactiveLabel" />
      </span>
      <span class="ek-line__price">
        <span class="ek-num ek-line__total">{{ line.total !== undefined && line.total !== null ? formatMoney(line.total, currency) : '—' }}</span>
        <span v-if="line.unit !== undefined && line.unit !== null && (line.quantity ?? 1) > 1" class="ek-num ek-line__unit">{{ formatMoney(line.unit, currency) }} / adet</span>
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { EkStatusChip } from '@entegrasyonik/ui/components'
import type { StatusTone } from '@entegrasyonik/ui/components/statusTone'
import { formatMoney } from '@entegrasyonik/ui/format'

export interface RecordLine {
  key: string
  name?: string
  quantity?: number
  sku?: string
  barcode?: string
  unit?: number | null
  total?: number | null
  reason?: string
  note?: string
  inactiveLabel?: string
  inactiveTone?: StatusTone
}

withDefaults(defineProps<{ lines: RecordLine[]; label?: string; currency?: string }>(), { label: 'Kalemler' })
</script>

<style scoped>
.ek-lines {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-line {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-line + .ek-line {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-line__qty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-line__main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.ek-line__name {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.ek-line__meta,
.ek-line__unit {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-line__reason {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-top: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
}

.ek-line__note {
  display: block;
  margin-top: 2px;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-left: 2px solid var(--ek-color-border-strong);
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background: var(--ek-color-surface-sunken);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-default);
}

.ek-line__chip {
  margin-top: var(--ek-space-1);
}

.ek-line__price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
}

.ek-line__total {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-line.is-inactive .ek-line__name,
.ek-line.is-inactive .ek-line__total {
  color: var(--ek-color-content-muted);
}

.ek-line.is-inactive .ek-line__total {
  text-decoration: line-through;
}

@media (max-width: 479px) {
  .ek-line {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .ek-line__price {
    grid-column: 2;
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
  }
}
</style>
