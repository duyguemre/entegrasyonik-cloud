<!--
  frontend/src/components/productDefinitions/variants/ProductVariantListComponent.vue

  Ürün listesinde varyantlı ürünün SEÇENEKLER bölümü (ürün satırının altında açılır). A11 — premium varyant gösterimi:
    • Açılış: yükseklik + opaklık (grid satırı 0fr→1fr, `--ek-duration-base`; reduced-motion'da süre 0).
    • Özet şeridi: varyant sayısı, grup sayısı, toplam stok, tükenen/az stok, kanal kapsamı (yayında/gönderilen, hata sayısı).
    • Gruplar: ayırıcı seçenek (ör. Renk) başlık satırı — değer + varyant sayısı + grup stoğu; satırda kalan seçenekler çip.
    • Satır: görsel küçük resmi (yoksa nötr yer tutucu) · seçenek çipleri + stok kodu (mono) · barkod (mono + kopyala) ·
      fiyat (sağa hizalı, tabular) · stok (tükendi/az tonu + raf) · kanal durumları · satır eylemleri (`EkRowActions`).
    • Kanal durumu: gönderilmiş kanal = kanal rengi nokta + ad + durum ikonu; ipucunda durum + kısa neden; tıklayınca ayrıntı kartı
      (`ProductVariantListTooltipComponent`). Hiç gönderilmemiş kanallar tek soluk çipte toplanır (gürültü azaltma).
    • Çok varyant (> 8): ilk 8 satır + "Tümünü gör"; açıkken liste kendi içinde kayar (yapışık başlık).
    • Dar kap (< 600px): satırlar KART (A6b mobil kart deseni).
  Veri yalnız backend varyant projeksiyonundan (bkz. `variantListModel.ts`). Kanala gönder / durum sorgula satır eylemleri
  YOK: `IntegrationService/processPlatformProduct` ve `checkProductStatus` backend'de tanımsız (FE_CALLS_WITHOUT_BACKEND).
-->
<template>
  <div class="pvl-reveal" :class="{ 'is-open': revealed }">
    <div class="pvl-reveal__inner">
      <section ref="rootRef" class="pvl" :class="{ 'is-compact': summary.count > COMPACT_LIMIT }" :aria-label="`${productInfoForm.title ?? 'Ürün'} varyantları`">
        <header class="pvl-summary">
          <div class="pvl-summary__facts">
            <span class="pvl-fact pvl-fact--lead"><span class="ek-num">{{ summary.count }}</span> varyant</span>
            <span v-if="grouped" class="pvl-fact"><span class="ek-num">{{ groups.length }}</span> {{ slicerTitle }}</span>
            <span class="pvl-fact">Toplam stok <strong class="ek-num">{{ summary.totalStock }}</strong></span>
            <span v-if="summary.outOfStock" class="pvl-flag is-out"><span class="ek-num">{{ summary.outOfStock }}</span> tükendi</span>
            <span v-if="summary.lowStock" class="pvl-flag is-low" :title="`${LOW_STOCK_THRESHOLD} adet ve altı`"><span class="ek-num">{{ summary.lowStock }}</span> az stok</span>
            <span v-if="selectedCount" class="pvl-flag is-selected"><span class="ek-num">{{ selectedCount }}</span> seçili</span>
          </div>
          <ul class="pvl-summary__channels" aria-label="Kanal kapsamı">
            <li class="pvl-summary__label" aria-hidden="true">Kanallar</li>
            <li v-for="c in sentChannels" :key="c.code" class="pvl-cov" :class="channelClass(c.code)">
              <span class="pvl-cov__dot" aria-hidden="true"></span>
              <span class="pvl-cov__name">{{ channelTitle(c.code) }}</span>
              <span class="pvl-cov__val"><span class="ek-num">{{ c.live }}/{{ summary.count }}</span> yayında</span>
              <span v-if="c.failed" class="pvl-cov__err"><v-icon icon="mdi-alert-circle" aria-hidden="true" /><span class="ek-num">{{ c.failed }}</span> hata</span>
              <span v-else-if="c.waiting" class="pvl-cov__wait"><v-icon icon="mdi-clock-outline" aria-hidden="true" /><span class="ek-num">{{ c.waiting }}</span> bekliyor</span>
            </li>
            <li v-if="unsentChannels.length" class="pvl-cov is-unsent" :title="unsentChannels.map((c) => channelTitle(c.code)).join(', ')">
              {{ unsentChannels.length === 1 ? channelTitle(unsentChannels[0].code) : `${unsentChannels.length} kanal` }} gönderilmedi
            </li>
          </ul>
        </header>

        <div :id="scrollId" class="pvl-scroll" :class="{ 'is-scrolling': showAll && summary.count > COMPACT_LIMIT }">
          <table class="pvl-table" :aria-label="`${productInfoForm.title ?? 'Ürün'} varyant listesi`" :aria-rowcount="summary.count + 1">
            <thead>
              <tr>
                <th class="pvl-th pvl-th--select" scope="col">
                  <input ref="allRef" type="checkbox" class="pvl-check" :checked="allSelected" aria-label="Tüm varyantları seç" @change="toggleAll" />
                </th>
                <th class="pvl-th" scope="col" :aria-sort="ariaSort('choices')">
                  <button type="button" class="pvl-sort" :class="{ 'is-on': sortBy === 'choices' }" @click="toggleSort('choices')">
                    Varyant<v-icon class="pvl-sort__icon" :icon="sortIconFor('choices')" aria-hidden="true" />
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
            <tbody v-for="group in visibleGroups" :key="group.key" class="pvl-group">
              <tr v-if="grouped" class="pvl-group__head">
                <th colspan="7" scope="rowgroup">
                  <span class="pvl-group__title">
                    <span class="pvl-group__dot" aria-hidden="true"></span>
                    <span class="pvl-group__label">{{ slicerTitle }}</span>
                    <span class="pvl-group__name">{{ choiceValueName(group.choiceId, group.choiceValueId) ?? '—' }}</span>
                  </span>
                  <span class="pvl-group__meta">
                    <span class="ek-num">{{ groupSize(group.key) }}</span> varyant · stok <span class="ek-num">{{ groupStock(group.key) }}</span>
                  </span>
                </th>
              </tr>
              <tr v-for="item in group.variants" :key="item._id ?? item.barcode" class="pvl-row"
                :class="{ 'is-selected': isSelected(item), 'is-out': stockTone(item.stock) === 'out' }">
                <td class="pvl-td pvl-td--select">
                  <input type="checkbox" class="pvl-check" :checked="isSelected(item)" :aria-label="`${item.stockcode} varyantını seç`" @change="toggleRow(item)" />
                </td>
                <td class="pvl-td pvl-td--variant">
                  <div class="pvl-ident">
                    <span class="pvl-thumb" :class="{ 'is-empty': !hasImage(item) }">
                      <ProductVariantImageComponent v-if="hasImage(item)" :productInfoForm="productInfoForm" :imageId="item.images[0]" :height="40" />
                      <v-icon v-else icon="mdi-image-outline" aria-hidden="true" />
                    </span>
                    <span class="pvl-ident__text">
                      <span class="pvl-choices">
                        <span v-for="choice of rowChoices(item.choices, grouped)" :key="choice.choiceId" class="pvl-choice" :class="{ 'is-slicer': choice.slicer === true || choice === slicerChoice(item.choices) }">
                          <span class="pvl-choice__label">{{ choiceTitle(choice.choiceId) }}</span>
                          <span class="pvl-choice__value">{{ choiceValueName(choice.choiceId, choice.choiceValueId) ?? '—' }}</span>
                        </span>
                        <span v-if="!item.choices?.length" class="pvl-muted">Seçenek yok</span>
                      </span>
                      <span class="pvl-code">{{ item.stockcode }}</span>
                    </span>
                  </div>
                </td>
                <td class="pvl-td pvl-td--barcode" data-label="Barkod">
                  <span v-if="item.barcode" class="pvl-barcode">
                    <span class="pvl-mono">{{ item.barcode }}</span>
                    <button type="button" class="pvl-copy" :aria-label="`${item.barcode} barkodunu kopyala`" @click="copy(item.barcode, 'Barkod')">
                      <v-icon :icon="icons.copy" aria-hidden="true" />
                    </button>
                  </span>
                  <span v-else class="pvl-muted">—</span>
                </td>
                <td class="pvl-td pvl-td--end" data-label="Fiyat">
                  <span v-if="item.prices?.isPlatformBasedPrice === true" class="pvl-price">
                    <span class="pvl-price__sale ek-num">{{ money(minOf(item, 'salePrice')) }} – {{ money(maxOf(item, 'salePrice')) }}</span>
                    <span class="pvl-price__note">Kanala göre</span>
                  </span>
                  <span v-else class="pvl-price">
                    <span class="pvl-price__sale ek-num">{{ money(item.prices?.salePrice) }}</span>
                    <span v-if="Number(item.prices?.marketPrice) > 0" class="pvl-price__market ek-num">Piyasa {{ money(item.prices.marketPrice) }}</span>
                  </span>
                </td>
                <td class="pvl-td pvl-td--end" data-label="Stok">
                  <span class="pvl-stock" :class="`is-${stockTone(item.stock)}`">
                    <span class="pvl-stock__qty ek-num">{{ Math.max(0, Number(item.stock) || 0) }}</span>
                    <span v-if="stockTone(item.stock) === 'out'" class="pvl-stock__tag">Tükendi</span>
                    <span v-else-if="stockTone(item.stock) === 'low'" class="pvl-stock__tag" :title="`${LOW_STOCK_THRESHOLD} adet ve altı`">Az</span>
                    <span v-if="item.shelf" class="pvl-stock__shelf"><v-icon icon="mdi-map-marker-outline" aria-hidden="true" />Raf {{ item.shelf }}</span>
                  </span>
                </td>
                <td class="pvl-td pvl-td--channels" data-label="Kanallar">
                  <span class="pvl-channels">
                    <template v-for="ch in rowChannels(item).sent" :key="ch.code">
                      <v-menu :close-on-content-click="false" location="bottom center" transition="fade-transition" offset="8">
                        <template #activator="{ props: menuProps }">
                          <v-tooltip location="top" :open-delay="300" :eager="false" transition="fade-transition" max-width="320">
                            <template #activator="{ props: tipProps }">
                              <button type="button" v-bind="mergeProps(menuProps, tipProps)" class="pvl-ch" :class="[channelClass(ch.code), `is-${ch.state.tone}`]"
                                :data-channel-state="ch.state.tone"
                                :aria-label="`${channelTitle(ch.code)}: ${ch.state.label}${ch.state.reason ? ' — ' + ch.state.reason : ''}. Ayrıntı`">
                                <span class="pvl-ch__dot" aria-hidden="true"></span>
                                <span class="pvl-ch__name">{{ channelTitle(ch.code) }}</span>
                                <v-icon class="pvl-ch__state" :icon="ch.state.icon" aria-hidden="true" />
                              </button>
                            </template>
                            <span class="pvl-tip">
                              <strong>{{ channelTitle(ch.code) }} · {{ ch.state.label }}</strong>
                              <span v-if="ch.state.reason" class="pvl-tip__reason">{{ ch.state.reason }}</span>
                              <span class="pvl-tip__hint">Ayrıntı için tıklayın</span>
                            </span>
                          </v-tooltip>
                        </template>
                        <ProductVariantListTooltipComponent :data="item.platforms?.[ch.code]" :channel-code="ch.code" :channel-name="channelTitle(ch.code)" />
                      </v-menu>
                    </template>
                    <span v-if="rowChannels(item).unsent.length" class="pvl-ch is-unsent"
                      :title="rowChannels(item).unsent.map(channelTitle).join(', ') + ': gönderilmedi'">
                      <template v-if="rowChannels(item).sent.length"><span aria-hidden="true">+{{ rowChannels(item).unsent.length }}</span><span class="ek-sr-only">{{ rowChannels(item).unsent.map(channelTitle).join(', ') }}: gönderilmedi</span></template>
                      <template v-else>Kanala gönderilmedi</template>
                    </span>
                  </span>
                </td>
                <td class="pvl-td pvl-td--actions">
                  <EkRowActions :label="`${item.stockcode} işlemleri`" :items="rowActions(item)" />
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, mergeProps, getCurrentInstance } from 'vue'
import { formatMoney } from '@/composables/format'
import { useChoicesStore } from '@/stores/choicesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useToast } from '@/composables/useToast'
import { channelClass, channelName } from '@/design/channels'
import { icons } from '@/design/icons'
import EkRowActions from '@/components/ds/EkRowActions.vue'
import type { EkRowAction } from '@/components/ds/EkRowActions.vue'
import ProductVariantImageComponent from './ProductVariantImageComponent.vue'
import ProductVariantListTooltipComponent from './ProductVariantListTooltipComponent.vue'
import {
  COMPACT_LIMIT, LOW_STOCK_THRESHOLD, channelState, groupVariants, rowChoices, slicerChoice, stockTone, summarizeVariants,
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

/** Gruplu görünüm: varyantlarda ayırıcı + en az bir başka seçenek varsa ve gruplar tekil değilse. */
const grouped = computed(() => {
  if (!props.productInfoForm?.hasVariant) return false
  if (!variants.value.some((v) => (v.choices?.length ?? 0) >= 2)) return false
  return groupVariants(variants.value).length < variants.value.length
})
const slicerTitle = computed(() => choiceTitle(slicerChoice(variants.value[0]?.choices).choiceId))

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true })
const sorted = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  const key = sortBy.value
  const byKey = (a: any, b: any) => {
    if (key === 'salePrice') return (Number(a.prices?.salePrice) - Number(b.prices?.salePrice)) * dir
    if (key === 'stock') return ((Number(a.stock) || 0) - (Number(b.stock) || 0)) * dir
    if (key === 'barcode') return collator.compare(String(a.barcode ?? ''), String(b.barcode ?? '')) * dir
    const at = rowChoices(a.choices, grouped.value).map(valueTitle).join(' ')
    const bt = rowChoices(b.choices, grouped.value).map(valueTitle).join(' ')
    return collator.compare(at, bt) * dir || collator.compare(String(a.stockcode ?? ''), String(b.stockcode ?? ''))
  }
  const list = [...variants.value]
  if (!grouped.value) return list.sort(byKey)
  // Gruplar ayırıcı değere göre (seçenek sıralamasında yönü izler), grup içi seçili anahtara göre.
  const groupDir = key === 'choices' ? dir : 1
  return list.sort((a, b) => collator.compare(valueTitle(slicerChoice(a.choices)), valueTitle(slicerChoice(b.choices))) * groupDir || byKey(a, b))
})

