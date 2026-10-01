<!--
  frontend/src/components/productDefinitions/variants/ProductVariantListComponent.vue

  Ürün listesinde varyantlı ürünün SEÇENEKLER bölümü (ürün satırının altında açılır). A11 + B1:
    • Açılış: yükseklik + opaklık (grid satırı 0fr→1fr, `--ek-duration-base`; reduced-motion'da süre 0).
    • Özet şeridi: varyant sayısı, grup sayısı, toplam stok, tükenen/az stok, kanal kapsamı (yayında/gönderilen, hata sayısı).
    • B1 — Gruplar ürün güncelle varyant ızgarasıyla AYNI desen: ayırıcı seçenek (ör. Renk) ilk kolonda rowspan'lı birleşik
      hücre (`VariantGroupCell`, değer + varyant sayısı + grup stoğu); sıra seçenek TANIM sırası (`useVariantGrouping`);
      rowspan hesabı `variantSheet.windowRowspans` ("Tümünü gör" kırpmasında grup hücresi kalan kısım kadar).
    • Satır: küçük görsel (`ProductThumb`: kare, iskelet, yer tutucu, çoklu görselde yığın kenarı, gecikmeli önizleme) ·
      kalan seçenek çipleri + stok kodu (mono) · barkod (mono + kopyala) · fiyat (sağa hizalı, tabular) ·
      stok (tükendi/az tonu + raf) · kanal durumları · satır eylemleri (`EkRowActions`).
    • Kanal durumu: gönderilmiş kanal = kanal rengi nokta + ad + durum ikonu; ipucunda durum + kısa neden; tıklayınca ayrıntı kartı
      (`ProductVariantListTooltipComponent`). Hiç gönderilmemiş kanallar tek soluk çipte toplanır (gürültü azaltma).
    • Çok varyant (> 8): ilk 8 satır + "Tümünü gör"; açıkken liste kendi içinde kayar (yapışık başlık + yapışık grup adı).
    • Dar kap (< 600px): satırlar KART (A6b mobil kart deseni); grup hücresi grubun ilk kartının üstünde tam genişlik başlık.
  Veri yalnız backend varyant projeksiyonundan (bkz. `variantListModel.ts`). Kanala gönder / durum sorgula satır eylemleri
  YOK: `IntegrationService/processPlatformProduct` ve `checkProductStatus` backend'de tanımsız (FE_CALLS_WITHOUT_BACKEND).
-->
<template>
  <div class="pvl-reveal" :class="{ 'is-open': revealed }">
    <div class="pvl-reveal__inner">
      <section ref="rootRef" class="pvl" :class="{ 'is-compact': isCompact }" :aria-label="`${productInfoForm.title ?? 'Ürün'} varyantları`">
        <header class="pvl-summary">
          <div class="pvl-summary__facts">
            <span class="pvl-fact pvl-fact--lead"><span class="ek-num">{{ summary.count }}</span> varyant</span>
            <span v-if="grouped" class="pvl-fact"><span class="ek-num">{{ groupCount }}</span> {{ slicerTitle }}</span>
            <span class="pvl-fact">Toplam stok <strong class="ek-num">{{ summary.totalStock }}</strong></span>
            <span v-if="summary.outOfStock" class="pvl-flag is-out"><span class="ek-num">{{ summary.outOfStock }}</span> tükendi</span>
            <span v-if="summary.lowStock" class="pvl-flag is-low" :title="`${LOW_STOCK_THRESHOLD} adet ve altı`"><span class="ek-num">{{ summary.lowStock }}</span> az stok</span>
            <span v-if="selectedCount" class="pvl-flag is-selected"><span class="ek-num">{{ selectedCount }}</span> seçili</span>
          </div>
          <ul class="pvl-summary__channels" aria-label="Kanal kapsamı">
            <li class="pvl-summary__label" aria-hidden="true">Kanallar</li>
            <li v-for="c in sentChannels" :key="c.code" class="pvl-cov">
              <EkChannelBadge :code="c.code" :name="channelTitle(c.code)" size="xs" />
              <span class="pvl-cov__val"><span class="ek-num">{{ c.live }}/{{ summary.count }}</span> yayında</span>
              <span v-if="c.failed" class="pvl-cov__err"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" /><span class="ek-num">{{ c.failed }}</span> hata</span>
              <span v-else-if="c.waiting" class="pvl-cov__wait"><v-icon icon="mdi-clock-outline" aria-hidden="true" /><span class="ek-num">{{ c.waiting }}</span> bekliyor</span>
            </li>
            <li v-if="unsentChannels.length" class="pvl-cov is-unsent" :title="unsentChannels.map((c) => channelTitle(c.code)).join(', ')">
              {{ unsentChannels.length === 1 ? channelTitle(unsentChannels[0].code) : `${unsentChannels.length} kanal` }} gönderilmedi
            </li>
          </ul>
        </header>

        <div :id="scrollId" class="pvl-scroll" :class="{ 'is-scrolling': showAll && summary.count > COMPACT_LIMIT }">
          <table class="pvl-table" :class="{ 'is-grouped': grouped, 'is-header-named': choiceInHeader }" :aria-label="`${productInfoForm.title ?? 'Ürün'} varyant listesi`" :aria-rowcount="summary.count + 1">
            <thead>
              <tr>
                <th class="pvl-th pvl-th--select" scope="col">
                  <input ref="allRef" type="checkbox" class="pvl-check" :checked="allSelected" aria-label="Tüm varyantları seç" @change="toggleAll" />
                </th>
                <th v-if="grouped" class="pvl-th pvl-th--group" scope="col">{{ slicerTitle }}</th>
                <th class="pvl-th" scope="col" :aria-sort="ariaSort('choices')">
                  <button type="button" class="pvl-sort" :class="{ 'is-on': sortBy === 'choices' }" @click="toggleSort('choices')">
                    {{ grouped ? otherChoicesTitle : 'Varyant' }}<v-icon class="pvl-sort__icon" :icon="sortIconFor('choices')" aria-hidden="true" />
                  </button>
                </th>
                <th class="pvl-th" scope="col" :aria-sort="ariaSort('barcode')">
                  <button type="button" class="pvl-sort" :class="{ 'is-on': sortBy === 'barcode' }" @click="toggleSort('barcode')">
                    Barkod<v-icon class="pvl-sort__icon" :icon="sortIconFor('barcode')" aria-hidden="true" />
                  </button>
                </th>
                <th class="pvl-th pvl-th--end" scope="col" :aria-sort="ariaSort('salePrice')">
                  <button type="button" class="pvl-sort" :class="{ 'is-on': sortBy === 'salePrice' }" @click="toggleSort('salePrice')">
                    Fiyat<v-icon class="pvl-sort__icon" :icon="sortIconFor('salePrice')" aria-hidden="true" />
                  </button>
                </th>
                <th class="pvl-th pvl-th--end" scope="col" :aria-sort="ariaSort('stock')">
                  <button type="button" class="pvl-sort" :class="{ 'is-on': sortBy === 'stock' }" @click="toggleSort('stock')">
                    Stok<v-icon class="pvl-sort__icon" :icon="sortIconFor('stock')" aria-hidden="true" />
                  </button>
                </th>
                <th class="pvl-th" scope="col">Kanal durumu</th>
                <th class="pvl-th pvl-th--actions" scope="col"><span class="ek-sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in visibleRows" :key="r.variant._id ?? r.variant.barcode ?? r.index" class="pvl-row"
                :class="{
                  'is-selected': isSelected(r.variant), 'is-out': stockTone(r.variant.stock) === 'out',
                  'is-group-start': grouped && r.groupStart, 'has-group-cell': grouped && spans.has(r.index),
                }">
                <td class="pvl-td pvl-td--select">
                  <input type="checkbox" class="pvl-check" :checked="isSelected(r.variant)" :aria-label="`${r.variant.stockcode} varyantını seç`" @change="toggleRow(r.variant)" />
                </td>
                <VariantGroupCell v-if="grouped && spans.has(r.index)" :rowspan="spans.get(r.index)" role="rowheader"
                  class="pvl-vgroup" :title="grouping.groupLabel(r.variant)" :count="r.groupSize" :alt="r.groupIndex % 2 === 1">
                  <template #meta> · stok <span class="ek-num">{{ groupStock.get(r.groupKey) ?? 0 }}</span></template>
                </VariantGroupCell>
                <td class="pvl-td pvl-td--variant">
                  <div class="pvl-ident">
                    <ProductThumb class="pvl-thumb" :src="imagesOf(r.variant)[0]" :gallery="imagesOf(r.variant)"
                      :size="isCompact ? 'xs' : 'sm'" :interactive="imagesOf(r.variant).length > 0"
                      :label="`${rowTitle(r.variant)} görsellerini aç`" :caption="rowTitle(r.variant)" @click="openGallery(r.variant)" />
                    <span class="pvl-ident__text">
                      <span class="pvl-choices">
                        <span v-for="choice of rowChoices(r.variant.choices, grouped)" :key="choice.choiceId" class="pvl-choice">
                          <span class="pvl-choice__label">{{ choiceTitle(choice.choiceId) }}</span>
                          <span class="pvl-choice__value">{{ choiceValueName(choice.choiceId, choice.choiceValueId) ?? '—' }}</span>
                        </span>
                        <span v-if="!r.variant.choices?.length" class="pvl-muted">Seçenek yok</span>
                      </span>
                      <span class="pvl-code">{{ r.variant.stockcode }}</span>
                    </span>
                  </div>
                </td>
                <td class="pvl-td pvl-td--barcode" data-label="Barkod">
                  <span v-if="r.variant.barcode" class="pvl-barcode">
                    <span class="pvl-mono">{{ r.variant.barcode }}</span>
                    <button type="button" class="pvl-copy" :aria-label="`${r.variant.barcode} barkodunu kopyala`" @click="copy(r.variant.barcode, 'Barkod')">
                      <v-icon :icon="icons.copy" aria-hidden="true" />
                    </button>
                  </span>
                  <span v-else class="pvl-muted">—</span>
                </td>
                <td class="pvl-td pvl-td--end" data-label="Fiyat">
                  <span v-if="r.variant.prices?.isPlatformBasedPrice === true" class="pvl-price">
                    <span class="pvl-price__sale ek-num">{{ money(minOf(r.variant, 'salePrice')) }} – {{ money(maxOf(r.variant, 'salePrice')) }}</span>
                    <span class="pvl-price__note">Kanala göre</span>
                  </span>
                  <span v-else class="pvl-price">
                    <span class="pvl-price__sale ek-num">{{ money(r.variant.prices?.salePrice) }}</span>
                    <span v-if="Number(r.variant.prices?.marketPrice) > 0" class="pvl-price__market ek-num">Piyasa {{ money(r.variant.prices.marketPrice) }}</span>
                  </span>
                </td>
                <td class="pvl-td pvl-td--end" data-label="Stok">
                  <span class="pvl-stock" :class="`is-${stockTone(r.variant.stock)}`">
                    <span class="pvl-stock__qty ek-num">{{ Math.max(0, Number(r.variant.stock) || 0) }}</span>
                    <span v-if="stockTone(r.variant.stock) === 'out'" class="pvl-stock__tag">Tükendi</span>
                    <span v-else-if="stockTone(r.variant.stock) === 'low'" class="pvl-stock__tag" :title="`${LOW_STOCK_THRESHOLD} adet ve altı`">Az</span>
                    <span v-if="r.variant.shelf" class="pvl-stock__shelf"><v-icon icon="mdi-map-marker-outline" aria-hidden="true" />Raf {{ r.variant.shelf }}</span>
                  </span>
                </td>
                <td class="pvl-td pvl-td--channels" data-label="Kanallar">
                  <!-- FR2 21: ürün satırıyla AYNI kanal karosu (kısa rozet + durum işareti); gönderilmiş kanal tıklanınca ayrıntı kartı. -->
                  <span class="pvl-channels">
                    <!-- Ürün satırıyla AYNI dil: yalnız gönderilmiş kanallar karo; gönderilmeyenler tek soluk "+n" hapında. -->
                    <template v-for="ch in rowChannels(r.variant).sent" :key="ch.code">
                      <v-menu v-if="ch.status.key !== 'none'" :close-on-content-click="false" location="bottom center" transition="fade-transition" offset="8">
                        <template #activator="{ props: menuProps }">
                          <v-tooltip location="top" :open-delay="300" :eager="false" transition="fade-transition" max-width="320">
                            <template #activator="{ props: tipProps }">
                              <button type="button" v-bind="mergeProps(menuProps, tipProps)" class="pvl-ch"
                                :data-channel-state="ch.state.tone"
                                :aria-label="`${channelTitle(ch.code)}: ${ch.state.label}${ch.state.reason ? ' — ' + ch.state.reason : ''}. Ayrıntı`">
                                <ChannelStatusTile :status="ch.status" :name="channelTitle(ch.code)" size="xs" />
                              </button>
                            </template>
                            <span class="pvl-tip">
                              <strong>{{ channelTitle(ch.code) }} · {{ ch.state.label }}</strong>
                              <span v-if="ch.state.reason" class="pvl-tip__reason">{{ ch.state.reason }}</span>
                              <span class="pvl-tip__hint">Ayrıntı için tıklayın</span>
                            </span>
                          </v-tooltip>
                        </template>
                        <ProductVariantListTooltipComponent :data="r.variant.platforms?.[ch.code]" :channel-code="ch.code" :channel-name="channelTitle(ch.code)" />
                      </v-menu>
                    </template>
                    <!-- "+n" tıklanınca bilgi kartı: hangi kanallara gönderilmedi + nasıl gönderilir. -->
                    <v-menu v-if="rowChannels(r.variant).unsent.length" :close-on-content-click="false" location="bottom end"
                      transition="fade-transition" offset="8">
                      <template #activator="{ props: absentProps }">
                        <button type="button" v-bind="absentProps" class="pvl-absent"
                          :aria-label="`${rowChannels(r.variant).unsent.length} kanala gönderilmedi. Ayrıntı`">
                          <span aria-hidden="true">+{{ rowChannels(r.variant).unsent.length }}</span>
                        </button>
                      </template>
                      <section class="pvl-absent-card" role="dialog" :aria-label="`${r.variant.stockcode} — gönderilmeyen kanallar`">
                        <header class="pvl-absent-card__head">
                          <span class="pvl-absent-card__title">Gönderilmeyen kanallar</span>
                          <span class="pvl-absent-card__sub">{{ r.variant.stockcode }}</span>
                        </header>
                        <ul class="pvl-absent-card__list">
                          <li v-for="code in rowChannels(r.variant).unsent" :key="code">
                            <EkChannelBadge :code="code" :name="channelTitle(code)" size="xs" />
                            <span class="pvl-absent-card__state">Gönderilmedi</span>
                          </li>
                        </ul>
                        <p class="pvl-absent-card__hint">
                          <v-icon icon="mdi-information-outline" aria-hidden="true" />
                          Göndermek için ürünü seçip Toplu işlemler → Kanallara yükle.
                        </p>
                      </section>
                    </v-menu>
                    <span v-if="!rowChannels(r.variant).sent.length && !rowChannels(r.variant).unsent.length" class="pvl-absent-none">—</span>
                  </span>
                </td>
                <td class="pvl-td pvl-td--actions">
                  <EkRowActions :label="`${r.variant.stockcode} işlemleri`" :items="rowActions(r.variant)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer v-if="summary.count > COMPACT_LIMIT" class="pvl-more">
          <button type="button" class="pvl-more__btn" :aria-expanded="showAll" :aria-controls="scrollId" @click="showAll = !showAll">
            <template v-if="showAll">Daha az göster</template>
            <template v-else>Tümünü gör · <span class="ek-num">{{ summary.count - COMPACT_LIMIT }}</span> varyant daha</template>
            <v-icon class="pvl-more__chevron" :class="{ 'is-open': showAll }" icon="mdi-chevron-down" aria-hidden="true" />
          </button>
        </footer>
      </section>
      <ProductGalleryDialog :open="!!galleryVariant" :images="galleryVariant ? imagesOf(galleryVariant) : []"
        :title="productInfoForm.title ?? 'Ürün'" :subtitle="galleryVariant ? rowTitle(galleryVariant) : ''"
        @close="galleryVariant = null" @edit="editFromGallery" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, mergeProps, getCurrentInstance } from 'vue'
