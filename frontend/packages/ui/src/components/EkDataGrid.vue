<!--
  frontend/src/components/ds/EkDataGrid.vue

  DS-v2 — TEK liste tablosu standardı (sipariş, ürün, iade, log … hepsi).
    - Başlık YAPIŞKAN (yalnızca satırlar kayar); başlık = mikro etiket (11/600
      BÜYÜK HARF), `surface-muted` zemin; sıralanabilir kolonda ok + `aria-sort`
    - Satır: yalnız alt çizgi (`border-subtle`), hover `surface-muted`,
      SEÇİLİ `selection` zemin + solda 3px aksiyon göstergesi
    - Kolon tipleri: id (aksiyon renginde yarı kalın kimlik), num (sağa, tabular),
      muted (ikincil bilgi), text (varsayılan). Hücre içeriği `#cell-<key>` slot'u
    - Durumlar: yükleniyor (iskelet satırlar, başlık korunur), boş (ikon
      kapsülü + başlık + açıklama + #empty-action), HATA (`error`; boştan ayrı
      ton + #error-action / `retry` olayı)
    - Kolon `hideLabel`: başlık görsel olarak boş (eylem kolonu), ekran okuyucu adı korunur
    - Genişletme: `expandedKeys` + `#expanded="{ row }"` → satırın altında tam genişlik satır
    - Kolon `pin: 'end'`: yatay kaydırmada sağa yapışık (satır eylemleri hep görünür)
    - Yatay taşma (Aşama 3): seçim kolonu + İLK veri kolonu (kimlik) sola yapışık (kap ≥ 600px);
      altında içerik kalan yapışık kenar `shadow-scroll-start/end` gölgesi alır → kolon "kesik"
      görünmez, kaydırılabildiği anlaşılır. Kolon `pin: 'none'` ilk kolonu serbest bırakır.
    - Dar kap (< 600px, Aşama 4): satır = KART (☐ · kimlik başlığı · eylemler; altında ETİKET–değer satırları),
      başlık satırı sıralama çubuğuna iner. Kolon `label` kart etiketi olur (`hideLabel` → etiketsiz).
    - Hücre slot kapsamı: `{ row, item, value, index }` (`item` = `row`, göç kolaylığı)
  Yükseklik: kapsayıcısını doldurur (`EkListFrame` içinde kullanılır);
  sayfalama bu bileşenin DIŞINDA, çerçevenin altına sabittir.
-->
<template>
  <div
    ref="rootRef"
    class="ek-grid"
    :class="{ 'is-overflow-start': overflowStart, 'is-overflow-end': overflowEnd }"
    :aria-busy="loading || undefined"
    @scroll.passive="measure"
  >
    <table class="ek-grid__table" role="table" :aria-label="label" :aria-rowcount="loading ? undefined : rows.length + 1">
      <thead role="rowgroup">
        <tr role="row">
          <th v-if="selectable" class="ek-grid__th ek-grid__th--select" scope="col" role="columnheader">
            <!-- MOB-00: etiket dokunma alanını büyütür (dokunmatikte 44×44, touch.css); görünen kutu aynı. -->
            <label class="ek-grid__check-hit">
              <input
                ref="allRef"
                type="checkbox"
                class="ek-grid__check"
                :checked="allSelected"
                :disabled="loading || !rows.length"
                aria-label="Tüm satırları seç"
                @change="toggleAll"
              />
            </label>
          </th>
          <th
            v-for="(col, ci) in columns"
            :key="col.key"
            class="ek-grid__th"
            :class="[`ek-grid__th--${col.align ?? alignFor(col)}`, { 'is-sorted': sort?.key === col.key, 'is-sortable': col.sortable }, pinClass(col, ci)]"
            scope="col"
            role="columnheader"
            :aria-sort="col.sortable ? ariaSort(col.key) : undefined"
            v-bind="col.width ? { width: col.width } : {}"
          >
            <button v-if="col.sortable" type="button" class="ek-grid__sort" @click="toggleSort(col.key)">
              <span>{{ col.label }}</span>
              <v-icon class="ek-grid__sort-icon" :icon="sortIcon(col.key)" aria-hidden="true" />
            </button>
            <span v-else :class="{ 'ek-sr-only': col.hideLabel }">{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody v-if="loading" role="rowgroup">
        <tr v-for="n in skeletonRows" :key="`sk-${n}`" class="ek-grid__row ek-grid__row--skeleton" role="row" aria-hidden="true">
          <td v-if="selectable" class="ek-grid__td ek-grid__td--select" role="cell"><span class="ek-grid__bone ek-grid__bone--box"></span></td>
          <td v-for="(col, ci) in columns" :key="col.key" class="ek-grid__td" role="cell">
            <span class="ek-grid__bone" :class="`ek-grid__bone--w${(n + ci) % 3}`"></span>
          </td>
        </tr>
      </tbody>
      <tbody v-else-if="error" role="rowgroup">
        <tr role="row">
          <td role="cell" class="ek-grid__empty-cell" :colspan="columns.length + (selectable ? 1 : 0)">
            <!-- Aşama 6b (Standart 1): liste gövdesindeki hata = tek hata deseni (EkProblemState). -->
            <div class="ek-grid__problem" role="alert">
              <EkProblemState :title="errorTitle" :cause="errorCause" :action="errorText" :details="errorDetails" :retryable="false" size="page">
                <template #actions><slot name="error-action" /></template>
              </EkProblemState>
            </div>
          </td>
        </tr>
      </tbody>
      <tbody v-else-if="rows.length" role="rowgroup">
        <template v-for="(row, ri) in rows" :key="row[rowKey]">
        <tr
          class="ek-grid__row"
          role="row"
          :class="[{ 'is-selected': isSelected(row), 'is-hover': forceHoverIndex === ri, 'is-alt': ri % 2 === 1 }, channelKey ? ['has-channel', channelClass(row[channelKey])] : undefined, rowClass?.(row)]"
          @click="emit('row-click', row)"
        >
          <td v-if="selectable" class="ek-grid__td ek-grid__td--select" role="cell" @click.stop>
            <label class="ek-grid__check-hit">
              <input
                type="checkbox"
                class="ek-grid__check"
                :checked="isSelected(row)"
                :indeterminate.prop="indeterminateSet.has(row[rowKey])"
                :aria-label="`${row[labelKey] ?? row[rowKey]} satırını seç`"
                @change="toggleRow(row)"
              />
            </label>
          </td>
          <td
            v-for="(col, ci) in columns"
            :key="col.key"
            class="ek-grid__td"
            :class="[`ek-grid__td--${col.type ?? 'text'}`, `ek-grid__td--${col.align ?? alignFor(col)}`, { 'ek-grid__td--wrap': col.wrap, 'ek-grid__td--lead': isLead(col, ci) }, pinClass(col, ci)]"
            role="cell"
            :data-label="col.hideLabel || isLead(col, ci) ? undefined : col.label"
          >
            <slot :name="`cell-${col.key}`" :row="row" :item="row" :value="row[col.key]" :index="ri">{{ row[col.key] ?? '—' }}</slot>
          </td>
        </tr>
        <Transition name="ek-grid-expand">
        <tr v-if="expandedSet.has(row[rowKey])" class="ek-grid__expanded" role="row">
          <td role="cell" class="ek-grid__expanded-cell" :colspan="columns.length + (selectable ? 1 : 0)">
            <slot name="expanded" :row="row" :item="row" />
          </td>
        </tr>
        </Transition>
        </template>
      </tbody>
      <tbody v-else role="rowgroup">
        <tr role="row">
          <td role="cell" class="ek-grid__empty-cell" :colspan="columns.length + (selectable ? 1 : 0)">
            <div class="ek-grid__empty" role="status">
              <EkIconTile :icon="emptyIcon" tone="neutral" size="lg" />
              <p class="ek-grid__empty-title">{{ emptyTitle }}</p>
              <p class="ek-grid__empty-text">{{ emptyText }}</p>
              <slot name="empty-action" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { channelClass } from '../tokens/channels'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import EkIconTile from './EkIconTile.vue'
import EkProblemState from './EkProblemState.vue'

export interface EkGridColumn {
  key: string
  label: string
  type?: 'id' | 'text' | 'num' | 'muted'
  align?: 'start' | 'end' | 'center'
  sortable?: boolean
  width?: string
  /** Başlık görsel olarak gizli (ör. eylem kolonu); ekran okuyucu için ad korunur. */
  hideLabel?: boolean
  /** Hücre metni satır kırabilir (varsayılan tek satır). */
  wrap?: boolean
  /** `end`: kolon sağa yapışık kalır (yatay kaydırmada satır eylemleri görünür). İlk kolon varsayılan
   *  olarak sola yapışıktır; `none` bunu kapatır. */
  pin?: 'end' | 'none'
}

export type EkGridSort = { key: string; dir: 'asc' | 'desc' } | null
type Row = Record<string, any>

const props = withDefaults(
  defineProps<{
    columns: EkGridColumn[]
    rows: Row[]
    label: string
    rowKey?: string
    labelKey?: string
    selectable?: boolean
    selected?: Array<string | number>
    sort?: EkGridSort
    loading?: boolean
    skeletonRows?: number
    emptyTitle?: string
    emptyText?: string
    emptyIcon?: string
    forceHoverIndex?: number
    error?: boolean
    errorTitle?: string
    errorText?: string
    /** Olası neden (biliniyorsa) ve katlanır teknik ayrıntı (Aşama 6b). */
    errorCause?: string
    errorDetails?: Array<{ label: string; value: string }>
    rowClass?: (row: Row) => string | Record<string, boolean> | undefined
    /** Aşama 5: satırın kanal kodu alanı (ör. `integrationCode`) — satır/kart solunda 3px kanal şeridi. */
    channelKey?: string
    /** Satırın altında tam genişlik `#expanded` satırı açık olan anahtarlar. */
    expandedKeys?: Array<string | number>
    /** Kısmi seçili (ör. varyantlarının bir kısmı seçili ürün) satır anahtarları — onay kutusu belirsiz. */
    indeterminateKeys?: Array<string | number>
  }>(),
  {
    rowKey: 'id',
    labelKey: 'id',
    selectable: false,
    selected: () => [],
    sort: null,
    loading: false,
    skeletonRows: 8,
    emptyTitle: 'Kayıt bulunamadı',
    emptyText: 'Filtreleri değiştirip yeniden sorgulayın.',
    emptyIcon: 'mdi-text-box-search-outline',
    error: false,
    expandedKeys: () => [],
    indeterminateKeys: () => [],
    errorTitle: 'Kayıtlar yüklenemedi',
    errorText: 'Bağlantınızı kontrol edip yeniden deneyin.',
  },
)

const emit = defineEmits<{
  'update:selected': [keys: Array<string | number>]
  'update:sort': [sort: EkGridSort]
  'row-click': [row: Row]
}>()

const allRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const overflowStart = ref(false)
const overflowEnd = ref(false)

/** Yatay kaydırma durumu: solda/sağda gizli içerik var mı (yapışık kenar gölgeleri). */
function measure() {
  const el = rootRef.value
  if (!el) return
  overflowStart.value = el.scrollLeft > 1
  overflowEnd.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(rootRef.value)
    const table = rootRef.value.querySelector('table')
    if (table) resizeObserver.observe(table)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
watch(() => [props.rows, props.columns, props.loading], () => nextTick(measure))

/** Dar kapta (kart düzeni) kartın başlığı olan kolon: ilk veri kolonu (kimlik). */
function isLead(col: EkGridColumn, index: number) {
  return index === 0 && col.pin !== 'end'
}

function pinClass(col: EkGridColumn, index: number) {
  if (col.pin === 'end') return 'ek-grid__pin-end'
  if (index === 0 && col.pin !== 'none') return props.selectable ? 'ek-grid__pin-start ek-grid__pin-start--after-select' : 'ek-grid__pin-start'
  return undefined
}
const selectedSet = computed(() => new Set(props.selected))
const expandedSet = computed(() => new Set(props.expandedKeys))
const indeterminateSet = computed(() => new Set(props.indeterminateKeys))
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((r) => selectedSet.value.has(r[props.rowKey])))
const someSelected = computed(() => props.rows.some((r) => selectedSet.value.has(r[props.rowKey])))

watchEffect(() => {
  if (allRef.value) allRef.value.indeterminate = someSelected.value && !allSelected.value
})

const alignFor = (col: EkGridColumn) => (col.type === 'num' ? 'end' : 'start')
const isSelected = (row: Row) => selectedSet.value.has(row[props.rowKey])

function toggleRow(row: Row) {
  const key = row[props.rowKey]
  const next = new Set(props.selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  emit('update:selected', [...next])
}

function toggleAll() {
  emit('update:selected', allSelected.value ? [] : props.rows.map((r) => r[props.rowKey]))
}

function ariaSort(key: string) {
  if (props.sort?.key !== key) return 'none'
  return props.sort.dir === 'asc' ? 'ascending' : 'descending'
}

function sortIcon(key: string) {
  if (props.sort?.key !== key) return 'mdi-swap-vertical'
  return props.sort.dir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down'
}

function toggleSort(key: string) {
  if (props.sort?.key !== key) return emit('update:sort', { key, dir: 'asc' })
  if (props.sort.dir === 'asc') return emit('update:sort', { key, dir: 'desc' })
  emit('update:sort', null)
}
</script>

<style scoped>
.ek-grid {
  container-type: inline-size;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: auto;
  /* Aşama 3: yapışık kolon olmayan dar görünümde de (mobil) yatay kaydırma ipucu — CSS "kaydırma gölgesi":
     `local` örtüler içerikle kayar, `scroll` gölgeler kenarda sabit durur; içerik kenara ulaşınca örtü
     gölgeyi kapatır. Renkler token'dan (scrim karışımı), literal yok. */
  background:
    linear-gradient(to right, var(--ek-color-surface) 40%, transparent) left center / 24px 100% no-repeat local,
    linear-gradient(to left, var(--ek-color-surface) 40%, transparent) right center / 24px 100% no-repeat local,
    radial-gradient(farthest-side at 0 50%, color-mix(in srgb, var(--ek-color-scrim) 14%, transparent), transparent) left center / 10px 100% no-repeat scroll,
    radial-gradient(farthest-side at 100% 50%, color-mix(in srgb, var(--ek-color-scrim) 14%, transparent), transparent) right center / 10px 100% no-repeat scroll,
    var(--ek-color-surface);
  scrollbar-width: thin;
}

/* FR3 madde 9 (fe-r3a): TABLO TİPOGRAFİSİ TEK MERKEZDEN — tek aile (Inter; hücre içinde eş aralıklı/mono YOK — kodlar,
   barkodlar, olay kodları da aynı ailede), tablo GENELİNDE `tabular-nums` (rakamlar her kolonda aynı genişlik → tarih,
   tutar, kod alt alta hizalı; aynı tabloda orantılı/sabit rakam karışımı "farklı font" gibi görünüyordu). Ağırlık
   rolleri: 400 veri · 500 birincil metin (`.ek-cell-primary`) · 600 kimlik/bağlantı (`--id`). Boyut: 13 hücre, 12 ikincil
   satır (`.ek-cell-secondary`). Hizalama: tutar/adet sağa (`num`), tarih sola, tek satır. */
.ek-grid__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-sans);
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  font-variant-numeric: tabular-nums;
}

.ek-grid__td :where(*:not(.v-icon):not(.mdi)) {
  font-family: inherit !important;
}

.ek-grid__th {
  position: sticky;
  top: 0;
  z-index: var(--ek-z-sticky);
  height: 40px;
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  /* Başlık bir kademe güçlü: kalın (700) + koyu nötr — 11px büyük harf etiket soluk/ince okunuyordu. */
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}

.ek-grid__th--end {
  text-align: right;
}

.ek-grid__th--center {
  text-align: center;
}

.ek-grid__th.is-sorted {
  color: var(--ek-color-action-emphasis);
}

/* Aşama 4: seçim kolonu TAM 44px (kimlik kolonu `left: 44px` yapışık). Kolon daha dar çizildiğinde yapışık kimlik
   kolonu 4px sağa itiliyor, başlıkta ızgara zemini (beyaz şerit) görünüyordu. */
.ek-grid__th--select,
.ek-grid__td--select {
  box-sizing: border-box;
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  padding: 0 0 0 var(--ek-space-4);
}

.ek-grid__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0 calc(var(--ek-space-1) * -1);
  padding: var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.ek-grid__th--end .ek-grid__sort {
  flex-direction: row-reverse;
}

.ek-grid__sort:hover {
  color: var(--ek-color-content-strong);
}

.ek-grid__sort:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-grid__sort-icon {
  font-size: var(--ek-icon-xs);
  opacity: 0.55;
}

.ek-grid__th.is-sorted .ek-grid__sort-icon {
  opacity: 1;
}

.ek-grid__td {
  height: var(--ek-app-row-h, 44px);
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  white-space: nowrap;
  transition: var(--ek-transition-colors);
}

.ek-grid__pin-end {
  position: sticky;
  right: 0;
  z-index: 1;
  background: var(--ek-color-surface);
  box-shadow: inset 1px 0 0 var(--ek-color-border-subtle);
}

.ek-grid.is-overflow-end .ek-grid__pin-end {
  box-shadow: var(--ek-shadow-scroll-end), inset 1px 0 0 var(--ek-color-border-default);
}

.ek-grid__th.ek-grid__pin-end,
.ek-grid__th.ek-grid__pin-start,
.ek-grid__th--select {
  z-index: calc(var(--ek-z-sticky) + 1);
  background: var(--ek-color-surface-muted);
}

/* Seçim + ilk (kimlik) kolonu sola yapışık — yalnız tablo yeterince genişken (mobilde alan yemez). */
@container (min-width: 600px) {
  .ek-grid__th--select,
  .ek-grid__td--select,
  .ek-grid__pin-start {
    position: sticky;
    left: 0;
  }

  .ek-grid__td--select,
  .ek-grid__td.ek-grid__pin-start {
    z-index: 1;
    background: var(--ek-color-surface);
  }

  .ek-grid__pin-start--after-select {
    left: 44px;
  }

  .ek-grid.is-overflow-start .ek-grid__pin-start {
    box-shadow: var(--ek-shadow-scroll-start), inset -1px 0 0 var(--ek-color-border-default);
  }
}

/* Aşama 5: genişleyen satır yumuşak girer/çıkar (opaklık + 4px; reduced-motion'da süre token'ı 0). */
.ek-grid-expand-enter-active {
  transition: opacity var(--ek-motion-reveal);
}

.ek-grid-expand-leave-active {
  transition: opacity var(--ek-motion-dismiss);
}

.ek-grid-expand-enter-from,
.ek-grid-expand-leave-to {
  opacity: 0;
}

.ek-grid-expand-enter-active > .ek-grid__expanded-cell > * {
  animation: ek-grid-expand-in var(--ek-motion-reveal);
}

@keyframes ek-grid-expand-in {
  from {
    transform: translateY(calc(-1 * var(--ek-motion-distance-sm)));
  }
}

.ek-grid__expanded-cell {
  padding: 0;
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-sunken);
  box-shadow: inset 3px 0 0 var(--ek-color-action-border);
}

