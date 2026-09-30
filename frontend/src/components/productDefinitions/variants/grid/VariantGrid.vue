<!--
  DS-v2 A6a — ürün ekleme/düzenleme VARYANT IZGARASI.
  Gösterim mantığı korunur: satırlar ilk seçenek değerine göre gruplanır ve grup hücresi rowspan ile birleşir.
  Teknik koordinasyon:
   · rowspan / gruplama / sıra tek yerde (`variantSheet.ts` groupRows + windowRowspans) — sayfalama yok,
     sanal kaydırma (sabit 56px satır, pencere + tampon) ile yüzlerce varyant akıcı
   · yapışkan başlık, yapışkan seçim + grup + stok kodu kolonları (dar kapta yalnız grup), sağda eylemler
   · hücre içi düzenleme `useVariantSheet` ile (Enter/F2/yazmaya başla, Enter aşağı, Tab sağ, Esc vazgeç,
     oklar, Shift ile seçim, Ctrl+Z/Y, Ctrl+D, Excel'den yapıştır)
   · değişen hücre vurgusu (açılıştaki değere göre), doğrulama hatası hücrede (ikon + metin + aria-invalid)
  Veri yolu değişmedi: hücreler `productInfoForm.variants` içindeki nesnelere yazar; kaydetme ürün kaydet/güncelle ile.
-->
<template>
  <div class="vg" :class="{ 'vg--narrow': narrow }" ref="rootRef">
    <div class="vg-scroll" ref="scrollRef" @scroll.passive="onScroll">
      <table class="vg-table" role="grid" :aria-label="ariaLabel" :aria-rowcount="rows.length + 1" aria-colcount="11"
        aria-multiselectable="true" @keydown="onKeydown" @copy="onCopy" @paste="onPaste">
        <colgroup>
          <col class="vg-c-sel" /><col class="vg-c-group" /><col class="vg-c-code" /><col class="vg-c-barcode" />
          <col class="vg-c-opts" /><col class="vg-c-money" /><col class="vg-c-money" /><col class="vg-c-chan" />
          <col class="vg-c-int" /><col class="vg-c-shelf" /><col class="vg-c-actions" />
        </colgroup>
        <thead>
          <tr role="row" aria-rowindex="1">
            <th class="vg-th vg-sticky vg-s-sel" aria-colindex="1" scope="col">
              <v-checkbox-btn density="compact" :model-value="allSelected" :indeterminate="someSelected && !allSelected"
                aria-label="Görünen tüm varyantları seç" @update:model-value="toggleAll" />
            </th>
            <th class="vg-th vg-sticky vg-s-group" aria-colindex="2" scope="col">{{ groupTitle }}</th>
            <th v-for="h in dataHeads" :key="h.idx" class="vg-th" :class="h.cls" :aria-colindex="h.idx" scope="col"
              :aria-sort="h.sortKey ? ariaSort(h.sortKey) : undefined">
              <button v-if="h.sortKey" type="button" class="vg-sort" @click="toggleSort(h.sortKey)">
                <span>{{ h.label }}</span>
                <v-icon class="vg-sort__icon" :class="{ 'is-on': sortKey === h.sortKey }" aria-hidden="true"
                  :icon="sortKey === h.sortKey && sortDir === 'desc' ? 'mdi-arrow-down' : 'mdi-arrow-up'" />
              </button>
              <span v-else>{{ h.label }}</span>
            </th>
            <th class="vg-th vg-sticky-end" aria-colindex="11" scope="col"><span class="ek-sr-only">İşlemler</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="win.start > 0" class="vg-pad vg-pad--top" aria-hidden="true"><td colspan="11"></td></tr>
          <tr v-for="r in windowRows" :key="r.key" role="row" class="vg-row"
            :class="{ 'is-picked': isPicked(r.variant), 'is-group-start': r.groupStart, 'is-group-odd': r.groupIndex % 2 === 1 }"
            :aria-rowindex="r.index + 2" :aria-selected="isPicked(r.variant)">
            <td class="vg-td vg-sticky vg-s-sel" aria-colindex="1">
              <v-checkbox-btn density="compact" :model-value="isPicked(r.variant)"
                :aria-label="`Varyantı seç: ${r.variant.stockcode || rowTitle(r.variant)}`"
                @update:model-value="(on: boolean | null) => pick(r.variant, !!on)" />
            </td>
            <td v-if="spans.has(r.index)" :rowspan="spans.get(r.index)" role="rowheader" aria-colindex="2"
              class="vg-td vg-sticky vg-s-group vg-group">
              <div class="vg-group__label">
                <span class="vg-group__title">{{ r.groupTitle }}</span>
                <span class="vg-group__count">{{ r.groupSize }} varyant</span>
              </div>
            </td>

            <!-- stok kodu (+ küçük resim) -->
            <td v-bind="cellAttrs(r, 0)" class="vg-td vg-sticky vg-s-code vg-cell" :class="cellClass(r, 0)">
              <div class="vg-code">
                <button type="button" class="vg-thumb" :aria-label="`Varyant resimleri: ${r.variant.stockcode || rowTitle(r.variant)}`"
                  tabindex="-1" @mousedown.stop @click.stop="emit('images', r.variant)">
                  <ProductVariantImageComponent :productInfoForm="productInfoForm" :height="36"
                    :imageId="r.variant.images ? r.variant.images[0] : undefined" />
                </button>
                <CellBody :sheet="sheet" :r="r.index" :c="0" :value="r.variant.stockcode" kind="text" strong
                  :issue="issueOf(r, 0)" :label="`Stok kodu, ${rowTitle(r.variant)}`" />
              </div>
            </td>
            <td v-bind="cellAttrs(r, 1)" class="vg-td vg-cell vg-mono" :class="cellClass(r, 1)">
              <CellBody :sheet="sheet" :r="r.index" :c="1" :value="r.variant.barcode" kind="text"
                :issue="issueOf(r, 1)" :label="`Barkod, ${rowTitle(r.variant)}`" />
            </td>

            <td class="vg-td vg-opts" aria-colindex="5">
              <span v-for="o in optionChips(r.variant)" :key="o.id" class="vg-chip">
                <span class="vg-chip__k">{{ o.choice }}</span>{{ o.value }}
              </span>
              <span v-if="!optionChips(r.variant).length" class="vg-muted">—</span>
            </td>

            <!-- fiyatlar -->
            <template v-if="r.variant.prices?.isPlatformBasedPrice">
              <td class="vg-td vg-num vg-chanrange" colspan="2" aria-colindex="6">
                <button type="button" class="vg-rangebtn" @click="emit('channelPrices', r.variant)"
                  :aria-label="`Kanal fiyatlarını düzenle: ${rowTitle(r.variant)}`">
                  <span class="vg-rangebtn__val ek-num">{{ priceRange(r.variant, 'salePrice') }}</span>
                  <span class="vg-rangebtn__sub">Kanal bazında · düzenle</span>
                </button>
              </td>
            </template>
            <template v-else>
              <td v-bind="cellAttrs(r, 2)" class="vg-td vg-cell vg-num" :class="cellClass(r, 2)">
                <CellBody :sheet="sheet" :r="r.index" :c="2" :value="r.variant.prices?.salePrice" kind="money"
                  :issue="issueOf(r, 2)" :label="`Satış fiyatı, ${rowTitle(r.variant)}`" />
              </td>
              <td v-bind="cellAttrs(r, 3)" class="vg-td vg-cell vg-num" :class="cellClass(r, 3)">
                <CellBody :sheet="sheet" :r="r.index" :c="3" :value="r.variant.prices?.marketPrice" kind="money"
                  :issue="issueOf(r, 3)" :label="`Piyasa fiyatı, ${rowTitle(r.variant)}`" />
              </td>
            </template>
            <td class="vg-td vg-chan" aria-colindex="8">
              <v-checkbox-btn density="compact" :model-value="!!r.variant.prices?.isPlatformBasedPrice"
                :aria-label="`${$t('productDefinitions.product.platformPrice')}: ${rowTitle(r.variant)}`"
                @update:model-value="(on: boolean | null) => setChannelBased(r.variant, !!on)" />
            </td>

            <td v-bind="cellAttrs(r, 4)" class="vg-td vg-cell vg-num" :class="cellClass(r, 4)">
              <CellBody :sheet="sheet" :r="r.index" :c="4" :value="r.variant.stock" kind="int"
                :issue="issueOf(r, 4)" :label="`Stok, ${rowTitle(r.variant)}`" />
            </td>
            <td v-bind="cellAttrs(r, 5)" class="vg-td vg-cell" :class="cellClass(r, 5)">
              <CellBody :sheet="sheet" :r="r.index" :c="5" :value="r.variant.shelf" kind="text"
                :issue="issueOf(r, 5)" :label="`Raf, ${rowTitle(r.variant)}`" placeholder="—" />
            </td>

            <td class="vg-td vg-sticky-end vg-actions" aria-colindex="11">
              <EkTooltip text="Özellikler ve kanal bilgileri">
                <v-btn icon variant="text" size="small" density="comfortable" class="vg-act"
                    aria-label="Varyantı düzenle" @click="emit('edit', r.variant)"><v-icon icon="mdi-pencil" size="18" /></v-btn>
              </EkTooltip>
              <EkTooltip text="Varyantı sil">
                <v-btn icon variant="text" size="small" density="comfortable" class="vg-act vg-act--danger"
                    aria-label="Varyantı sil" @click="emit('delete', r.variant)"><v-icon icon="mdi-delete" size="18" /></v-btn>
              </EkTooltip>
            </td>
          </tr>
          <tr v-if="win.end < rows.length" class="vg-pad vg-pad--bottom" aria-hidden="true"><td colspan="11"></td></tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="vg-empty">
        <slot name="empty" />
      </div>
    </div>
    <div class="ek-sr-only" aria-live="polite">{{ liveMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import { formatMoney } from '@/composables/format'
import { useChoicesStore } from '@/stores/choicesStore'
import ProductVariantImageComponent from '../ProductVariantImageComponent.vue'
import {
  BASE_COLUMNS, choiceOrderComparator, diff, duplicateIndex, getCell, groupRows, rowId, validateCell, visibleWindow,
  windowRowspans, type CellChange, type CellIssue, type ColumnKey, type GroupedRow, type Snapshot,
} from './variantSheet'
import { useVariantSheet, type VariantSheet } from './useVariantSheet'

const ROW_H = 56

const props = defineProps<{
  variants: any[]
  productInfoForm: any
  /** Açılıştaki değerler (değişen hücre vurgusu). */
  baseline: Snapshot
  filter?: string
  ariaLabel?: string
}>()
const selected = defineModel<string[]>('selected', { default: () => [] })
const emit = defineEmits<{
  edit: [v: any]; images: [v: any]; delete: [v: any]; channelPrices: [v: any]; changed: [changes: CellChange[]]
}>()

const choicesStore = useChoicesStore()

// ── sıra: grup (ilk seçenek) tanım sırası → kolon sıralaması → kalan seçeneklerin tanım sırası ──
const valueOrder = (choiceId: string, valueId: string) => {
  const values = choicesStore.getChoiceValues(choiceId as any) as any[] | undefined
  const i = values ? values.findIndex((x: any) => x._id === valueId) : -1
  return i < 0 ? 9999 : i
}
const valueTitle = (valueId: string) => choicesStore.getDirectChoiceValueTitle(valueId) || ''
const byChoices = choiceOrderComparator(valueOrder, valueTitle)

type SortKey = 'stockcode' | 'barcode' | 'salePrice' | 'marketPrice' | 'stock'
const sortKey = ref<SortKey | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')
function toggleSort(k: SortKey) {
  if (sortKey.value !== k) { sortKey.value = k; sortDir.value = 'asc' }
  else if (sortDir.value === 'asc') sortDir.value = 'desc'
  else sortKey.value = null // üçüncü tık: seçenek sırasına dön
}
const ariaSort = (k: SortKey) => (sortKey.value === k ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : 'none')

const matches = (v: any, q: string) => {
  if (!q) return true
  const hay = [v.stockcode, v.barcode, v.shelf, ...(v.choices || []).map((c: any) => valueTitle(c.choiceValueId))]
    .filter(Boolean).join(' ').toLocaleLowerCase('tr')
  return q.split(/\s+/).every((t) => hay.includes(t))
}

const ordered = computed(() => {
  const q = (props.filter || '').trim().toLocaleLowerCase('tr')
  const list = (props.variants || []).filter((v) => matches(v, q))
  const groupCmp = (a: any, b: any) => {
    const x = a.choices?.[0]; const y = b.choices?.[0]
    if (!x || !y) return 0
    return valueOrder(x.choiceId, x.choiceValueId) - valueOrder(y.choiceId, y.choiceValueId)
      || valueTitle(x.choiceValueId).localeCompare(valueTitle(y.choiceValueId), 'tr')
  }
  return [...list].sort((a, b) => {
    const g = groupCmp(a, b)
    if (g) return g
    if (sortKey.value) {
      const av = getCell(a, sortKey.value); const bv = getCell(b, sortKey.value)
      const d = typeof av === 'number' || typeof bv === 'number'
        ? Number(av ?? 0) - Number(bv ?? 0)
        : String(av ?? '').localeCompare(String(bv ?? ''), 'tr', { numeric: true })
      if (d) return sortDir.value === 'asc' ? d : -d
    }
    return byChoices(a, b)
  })
})

interface ViewRow extends GroupedRow { key: string; groupTitle: string }
const rows = computed<ViewRow[]>(() => groupRows(ordered.value, (v: any) => v.choices?.[0]?.choiceValueId ?? '')
  .map((r) => ({ ...r, key: rowId(r.variant) || String(r.index), groupTitle: groupLabel(r.variant) })))
const rowVariants = computed(() => ordered.value)

const groupTitle = computed(() => {
  const first = props.variants?.find((v) => v.choices?.[0])
  return (first && choicesStore.getChoiceTitle(first.choices[0].choiceId)) || 'Grup'
})
function groupLabel(v: any) {
  const c = v.choices?.[0]
  return c ? (choicesStore.getChoiceValueName(c.choiceId, c.choiceValueId) || '—') : '—'
}
const rowTitle = (v: any) => (v.choices || []).map((c: any) => valueTitle(c.choiceValueId)).filter(Boolean).join(' / ') || v.stockcode || 'varyant'
function optionChips(v: any) {
  return (v.choices || []).slice(1).map((c: any) => ({
    id: `${c.choiceId}:${c.choiceValueId}`,
    choice: choicesStore.getChoiceTitle(c.choiceId) || '',
    value: choicesStore.getChoiceValueName(c.choiceId, c.choiceValueId) || '—',
  }))
}

const dataHeads = [
  { idx: 3, label: 'Stok kodu', sortKey: 'stockcode' as SortKey, cls: 'vg-sticky vg-s-code' },
  { idx: 4, label: 'Barkod', sortKey: 'barcode' as SortKey, cls: '' },
  { idx: 5, label: 'Seçenekler', sortKey: null, cls: '' },
  { idx: 6, label: 'Satış fiyatı', sortKey: 'salePrice' as SortKey, cls: 'vg-th--num' },
  { idx: 7, label: 'Piyasa fiyatı', sortKey: 'marketPrice' as SortKey, cls: 'vg-th--num' },
  { idx: 8, label: 'Kanal fiyatı', sortKey: null, cls: 'vg-th--center' },
  { idx: 9, label: 'Stok', sortKey: 'stock' as SortKey, cls: 'vg-th--num' },
  { idx: 10, label: 'Raf', sortKey: null, cls: '' },
]

// ── sanal kaydırma ──
const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewport = ref(600)
const narrow = ref(false)
const HEAD_H = 44
const win = computed(() => visibleWindow(Math.max(0, scrollTop.value - HEAD_H), viewport.value, ROW_H, rows.value.length, 10))
const windowRows = computed(() => rows.value.slice(win.value.start, win.value.end))
const spans = computed(() => windowRowspans(rows.value, win.value.start, win.value.end))
const padTop = computed(() => `${win.value.start * ROW_H}px`)
const padBottom = computed(() => `${Math.max(0, rows.value.length - win.value.end) * ROW_H}px`)
const onScroll = () => { scrollTop.value = scrollRef.value?.scrollTop || 0 }
let ro: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && scrollRef.value) {
    ro = new ResizeObserver(() => {
      viewport.value = scrollRef.value?.clientHeight || 600
      narrow.value = (rootRef.value?.clientWidth || 1000) < 720
    })
    ro.observe(scrollRef.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())

// ── seçim (satır onay kutuları) ──
const pickedSet = computed(() => new Set(selected.value))
const isPicked = (v: any) => pickedSet.value.has(rowId(v))
function pick(v: any, on: boolean) {
  const id = rowId(v)
  selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter((x) => x !== id)
}
const allSelected = computed(() => rows.value.length > 0 && rows.value.every((r) => pickedSet.value.has(rowId(r.variant))))
const someSelected = computed(() => rows.value.some((r) => pickedSet.value.has(rowId(r.variant))))
function toggleAll(on: boolean | null) {
  const ids = rows.value.map((r) => rowId(r.variant))
  selected.value = on ? [...new Set([...selected.value, ...ids])] : selected.value.filter((x) => !ids.includes(x))
}

// ── hücre düzenleme (useVariantSheet) ──
const liveMessage = ref('')
const columns = computed(() => BASE_COLUMNS)
const sheet: VariantSheet = useVariantSheet({
  rows: rowVariants,
  columns,
  readonly: (v, col) => !!v?.prices?.isPlatformBasedPrice && (col.key === 'salePrice' || col.key === 'marketPrice'),
  onChange: (c) => emit('changed', c),
  onActivate: (cell) => ensureVisible(cell.row),
  announce: (m) => { liveMessage.value = m },
})

function cellAttrs(r: ViewRow, c: number): Record<string, any> {
  const issue = issueOf(r, c)
  return {
    role: 'gridcell',
    'aria-colindex': [3, 4, 6, 7, 9, 10][c],
    'aria-selected': sheet.isSelected(r.index, c),
    'aria-invalid': issue?.level === 'error' ? 'true' : undefined,
    tabindex: sheet.isActive(r.index, c) ? 0 : -1,
    'data-r': r.index,
    'data-c': c,
    'data-cell': BASE_COLUMNS[c].key,
    onMousedown: (e: MouseEvent) => onCellDown(e, r.index, c),
    onMouseenter: () => onCellEnter(r.index, c),
    onDblclick: () => { sheet.activate(r.index, c); sheet.startEdit() },
  }
}

const dupes = computed(() => ({ barcode: duplicateIndex(props.variants || [], 'barcode'), stockcode: duplicateIndex(props.variants || [], 'stockcode') }))
function issueOf(r: ViewRow, c: number): CellIssue | null {
  if (sheet.isEditing(r.index, c) && sheet.editing.value?.error) return { level: 'error', message: sheet.editing.value.error }
  return validateCell(r.variant, BASE_COLUMNS[c], dupes.value)
}
const changedKeys = computed(() => new Set(diff(props.baseline || {}, props.variants || [], BASE_COLUMNS).map((x) => `${x.id}|${x.key}`)))
const isChanged = (v: any, key: ColumnKey) => changedKeys.value.has(`${rowId(v)}|${key}`)
function cellClass(r: ViewRow, c: number) {
  const issue = issueOf(r, c)
  return {
    'is-sel': sheet.isSelected(r.index, c) && sheet.selectedCount.value > 1,
    'is-active': sheet.isActive(r.index, c),
    'is-editing': sheet.isEditing(r.index, c),
    'is-changed': isChanged(r.variant, BASE_COLUMNS[c].key),
    'is-error': issue?.level === 'error',
    'is-warning': issue?.level === 'warning',
  }
}

let dragging = false
function onCellDown(e: MouseEvent, r: number, c: number) {
  if (e.button !== 0) return
  if (sheet.editing.value && !sheet.isEditing(r, c)) { if (!sheet.commitEdit()) sheet.cancelEdit() }
  if (sheet.isEditing(r, c)) return
  sheet.activate(r, c, e.shiftKey)
  dragging = true
  window.addEventListener('mouseup', () => { dragging = false }, { once: true })
}
function onCellEnter(r: number, c: number) { if (dragging) sheet.activate(r, c, true) }

function focusActive() {
  nextTick(() => {
    const { row, col } = sheet.active.value
    const el = rootRef.value?.querySelector<HTMLElement>(`[data-r="${row}"][data-c="${col}"]`)
    if (!el) return
    const input = el.querySelector<HTMLInputElement>('input.vg-input')
    ;(input || el).focus({ preventScroll: true })
    // yatay: yapışkan kolonların altında kalmasın
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}
function ensureVisible(row: number) {
  const s = scrollRef.value
  if (s) {
    const top = row * ROW_H
    const bottom = top + ROW_H
    const viewTop = s.scrollTop
    const viewBottom = s.scrollTop + s.clientHeight - HEAD_H
    if (top < viewTop) s.scrollTop = top
    else if (bottom > viewBottom) s.scrollTop = bottom - (s.clientHeight - HEAD_H)
    scrollTop.value = s.scrollTop
  }
  focusActive()
}
watch(() => sheet.editing.value && `${sheet.editing.value.row}:${sheet.editing.value.col}`, (on) => { if (on) focusActive() })

function isCellTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.matches?.('td[data-r]') || el.matches?.('input.vg-input'))
}
function onKeydown(e: KeyboardEvent) {
  if (!isCellTarget(e.target)) return
  // Kopyala/yapıştır/kes tarayıcı olayıyla gelsin.
  if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'C', 'V', 'X'].includes(e.key)) return
  const wasEditing = !!sheet.editing.value
  if (sheet.onKeydown(e)) {
    e.preventDefault()
    if (wasEditing && !sheet.editing.value) focusActive()
    if (!wasEditing && !sheet.editing.value) focusActive()
  }
}
function onCopy(e: ClipboardEvent) {
  if (!isCellTarget(e.target) || sheet.editing.value) return
  e.clipboardData?.setData('text/plain', sheet.copyText())
  e.preventDefault()
}
function onPaste(e: ClipboardEvent) {
  if (!isCellTarget(e.target) || sheet.editing.value) return
  const text = e.clipboardData?.getData('text/plain')
  if (!text) return
  e.preventDefault()
  sheet.pasteText(text)
}

function setChannelBased(v: any, on: boolean) {
  v.prices = v.prices || {}
  v.prices.isPlatformBasedPrice = on
}
function priceRange(v: any, field: 'salePrice' | 'marketPrice') {
  const vals = Object.values(v.platforms || {}).map((p: any) => Number(p?.prices?.[field])).filter((n) => Number.isFinite(n) && n > 0)
  if (!vals.length) return 'Fiyat girilmedi'
  const lo = Math.min(...vals); const hi = Math.max(...vals)
  return lo === hi ? formatMoney(lo) : `${formatMoney(lo)} – ${formatMoney(hi)}`
}

const issueCounts = computed(() => {
  let errors = 0; let warnings = 0; let first: { row: number; col: number } | null = null
  rows.value.forEach((r) => BASE_COLUMNS.forEach((col, c) => {
    const i = validateCell(r.variant, col, dupes.value)
    if (!i) return
    if (i.level === 'error') { errors++; if (!first) first = { row: r.index, col: c } } else warnings++
  }))
  return { errors, warnings, first: first as { row: number; col: number } | null }
})
function goToFirstIssue() {
  const f = issueCounts.value.first
  if (f) sheet.activate(f.row, f.col)
}

defineExpose({ sheet, issueCounts, goToFirstIssue, rows, changedCount: computed(() => changedKeys.value.size) })

// ── hücre gövdesi: görüntü ↔ düzenleme girişi (tek yerde) ──
const CellBody = defineComponent({
  props: {
    sheet: { type: Object as PropType<VariantSheet>, required: true },
    r: { type: Number, required: true }, c: { type: Number, required: true },
    value: { type: [String, Number, null] as PropType<any>, default: undefined },
    kind: { type: String as PropType<'text' | 'money' | 'int'>, required: true },
    issue: { type: Object as PropType<CellIssue | null>, default: null },
    label: { type: String, required: true },
    strong: Boolean,
    placeholder: { type: String, default: '' },
  },
  setup(p) {
    return () => {
      const s = p.sheet
      if (s.isEditing(p.r, p.c) && s.editing.value) {
        const ed = s.editing.value
        return h('input', {
          class: ['vg-input', { 'is-num': p.kind !== 'text' }],
          value: ed.draft,
          'aria-label': p.label,
          'aria-invalid': ed.error ? 'true' : undefined,
          inputmode: p.kind === 'text' ? undefined : 'decimal',
          autocomplete: 'off',
          spellcheck: false,
          onInput: (e: Event) => { if (s.editing.value) s.editing.value.draft = (e.target as HTMLInputElement).value },
          onBlur: () => { if (s.isEditing(p.r, p.c) && !s.commitEdit()) s.cancelEdit() },
        })
      }
      const empty = p.value === undefined || p.value === null || p.value === ''
      const text = empty ? p.placeholder : p.kind === 'money' ? formatMoney(Number(p.value)) : String(p.value)
      return h('span', { class: ['vg-val', { 'is-strong': p.strong, 'is-empty': empty, 'ek-num': p.kind !== 'text' }] }, [
        text,
        p.issue ? h('span', { class: ['vg-issue', `vg-issue--${p.issue.level}`], title: p.issue.message }, [
          h('i', { class: ['mdi', p.issue.level === 'error' ? 'mdi-alert-circle' : 'mdi-alert', 'vg-issue__icon'], 'aria-hidden': 'true' }),
          h('span', { class: 'ek-sr-only' }, p.issue.message),
        ]) : null,
      ])
    }
  },
})
</script>

<style scoped>
.vg {
  --vg-row: 56px;
  --vg-head: 44px;
  --vg-w-sel: 44px;
  --vg-w-group: 112px;
  --vg-w-code: 180px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ek-color-surface);
}
.vg--narrow { --vg-w-group: 96px; --vg-w-code: 176px; }

