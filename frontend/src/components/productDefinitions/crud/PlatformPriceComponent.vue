<!--
  frontend/src/components/productDefinitions/crud/PlatformPriceComponent.vue

  Kanal bazında varyant fiyatları. FR2-PFORM madde 25 — yapı yeniden kuruldu (önceki: her kanal katlanır kutu,
  üstte açılır menülü "Toplu Fiyat Atama", fiyatı olmayan kanal "Fiyat yok" — oysa kanal ana fiyatla gidiyordu):
    1) ANA FİYAT: özel fiyatı olmayan kanalların kullandığı satış/piyasa fiyatı (düzenlenebilir) + indirim oranı.
    2) KANAL TABLOSU: satır başına kanal rozeti · kaynak (Özel fiyat / Ana fiyat) · satış · piyasa · indirim ·
       ana fiyata göre fark; "Özel fiyat gir" ana fiyattan kopyalar, "Ana fiyata dön" özel fiyatı kaldırır.
       Kurallar satırda: satış > 0, satış ≤ piyasa (kanal reddedebilir).
    3) TOPLU DEĞİŞİKLİK: alan (satış/piyasa) · işlem (ata, % artır/azalt, tutar ekle/düş) · değer → önizleme cümlesi → Uygula.
  Model DEĞİŞMEDİ (`prices`, `platforms[kod].prices`); mantık `variants/channelPriceModel.ts`.