const allGroups = computed(() => groupVariants(sorted.value))
const groups = computed(() => (grouped.value ? allGroups.value : []))
const groupSize = (key: string) => allGroups.value.find((g) => g.key === key)?.variants.length ?? 0
const groupStock = (key: string) => allGroups.value.find((g) => g.key === key)?.totalStock ?? 0
const visibleGroups = computed(() => {
  const rows = showAll.value || sorted.value.length <= COMPACT_LIMIT ? sorted.value : sorted.value.slice(0, COMPACT_LIMIT)
  return grouped.value ? groupVariants(rows) : [{ key: 'all', variants: rows, totalStock: 0 }]
})

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

const hasImage = (v: any) => {
  const id = v.images?.[0]
  if (!id) return false
  if (typeof id === 'string' && id.startsWith('http')) return true
  return !!props.productInfoForm?.images?.some((img: any) => img?._id === id)
}

const money = (n: unknown) => formatMoney(Number(n) || 0)
const channelPrices = (v: any, field: 'salePrice' | 'marketPrice') =>
  Object.values(v.platforms ?? {}).map((p: any) => Number(p?.prices?.[field])).filter((n) => Number.isFinite(n) && n > 0)
const minOf = (v: any, f: 'salePrice' | 'marketPrice') => { const xs = channelPrices(v, f); return xs.length ? Math.min(...xs) : 0 }
const maxOf = (v: any, f: 'salePrice' | 'marketPrice') => { const xs = channelPrices(v, f); return xs.length ? Math.max(...xs) : 0 }