.vg-scroll {
  position: relative;
  overflow: auto;
  max-height: max(360px, calc(100dvh - 360px));
  overscroll-behavior: contain;
}
.vg-table {
  width: 100%;
  min-width: 1120px;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  color: var(--ek-color-content-default);
}
.vg-c-sel { width: var(--vg-w-sel); }
.vg-c-group { width: var(--vg-w-group); }
.vg-c-code { width: var(--vg-w-code); }
.vg-c-barcode { width: 132px; }
.vg-c-opts { width: auto; }
.vg-c-money { width: 118px; }
.vg-c-chan { width: 96px; }
.vg-c-int { width: 68px; }
.vg-c-shelf { width: 80px; }
.vg-c-actions { width: 84px; }

/* başlık */
.vg-th {
  position: sticky;
  top: 0;
  z-index: 3;
  height: var(--vg-head);
  padding: 0 var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}
.vg-th--num { text-align: right; }
.vg-th--center { text-align: center; }
.vg-sort {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
  border-radius: var(--ek-radius-control);
  padding: var(--ek-space-1) 0;
  cursor: pointer;
}
.vg-th--num .vg-sort { flex-direction: row-reverse; }
.vg-sort:hover { color: var(--ek-color-content-strong); }
.vg-sort:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.vg-sort__icon { font-size: var(--ek-icon-xs); opacity: 0; transition: opacity var(--ek-duration-fast) var(--ek-easing-standard); }
.vg-sort:hover .vg-sort__icon, .vg-sort__icon.is-on { opacity: 1; }
.vg-sort__icon.is-on { color: var(--ek-color-action); }