-->
<template>
  <div class="cpe">
    <!-- 1) ana fiyat -->
    <section class="cpe-base" aria-labelledby="cpe-base-title">
      <div class="cpe-base__text">
        <h3 id="cpe-base-title" class="cpe-h">Ana fiyat</h3>
        <p class="cpe-sub">Özel fiyat girmediğiniz kanallar bu fiyatla gönderilir.</p>
      </div>
      <div class="cpe-base__fields" data-cpe="base">
        <VCurrencyComponentVue v-model="basePriceForm.salePrice" :compact="true" :isIconExist="false"
          :label="$t('productDefinitions.product.variants.salePrice')" clearable />
        <VCurrencyComponentVue v-model="basePriceForm.marketPrice" :compact="true" :isIconExist="false"
          :label="$t('productDefinitions.product.variants.marketPrice')" clearable />
        <span class="cpe-disc" :class="{ 'is-none': baseDiscount === null }">
          <span class="cpe-micro">İndirim</span>
          <strong class="ek-num">{{ baseDiscount === null ? '—' : pct(baseDiscount) }}</strong>
        </span>
      </div>
    </section>

    <!-- 2) kanal tablosu -->
    <section class="cpe-list" aria-labelledby="cpe-list-title">
      <header class="cpe-list__bar">
        <div>
          <h3 id="cpe-list-title" class="cpe-h">Kanal fiyatları</h3>
          <p class="cpe-sub">
            <strong class="ek-num">{{ customCount }}</strong> kanalda özel fiyat ·
            <strong class="ek-num">{{ rows.length - customCount }}</strong> kanal ana fiyatla
          </p>
        </div>
        <EkButton size="sm" tone="ghost" :icon="bulkOpen ? 'mdi-chevron-up' : 'mdi-tune-variant'" :aria-expanded="bulkOpen"
          aria-controls="cpe-bulk" data-cpe="bulk-toggle" @click="bulkOpen = !bulkOpen">Toplu değişiklik</EkButton>
      </header>

      <!-- 3) toplu değişiklik -->
      <div v-if="bulkOpen" id="cpe-bulk" class="cpe-bulk" role="group" aria-label="Tüm kanallara toplu değişiklik">
        <div class="cpe-bulk__fields">
          <v-btn-toggle v-model="bulk.field" mandatory variant="outlined" divided class="cpe-seg" aria-label="Değişecek fiyat">
            <v-btn value="salePrice" size="small">Satış</v-btn>
            <v-btn value="marketPrice" size="small">Piyasa</v-btn>
          </v-btn-toggle>
          <v-select v-model="bulk.op" :items="BULK_OPS" item-title="title" item-value="value" label="İşlem"
            hide-details class="cpe-bulk__op" />
          <v-text-field v-model.number="bulk.value" type="number" min="0" step="0.01" :label="opUnit === '%' ? 'Oran' : 'Tutar'"
            :prefix="opUnit === '₺' ? '₺' : undefined" :suffix="opUnit === '%' ? '%' : undefined" hide-details
            class="cpe-bulk__val" data-cpe="bulk-value" @keydown.enter.prevent="applyBulkNow" />
          <EkButton tone="primary" size="sm" icon="mdi-check" :disabled="!bulkValid" data-cpe="bulk-apply" @click="applyBulkNow">Uygula</EkButton>
          <EkHelpHint hint="price.rules" class="cpe-help" />
        </div>
        <p class="cpe-bulk__preview" aria-live="polite">{{ preview }}</p>
      </div>

      <div class="cpe-table" role="table" aria-label="Kanal fiyatları">
        <div class="cpe-tr cpe-tr--head" role="row">
          <span role="columnheader">Kanal</span>
          <span role="columnheader" class="is-num">Satış fiyatı</span>
          <span role="columnheader" class="is-num">Piyasa fiyatı</span>
          <span role="columnheader" class="is-num">İndirim</span>
          <span role="columnheader"><span class="ek-sr-only">İşlem</span></span>
        </div>

        <div v-for="row in rows" :key="row.code" class="cpe-tr" :class="{ 'is-custom': row.custom }" role="row" :data-channel="row.code">
          <span class="cpe-ch" role="cell">
            <EkPlatformMark :name="row.title" :code="row.code" />
            <span class="cpe-src" :class="row.custom ? 'is-custom' : 'is-base'">{{ row.custom ? 'Özel fiyat' : 'Ana fiyat' }}</span>
          </span>

          <template v-if="row.custom">
            <span class="cpe-cell cpe-sale" role="cell">
              <span class="cpe-lbl" aria-hidden="true">Satış</span>
              <VCurrencyComponentVue v-model="customOf(row.code).salePrice" :compact="true" :isIconExist="false"
                :aria-label="`${row.title} satış fiyatı`" class="cpe-in" />
              <span v-if="row.diff && row.diff.abs !== 0" class="cpe-diff ek-num" :class="row.diff.abs > 0 ? 'is-up' : 'is-down'">
                <v-icon :icon="row.diff.abs > 0 ? 'mdi-arrow-up' : 'mdi-arrow-down'" aria-hidden="true" />
                {{ money(Math.abs(row.diff.abs)) }}<template v-if="row.diff.pct !== null"> ({{ pct(Math.abs(row.diff.pct)) }})</template>
                <span class="cpe-diff__ref">ana fiyata göre</span>
              </span>
              <span v-else class="cpe-diff is-same">Ana fiyatla aynı</span>
            </span>
            <span class="cpe-cell cpe-market" role="cell">
              <span class="cpe-lbl" aria-hidden="true">Piyasa</span>
              <VCurrencyComponentVue v-model="customOf(row.code).marketPrice" :compact="true" :isIconExist="false"
                :aria-label="`${row.title} piyasa fiyatı`" class="cpe-in" />
              <span class="cpe-diff" aria-hidden="true">&nbsp;</span>
            </span>
          </template>
          <template v-else>
            <span class="cpe-cell cpe-sale cpe-inherit is-num ek-num" role="cell"><span class="cpe-lbl" aria-hidden="true">Satış</span>{{ money(row.sale) }}</span>
            <span class="cpe-cell cpe-market cpe-inherit is-num ek-num" role="cell"><span class="cpe-lbl" aria-hidden="true">Piyasa</span>{{ money(row.market) }}</span>
          </template>

          <span class="cpe-cell is-num ek-num cpe-disc-cell" role="cell">{{ row.discountPct === null ? '—' : pct(row.discountPct) }}</span>

          <span class="cpe-cell cpe-act" role="cell">
            <EkButton v-if="!row.custom" size="sm" tone="secondary" icon="mdi-pencil-outline" :data-cpe="`custom-${row.code}`"
              @click="makeCustom(platformPriceForm, row.code)">Özel fiyat</EkButton>
            <EkTooltip v-else text="Ana fiyata dön (özel fiyatı kaldır)">
              <EkButton size="sm" tone="ghost" icon="mdi-backup-restore" icon-only :aria-label="`${row.title}: ana fiyata dön`"
                :data-cpe="`reset-${row.code}`" @click="resetToBase(platformPriceForm, row.code)" />
            </EkTooltip>
          </span>

          <p v-if="row.issues.length" class="cpe-issues" role="cell">
            <span v-for="(is, k) in row.issues" :key="k" class="cpe-issue" :class="`is-${is.level}`">
              <v-icon :icon="is.level === 'error' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'" aria-hidden="true" />{{ is.message }}
            </span>
          </p>
        </div>

        <EkEmptyState v-if="!rows.length" variant="not-connected" title="Bağlı kanal yok"
          message="Kanal bazında fiyat için önce Entegrasyonlar'dan bir pazaryeri ya da e-ticaret kanalı bağlayın." />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import { computed, reactive, ref } from 'vue'