import { formatMoney } from '@entegrasyonik/ui/format'
import { useChoicesStore } from '@/stores/choicesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { channelName } from '@entegrasyonik/ui/tokens'
import { icons } from '@entegrasyonik/ui/icons'
import { EkChannelBadge, EkRowActions } from '@entegrasyonik/ui/components'
import type { EkRowAction } from '@entegrasyonik/ui/components'
import ProductThumb from '../products/ProductThumb.vue'
import ProductGalleryDialog from '../products/ProductGalleryDialog.vue'
import ChannelStatusTile from '../products/ChannelStatusTile.vue'
import { productChannelStatus, type ProductChannelStatus } from '../products/channelStatus'
import { variantImageSrcs } from '../products/productImage'
import ProductVariantListTooltipComponent from './ProductVariantListTooltipComponent.vue'
import VariantGroupCell from './VariantGroupCell.vue'
import { sortGrouped, useVariantGrouping } from './useVariantGrouping'
import { windowRowspans } from './grid/variantSheet'
import {
  COMPACT_LIMIT, LOW_STOCK_THRESHOLD, channelState, isGroupable, rowChoices, slicerChoice, stockTone, summarizeVariants,
  type ChannelState,
} from './variantListModel'

const props = defineProps<{ productInfoForm: any }>()
// Geri uyum: üst bileşenin bağladığı olaylar korunur (kanala gönder/durum sorgula backend'de tanımsız → satırda tetiklenmez).
const emit = defineEmits(['checkVariantStatus', 'refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close', 'transferVariant', 'updatePriceVariant', 'updateStockVariant', 'updateVariant', 'editProduct'])
const selectedVariants = defineModel<string[]>('selectedVariants', { default: () => [] })

