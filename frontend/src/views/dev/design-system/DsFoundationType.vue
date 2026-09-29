<!-- Vitrin §3 — tipografi rolleri + ikon boyutu eşlemesi (yazıyla orantılı) + ikon kapsülleri. -->
<template>
  <DsSpecimen title="Tipografi rolleri" note="Aile: Inter (kendi barındırılan). Her rol boyut / satır / ağırlık + aynı satırdaki ikon boyutunu taşır.">
    <div class="ds-type">
      <div v-for="row in roles" :key="row.role" class="ds-type__row">
        <div class="ds-type__meta">
          <code class="ds-type__name">{{ row.role }}</code>
          <span class="ds-type__spec">{{ row.size }}/{{ row.line }} · {{ row.weight }}<template v-if="row.tracking !== '0'"> · {{ row.tracking }}</template></span>
          <span class="ds-type__use">{{ row.use }}</span>
        </div>
        <div class="ds-type__sample" :class="`ds-type__sample--${row.role}`">
          <v-icon :icon="row.icon" class="ds-type__icon" aria-hidden="true" />
          <span>{{ row.sample }}</span>
        </div>
        <span class="ds-type__icon-size">ikon {{ row.iconPx }}px</span>
      </div>
    </div>
  </DsSpecimen>

  <div class="ds-icon-grid">
    <DsSpecimen title="İkon ölçeği" note="Tek aile MDI, outline varyant tercih edilir. 24 üstü yalnızca boş durum / vitrin.">
      <div class="ds-icons">
        <div v-for="(px, name) in iconSize" :key="name" class="ds-icons__cell">
          <v-icon icon="mdi-package-variant-closed" :class="`ds-icons__i--${name}`" aria-hidden="true" />
          <code>{{ name }} · {{ px }}</code>
        </div>
      </div>
    </DsSpecimen>
    <DsSpecimen title="İkon kapsülü (EkIconTile)" note="Her yerde aynı: yuvarlatılmış kare, açık ton zemin, ton rengi ikon.">
      <div class="ds-tiles">
        <div class="ds-tiles__row">
          <EkIconTile icon="mdi-cart-outline" size="sm" />
          <EkIconTile icon="mdi-cart-outline" size="md" />
          <EkIconTile icon="mdi-cart-outline" size="lg" />
          <span class="ds-tiles__note">sm 28/16 · md 36/18 · lg 44/24</span>
        </div>
        <div class="ds-tiles__row">
          <EkIconTile v-for="t in tones" :key="t.tone" :icon="t.icon" :tone="t.tone" />
        </div>
      </div>
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import DsSpecimen from './DsSpecimen.vue'
import EkIconTile, { type EkTone } from '@/components/ds/EkIconTile.vue'
import { typeRole, iconSize } from '@/design/tokens'

const SAMPLES: Record<string, { sample: string; icon: string }> = {
  display: { sample: 'Tasarım sistemi', icon: 'mdi-palette-swatch-outline' },
  metric: { sample: '₺184.920', icon: 'mdi-cash-multiple' },
  title: { sample: 'Sipariş Yönetimi', icon: 'mdi-cart-outline' },
  heading: { sample: 'Bekleyen aksiyonlar', icon: 'mdi-clipboard-text-clock-outline' },
  subheading: { sample: 'Kargo bilgileri', icon: 'mdi-truck-outline' },
  body: { sample: 'Trendyol siparişleri 5 dakikada bir eşitlenir.', icon: 'mdi-sync' },
  label: { sample: 'Satıcı ID', icon: 'mdi-card-account-details-outline' },
  table: { sample: 'TY-102348 · Ayşe K.', icon: 'mdi-pound' },
  tab: { sample: 'Tüm Siparişler', icon: 'mdi-tab' },
  caption: { sample: 'Son eşitleme 3 dk önce', icon: 'mdi-clock-outline' },
  micro: { sample: 'Toplam ciro', icon: 'mdi-information-outline' },
}

const roles = Object.entries(typeRole).map(([role, t]) => ({
  role,
  ...t,
  iconPx: iconSize[t.icon],
  ...SAMPLES[role],
}))

const tones: Array<{ tone: EkTone; icon: string }> = [
  { tone: 'action', icon: 'mdi-cart-outline' },
  { tone: 'success', icon: 'mdi-check-circle-outline' },
  { tone: 'warning', icon: 'mdi-truck-alert-outline' },
  { tone: 'error', icon: 'mdi-alert-octagon-outline' },
  { tone: 'info', icon: 'mdi-sync' },
  { tone: 'neutral', icon: 'mdi-archive-outline' },
  { tone: 'brand', icon: 'mdi-storefront-outline' },
]
</script>

