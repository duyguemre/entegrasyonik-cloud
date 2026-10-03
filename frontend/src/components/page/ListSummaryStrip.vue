<!--
  frontend/src/components/page/ListSummaryStrip.vue

  FE-LOCAL-1042 — liste sayfalarının ORTAK özet şeridi (ana sayfa KPI şeridiyle aynı dil). EkListScreen `#summary`
  yuvasına konur; sayfa adı satırındaki "Özet" düğmesiyle açılır/kapanır (varsayılan kapalı — tabloya yer kalsın).
    [hücre][hücre][hücre]…  │  #aside (isteğe bağlı: mini grafik, kanal dağılımı …)
  Hücre: tonlu ikon kapsülü + mikro etiket + büyük rakam + kısa açıklama. `clickable` hücre düğmedir (ör. listeyi o
  duruma süz); `active` = süzme uygulanmış. Rakamlar çağırandan gelir (sunum bileşeni) — burada veri çekilmez.
-->
<template>
  <div class="lss" :class="{ 'has-aside': $slots.aside }" role="group" :aria-label="label" :aria-busy="loading || undefined">
    <div class="lss__cells" :style="{ '--lss-cols': cells.length }">
      <component
        :is="c.clickable ? 'button' : 'div'"
        v-for="c in cells"
        :key="c.key"
        :type="c.clickable ? 'button' : undefined"
        class="lss__cell"
        :class="[`is-${c.tone}`, { 'is-link': c.clickable, 'is-active': c.active, 'is-zero': !loading && c.zero }]"
        :aria-pressed="c.clickable ? !!c.active : undefined"
        :aria-label="c.clickable ? `${c.label}: ${c.value} — ${c.active ? 'süzmeyi kaldır' : 'listede göster'}` : undefined"
        @click="c.clickable && emit('select', c.key)"
      >
        <span class="lss__head">
          <EkIconTile :icon="c.icon" :tone="c.tone" size="sm" />
          <span class="lss__label">{{ c.label }}</span>
        </span>
        <span v-if="loading" class="lss__skeleton" aria-hidden="true"></span>
        <span v-else class="lss__value ek-num">{{ c.value }}</span>
        <span v-if="c.hint" class="lss__hint">{{ c.hint }}</span>
      </component>
    </div>
    <div v-if="$slots.aside" class="lss__aside"><slot name="aside" /></div>
  </div>
</template>

<script setup lang="ts">
import { EkIconTile, type EkTone } from '@entegrasyonik/ui/components'

export interface ListSummaryCell {
  key: string
  label: string
  /** Biçimlenmiş değer (sayı/para) — biçimlendirme çağıranın işi. */
  value: string
  hint?: string
  icon: string
  tone: EkTone
  /** Değer sıfır → rakam sakin tonda. */
  zero?: boolean
  clickable?: boolean
  active?: boolean
}

defineProps<{ cells: ListSummaryCell[]; label: string; loading?: boolean }>()
const emit = defineEmits<{ select: [key: string] }>()
</script>

<style scoped>
/* Tek şerit: hücre aralığı 1px, zemin rengi çizgi olur (kırılınca da çizgiler doğru kalır). */
.lss {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-border-subtle);
  box-shadow: var(--ek-shadow-card);
}

.lss.has-aside {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
}

.lss__cells {
  display: grid;
  grid-template-columns: repeat(var(--lss-cols, 4), minmax(0, 1fr));
  gap: 1px;
}

.lss__cell {
  --lss-tone: var(--ek-color-content-strong);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--ek-space-3);
  border: 0;
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
}

.lss__cell.is-warning { --lss-tone: var(--ek-color-warning-emphasis); }
.lss__cell.is-info { --lss-tone: var(--ek-color-info-emphasis); }
.lss__cell.is-action { --lss-tone: var(--ek-color-action-emphasis); }
.lss__cell.is-success { --lss-tone: var(--ek-color-success-emphasis); }
.lss__cell.is-error { --lss-tone: var(--ek-color-error-emphasis); }

.lss__cell.is-link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.lss__cell.is-link:hover {
  background: var(--ek-color-surface-muted);
}

.lss__cell.is-link:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

/* Etkin (liste bu hücreye süzülü): eylem renginin açık tonu + altta düz gösterge çizgisi. */
.lss__cell.is-active {
  background: var(--ek-color-action-subtle);
}

.lss__cell.is-active::after {
  content: '';
  position: absolute;
  left: var(--ek-space-3);
  right: var(--ek-space-3);
  bottom: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--ek-color-action);
}

.lss__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-1);
}

.lss__label {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  /* FE-LOCAL-1047: çok hücreli şeritte etiket kesilmez — en çok iki satıra sarar. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.lss__value {
  color: var(--lss-tone);
  font-size: var(--ek-type-metric-size);
  line-height: 1.15;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.lss__cell.is-zero .lss__value {
  color: var(--ek-color-content-muted);
}

.lss__hint {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lss__skeleton {
  display: block;
  width: 56px;
  height: 30px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.lss__aside {
  min-width: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface);
}

@media (max-width: 1199px) {
  .lss.has-aside {
    grid-template-columns: minmax(0, 1fr);
  }

  .lss__cells {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 599px) {
  .lss__cells {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lss__hint {
    display: none;
  }
}
</style>