const choicesStore = useChoicesStore()
const integrationStore = useIntegrationStore()
const { showToast } = useToast()

const scrollId = `pvl-scroll-${getCurrentInstance()?.uid ?? 0}`
const rootRef = ref<HTMLElement>()
const allRef = ref<HTMLInputElement>()
const revealed = ref(false)
const showAll = ref(false)
const sortBy = ref<'choices' | 'barcode' | 'salePrice' | 'stock'>('choices')
const sortDir = ref<'asc' | 'desc'>('asc')

onMounted(() => {
  // Yükseklik + opaklık açılışı: ilk karede kapalı çiz, sonraki karede aç (geçiş token süresinde).
  requestAnimationFrame(() => requestAnimationFrame(() => (revealed.value = true)))
})

const variants = computed<any[]>(() => props.productInfoForm?.variants ?? [])
const channelCodes = computed<string[]>(() => (integrationStore.getClientPlatforms?.() ?? []).map((i: any) => i.code))
const channelTitles = computed<Record<string, string>>(() =>
  Object.fromEntries((integrationStore.getClientPlatforms?.() ?? []).map((i: any) => [i.code, channelName(i.code, i.title)])),
)
const channelTitle = (code: string) => channelTitles.value[code] ?? channelName(code)

const choiceTitle = (choiceId: any) => choicesStore.getChoiceTitle(choiceId) ?? 'Seçenek'
const choiceValueName = (choiceId: any, valueId: any): string | undefined => choicesStore.getChoiceValueName(choiceId, valueId)
const valueTitle = (c: any) => choiceValueName(c?.choiceId, c?.choiceValueId) ?? ''