<style scoped>
.ds-type {
  display: flex;
  flex-direction: column;
}

.ds-type__row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 72px;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-3) 0;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ds-type__row:last-child {
  border-bottom: 0;
}

.ds-type__meta {
  display: flex;
  flex-direction: column;
}

.ds-type__name {
  color: var(--ek-color-action-emphasis);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

.ds-type__spec {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
  font-variant-numeric: tabular-nums;
}

.ds-type__use {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-type__sample {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  color: var(--ek-color-content-strong);
}

.ds-type__sample > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-type__icon {
  color: var(--ek-color-action);
}

.ds-type__icon-size {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Her rol kendi token'larını kullanır */
.ds-type__sample--display { font-size: var(--ek-type-display-size); line-height: var(--ek-type-display-line); font-weight: var(--ek-type-display-weight); letter-spacing: var(--ek-type-display-tracking); }
.ds-type__sample--display .ds-type__icon { font-size: var(--ek-type-display-icon); }
.ds-type__sample--metric { font-size: var(--ek-type-metric-size); line-height: var(--ek-type-metric-line); font-weight: var(--ek-type-metric-weight); letter-spacing: var(--ek-type-metric-tracking); font-variant-numeric: tabular-nums; }
.ds-type__sample--metric .ds-type__icon { font-size: var(--ek-type-metric-icon); }
.ds-type__sample--title { font-size: var(--ek-type-title-size); line-height: var(--ek-type-title-line); font-weight: var(--ek-type-title-weight); letter-spacing: var(--ek-type-title-tracking); }
.ds-type__sample--title .ds-type__icon { font-size: var(--ek-type-title-icon); }
.ds-type__sample--heading { font-size: var(--ek-type-heading-size); line-height: var(--ek-type-heading-line); font-weight: var(--ek-type-heading-weight); }
.ds-type__sample--heading .ds-type__icon { font-size: var(--ek-type-heading-icon); }
.ds-type__sample--subheading { font-size: var(--ek-type-subheading-size); line-height: var(--ek-type-subheading-line); font-weight: var(--ek-type-subheading-weight); }
.ds-type__sample--subheading .ds-type__icon { font-size: var(--ek-type-subheading-icon); }
.ds-type__sample--body { font-size: var(--ek-type-body-size); line-height: var(--ek-type-body-line); font-weight: var(--ek-type-body-weight); color: var(--ek-color-content-default); }
.ds-type__sample--body .ds-type__icon { font-size: var(--ek-type-body-icon); }
.ds-type__sample--label { font-size: var(--ek-type-label-size); line-height: var(--ek-type-label-line); font-weight: var(--ek-type-label-weight); }
.ds-type__sample--label .ds-type__icon { font-size: var(--ek-type-label-icon); }
.ds-type__sample--table { font-size: var(--ek-type-table-size); line-height: var(--ek-type-table-line); font-weight: var(--ek-type-table-weight); color: var(--ek-color-content-default); }
.ds-type__sample--table .ds-type__icon { font-size: var(--ek-type-table-icon); }
.ds-type__sample--tab { font-size: var(--ek-type-tab-size); line-height: var(--ek-type-tab-line); font-weight: var(--ek-type-tab-weight); }
.ds-type__sample--tab .ds-type__icon { font-size: var(--ek-type-tab-icon); }
.ds-type__sample--caption { font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); font-weight: var(--ek-type-caption-weight); color: var(--ek-color-content-muted); }
.ds-type__sample--caption .ds-type__icon { font-size: var(--ek-type-caption-icon); }
.ds-type__sample--micro { font-size: var(--ek-type-micro-size); line-height: var(--ek-type-micro-line); font-weight: var(--ek-type-micro-weight); letter-spacing: var(--ek-type-micro-tracking); text-transform: uppercase; color: var(--ek-color-content-muted); }
.ds-type__sample--micro .ds-type__icon { font-size: var(--ek-type-micro-icon); }

.ds-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--ek-space-4);
}

.ds-icons {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ek-space-5);
}

.ds-icons__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
}

.ds-icons__cell code {
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}

.ds-icons__i--xs { font-size: var(--ek-icon-xs); }
.ds-icons__i--sm { font-size: var(--ek-icon-sm); }
.ds-icons__i--md { font-size: var(--ek-icon-md); }
.ds-icons__i--lg { font-size: var(--ek-icon-lg); }
.ds-icons__i--xl { font-size: var(--ek-icon-xl); }
.ds-icons__i--2xl { font-size: var(--ek-icon-2xl); }

.ds-tiles {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ds-tiles__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-tiles__note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (max-width: 767px) {
  .ds-type__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-1);
  }

  .ds-type__icon-size {
    text-align: left;
  }
}
</style>