/* gövde */
.vg-td {
  height: var(--vg-row);
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vg-row.is-group-start > .vg-td { border-top: 1px solid var(--ek-color-border-strong); }
.vg-row:first-child > .vg-td, .vg-pad + .vg-row > .vg-td { border-top-color: transparent; }
.vg-row:hover > .vg-td:not(.vg-group) { background: var(--ek-color-surface-muted); }
.vg-row.is-picked > .vg-td:not(.vg-group) { background: var(--ek-color-selection); }
.vg-pad--top td { height: v-bind(padTop); padding: 0; border: 0; }
.vg-pad--bottom td { height: v-bind(padBottom); padding: 0; border: 0; }

/* yapışkan kolonlar */
.vg-sticky { position: sticky; z-index: 1; }
.vg-th.vg-sticky { z-index: 4; }
.vg-s-sel { left: 0; padding: 0; text-align: center; }
.vg-s-group { left: var(--vg-w-sel); }
.vg-s-code { left: calc(var(--vg-w-sel) + var(--vg-w-group)); box-shadow: var(--ek-shadow-scroll-start); }
.vg--narrow .vg-s-sel { position: static; }
.vg--narrow .vg-s-group { left: 0; }
.vg--narrow .vg-s-code, .vg--narrow .vg-cell.vg-s-code { position: relative; left: auto; box-shadow: none; }
.vg--narrow .vg-s-group { box-shadow: var(--ek-shadow-scroll-start); }
.vg-sticky-end { position: sticky; right: 0; z-index: 1; box-shadow: var(--ek-shadow-scroll-end); }
.vg-th.vg-sticky-end { z-index: 4; }
.vg--narrow .vg-sticky-end { position: static; box-shadow: none; }

/* grup (rowspan) */
.vg-group {
  vertical-align: top;
  padding: 0;
  background: var(--ek-color-surface-sunken);
  border-right: 1px solid var(--ek-color-border-default);
  border-top: 1px solid var(--ek-color-border-strong);
}
.vg-row.is-group-odd .vg-group { background: var(--ek-color-surface-muted); }
.vg-group__label {
  position: sticky;
  top: var(--vg-head);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-3);
  white-space: normal;
}
.vg-group__title {
  color: var(--ek-color-content-strong);
  font-weight: 600;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  overflow-wrap: anywhere;
}
.vg-group__count { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }

/* düzenlenebilir hücre */
.vg-cell { position: relative; cursor: cell; outline: none; }
.vg-cell.vg-sticky { position: sticky; }
.vg-cell.is-sel { background: var(--ek-color-selection) !important; }
.vg-cell.is-active { box-shadow: inset 0 0 0 2px var(--ek-color-border-focus); z-index: 2; }
.vg-cell:focus-visible { box-shadow: inset 0 0 0 2px var(--ek-color-border-focus); }
.vg-cell.is-changed:not(.is-sel)::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 8px 8px 0;
  border-color: transparent var(--ek-color-warning) transparent transparent;
}
.vg-cell.is-changed:not(.is-sel):not(.is-active) { background: var(--ek-color-highlight); }
.vg-cell.is-error { box-shadow: inset 3px 0 0 var(--ek-color-error); }
.vg-cell.is-error.is-active { box-shadow: inset 0 0 0 2px var(--ek-color-error); }
.vg-cell.is-editing { padding: 0 var(--ek-space-2); }
.vg-num { text-align: right; }
.vg-mono { font-variant-numeric: tabular-nums; color: var(--ek-color-content-muted); }

.vg-code { display: flex; align-items: center; gap: var(--ek-space-3); min-width: 0; }
.vg-code :deep(.vg-val) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.vg-thumb {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-subtle);
  cursor: pointer;
}
.vg-thumb:hover { border-color: var(--ek-color-action-border); }
.vg-thumb:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.vg-thumb :deep(.v-icon) { font-size: 22px !important; }

