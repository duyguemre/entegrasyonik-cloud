<!--
  PulseTrends — "Sistem kullanımı büyük resimde nasıl?" (genel bakış 2. soru). Sakin trend satırları: ad · değer ·
  önceki eş döneme göre değişim (renksiz metin) · küçük çizgi. Renk yalnız eşik aşımında (hata oranı ≥ %1, p95 ≥ 1 sn).
-->
<!--
  PulseTrends — "Kullanım büyük resimde nasıl?" (genel bakış 2. soru). Sakin satırlar: ad · değer · karşılaştırma/not
  (renksiz) · son 24 saatin saatlik çizgisi. Renk yalnız eşik aşımında (getAttention eşikleri: 5xx ≥ %5, kanal ≥ %20).
  Hesaplanamayan değer "—" + neden; okunamayan blok "Okunamadı" (boşluk "sorun yok" değildir).
-->
<template>
  <ul class="bo-pt" aria-label="Kullanım trendleri" data-testid="pulse-trends">
    <li v-for="t in model.rows" :key="t.key" class="bo-pt__row" :class="[`is-${t.state}`, { 'is-over': t.over }]">
      <span class="bo-pt__label">{{ t.label }}</span>
      <span class="bo-pt__value ek-num">{{ t.value }}</span>
      <span class="bo-pt__delta">
        <v-icon v-if="t.trend && t.trend !== 'flat'" :icon="t.trend === 'up' ? 'mdi-arrow-top-right' : 'mdi-arrow-bottom-right'" aria-hidden="true" />{{ t.note }}
      </span>
      <Sparkline v-if="t.series && t.series.length > 1" class="bo-pt__spark" :values="t.series" :label="`${t.label} — son 24 saat, saatlik`" :tone="t.over ? 'warning' : 'neutral'" />
      <span v-else class="bo-pt__spark" aria-hidden="true"></span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import Sparkline from '@bo/components/Sparkline.vue'
import type { PulseModel } from '@bo/api/attention'

defineProps<{ model: PulseModel }>()
</script>

<style scoped>
.bo-pt {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-pt__row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(56px, auto) minmax(0, 1.5fr) 72px;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 44px;
  padding: var(--ek-space-1) 0;
}

.bo-pt__row + .bo-pt__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-pt__label {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-pt__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  text-align: right;
}

.bo-pt__row.is-over .bo-pt__value {
  color: var(--ek-color-warning-emphasis);
}

.bo-pt__delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-pt__row.is-na .bo-pt__value,
.bo-pt__row.is-degraded .bo-pt__value {
  color: var(--ek-color-content-muted);
}

.bo-pt__delta .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-pt__spark {
  min-width: 0;
}


@media (max-width: 600px) {
  .bo-pt__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'label value' 'delta spark';
    row-gap: 2px;
    padding: var(--ek-space-2) 0;
  }

  .bo-pt__label {
    grid-area: label;
  }

  .bo-pt__value {
    grid-area: value;
  }

  .bo-pt__delta {
    grid-area: delta;
  }

  .bo-pt__spark {
    grid-area: spark;
    width: 96px;
    justify-self: end;
  }
}
</style>