const summary = computed(() => summarizeVariants(variants.value, channelCodes.value))
const sentChannels = computed(() => summary.value.channels.filter((c) => c.sent > 0))
const unsentChannels = computed(() => summary.value.channels.filter((c) => c.sent === 0))

/** Gruplu görünüm: varyantlarda ayırıcı + en az bir başka seçenek varsa ve gruplar tekil değilse (`isGroupable`). */
const grouped = computed(() => isGroupable(variants.value, !!props.productInfoForm?.hasVariant))
const slicerTitle = computed(() => choiceTitle(slicerChoice(variants.value[0]?.choices).choiceId))
/** Gruplu görünümde varyant kolonu başlığı: kalan seçeneklerin adı (ör. "Beden"); karışıksa "Varyant". */
const otherChoicesTitle = computed(() => {
  const ids = new Set<string>()
  for (const v of variants.value) for (const c of rowChoices(v.choices, true)) ids.add(c.choiceId)
  return ids.size === 1 ? choiceTitle([...ids][0]) : 'Varyant'
})
/** Kolon başlığı seçeneği adlandırıyorsa (ör. "Beden") çipte ad tekrarlanmaz — yalnız değer ("M"). */
const choiceInHeader = computed(() => grouped.value && otherChoicesTitle.value !== 'Varyant')
const isCompact = computed(() => summary.value.count > COMPACT_LIMIT)