.ek-grid__td--wrap {
  white-space: normal;
  min-width: 160px;
}

/* Aşama 4 (stres): tek satırlık metin kolonu en fazla 240px, taşan kısım üç nokta — uzun müşteri/ürün adı tutar ve
   durum kolonlarını görünür alanın dışına itmesin. Sarılan (`wrap`) ve tipli kolonlar etkilenmez. */
.ek-grid__td--text:not(.ek-grid__td--wrap) {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-grid__td--end {
  text-align: right;
}

.ek-grid__td--center {
  text-align: center;
}

.ek-grid__td--num {
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-content-strong);
}

.ek-grid__td--id {
  color: var(--ek-color-action);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.ek-grid__td--muted {
  color: var(--ek-color-content-muted);
}

/* Zebra: her ikinci VERİ satırı çok hafif ton (açılan varyant satırları sırayı bozmasın diye sınıf veri sırasından —
   `is-alt`). Hover ve seçili satır zebranın önünde (daha yüksek özgüllük / sonra gelir). Yapışık eylem kolonu da aynı ton. */
.ek-grid__row.is-alt > .ek-grid__td,
.ek-grid__row.is-alt > .ek-grid__pin-end {
  background: color-mix(in srgb, var(--ek-color-content-strong) 1.5%, var(--ek-color-surface));
}

/* Hover: zebradan ayrışan çok açık site mavisi (gri zebra ↔ gri hover karışıyordu). */
.ek-grid__row:not(.ek-grid__row--skeleton):hover > .ek-grid__td,
.ek-grid__row.is-hover > .ek-grid__td {
  background: color-mix(in srgb, var(--ek-color-action) 5%, var(--ek-color-surface));
}

.ek-grid__row.is-selected > .ek-grid__td {
  background: var(--ek-color-selection);
}

/* FR3 madde 8 (fe-r3a): KANAL ÇİZGİSİ — satırın sol kenarına yapışık düz şerit (tablo kenarıyla birleşip "yapışık bant"
   gibi duruyordu) yerine satır İÇİNDE, kenardan 4px ayrık, yuvarlak uçlu 3px dikey çizgi (orijinal marka rengi, K13).
   Satır yüksekliğinin ~%60'ı; hover'da tam boya uzar (yalnız transform, `feedback` rolü). Seçili satır kanal kimliğini
   KORUR (seçim = zemin + işaretli kutu); kanalsız seçili satırda aksiyon çizgisi aynı geometride. */
:where(.ek-grid__row.has-channel, .ek-grid__row.is-selected) > .ek-grid__td:first-child {
  position: relative;
}

.ek-grid__row.has-channel > .ek-grid__td:first-child::before,
.ek-grid__row.is-selected:not(.has-channel) > .ek-grid__td:first-child::before {
  content: '';
  position: absolute;
  left: var(--ek-space-1);
  top: var(--ek-space-2);
  bottom: var(--ek-space-2);
  width: 3px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
  transform: scaleY(0.72);
  transition: transform var(--ek-motion-feedback);
  pointer-events: none;
}

.ek-grid__row.is-selected:not(.has-channel) > .ek-grid__td:first-child::before {
  background: var(--ek-color-action);
}

.ek-grid__row.has-channel:hover > .ek-grid__td:first-child::before,
.ek-grid__row.has-channel.is-hover > .ek-grid__td:first-child::before,
.ek-grid__row.is-selected > .ek-grid__td:first-child::before {
  transform: none;
}

/* Koyu temada koyu marka tonları (Pazarama/Ideasoft/Bizimhesap) koyu zeminde kaybolmasın: ince açık halka (K13 + FR2-DARK). */
:root[data-theme='dark'] .ek-grid__row.has-channel > .ek-grid__td:first-child::before {
  box-shadow: 0 0 0 1px var(--ek-channel-ring, transparent);
}

.ek-grid__check-hit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  cursor: pointer;
}