const rowChannels = (v: any) => {
  const sent: { code: string; state: ChannelState }[] = []
  const unsent: string[] = []
  for (const code of channelCodes.value) {
    const state = channelState(v, code)
    if (state.key === 'none') unsent.push(code)
    else sent.push({ code, state })
  }
  return { sent, unsent }
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
    grid-template-rows var(--ek-duration-base) var(--ek-easing-enter),
    opacity var(--ek-duration-base) var(--ek-easing-enter);
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
  height: 24px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  white-space: nowrap;
}

.pvl-cov__dot,
.pvl-ch__dot,
.pvl-group__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

.pvl-cov__name {
  color: var(--ek-ch-text);
  font-weight: var(--ek-font-weight-semibold);
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

/* Grup başlığı */
.pvl-group__head > th {
  padding: var(--ek-space-2) var(--ek-space-4) 6px;
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-sunken);
  text-align: left;
  font-weight: inherit;
}

.pvl-group + .pvl-group .pvl-group__head > th {
  border-top: 1px solid var(--ek-color-border-default);
}

.pvl-group__title {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.pvl-group__dot {
  --ek-ch-solid: var(--ek-color-action);
}

.pvl-group__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pvl-group__name {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.pvl-group__meta {
  margin-left: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* Satır */
.pvl-td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-default);
  vertical-align: middle;
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.pvl-group:last-child .pvl-row:last-child > .pvl-td { border-bottom: 0; }
.pvl-td--end { text-align: right; }
.pvl-row:hover > .pvl-td { background: var(--ek-color-surface-muted); }
.pvl-row.is-selected > .pvl-td { background: var(--ek-color-selection); }
.pvl-row.is-selected > .pvl-td--select { box-shadow: inset 3px 0 0 var(--ek-color-action); }

/* Kompakt ızgara (> 8 varyant): her hücre tek satır — seçenek + stok kodu, satış + piyasa fiyatı, stok + raf yan yana. */
.is-compact .pvl-td { padding: 6px var(--ek-space-2); }
.is-compact .pvl-ident { min-width: 0; }
.is-compact .pvl-td--select { padding-left: var(--ek-space-4); }
.is-compact .pvl-thumb { width: 28px; height: 28px; }
.is-compact .pvl-thumb .v-icon { font-size: var(--ek-icon-sm); }
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

.pvl-thumb {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-subtle);
}

.pvl-thumb .v-icon { font-size: var(--ek-icon-md); }

.pvl-thumb :deep(img),
.pvl-thumb :deep(.v-img) {
  width: 100% !important; /* görsel bileşeni satır içi ölçü taşır */
  height: 100% !important;
  object-fit: cover;
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
  font-family: var(--ek-font-mono);
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
  transition: var(--ek-transition-colors), opacity var(--ek-duration-fast) var(--ek-easing-standard);
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
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  max-width: 360px;
}

.pvl-ch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pvl-ch:hover { border-color: var(--ek-ch-solid); background: var(--ek-ch-subtle); }
.pvl-ch__state { font-size: var(--ek-icon-sm); }
.pvl-ch.is-success .pvl-ch__state { color: var(--ek-color-success); }
.pvl-ch.is-warning .pvl-ch__state { color: var(--ek-color-warning); }
.pvl-ch.is-info .pvl-ch__state { color: var(--ek-color-info); }
.pvl-ch.is-danger {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}
.pvl-ch.is-danger .pvl-ch__state { color: var(--ek-color-error); }

.pvl-ch.is-unsent {
  padding: 0 var(--ek-space-2);
  border-style: dashed;
  background: transparent;
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
  cursor: default;
}

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
  transition: transform var(--ek-duration-base) var(--ek-easing-standard);
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
  .pvl-table tbody,
  .pvl-group__head,
  .pvl-group__head > th { display: block; }

  .pvl-group__head > th { padding: var(--ek-space-2) var(--ek-space-3); }

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

  .pvl-group:last-child .pvl-row:last-child { border-bottom: 0; }

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
  .pvl-channels,
  .is-compact .pvl-channels { flex-wrap: wrap; max-width: none; }
  .pvl-copy { opacity: 1; }
  .pvl-summary { padding: var(--ek-space-2) var(--ek-space-3); }
}
</style>