// Ürün güncelle varyant ızgarasıyla ortak sıra + gruplama (grup = ayırıcı seçenek; tanım sırası).
const grouping = useVariantGrouping((v) => slicerChoice(v?.choices))

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true })
const rows = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  const key = sortBy.value
  const cmp = key === 'choices' ? null
    : key === 'salePrice' ? (a: any, b: any) => (Number(a.prices?.salePrice) - Number(b.prices?.salePrice)) * dir
    : key === 'stock' ? (a: any, b: any) => ((Number(a.stock) || 0) - (Number(b.stock) || 0)) * dir
    : (a: any, b: any) => collator.compare(String(a.barcode ?? ''), String(b.barcode ?? '')) * dir
  const ordered = sortGrouped(variants.value, {
    groupCmp: grouped.value ? grouping.groupCmp : () => 0,
    cmp,
    fallback: (a: any, b: any) => grouping.byChoices(a, b) || collator.compare(String(a.stockcode ?? ''), String(b.stockcode ?? '')),
    reverse: key === 'choices' && dir < 0,
  })
  return grouping.group(ordered)
})
const groupCount = computed(() => new Set(rows.value.map((r) => r.groupKey)).size)
const groupStock = computed(() => {
  const m = new Map<string, number>()
  for (const r of rows.value) m.set(r.groupKey, (m.get(r.groupKey) ?? 0) + Math.max(0, Number(r.variant.stock) || 0))
  return m
})
const visibleRows = computed(() => (showAll.value || rows.value.length <= COMPACT_LIMIT ? rows.value : rows.value.slice(0, COMPACT_LIMIT)))
/** Grup hücresi rowspan'ları (ızgarayla aynı hesap): kırpılan grupta hücre görünen kısım kadar. */
const spans = computed(() => windowRowspans(rows.value, 0, visibleRows.value.length))

const toggleSort = (key: typeof sortBy.value) => {
  if (sortBy.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = key; sortDir.value = 'asc' }
}
const sortIconFor = (key: string) => (sortBy.value === key ? (sortDir.value === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down') : 'mdi-swap-vertical')
const ariaSort = (key: string) => (sortBy.value === key ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : 'none')

// Seçim (barkod anahtarlı — üst bileşenin toplu işlem sözleşmesi).
const isSelected = (v: any) => selectedVariants.value.includes(v.barcode)
const selectedCount = computed(() => variants.value.filter(isSelected).length)
const allSelected = computed(() => variants.value.length > 0 && selectedCount.value === variants.value.length)
watch([selectedCount, allSelected, allRef], () => {
  if (allRef.value) allRef.value.indeterminate = selectedCount.value > 0 && !allSelected.value
}, { immediate: true })
const toggleRow = (v: any) => {
  selectedVariants.value = isSelected(v) ? selectedVariants.value.filter((b) => b !== v.barcode) : [...selectedVariants.value, v.barcode]
}
const toggleAll = () => {
  selectedVariants.value = allSelected.value ? [] : variants.value.map((v) => v.barcode)
}

const imagesOf = (v: any) => variantImageSrcs(v, props.productInfoForm)
const rowTitle = (v: any) => {
  const opts = (v.choices ?? []).map(valueTitle).filter(Boolean).join(' / ')
  return [opts, v.stockcode].filter(Boolean).join(' · ') || 'Varyant'
}

const money = (n: unknown) => formatMoney(Number(n) || 0)
const channelPrices = (v: any, field: 'salePrice' | 'marketPrice') =>
  Object.values(v.platforms ?? {}).map((p: any) => Number(p?.prices?.[field])).filter((n) => Number.isFinite(n) && n > 0)
const minOf = (v: any, f: 'salePrice' | 'marketPrice') => { const xs = channelPrices(v, f); return xs.length ? Math.min(...xs) : 0 }
const maxOf = (v: any, f: 'salePrice' | 'marketPrice') => { const xs = channelPrices(v, f); return xs.length ? Math.max(...xs) : 0 }

/** Satırın kanal durumları: bağlı TÜM kanallar (gönderilmemişler pasif karo) — ürün satırıyla aynı tek bakış dili. */
const rowChannels = (v: any) => {
  const all: { code: string; state: ChannelState; status: ProductChannelStatus }[] = channelCodes.value.map((code) => ({
    code,
    state: channelState(v, code),
    status: productChannelStatus({ variants: [v] }, code),
  }))
  return { all, sent: all.filter((c) => c.state.key !== 'none'), unsent: all.filter((c) => c.state.key === 'none').map((c) => c.code) }
}

// FR2 19–20: varyant görseli tıklanınca salt-okunur galeri (ürün satırıyla aynı).
const galleryVariant = ref<any>(null)
function openGallery(v: any) {
  if (imagesOf(v).length) galleryVariant.value = v
}
function editFromGallery() {
  const v = galleryVariant.value
  galleryVariant.value = null
  if (v) emit('editProduct', { variantId: v._id })
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast({ tone: 'success', message: `${what} kopyalandı: ${text}` })
  } catch {
    showToast({ tone: 'warning', message: `${what} kopyalanamadı; tarayıcı pano iznini kontrol edin.` })
  }
}

const rowActions = (v: any): EkRowAction[] => [
  { key: 'edit', action: 'edit', label: 'Ürün formunda düzenle', onClick: () => emit('editProduct', { variantId: v._id }) },
  ...(v.barcode ? [{ key: 'copy-barcode', action: 'copy' as const, label: 'Barkodu kopyala', onClick: () => copy(v.barcode, 'Barkod') }] : []),
  { key: 'copy-stockcode', action: 'copy', label: 'Stok kodunu kopyala', onClick: () => copy(v.stockcode, 'Stok kodu') },
]
</script>

<style scoped>
/* A11 — satır altı varyant alanı. Yalnız semantik token (dark mode'a hazır); sayılar tabular; hareket token süreleri. */

/* Açılış: yükseklik (grid 0fr→1fr) + opaklık. */
.pvl-reveal {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--ek-motion-reveal),
    opacity var(--ek-motion-reveal);
}

.pvl-reveal.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.pvl-reveal__inner {
  min-height: 0;
  overflow: hidden;
}