:deep(.vg-val) { display: inline-flex; align-items: center; gap: var(--ek-space-1); max-width: 100%; }
:deep(.vg-val.is-strong) { color: var(--ek-color-content-strong); font-weight: 600; }
:deep(.vg-val.is-empty) { color: var(--ek-color-content-subtle); }
:deep(.vg-issue) { display: inline-flex; flex: 0 0 auto; }
:deep(.vg-issue__icon) { font-size: var(--ek-icon-sm); line-height: 1; }
:deep(.vg-issue--error) { color: var(--ek-color-error); }
:deep(.vg-issue--warning) { color: var(--ek-color-warning); }
:deep(.vg-input) {
  width: 100%;
  height: 36px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-focus);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
:deep(.vg-input.is-num) { text-align: right; font-variant-numeric: tabular-nums; }
:deep(.vg-input[aria-invalid='true']) { border-color: var(--ek-color-error); }

/* seçenek çipleri */
.vg-opts { white-space: normal; text-overflow: clip; line-height: 1; }
.vg-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ek-space-1);
  margin: 2px 2px 2px 0;
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
  font-weight: 600;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.vg-chip__k { color: var(--ek-color-content-muted); font-weight: 400; }
.vg-muted { color: var(--ek-color-content-subtle); }

/* kanal */
.vg-chan { text-align: center; }
.vg-chan :deep(.v-selection-control) { justify-content: center; }
.vg-chanrange { padding: 0 var(--ek-space-2); }
.vg-rangebtn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-strong);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.vg-rangebtn:hover { background: var(--ek-color-action-subtle); }
.vg-rangebtn:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.vg-rangebtn__val { font-weight: 600; }
.vg-rangebtn__sub { color: var(--ek-color-action); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }

/* eylemler */
.vg-actions { text-align: right; padding: 0 var(--ek-space-2); }
.vg-act { color: var(--ek-color-content-muted) !important; }
.vg-act:hover { color: var(--ek-color-content-strong) !important; }
.vg-act--danger:hover { color: var(--ek-color-error) !important; }

.vg-empty { padding: var(--ek-space-8) var(--ek-space-4); }

@media (prefers-reduced-motion: reduce) {
  .vg-sort__icon, .vg-rangebtn { transition: none; }
}
</style>
