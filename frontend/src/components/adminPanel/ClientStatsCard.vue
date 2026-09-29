<template>
  <v-card flat border class="p-card" :class="colorClass">
    <div class="c-header">
      <div class="c-icon-box">
        <v-icon size="20" aria-hidden="true">{{ icon }}</v-icon>
      </div>
      <span class="c-label">{{ title }}</span>
    </div>

    <div class="c-body">
      <div class="c-value">{{ formattedValue }}</div>
    </div>

    <div class="c-footer" v-if="subValue !== undefined">
      <div class="revenue-tag-wrapper">
        <div class="price-tag">
          <div class="tag-hole"></div>
          <div class="tag-content">
            <span class="tag-amount">{{ formattedSubValue }}</span>
            <span class="tag-currency">{{ subUnit }}</span>
          </div>
        </div>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
// ADR-0015 Karar 6.3 — tek biçimlendirici örnek kullanımı (SIFIR-FARK:
// `formatNumber(n)` ile `(n).toLocaleString('tr-TR')` aynı çıktıyı üretir,
// bkz. `tests/format.test.ts`). Tam yayılım (44 dosya) bu görevin kapsamı
// DIŞINDA — kalan dosyalar BACKLOG'da TODO.
import { formatNumber } from '@/composables/format';

// NOT (Faz 3 admin göçü): eski `tagBgColor` prop'u (tek tüketici AdminClientDetailComponent, iki
// çağrıda tekil hex literal geçiyordu) kaldırıldı — etiket rengi artık kart varyantının vurgu
// rengini (`--card-accent`, aşağıda) kullanır; mevcut iki kullanımda görsel sonuç birebir aynı.
const props = defineProps<{
  title: string;
  value: number;
  icon: string;
  colorClass?: 'teal-card' | 'rose-card' | 'highlight-card';
  subValue?: number;
  subUnit?: string;
}>();

const formattedValue = computed(() => formatNumber(props.value ?? 0));
const formattedSubValue = computed(() =>
  (props.subValue ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
);
</script>

<style scoped>
.p-card {
  --card-accent: var(--ek-color-primary);
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: var(--ek-space-5);
  /* 16px: radius ölçeğinde (en büyüğü xl=12px) karşılığı yok — yakın-ama-farklı değer ZORLANMADI. */
  border-radius: 16px;
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  overflow: hidden;
  /* `transition: all` + 3px zıplama (translateY) kaldırıldı: yalnızca kenarlık/gölge geri bildirimi. */
  transition: border-color var(--ek-duration-slow) var(--ek-easing-standard),
    box-shadow var(--ek-duration-slow) var(--ek-easing-standard);
  min-width: 200px;
}

.p-card:hover {
  box-shadow: var(--ek-shadow-md);
  border-color: var(--ek-color-border-strong);
}

.c-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: var(--ek-space-3);
  position: relative;
}

.c-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-muted);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* Renk tonlu kart zeminlerinde `content-muted` ~4,4:1'de kalıp AA'yı (4,5:1) geçemiyor → `content-default`. */
.teal-card .c-label,
.rose-card .c-label,
.highlight-card .c-label {
  color: var(--ek-color-content-default);
}

.c-icon-box {
  width: var(--ek-space-8);
  height: var(--ek-space-8);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  left: -10px;
  top: -6px;
  opacity: 0.8;
}

.c-body {
  margin-bottom: var(--ek-space-3);
  text-align: center;
}

.c-value {
  font-size: 36px;
  font-weight: 900;
  color: var(--ek-color-content-strong);
  line-height: 1;
  letter-spacing: -1.5px;
}

.c-footer {
  margin-top: auto;
  display: flex;
  justify-content: center;
}

/*
 * Renk varyasyonları — vurgu renkleri (teal/rose/indigo) token setinde TAM eşleşen karşılığı olmayan
 * "canlı" palet değerleridir (ADR-0011 Açık Soru 4: yakın-ama-farklı renk ZORLANMADI). Her varyant
 * vurgusunu TEK yerde (`--card-accent`) tanımlar; zemin/kenarlık/ikon/etiket bundan türetilir
 * (eskiden aynı üç değer birkaç yerde tekrar yazılıyordu).
 */
/* Teal vurgu: beyaz etiket yazısı için AA (>=4,5:1) gerekir — eski teal-600 tonu beyazda 3,7:1'de
   kalıyordu, bir kademe koyu teal-700 tonuna alındı (bilinçli a11y değişikliği; ikon/zemin tonları
   göz ile ayırt edilemeyecek kadar yakın). */
.teal-card {
  --card-accent: #0f766e;
  background: color-mix(in srgb, var(--card-accent) 5%, transparent);
  border-color: color-mix(in srgb, var(--card-accent) 20%, transparent);
}
.rose-card {
  --card-accent: #e11d48;
  background: color-mix(in srgb, var(--card-accent) 5%, transparent);
  border-color: color-mix(in srgb, var(--card-accent) 20%, transparent);
}
.highlight-card {
  --card-accent: #4f46e5;
  background: linear-gradient(145deg, #f5f7ff 0%, #eef2ff 100%);
  border-color: #c7d2fe;
}
.teal-card .c-icon-box,
.rose-card .c-icon-box,
.highlight-card .c-icon-box { color: var(--card-accent); }

/* Price Tag Style from StatisticsComponent */
.revenue-tag-wrapper {
  display: flex;
  justify-content: center;
  transform: scale(0.9);
}

.price-tag {
  height: 28px;
  border-radius: var(--ek-radius-sm) var(--ek-radius-md) var(--ek-radius-md) var(--ek-radius-sm);
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 10px 0 var(--ek-space-4);
  background: var(--card-accent);
  /* Renkli zemin üzerinde ön-plan: beyaz (surface ile birebir). */
  color: var(--ek-color-surface);
  font-weight: 800;
}

.tag-hole {
  position: absolute;
  left: 6px;
  width: 6px;
  height: 6px;
  background: var(--ek-color-surface);
  border-radius: var(--ek-radius-full);
  box-shadow: inset 0 1px 1px color-mix(in srgb, var(--ek-color-content-strong) 20%, transparent);
}

.tag-content {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-1);
}

.tag-amount {
  font-size: var(--ek-font-size-md);
}

/* Eski `opacity: 0.9` kaldırıldı: renkli etiket zemininde AA kontrastını düşürüyordu. */
.tag-currency {
  font-size: var(--ek-font-size-xs);
}
</style>