/* Kap: ürün satırının devamı — sol hizalama çizgisi + iç girinti, satırla birleşen üst kenar. */
.pvl {
  --pvl-indent: 56px;
  position: relative;
  container-type: inline-size;
  margin: 0 var(--ek-space-4) var(--ek-space-4) var(--pvl-indent);
  border: 1px solid var(--ek-color-border-default);
  border-top: 0;
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

/* Özet şeridi */
.pvl-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 2px solid var(--ek-color-action-border);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvl-summary__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
  color: var(--ek-color-content-muted);
}

.pvl-fact strong,
.pvl-fact--lead {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-fact--lead {
  font-size: var(--ek-type-label-size);
}

.pvl-fact + .pvl-fact::before {
  content: '·';
  margin-right: var(--ek-space-3);
  color: var(--ek-color-content-subtle);
}

.pvl-flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 var(--ek-space-2);
  border: 1px solid;
  border-radius: var(--ek-radius-chip);
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-flag.is-out { border-color: var(--ek-color-error-border); background: var(--ek-color-error-subtle); color: var(--ek-color-error-emphasis); }
.pvl-flag.is-low { border-color: var(--ek-color-warning-border); background: var(--ek-color-warning-subtle); color: var(--ek-color-warning-emphasis); }
.pvl-flag.is-selected { border-color: var(--ek-color-action-border); background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }

.pvl-summary__channels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pvl-summary__label {
  align-self: center;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pvl-cov {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 var(--ek-space-2) 0 3px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  white-space: nowrap;
}

.pvl-cov__val {
  color: var(--ek-color-content-muted);
}

.pvl-cov__val .ek-num {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-cov__err,
.pvl-cov__wait {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-left: 6px;
  border-left: 1px solid var(--ek-color-border-subtle);
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-cov__err { color: var(--ek-color-error-emphasis); }
.pvl-cov__wait { color: var(--ek-color-info-emphasis); }

.pvl-cov__err .v-icon,
.pvl-cov__wait .v-icon {
  font-size: var(--ek-icon-xs);
}

.pvl-cov.is-unsent {
  border-style: dashed;
  background: transparent;
  color: var(--ek-color-content-muted);
}

/* Tablo */
.pvl-scroll {
  overflow-x: auto;
}

.pvl-scroll.is-scrolling {
  max-height: 520px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pvl-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.pvl-th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 34px;
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}

.pvl-th--end { text-align: right; }
.pvl-th--select,
.pvl-td--select { width: 44px; padding: 0 0 0 var(--ek-space-4); }
.pvl-th--actions,
.pvl-td--actions { width: 1%; padding-right: var(--ek-space-3); }

.pvl-sort {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0 calc(-1 * var(--ek-space-1));
  padding: 2px var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pvl-sort:hover,
.pvl-sort.is-on { color: var(--ek-color-action-emphasis); }

.pvl-sort__icon { font-size: var(--ek-icon-xs); opacity: 0.45; }
.pvl-sort.is-on .pvl-sort__icon { opacity: 1; }

.pvl-check {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--ek-color-action);
  cursor: pointer;
  vertical-align: middle;
}

/* Satır */
.pvl-td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-default);
  vertical-align: middle;
  transition: background-color var(--ek-motion-feedback);
}

.pvl-row:last-child > .pvl-td { border-bottom: 0; }
.pvl-td--end { text-align: right; }
.pvl-row:hover > .pvl-td { background: var(--ek-color-surface-muted); }
.pvl-row.is-selected > .pvl-td { background: var(--ek-color-selection); }
.pvl-row.is-selected > .pvl-td--select { box-shadow: inset 3px 0 0 var(--ek-color-action); }

/* B1 — rowspan'lı grup kolonu (ürün güncelle varyant ızgarasıyla aynı desen; görünüm `VariantGroupCell`). */
.pvl-th--group { width: 136px; }
.pvl-vgroup :deep(.ek-vgroup__label) { position: static; }
/* "Tümünü gör" iç kaydırmasında grup adı yapışık başlığın altında kalır. */
.is-scrolling .pvl-vgroup { --ek-vgroup-top: 34px; /* yapışık tablo başlığı yüksekliği */ }
.is-scrolling .pvl-vgroup :deep(.ek-vgroup__label) { position: sticky; }
/* Grup ayırıcı çizgi mevcut alt kenarlıkta (ek kenarlık yok → satır yüksekliği A11 ile aynı: 58 px). */
td.pvl-vgroup { border-top: 0; border-bottom: 1px solid var(--ek-color-border-strong); }
.pvl-row:last-child > td.pvl-vgroup { border-bottom: 0; }
.pvl-row:has(+ .pvl-row.is-group-start) > .pvl-td { border-bottom-color: var(--ek-color-border-strong); }
/* Tek varyantlı grupta etiket satıra sığar (ızgaradaki 56 px satırdan dar liste satırı için sıkı ölçü). */
.pvl-vgroup :deep(.ek-vgroup__label) { padding: var(--ek-space-2) var(--ek-space-3); }
.pvl-vgroup :deep(.ek-vgroup__title) { font-size: var(--ek-type-label-size); line-height: var(--ek-type-label-line); }
.pvl-vgroup :deep(.ek-vgroup__meta) { white-space: nowrap; }
/* Kolon başlığı seçeneği adlandırıyor ("Beden") → tabloda çipte yalnız değer; kartta (başlık gizli) ad geri gelir. */
.is-header-named .pvl-choice__label { display: none; }
.is-header-named .pvl-choice { min-width: 32px; justify-content: center; }
.is-compact .is-header-named .pvl-choices { flex: none; min-width: 44px; } /* kompakt: stok kodları hizalı */
.is-grouped .pvl-ident { min-width: 164px; } /* grup adı kendi kolonunda; varyant hücresinde yalnız değer + kod */

/* Kompakt ızgara (> 8 varyant): her hücre tek satır — seçenek + stok kodu, satış + piyasa fiyatı, stok + raf yan yana. */
.is-compact .pvl-td { padding: 6px var(--ek-space-2); }
.is-compact .pvl-ident { min-width: 0; }
.is-compact .pvl-td--select { padding-left: var(--ek-space-4); }
.is-compact .pvl-ident__text { flex-direction: row; align-items: center; gap: var(--ek-space-2); }
.is-compact .pvl-price { flex-direction: row; align-items: baseline; gap: var(--ek-space-2); }
.is-compact .pvl-channels { flex-wrap: nowrap; max-width: none; }
.is-compact .pvl-stock { grid-template-columns: auto auto auto; }
.is-compact .pvl-stock__shelf { grid-column: auto; order: -1; margin-right: var(--ek-space-1); }

.pvl-ident {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 220px;
}

.pvl-ident__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pvl-choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.pvl-choice {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.pvl-choice__label { color: var(--ek-color-content-muted); }
.pvl-choice__value { color: var(--ek-color-content-strong); font-weight: var(--ek-font-weight-semibold); }

.pvl-code,
.pvl-mono {
  /* FR3 madde 9: tabloda tek aile — kod da Inter (tabular rakam). */
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.pvl-code { color: var(--ek-color-content-muted); }
.pvl-mono { color: var(--ek-color-content-default); }

.pvl-barcode {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  white-space: nowrap;
}

.pvl-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  cursor: pointer;
  opacity: 0;
  transition: var(--ek-transition-colors), opacity var(--ek-motion-feedback);
}

.pvl-copy .v-icon { font-size: var(--ek-icon-xs); }
.pvl-row:hover .pvl-copy,
.pvl-copy:focus-visible { opacity: 1; }
.pvl-copy:hover { background: var(--ek-color-surface-sunken); color: var(--ek-color-action-emphasis); }

@media (hover: none) {
  .pvl-copy { opacity: 1; }
}

.pvl-price,
.pvl-stock {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  white-space: nowrap;
}

.pvl-price__sale,
.pvl-stock__qty {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-price__market,
.pvl-stock__shelf,
.pvl-price__note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pvl-stock {
  display: inline-grid;
  grid-template-columns: auto auto;
  justify-items: end;
  column-gap: 6px;
  align-items: center;
}

.pvl-stock__shelf {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.pvl-stock__shelf .v-icon { font-size: var(--ek-icon-xs); }

.pvl-stock__tag {
  height: 18px;
  padding: 0 6px;
  border: 1px solid;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-micro-size);
  line-height: 16px;
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-stock.is-out .pvl-stock__qty { color: var(--ek-color-error-emphasis); }
.pvl-stock.is-out .pvl-stock__tag { border-color: var(--ek-color-error-border); background: var(--ek-color-error-subtle); color: var(--ek-color-error-emphasis); }
.pvl-stock.is-low .pvl-stock__qty { color: var(--ek-color-warning-emphasis); }
.pvl-stock.is-low .pvl-stock__tag { border-color: var(--ek-color-warning-border); background: var(--ek-color-warning-subtle); color: var(--ek-color-warning-emphasis); }

/* Kanal durumu */
.pvl-channels {
  display: flex;
  flex-wrap: nowrap; /* B1: satır yüksekliği sabit — çipler tek satır */
  align-items: center;
  gap: 4px 6px; /* ürün satırı (`.pcs__channels`) ile aynı aralık */
  max-width: 360px;
}

/* Gönderilmemiş kanallar: ürün satırındaki "+n" hapının aynısı (kesik çizgili, soluk). */
.pvl-absent {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-chip);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: default;
}

button.pvl-absent {
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

button.pvl-absent:hover,
button.pvl-absent[aria-expanded='true'] {
  border-color: var(--ek-color-action);
  border-style: solid;
  background: color-mix(in srgb, var(--ek-color-action) 8%, var(--ek-color-surface));
  color: var(--ek-color-action);
}

button.pvl-absent:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

.pvl-absent-none { color: var(--ek-color-content-subtle); }

.pvl-ch {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-control);
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pvl-ch:hover { border-color: var(--ek-color-border-default); background: var(--ek-color-surface-muted); }
.pvl-ch.is-unsent { cursor: default; }
.pvl-ch.is-unsent:hover { border-color: transparent; background: transparent; }

.pvl-tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pvl-tip__reason { opacity: 0.92; }
.pvl-tip__hint { opacity: 0.72; font-size: var(--ek-type-micro-size); }

.pvl-sort:focus-visible,
.pvl-copy:focus-visible,
.pvl-ch:focus-visible,
.pvl-more__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pvl-muted { color: var(--ek-color-content-muted); }

/* Tümünü gör */
.pvl-more {
  display: flex;
  justify-content: center;
  padding: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}

.pvl-more__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: 28px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pvl-more__btn:hover { background: var(--ek-color-action-subtle); }

.pvl-more__chevron {
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-motion-reveal);
}

.pvl-more__chevron.is-open { transform: rotate(180deg); }

/* Dar ekran: girinti küçülür (kart listesi ekran genişliğini kullanır). */
@media (max-width: 599px) {
  .pvl { --pvl-indent: 28px; margin-right: var(--ek-space-2); }
}

/* Dar kap (< 600px): satır = kart (A6b mobil kart deseni). */
@container (max-width: 599px) {
  .pvl-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .pvl-table,
  .pvl-table tbody { display: block; }

  .pvl-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'sel main act'
      '. barcode barcode'
      '. price price'
      '. stock stock'
      '. ch ch';
    align-items: center;
    column-gap: var(--ek-space-3);
    row-gap: var(--ek-space-1);
    padding: var(--ek-space-3);
    border-bottom: 1px solid var(--ek-color-border-subtle);
  }

  .pvl-row:last-child { border-bottom: 0; }

  /* Grup hücresi: grubun ilk kartının üstünde tam genişlik başlık (kart kenarına taşar). */
  .pvl-row.has-group-cell {
    grid-template-areas:
      'grp grp grp'
      'sel main act'
      '. barcode barcode'
      '. price price'
      '. stock stock'
      '. ch ch';
    padding-top: 0;
  }
  .pvl-row.is-group-start:not(:first-child) { border-top: 1px solid var(--ek-color-border-strong); }
  .pvl-row.is-group-start > .pvl-td { border-top: 0 !important; /* çizgi kartın kendisinde */ }
  td.pvl-vgroup {
    grid-area: grp;
    display: block;
    margin: 0 calc(-1 * var(--ek-space-3)) var(--ek-space-2);
    border-top: 0;
    border-right: 0;
    border-bottom: 1px solid var(--ek-color-border-subtle);
  }
  .pvl-vgroup :deep(.ek-vgroup__label),
  .is-compact .pvl-vgroup :deep(.ek-vgroup__label) {
    position: static;
    flex-direction: row;
    align-items: baseline;
    gap: var(--ek-space-2);
    padding: var(--ek-space-2) var(--ek-space-3);
  }
  .pvl-vgroup :deep(.ek-vgroup__title) { font-size: var(--ek-type-label-size); line-height: var(--ek-type-label-line); }

  .pvl-row > .pvl-td {
    padding: 0;
    border: 0;
    background: transparent !important; /* kartta zemin satırdadır */
    text-align: left;
  }

  .pvl-row:hover { background: var(--ek-color-surface-muted); }
  .pvl-row.is-selected { background: var(--ek-color-selection); box-shadow: inset 3px 0 0 var(--ek-color-action); }
  .pvl-row.is-selected > .pvl-td--select { box-shadow: none; }

  .pvl-td--select { grid-area: sel; width: auto; align-self: start; padding-top: 12px !important; }
  .pvl-td--variant { grid-area: main; }
  .pvl-td--actions { grid-area: act; align-self: start; width: auto; }
  .pvl-td--barcode { grid-area: barcode; }
  .pvl-td--end[data-label='Fiyat'] { grid-area: price; }
  .pvl-td--end[data-label='Stok'] { grid-area: stock; }
  .pvl-td--channels { grid-area: ch; }

  .pvl-td[data-label] {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: baseline;
    column-gap: var(--ek-space-3);
  }

  .pvl-td[data-label]::before {
    content: attr(data-label);
    color: var(--ek-color-content-muted);
    font-size: var(--ek-type-micro-size);
    line-height: var(--ek-type-micro-line);
    font-weight: var(--ek-type-micro-weight);
    letter-spacing: var(--ek-type-micro-tracking);
    text-transform: uppercase;
  }

  .pvl-td[data-label] > * { justify-self: start; }

  .pvl-price,
  .pvl-stock { align-items: flex-start; justify-items: start; }
  .pvl-price { flex-direction: row; flex-wrap: wrap; column-gap: var(--ek-space-2); align-items: baseline; }
  .pvl-stock { grid-template-columns: auto auto auto; }
  .pvl-stock__shelf { grid-column: auto; }

  .pvl-ident { min-width: 0; }
  .is-header-named .pvl-choice__label { display: inline; }
  .pvl-channels,
  .is-compact .pvl-channels { flex-wrap: wrap; max-width: none; }
  .pvl-copy { opacity: 1; }
  .pvl-summary { padding: var(--ek-space-2) var(--ek-space-3); }
}
</style>

<style>
/* "+n" bilgi kartı (teleport edilir → kapsamsız; önek bu bileşene özgü). */
.pvl-absent-card {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 240px;
  max-width: 300px;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover, 10px);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover, 0 8px 24px rgb(15 23 42 / 0.12));
}
.pvl-absent-card__head { display: flex; flex-direction: column; gap: 1px; }
.pvl-absent-card__title { color: var(--ek-color-content-strong); font-size: var(--ek-type-label-size); font-weight: var(--ek-font-weight-semibold); }
.pvl-absent-card__sub { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }
.pvl-absent-card__list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.pvl-absent-card__list > li {
  display: flex; align-items: center; gap: var(--ek-space-2);
  padding: 6px 8px; border-radius: 8px;
  background: color-mix(in srgb, var(--ek-color-content-strong) 3%, var(--ek-color-surface));
  font-size: var(--ek-type-caption-size);
}
.pvl-absent-card__state { margin-left: auto; color: var(--ek-color-content-muted); }
.pvl-absent-card__hint {
  display: flex; gap: 6px; margin: 0;
  color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line);
}
.pvl-absent-card__hint .v-icon { flex: none; margin-top: 1px; font-size: 14px; color: var(--ek-color-info, var(--ek-color-action)); }
</style>