import { EkButton, EkEmptyState, EkPlatformMark, EkTooltip } from '@entegrasyonik/ui/components'
import { formatMoney, formatPercent } from '@entegrasyonik/ui/format'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import {
  applyBulk, BULK_OPS, bulkPreview, channelRows, discountPct, makeCustom, resetToBase, type BulkField, type BulkOp,
} from '../variants/channelPriceModel'

const props = defineProps<{
  platformPriceForm: any
  categoryId: any
}>()

const integrationStore = useIntegrationStore()
const { showToast } = useToast()

const channels = computed<any[]>(() => [...(integrationStore.getClientMarketplaces() ?? []), ...(integrationStore.getClientECommerces() ?? [])]
  .map((c: any) => ({ code: c.code, title: c.title || c.code })))
const rows = computed(() => channelRows(channels.value, props.platformPriceForm))
const customCount = computed(() => rows.value.filter((r) => r.custom).length)

/** Ana fiyat nesnesi (yoksa oluşturulur; ürün kaydında zaten var). */
// Çağıran varyant nesnesini doğrudan düzenler (mevcut sözleşme); ana fiyat nesnesi yoksa kurulumda bir kez açılır.
// eslint-disable-next-line vue/no-mutating-props
if (!props.platformPriceForm.prices) props.platformPriceForm.prices = { salePrice: 0, marketPrice: 0, isPlatformBasedPrice: true }
const basePriceForm = computed(() => props.platformPriceForm.prices)
const baseDiscount = computed(() => discountPct(Number(basePriceForm.value.salePrice) || 0, Number(basePriceForm.value.marketPrice) || 0))
const customOf = (code: string) => props.platformPriceForm.platforms[code].prices

const money = (v: number) => formatMoney(Number(v) || 0)
/** 17.8 → "%17,8" (DS biçimleyici; oran 0..1). */
const pct = (v: number) => formatPercent(v / 100)

// ---- toplu değişiklik ----
const bulkOpen = ref(false)
const bulk = reactive<{ field: BulkField; op: BulkOp; value: number | null }>({ field: 'salePrice', op: 'pctUp', value: null })
const opUnit = computed(() => BULK_OPS.find((o) => o.value === bulk.op)?.unit ?? '₺')
const bulkValid = computed(() => rows.value.length > 0 && bulk.value !== null && Number.isFinite(Number(bulk.value)) && Number(bulk.value) > 0)
const preview = computed(() => bulkPreview(rows.value, bulk.field, bulk.op, bulk.value))

function applyBulkNow() {
  if (!bulkValid.value) return
  const res = applyBulk(props.platformPriceForm, rows.value.map((r) => r.code), bulk.field, bulk.op, Number(bulk.value))
  showToast({
    tone: 'success',
    message: `${res.changed} kanalın ${bulk.field === 'salePrice' ? 'satış' : 'piyasa'} fiyatı güncellendi${res.converted ? ` (${res.converted} kanal özel fiyata geçti)` : ''}. Ürünü kaydedince geçerli olur.`,
  })
  bulk.value = null
}

function init() {
  bulk.value = null
}

defineExpose({ init })
</script>

<style scoped>
.cpe {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}

.cpe-h {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: 600;
}