.ek-grid__check {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--ek-color-action);
  cursor: pointer;
}

.ek-grid__check:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.ek-grid__bone {
  display: block;
  height: 10px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ek-grid__bone--w0 {
  width: 72%;
}

.ek-grid__bone--w1 {
  width: 48%;
}

.ek-grid__bone--w2 {
  width: 88%;
}

.ek-grid__bone--box {
  width: 16px;
  height: 16px;
}

.ek-grid__empty-cell {
  padding: 0;
  border: 0;
}

.ek-grid__empty {
  /* Tablo yatay kaysa da boş durum görünür alanda ortalı kalır. */
  position: sticky;
  left: 0;
  box-sizing: border-box;
  width: 100cqi;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-12) var(--ek-space-6);
  text-align: center;
}

.ek-grid__empty-title {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-grid__empty-text {
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  white-space: normal;
}
/* Aşama 4 — DAR KAP (< 600px) KART DÜZENİ. Masaüstü tablo 390px'te yalnız iki kolon + eylem kolonu gösteriyordu
   (durum, tutar, mesaj metni görünmüyordu). Dar kapta her satır bir karttır:
     [☐] Kimlik (ilk kolon, başlık) ............................ [eylemler]
         ETİKET      değer
         ETİKET      değer …
   Başlık satırı yalnız SIRALAMA ÇUBUĞUNA iner (sıralanabilir kolonlar + tümünü seç); diğer başlıklar ekran okuyucuda
   kalır. Tablo anlamı açık ARIA rolleriyle korunur (display değişince yerel rol düşmesin). */
@container (max-width: 599.98px) {
  .ek-grid {
    background: var(--ek-color-surface);
  }

  .ek-grid__table,
  .ek-grid__table > tbody {
    display: block;
  }

  .ek-grid__table > thead {
    display: block;
    position: sticky;
    top: 0;
    z-index: var(--ek-z-sticky);
  }

  /* Aşama 6b (Standart 2): kart görünümünde sıralama çubuğu TEK satır, yatay kayar (gizli çubuk). */
  .ek-grid__table > thead > tr {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    align-items: center;
    gap: var(--ek-space-1) var(--ek-space-2);
    min-height: 40px;
    padding: var(--ek-space-1) var(--ek-space-4);
    border-bottom: 1px solid var(--ek-color-border-default);
    background: var(--ek-color-surface-muted);
  }

  /* Sıralanabilir kolon ve seçim yoksa sıralama çubuğu boş kalırdı (gri şerit) — görsel olarak gizli. */
  .ek-grid__table > thead:not(:has(.is-sortable, .ek-grid__th--select)) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .ek-grid__table > thead > tr::-webkit-scrollbar {
    display: none;
  }

  .ek-grid__th {
    flex: none;
    position: static;
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .ek-grid__th--select {
    width: auto;
    padding: 0 var(--ek-space-2) 0 0;
    background: transparent;
  }

  .ek-grid__th.ek-grid__pin-end,
  .ek-grid__th.ek-grid__pin-start {
    background: transparent;
    box-shadow: none;
  }

  /* Sıralanamayan kolon başlıkları görsel olarak gizli (ekran okuyucu adı korunur). */
  .ek-grid__th:not(.is-sortable):not(.ek-grid__th--select) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .ek-grid__th .ek-grid__sort {
    margin: 0;
    padding: var(--ek-space-1) var(--ek-space-2);
    border-radius: var(--ek-radius-chip);
  }

  .ek-grid__th.is-sorted .ek-grid__sort {
    background: var(--ek-color-action-subtle);
  }

  .ek-grid__th--end .ek-grid__sort {
    flex-direction: row;
  }

  .ek-grid__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--ek-space-3);
    row-gap: var(--ek-space-1);
    padding: var(--ek-space-3) var(--ek-space-4);
    border-bottom: 1px solid var(--ek-color-border-subtle);
    transition: var(--ek-transition-colors);
  }

  .ek-grid__td,
  .ek-grid__td--select,
  .ek-grid__td.ek-grid__pin-end,
  .ek-grid__td.ek-grid__pin-start {
    position: static;
    height: auto;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    text-align: left;
    white-space: normal;
  }

  .ek-grid__td--select {
    grid-column: 1;
    grid-row: 1;
    width: auto;
    display: flex;
  }

  .ek-grid__td--lead {
    grid-column: 2;
    grid-row: 1;
    min-height: 32px;
    display: flex;
    align-items: center;
    overflow-wrap: anywhere;
  }

  .ek-grid__row:not(:has(.ek-grid__td--select)) > .ek-grid__td--lead {
    grid-column: 1 / 3;
  }

  .ek-grid__td.ek-grid__pin-end {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }

  /* Etiketsiz (hideLabel) veri hücresi: kart genişliğinde, etiketsiz satır. */
  .ek-grid__td:not([data-label]):not(.ek-grid__td--lead):not(.ek-grid__pin-end):not(.ek-grid__td--select) {
    grid-column: 2 / -1;
  }

  /* Anahtar–değer satırları: etiket solda sabit genişlik (mikro), değer sağında akar. */
  .ek-grid__td[data-label] {
    grid-column: 2 / -1;
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    align-items: baseline;
    column-gap: var(--ek-space-3);
    min-height: 24px;
  }

  .ek-grid__row:not(:has(.ek-grid__td--select)) > .ek-grid__td[data-label] {
    grid-column: 1 / -1;
  }

  /* Hücrenin tüm çocukları değer kolonunda alt alta (çok öğeli hücreler etiket kolonuna taşmaz); rozetler esnemez. */
  .ek-grid__td[data-label] > * {
    grid-column: 2;
    justify-self: start;
    max-width: 100%;
    min-width: 0;
  }

  .ek-grid__td[data-label]::before {
    grid-column: 1;
    grid-row: 1 / span 4;
    content: attr(data-label);
    color: var(--ek-color-content-muted);
    font-size: var(--ek-type-micro-size);
    line-height: var(--ek-type-micro-line);
    font-weight: var(--ek-type-micro-weight);
    letter-spacing: var(--ek-type-micro-tracking);
    text-transform: uppercase;
  }

  .ek-grid__td--wrap {
    min-width: 0;
  }

  .ek-grid__td--text:not(.ek-grid__td--wrap) {
    max-width: none;
    overflow: visible;
  }

  .ek-grid__row:not(.ek-grid__row--skeleton):hover > .ek-grid__td,
  .ek-grid__row.is-hover > .ek-grid__td,
  .ek-grid__row.is-selected > .ek-grid__td {
    background: transparent;
  }

  .ek-grid__row:not(.ek-grid__row--skeleton):hover,
  .ek-grid__row.is-hover {
    background: var(--ek-color-surface-muted);
  }

  /* Kart: kanal çizgisi kartın solunda, kenardan ayrık (masaüstüyle aynı dil). */
  .ek-grid__row.has-channel,
  .ek-grid__row.is-selected {
    position: relative;
  }

  .ek-grid__row.has-channel > .ek-grid__td:first-child::before,
  .ek-grid__row.is-selected:not(.has-channel) > .ek-grid__td:first-child::before {
    display: none;
  }

  .ek-grid__row.has-channel::before,
  .ek-grid__row.is-selected:not(.has-channel)::before {
    content: '';
    position: absolute;
    left: var(--ek-space-1);
    top: var(--ek-space-3);
    bottom: var(--ek-space-3);
    width: 3px;
    border-radius: var(--ek-radius-chip);
    background: var(--ek-ch-solid);
    pointer-events: none;
  }

  .ek-grid__row.is-selected:not(.has-channel)::before {
    background: var(--ek-color-action);
  }

  .ek-grid__row.is-selected {
    background: var(--ek-color-selection);
  }

  /* İskelet kartı: başlık kemiği + iki satır. */
  .ek-grid__row--skeleton > .ek-grid__td:not(.ek-grid__td--select) {
    grid-column: 2 / -1;
  }

  .ek-grid__row--skeleton > .ek-grid__td:nth-child(n + 5) {
    display: none;
  }

  .ek-grid__expanded,
  .ek-grid__expanded-cell,
  .ek-grid__table > tbody > tr:not(.ek-grid__row) {
    display: block;
  }

  .ek-grid__empty-cell {
    display: block;
  }
}
</style>