.cpe-sub {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cpe-micro {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

/* 1) ana fiyat */
.cpe-base {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(0, 2fr);
  gap: var(--ek-space-4);
  align-items: center;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.cpe-base__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 72px;
  gap: var(--ek-space-3);
  align-items: center;
}

.cpe-disc {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  color: var(--ek-color-success-emphasis);
}

.cpe-disc.is-none {
  color: var(--ek-color-content-subtle);
}

/* 2) kanal tablosu */
.cpe-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.cpe-list__bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.cpe-table {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.cpe-tr {
  display: grid;
  grid-template-columns: minmax(170px, 1.1fr) minmax(0, 1fr) minmax(0, 1fr) 72px 128px;
  gap: var(--ek-space-3);
  align-items: center;
  min-height: 64px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.cpe-tr--head {
  min-height: 40px;
  border-top: 0;
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cpe-tr.is-custom {
  background: var(--ek-color-surface);
}

.cpe-tr:not(.is-custom):not(.cpe-tr--head) {
  background: var(--ek-color-surface-sunken);
}

.is-num {
  text-align: right;
  justify-self: stretch;
}

.cpe-ch {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-1);
  min-width: 0;
}

.cpe-src {
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  font-size: var(--ek-type-micro-size);
  font-weight: 600;
  line-height: 18px;
}

.cpe-src.is-custom {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.cpe-src.is-base {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
}

.cpe-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cpe-inherit {
  color: var(--ek-color-content-muted);
}

.cpe-lbl {
  display: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

/* Görünür etiket yok (sütun başlığı var; ekran okuyucuya aria-label) → çerçevedeki boş etiket boşluğu kapanır. */
.cpe-in :deep(.v-field__outline__notch) {
  display: none;
}

.cpe-in :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cpe-diff {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.cpe-diff :deep(.v-icon) {
  font-size: 13px;
}

.cpe-diff.is-up {
  color: var(--ek-color-success-emphasis);
}

.cpe-diff.is-down {
  color: var(--ek-color-warning-emphasis);
}

.cpe-diff.is-same {
  color: var(--ek-color-content-subtle);
}

.cpe-diff__ref {
  color: var(--ek-color-content-muted);
}

.cpe-disc-cell {
  color: var(--ek-color-content-default);
  font-weight: 600;
}

.cpe-act {
  align-items: flex-end;
}

.cpe-issues {
  display: flex;
  flex-wrap: wrap;
  grid-column: 2 / -1;
  gap: var(--ek-space-3);
  margin: 0;
}

.cpe-issue {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
}

.cpe-issue :deep(.v-icon) {
  font-size: 15px;
}

.cpe-issue.is-error {
  color: var(--ek-color-error-emphasis);
}

.cpe-issue.is-warning {
  color: var(--ek-color-warning-emphasis);
}

/* 3) toplu değişiklik */
.cpe-bulk {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-action-subtle);
}

.cpe-bulk__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.cpe-seg {
  height: var(--ek-control-h-field);
  background: var(--ek-color-surface);
}

.cpe-bulk__op {
  flex: 0 1 200px;
  min-width: 160px;
  background: var(--ek-color-surface);
}

.cpe-bulk__val {
  flex: 0 1 140px;
  min-width: 110px;
  background: var(--ek-color-surface);
}

.cpe-bulk__preview {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (max-width: 719px) {
  .cpe-base {
    grid-template-columns: minmax(0, 1fr);
  }

  .cpe-base__fields {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .cpe-disc {
    grid-column: 1 / -1;
    flex-direction: row;
    justify-content: space-between;
  }

  .cpe-tr--head {
    display: none;
  }

  .cpe-tr {
    grid-template-areas: 'ch act' 'sale market' 'disc disc' 'iss iss';
    align-items: start;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    row-gap: var(--ek-space-2);
    padding: var(--ek-space-3);
  }

  .cpe-ch { grid-area: ch; }
  .cpe-act { grid-area: act; }
  .cpe-sale { grid-area: sale; }
  .cpe-market { grid-area: market; }
  .cpe-disc-cell { grid-area: disc; flex-direction: row; justify-content: flex-start; gap: var(--ek-space-1); }
  .cpe-issues { grid-area: iss; }

  .cpe-lbl {
    display: block;
    text-align: left;
  }

  .cpe-disc-cell::before {
    content: 'İndirim';
    color: var(--ek-color-content-muted);
    font-weight: 400;
  }

  .cpe-market .cpe-diff[aria-hidden='true'] {
    display: none;
  }

}
</style>
