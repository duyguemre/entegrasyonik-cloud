<!--
  DS-v2 A6a — TOPLU VARYANT DÜZENLEYİCİ (tablo). Yalnız mevcut veri yolu: değişiklikler bir TASLAK üzerinde
  yapılır, "Uygula" ile formdaki `productInfoForm.variants`'a yazılır; kalıcı kayıt ürün kaydet/güncelle ile.
  · Hücre / satır / kolon seçimi (tık, Shift+tık, sürükle, başlıklar, köşe = tümü; Shift+oklar)
  · Seçime toplu uygula: değer ata · ± yüzde · ± tutar (stokta ± adet) · temizle
  · Aşağı doldur (Ctrl+D), kopyala / Excel'den tablo yapıştır (Ctrl+C / Ctrl+V), geri al / yinele (Ctrl+Z / Ctrl+Y)
  · Kanal fiyat kolonları kanal adı + kanal rengiyle gruplu başlık altında (renk tek başına anlam taşımaz)
  · Değişiklik özeti + uygulamadan önce önizleme (önce → sonra); hata varken uygulanmaz
-->
<template>
  <EkDialogCard class="vbe-root" title="Toplu düzenle" icon="mdi-table-edit" width="custom" hide-actions
    :description="`${variants.length === allCount ? 'Tüm' : 'Seçili'} ${variants.length} varyant · değişiklikler önce önizlenir, sonra forma yazılır`"
    @close="requestClose">
    <template v-if="step === 'edit'">
      <!-- işlem çubuğu -->
      <div class="vbe-ops" role="toolbar" aria-label="Toplu işlem">
        <div class="vbe-ops__row">
          <div class="vbe-seg" role="radiogroup" aria-label="Görünen kolonlar">
            <button v-for="p in presets" :key="p.key" type="button" role="radio" class="vbe-seg__btn"
              :aria-checked="view === p.key" :class="{ 'is-on': view === p.key }" @click="setView(p.key)">{{ p.label }}</button>
          </div>
          <span class="vbe-spacer"></span>
          <EkTooltip text="Geri al" :shortcut="['Ctrl', 'Z']">
            <EkButton size="sm" tone="ghost" icon="mdi-undo" icon-only aria-label="Geri al" :disabled="!sheet.canUndo.value" @click="sheet.undo()" />
          </EkTooltip>
          <EkTooltip text="Yinele" :shortcut="['Ctrl', 'Y']">
            <EkButton size="sm" tone="ghost" icon="mdi-redo" icon-only aria-label="Yinele" :disabled="!sheet.canRedo.value" @click="sheet.redo()" />
          </EkTooltip>
          <span class="vbe-selinfo">{{ selectionText }}</span>
        </div>
        <div class="vbe-ops__row vbe-apply" data-bulk-op>
          <div class="vbe-seg" role="radiogroup" aria-label="İşlem">
            <button v-for="m in modes" :key="m.key" type="button" role="radio" class="vbe-seg__btn" :disabled="m.numeric && !selectionNumeric"
              :aria-checked="mode === m.key" :class="{ 'is-on': mode === m.key }" @click="mode = m.key">{{ m.label }}</button>
          </div>
          <v-text-field v-model="opValue" class="vbe-value" density="compact" variant="outlined" hide-details
            :label="valueLabel" :prefix="mode === 'percent' ? '%' : undefined" :disabled="mode === 'clear'"
            :placeholder="valuePlaceholder" @keydown.enter.prevent="applyOp" aria-describedby="vbe-op-hint" />
          <EkButton size="sm" tone="primary" icon="mdi-check" :disabled="!canApplyOp" @click="applyOp">Seçime uygula</EkButton>
          <EkTooltip text="Seçimin ilk satırını alttakilere kopyalar" :shortcut="['Ctrl', 'D']">
            <EkButton size="sm" icon="mdi-arrow-collapse-down" :disabled="sheet.range.value.r2 === sheet.range.value.r1" @click="sheet.fillDown()">Aşağı doldur</EkButton>
          </EkTooltip>
          <span id="vbe-op-hint" class="vbe-hint">{{ opHint }}</span>
        </div>
      </div>

      <p v-if="view !== 'general'" class="vbe-note">
        <v-icon icon="mdi-information-outline" aria-hidden="true" />
        Kanal fiyatları yalnız “kanal bazında fiyat” işaretli varyantlarda kullanılır. Uygularken kanal fiyatı değişen varyantlar
        kanal bazında olarak işaretlenebilir (önizlemede seçilir).
      </p>

      <!-- tablo -->
      <div class="vbe-scroll" ref="scrollRef" @scroll.passive="onScroll">
        <table class="vbe-table" role="grid" aria-label="Toplu düzenleme tablosu" :aria-rowcount="rows.length + 1"
          :aria-colcount="columns.length + 1" aria-multiselectable="true" @keydown="onKeydown" @copy="onCopy" @paste="onPaste">
          <thead>
            <tr v-if="hasChannelCols" class="vbe-band" aria-hidden="true">
              <th class="vbe-corner-band"></th>
              <th v-for="b in bands" :key="b.key" :colspan="b.span" class="vbe-band__th" :class="{ 'is-channel': b.channel }"
                v-channel-accent="b.channel">
                <EkChannelDot v-if="b.channel" :code="b.channel" :name="b.label" />
                <span v-else>{{ b.label }}</span>
              </th>
            </tr>
            <tr role="row" aria-rowindex="1">
              <th class="vbe-corner" scope="col" aria-colindex="1">
                <button type="button" class="vbe-head-btn" aria-label="Tüm hücreleri seç" @click="sheet.selectAll()">Varyant</button>
              </th>
              <th v-for="(c, ci) in columns" :key="c.key" role="columnheader" scope="col" :aria-colindex="ci + 2"
                class="vbe-colhead" :class="{ 'is-num': c.kind !== 'text', 'is-sel': colSelected(ci), 'is-channel': !!c.channel }"
                v-channel-accent="c.channel">
                <button type="button" class="vbe-head-btn" :aria-label="`${c.channelName ? c.channelName + ' ' : ''}${c.label} kolonunu seç`"
                  @click="(e: MouseEvent) => sheet.selectCol(ci, e.shiftKey)">{{ c.label }}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="win.start > 0" class="vbe-pad vbe-pad--top" aria-hidden="true"><td :colspan="columns.length + 1"></td></tr>
            <tr v-for="(v, i) in windowRows" :key="rowId(v)" role="row" :aria-rowindex="win.start + i + 2"
              :class="{ 'is-group-start': isGroupStart(win.start + i) }">
              <th scope="row" class="vbe-rowhead" :class="{ 'is-sel': rowSelected(win.start + i) }" aria-colindex="1">
                <button type="button" class="vbe-head-btn vbe-rowbtn" :aria-label="`${rowTitle(v)} satırını seç`"
                  @click="(e: MouseEvent) => sheet.selectRow(win.start + i, e.shiftKey)">
                  <span class="vbe-rowbtn__title">{{ rowTitle(v) }}</span>
                  <span class="vbe-rowbtn__sub">{{ v.stockcode || '—' }}</span>
                </button>
              </th>
              <td v-for="(c, ci) in columns" :key="c.key" role="gridcell" :aria-colindex="ci + 2"
                :aria-selected="sheet.isSelected(win.start + i, ci)" :tabindex="sheet.isActive(win.start + i, ci) ? 0 : -1"
                :aria-invalid="issueOf(v, ci)?.level === 'error' ? 'true' : undefined"
                :data-r="win.start + i" :data-c="ci" class="vbe-cell" :class="cellClass(v, win.start + i, ci)"
                @mousedown="(e: MouseEvent) => onCellDown(e, win.start + i, ci)" @mouseenter="onCellEnter(win.start + i, ci)"
                @dblclick="sheet.activate(win.start + i, ci); sheet.startEdit()">
                <input v-if="sheet.isEditing(win.start + i, ci) && sheet.editing.value" class="vbe-input" :class="{ 'is-num': c.kind !== 'text' }"
                  :value="sheet.editing.value.draft" :aria-label="`${c.channelName ? c.channelName + ' ' : ''}${c.label}, ${rowTitle(v)}`"
                  :aria-invalid="sheet.editing.value.error ? 'true' : undefined" :inputmode="c.kind === 'text' ? undefined : 'decimal'"
                  autocomplete="off" spellcheck="false"
                  @input="(e: Event) => { if (sheet.editing.value) sheet.editing.value.draft = (e.target as HTMLInputElement).value }"
                  @blur="onEditBlur(win.start + i, ci)" />
                <span v-else class="vbe-val" :class="{ 'ek-num': c.kind !== 'text', 'is-empty': isEmpty(v, c.key) }">
                  {{ display(v, c) }}
                  <span v-if="issueOf(v, ci)" class="vbe-issue" :class="`vbe-issue--${issueOf(v, ci)!.level}`" :title="issueOf(v, ci)!.message">
                    <v-icon :icon="issueOf(v, ci)!.level === 'error' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'" aria-hidden="true" />
                    <span class="ek-sr-only">{{ issueOf(v, ci)!.message }}</span>
                  </span>
                </span>
              </td>
            </tr>
            <tr v-if="win.end < rows.length" class="vbe-pad vbe-pad--bottom" aria-hidden="true"><td :colspan="columns.length + 1"></td></tr>
          </tbody>
        </table>
      </div>

      <div class="vbe-foot">
        <div class="vbe-foot__summary" role="status">
          <span class="vbe-sum" :class="{ 'is-on': changes.length > 0 }"><strong class="ek-num">{{ changes.length }}</strong> değişiklik</span>
          <span v-if="issueTotals.errors" class="vbe-sum vbe-sum--error"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ issueTotals.errors }} hata</span>
          <span v-if="issueTotals.warnings" class="vbe-sum vbe-sum--warning"><v-icon icon="mdi-alert-outline" aria-hidden="true" />{{ issueTotals.warnings }} uyarı</span>
          <span class="vbe-foot__keys" aria-hidden="true">
            <EkKbd :keys="['Ctrl', 'V']" /> Excel'den yapıştır · <EkKbd :keys="['Ctrl', 'C']" /> kopyala · <EkKbd keys="Del" /> temizle
          </span>
        </div>
        <div v-if="confirmDiscard" class="vbe-discard" role="alert">
          <v-icon icon="mdi-alert-outline" aria-hidden="true" />
          <span><strong>{{ changes.length }} değişiklik uygulanmadı.</strong> Çıkarsanız bu değişiklikler kaybolur.</span>
          <EkButton size="sm" @click="confirmDiscard = false">Düzenlemeye dön</EkButton>
          <EkButton size="sm" tone="danger" icon="mdi-trash-can-outline" @click="emit('close')">Değişiklikleri at</EkButton>
        </div>
        <div v-else class="vbe-foot__actions">
          <EkButton @click="requestClose">Vazgeç</EkButton>
          <EkButton tone="primary" icon="mdi-eye-outline" :disabled="!changes.length" @click="step = 'preview'">
            Değişiklikleri gözden geçir ({{ changes.length }})
          </EkButton>
        </div>
      </div>
      <div class="ek-sr-only" aria-live="polite">{{ live }}</div>
    </template>

    <!-- önizleme -->
    <template v-else>
      <div class="vbe-preview">
        <div class="vbe-preview__head">
          <EkIconTile icon="mdi-format-list-checks" tone="action" size="sm" />
          <div>
            <h3 class="vbe-preview__title">{{ changes.length }} hücre, {{ changedVariantCount }} varyantta değişecek</h3>
            <p class="vbe-preview__desc">Uygula ile değerler forma yazılır. Kalıcı olması için ardından ürünü kaydedin.</p>
          </div>
        </div>
        <div v-if="issueTotals.errors" class="vbe-alert" role="alert">
          <v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />
          <span><strong>{{ issueTotals.errors }} hücrede hata var.</strong> Düzenlemeye dönüp işaretli hücreleri düzeltin; hata varken uygulanmaz.</span>
        </div>
        <ul class="vbe-colsum" aria-label="Kolona göre özet">
          <li v-for="s in columnSummary" :key="s.key">
            <EkChannelDot v-if="s.channel" :code="s.channel" :name="s.channelName" />
            <span>{{ s.label }}</span><strong class="ek-num">{{ s.count }}</strong>
          </li>
        </ul>
        <div class="vbe-diffwrap">
          <table class="vbe-diff">
            <caption class="ek-sr-only">Değişiklik önizlemesi</caption>
            <thead><tr><th scope="col">Varyant</th><th scope="col">Alan</th><th scope="col" class="is-num">Önce</th><th scope="col" class="is-num">Sonra</th></tr></thead>
            <tbody>
              <tr v-for="ch in previewRows" :key="ch.id + ch.key">
                <th scope="row">{{ ch.variantTitle }}<span class="vbe-diff__sub">{{ ch.stockcode }}</span></th>
                <td><EkChannelDot v-if="ch.channel" :code="ch.channel" :name="ch.channelName" /> {{ ch.label }}</td>
                <td class="is-num vbe-diff__before">{{ ch.before }}</td>
                <td class="is-num vbe-diff__after">{{ ch.after }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="changes.length > PREVIEW_LIMIT" class="vbe-more">İlk {{ PREVIEW_LIMIT }} değişiklik gösteriliyor; tamamı uygulanır.</p>
        </div>
        <v-checkbox v-if="channelChangedVariants > 0" v-model="markChannelBased" density="compact" hide-details class="vbe-mark"
          :label="`Kanal fiyatı değişen ${channelChangedVariants} varyantı “kanal bazında fiyat” olarak işaretle`" />
      </div>
      <div class="vbe-foot">
        <div class="vbe-foot__summary"></div>
        <div class="vbe-foot__actions">
          <EkButton icon="mdi-arrow-left" @click="step = 'edit'">Düzenlemeye dön</EkButton>
          <EkButton tone="primary" icon="mdi-check" :disabled="issueTotals.errors > 0" @click="apply">Uygula ({{ changes.length }})</EkButton>
        </div>
      </div>
    </template>
  </EkDialogCard>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type Directive } from 'vue'
import EkDialogCard from '@/components/ds/EkDialogCard.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import EkKbd from '@/components/ds/EkKbd.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import { integrationAccent } from '@/design/tokens/palette'
import { formatMoney } from '@/composables/format'
import { useChoicesStore } from '@/stores/choicesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import {
  BASE_COLUMNS, channelColumns, diff, duplicateIndex, getCell, rowId, setCell, snapshot, validateCell, visibleWindow,
  type BulkMode, type CellValue, type ColumnKey, type SheetColumn,
} from './variantSheet'
import { useVariantSheet } from './useVariantSheet'

const ROW_H = 44
const PREVIEW_LIMIT = 300

const props = defineProps<{
  variants: any[]
  allCount: number
  productInfoForm: any
  preset?: 'all' | 'prices' | 'channelPrices'
}>()
const emit = defineEmits<{ close: []; applied: [count: number] }>()

const choicesStore = useChoicesStore()
const integrationStore = useIntegrationStore()

/**
 * Kanal rengi CSS değişkeni (`--vbe-ch`) — yalnız bilinen 6 entegrasyon (`integrationAccent`); satır içi `style`
 * yazmadan veri güdümlü renk. Ortak kanal rengi token'ı gelince (paralel görev) buradan kaldırılır.
 */
const vChannelAccent: Directive<HTMLElement, string | undefined> = {
  mounted: (el, b) => paint(el, b.value),
  updated: (el, b) => paint(el, b.value),
}
function paint(el: HTMLElement, code?: string) {
  const hex = code ? (integrationAccent as Record<string, string>)[code.toLowerCase()] : undefined
  if (hex) el.style.setProperty('--vbe-ch', hex)
  else el.style.removeProperty('--vbe-ch')
}

// ── taslak: yalnız düzenlenen alanların kopyası; kaynak nesneye Uygula'da yazılır ──
const channels = computed(() => [...(integrationStore.getClientMarketplaces() || []), ...(integrationStore.getClientECommerces() || [])]
  .map((p: any) => ({ code: p.code, title: integrationStore.getIntegrationTitle(p.code) || p.title || p.code })))
const allColumns = computed<SheetColumn[]>(() => [...BASE_COLUMNS, ...channelColumns(channels.value)])

function cloneDraft(v: any) {
  const d: any = { tempId: rowId(v), choices: v.choices, stockcode: v.stockcode, barcode: v.barcode, stock: v.stock, shelf: v.shelf,
    prices: { ...(v.prices || {}) }, platforms: {} }
  for (const ch of channels.value) d.platforms[ch.code] = { prices: { ...(v.platforms?.[ch.code]?.prices || {}) } }
  return d
}
const sources = new Map<string, any>()
const draft = ref<any[]>([])
const base = ref<Record<string, any>>({})
onMounted(() => {
  for (const v of props.variants) sources.set(rowId(v), v)
  draft.value = props.variants.map(cloneDraft)
  base.value = snapshot(draft.value, allColumns.value)
})
const rows = computed(() => draft.value)

type View = 'general' | 'channels' | 'all'
const presets: Array<{ key: View; label: string }> = [
  { key: 'general', label: 'Genel' }, { key: 'channels', label: 'Kanal fiyatları' }, { key: 'all', label: 'Tümü' },
]
const view = ref<View>(props.preset === 'channelPrices' ? (channels.value.length ? 'channels' : 'general') : 'general')
const columns = computed<SheetColumn[]>(() => {
  const general = BASE_COLUMNS
  const chan = channelColumns(channels.value)
  if (view.value === 'general') return general
  if (view.value === 'channels') return [...general.filter((c) => c.key === 'salePrice' || c.key === 'marketPrice'), ...chan]
  return [...general, ...chan]
})
function setView(v: View) { view.value = v; sheet.activate(0, 0) }
const hasChannelCols = computed(() => columns.value.some((c) => c.channel))
const bands = computed(() => {
  const out: Array<{ key: string; label: string; span: number; channel?: string }> = []
  for (const c of columns.value) {
    const label = c.channel ? (c.channelName || c.channel) : 'Genel'
    const last = out[out.length - 1]
    if (last && last.label === label && last.channel === c.channel) last.span++
    else out.push({ key: `${c.channel || 'g'}-${out.length}`, label, span: 1, channel: c.channel })
  }
  return out
})

// ── seçim + etkileşim ──
const live = ref('')
const sheet = useVariantSheet({ rows, columns, onActivate: (c) => ensureVisible(c.row), announce: (m) => { live.value = m } })
const colSelected = (ci: number) => sheet.range.value.c1 <= ci && ci <= sheet.range.value.c2 && sheet.selectionMode.value !== 'cells' && sheet.selectionMode.value !== 'rows'
const rowSelected = (ri: number) => sheet.range.value.r1 <= ri && ri <= sheet.range.value.r2 && sheet.selectionMode.value !== 'cells' && sheet.selectionMode.value !== 'cols'
const selectedColumns = computed(() => columns.value.slice(sheet.range.value.c1, sheet.range.value.c2 + 1))
const selectionNumeric = computed(() => selectedColumns.value.some((c) => c.kind !== 'text'))
const selectionText = computed(() => {
  const g = sheet.range.value
  const cells = sheet.selectedCount.value
  const cols = selectedColumns.value.map((c) => (c.channelName ? `${c.channelName} ${c.label.toLocaleLowerCase('tr')}` : c.label))
  const colText = cols.length <= 2 ? cols.join(', ') : `${cols.length} kolon`
  return `Seçim: ${cells} hücre · ${g.r2 - g.r1 + 1} satır · ${colText}`
})

const modes: Array<{ key: BulkMode; label: string; numeric: boolean }> = [
  { key: 'set', label: 'Değer ata', numeric: false },
  { key: 'percent', label: 'Yüzde', numeric: true },
  { key: 'amount', label: 'Tutar / adet', numeric: true },
  { key: 'clear', label: 'Temizle', numeric: false },
]
const mode = ref<BulkMode>('set')
const opValue = ref<string>('')
watch(selectionNumeric, (n) => { if (!n && (mode.value === 'percent' || mode.value === 'amount')) mode.value = 'set' })
const valueLabel = computed(() => ({ set: 'Değer', percent: 'Değer', amount: 'Değer', clear: 'Değer' })[mode.value])
const valuePlaceholder = computed(() => ({ set: 'ör. 249,90', percent: 'ör. 10 veya -15', amount: 'ör. 20 veya -5', clear: '' })[mode.value])
const opHint = computed(() => {
  if (mode.value === 'percent') return 'Pozitif artırır, negatif indirir. Sonuç 0’ın altına düşmez; fiyat 2 haneye yuvarlanır.'
  if (mode.value === 'amount') return 'Fiyatta tutar, stokta adet eklenir/çıkarılır (negatif = çıkar).'
  if (mode.value === 'clear') return 'Seçili hücreler boşaltılır (sayılar 0 olur).'
  return 'Seçili tüm hücrelere aynı değer yazılır. Metin ve sayı kolonları birlikte seçilebilir.'
})
const canApplyOp = computed(() => mode.value === 'clear' || String(opValue.value ?? '').trim() !== '')
function applyOp() {
  if (!canApplyOp.value) return
  const onlyNumeric = mode.value === 'percent' || mode.value === 'amount'
  const r = sheet.applyToSelection({ mode: mode.value, value: opValue.value }, onlyNumeric ? ['money', 'int'] : undefined)
  live.value = `${r.changed} hücre değişti${r.skipped ? `, ${r.skipped} hücre atlandı` : ''}`
}

// ── görüntü / doğrulama / özet ──
const valueTitle = (id: string) => choicesStore.getDirectChoiceValueTitle(id) || ''
const rowTitle = (v: any) => (v.choices || []).map((c: any) => valueTitle(c.choiceValueId)).filter(Boolean).join(' / ') || v.stockcode || 'Varyant'
const isGroupStart = (i: number) => i > 0 && rows.value[i]?.choices?.[0]?.choiceValueId !== rows.value[i - 1]?.choices?.[0]?.choiceValueId
const isEmpty = (v: any, key: ColumnKey) => { const x = getCell(v, key); return x === undefined || x === null || x === '' }
function display(v: any, c: SheetColumn) {
  const x = getCell(v, c.key)
  if (x === undefined || x === null || x === '') return '—'
  return c.kind === 'money' ? formatMoney(Number(x)) : String(x)
}
const fmt = (c: SheetColumn | undefined, x: CellValue) => (x === undefined || x === null || x === '' ? '—' : c?.kind === 'money' ? formatMoney(Number(x)) : String(x))
const dupes = computed(() => {
  // Taslakta olmayan (kapsam dışı) varyantların kodları da tekrarlama denetimine girer.
  const inScope = new Set(draft.value.map(rowId))
  const merged = [...draft.value, ...(props.productInfoForm.variants || []).filter((v: any) => !inScope.has(rowId(v)))]
  return { barcode: duplicateIndex(merged, 'barcode'), stockcode: duplicateIndex(merged, 'stockcode') }
})
function issueOf(v: any, ci: number) {
  const r = rows.value.indexOf(v)
  if (sheet.isEditing(r, ci) && sheet.editing.value?.error) return { level: 'error' as const, message: sheet.editing.value.error }
  return validateCell(v, columns.value[ci], dupes.value)
}
const changes = computed(() => diff(base.value, draft.value, allColumns.value))
const changedSet = computed(() => new Set(changes.value.map((c) => `${c.id}|${c.key}`)))
function cellClass(v: any, r: number, ci: number) {
  const issue = issueOf(v, ci)
  return {
    'is-num': columns.value[ci].kind !== 'text',
    'is-sel': sheet.isSelected(r, ci),
    'is-active': sheet.isActive(r, ci),
    'is-editing': sheet.isEditing(r, ci),
    'is-changed': changedSet.value.has(`${rowId(v)}|${columns.value[ci].key}`),
    'is-error': issue?.level === 'error',
    'is-warning': issue?.level === 'warning',
  }
}
const issueTotals = computed(() => {
  let errors = 0; let warnings = 0
  for (const v of draft.value) for (const c of allColumns.value) {
    const i = validateCell(v, c, dupes.value)
    if (i?.level === 'error') errors++
    else if (i?.level === 'warning' && changedSet.value.has(`${rowId(v)}|${c.key}`)) warnings++
  }
  return { errors, warnings }
})
const colByKey = computed(() => new Map(allColumns.value.map((c) => [c.key, c])))
const columnSummary = computed(() => {
  const m = new Map<string, { key: string; label: string; count: number; channel?: string; channelName?: string }>()
  for (const ch of changes.value) {
    const c = colByKey.value.get(ch.key)!
    const s = m.get(ch.key) || { key: ch.key, label: c.label, count: 0, channel: c.channel, channelName: c.channelName }
    s.count++
    m.set(ch.key, s)
  }
  return [...m.values()]
})
const draftById = computed(() => new Map(draft.value.map((d) => [rowId(d), d])))
const previewRows = computed(() => changes.value.slice(0, PREVIEW_LIMIT).map((ch) => {
  const c = colByKey.value.get(ch.key)
  const d = draftById.value.get(ch.id)
  return { ...ch, label: c?.label || ch.key, channel: c?.channel, channelName: c?.channelName, variantTitle: rowTitle(d), stockcode: d?.stockcode || '',
    before: fmt(c, ch.before), after: fmt(c, ch.after) }
}))
const changedVariantCount = computed(() => new Set(changes.value.map((c) => c.id)).size)
const channelChangedIds = computed(() => new Set(changes.value.filter((c) => c.key.startsWith('ch:')).map((c) => c.id)))
const channelChangedVariants = computed(() => [...channelChangedIds.value].filter((id) => !sources.get(id)?.prices?.isPlatformBasedPrice).length)
const markChannelBased = ref(true)
const step = ref<'edit' | 'preview'>('edit')
const confirmDiscard = ref(false)
/** Uygulanmamış değişiklik varsa kapatmadan önce satır içi onay (kazara kayıp olmasın). */
function requestClose() {
  if (step.value === 'edit' && changes.value.length && !confirmDiscard.value) { confirmDiscard.value = true; return }
  if (step.value === 'preview') { step.value = 'edit'; confirmDiscard.value = true; return }
  emit('close')
}

function apply() {
  if (issueTotals.value.errors) return
  for (const ch of changes.value) {
    const src = sources.get(ch.id)
    if (src) setCell(src, ch.key, ch.after)
  }
  if (markChannelBased.value) {
    for (const id of channelChangedIds.value) {
      const src = sources.get(id)
      if (src) { src.prices = src.prices || {}; src.prices.isPlatformBasedPrice = true }
    }
  }
  emit('applied', changes.value.length)
}

// ── sanal kaydırma + odak ──
const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const HEAD_H = 72
const viewport = ref(480)
const win = computed(() => visibleWindow(Math.max(0, scrollTop.value - HEAD_H), viewport.value, ROW_H, rows.value.length, 10))
const windowRows = computed(() => rows.value.slice(win.value.start, win.value.end))
const padTop = computed(() => `${win.value.start * ROW_H}px`)
const padBottom = computed(() => `${Math.max(0, rows.value.length - win.value.end) * ROW_H}px`)
const onScroll = () => { scrollTop.value = scrollRef.value?.scrollTop || 0; viewport.value = scrollRef.value?.clientHeight || 480 }
onMounted(() => { onScroll(); nextTick(() => sheet.activate(0, view.value === 'channels' ? 2 : 0)) })

function focusActive() {
  nextTick(() => {
    const { row, col } = sheet.active.value
    const el = scrollRef.value?.querySelector<HTMLElement>(`td[data-r="${row}"][data-c="${col}"]`)
    if (!el) return
    const input = el.querySelector<HTMLInputElement>('input.vbe-input')
    ;(input || el).focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}
function ensureVisible(row: number) {
  const s = scrollRef.value
  if (s) {
    const top = row * ROW_H
    const visible = s.clientHeight - HEAD_H
    if (top < s.scrollTop) s.scrollTop = top
    else if (top + ROW_H > s.scrollTop + visible) s.scrollTop = top + ROW_H - visible
    scrollTop.value = s.scrollTop
  }
  focusActive()
}
watch(() => sheet.editing.value && `${sheet.editing.value.row}:${sheet.editing.value.col}`, (on) => { if (on) focusActive() })

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
function onEditBlur(r: number, c: number) { if (sheet.isEditing(r, c) && !sheet.commitEdit()) sheet.cancelEdit() }

const isCellTarget = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.matches?.('td[data-r]') || el.matches?.('input.vbe-input')) }
function onKeydown(e: KeyboardEvent) {
  if (!isCellTarget(e.target)) return
  if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'C', 'V', 'X'].includes(e.key)) return
  if (e.key === 'Escape' && !sheet.editing.value && sheet.selectedCount.value <= 1) return // diyalog kapanışına bırak
  const wasEditing = !!sheet.editing.value
  if (sheet.onKeydown(e)) {
    e.preventDefault()
    e.stopPropagation()
    if (!sheet.editing.value || !wasEditing) focusActive()
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
  const r = sheet.pasteText(text)
  live.value = `${r.changed} hücre yapıştırıldı${r.invalid ? `, ${r.invalid} geçersiz hücre atlandı` : ''}`
}

defineExpose({ sheet, changes, apply, requestClose })
</script>

<style scoped>
.vbe-root { width: min(1280px, calc(100vw - 32px)); max-width: 100%; }
.vbe-root :deep(.ek-dialog__body) { display: flex; flex-direction: column; gap: var(--ek-space-3); padding-bottom: 0; }

.vbe-ops {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}
.vbe-ops__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-2) var(--ek-space-3); }
.vbe-spacer { flex: 1 1 auto; }
.vbe-selinfo { flex: 1 1 100%; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.vbe-value { flex: 0 1 200px; min-width: 150px; }
.vbe-hint { flex: 1 1 240px; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }

.vbe-seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}
.vbe-seg__btn {
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border-radius: calc(var(--ek-radius-control) - 2px);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  white-space: nowrap;
  transition: var(--ek-transition-colors);
}
.vbe-seg__btn:hover:not(:disabled) { background: var(--ek-color-surface-muted); }
.vbe-seg__btn.is-on { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); box-shadow: inset 0 0 0 1px var(--ek-color-action-border); }
.vbe-seg__btn:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.vbe-seg__btn:disabled { color: var(--ek-color-content-subtle); cursor: not-allowed; }

.vbe-note {
  display: flex;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.vbe-note .v-icon { font-size: var(--ek-icon-sm); color: var(--ek-color-info); }

.vbe-scroll {
  overflow: auto;
  max-height: max(280px, calc(100dvh - 460px));
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  overscroll-behavior: contain;
}
.vbe-table {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  color: var(--ek-color-content-default);
}
.vbe-table th, .vbe-table td { white-space: nowrap; }

/* başlıklar */
.vbe-band th {
  position: sticky;
  top: 0;
  z-index: 3;
  height: 28px;
  padding: 0 var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: 600;
  text-align: left;
}
.vbe-band__th.is-channel { box-shadow: inset 0 3px 0 var(--vbe-ch, var(--ek-color-border-strong)); border-left: 1px solid var(--ek-color-border-default); }
.vbe-corner-band { left: 0; z-index: 5 !important; }
.vbe-band + tr th { top: 28px; }
.vbe-colhead, .vbe-corner {
  position: sticky;
  top: 0;
  z-index: 3;
  height: 44px;
  padding: 0;
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  text-align: left;
}
.vbe-colhead.is-channel { background: var(--ek-color-surface-sunken); }
.vbe-colhead.is-channel:first-of-type, .vbe-colhead.is-channel { border-left: 1px solid var(--ek-color-border-subtle); }
.vbe-colhead.is-num .vbe-head-btn { justify-content: flex-end; }
.vbe-colhead.is-sel, .vbe-rowhead.is-sel { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }
.vbe-corner { left: 0; z-index: 5; min-width: 200px; border-right: 1px solid var(--ek-color-border-default); }
.vbe-head-btn {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 0 var(--ek-space-3);
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
  text-align: inherit;
  cursor: pointer;
}
.vbe-head-btn:hover { color: var(--ek-color-content-strong); background: var(--ek-color-surface-sunken); }
.vbe-head-btn:focus-visible { outline: none; box-shadow: inset var(--ek-focus-ring); }

.vbe-rowhead {
  position: sticky;
  left: 0;
  z-index: 2;
  height: 44px;
  padding: 0;
  min-width: 200px;
  max-width: 240px;
  background: var(--ek-color-surface);
  border-right: 1px solid var(--ek-color-border-default);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  box-shadow: var(--ek-shadow-scroll-start);
  text-align: left;
  font-weight: 400;
}
.vbe-rowbtn { flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; text-transform: none; letter-spacing: 0; }
.vbe-rowbtn__title { color: var(--ek-color-content-strong); font-weight: 600; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.vbe-rowbtn__sub { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
tr.is-group-start > th, tr.is-group-start > td { border-top: 1px solid var(--ek-color-border-strong); }

/* hücre */
.vbe-cell {
  position: relative;
  min-width: 124px;
  height: 44px;
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  border-left: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  cursor: cell;
  outline: none;
}
.vbe-cell.is-num { text-align: right; }
.vbe-cell:hover { background: var(--ek-color-surface-muted); }
.vbe-cell.is-changed { background: var(--ek-color-highlight); }
.vbe-cell.is-changed::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  border-style: solid;
  border-width: 0 8px 8px 0;
  border-color: transparent var(--ek-color-warning) transparent transparent;
}
.vbe-cell.is-sel { background: var(--ek-color-selection); }
.vbe-cell.is-active { box-shadow: inset 0 0 0 2px var(--ek-color-border-focus); z-index: 1; }
.vbe-cell.is-error { box-shadow: inset 3px 0 0 var(--ek-color-error); }
.vbe-cell.is-error.is-active { box-shadow: inset 0 0 0 2px var(--ek-color-error); }
.vbe-cell.is-editing { padding: 0 var(--ek-space-1); }
.vbe-val { display: inline-flex; align-items: center; gap: var(--ek-space-1); }
.vbe-val.is-empty { color: var(--ek-color-content-subtle); }
.vbe-issue { display: inline-flex; }
.vbe-issue .v-icon { font-size: var(--ek-icon-sm); }
.vbe-issue--error { color: var(--ek-color-error); }
.vbe-issue--warning { color: var(--ek-color-warning); }
.vbe-input {
  width: 100%;
  height: 34px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-focus);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
.vbe-input.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.vbe-input[aria-invalid='true'] { border-color: var(--ek-color-error); }
.vbe-pad--top td { height: v-bind(padTop); padding: 0; border: 0; }
.vbe-pad--bottom td { height: v-bind(padBottom); padding: 0; border: 0; }

/* alt çubuk */
.vbe-foot {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
  margin: 0 calc(-1 * var(--ek-space-6));
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}
.vbe-foot__summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-3); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); color: var(--ek-color-content-muted); }
.vbe-foot__actions { display: flex; flex-wrap: wrap; gap: var(--ek-space-2); margin-left: auto; }
.vbe-foot__keys { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-1); }
.vbe-sum { display: inline-flex; align-items: center; gap: var(--ek-space-1); }
.vbe-sum.is-on { color: var(--ek-color-warning-emphasis); font-weight: 600; }
.vbe-sum .v-icon { font-size: var(--ek-icon-sm); }
.vbe-sum--error { color: var(--ek-color-error-emphasis); font-weight: 600; }
.vbe-sum--error .v-icon { color: var(--ek-color-error); }
.vbe-sum--warning { color: var(--ek-color-warning-emphasis); font-weight: 600; }
.vbe-sum--warning .v-icon { color: var(--ek-color-warning); }

.vbe-discard {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  margin-left: auto;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.vbe-discard .v-icon { color: var(--ek-color-warning); font-size: var(--ek-icon-sm); }

/* önizleme */
.vbe-preview { display: flex; flex-direction: column; gap: var(--ek-space-3); }
.vbe-preview__head { display: flex; gap: var(--ek-space-3); align-items: flex-start; }
.vbe-preview__title { margin: 0; color: var(--ek-color-content-strong); font-size: var(--ek-type-subheading-size); line-height: var(--ek-type-subheading-line); font-weight: 600; }
.vbe-preview__desc { margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.vbe-alert {
  display: flex;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}
.vbe-alert .v-icon { color: var(--ek-color-error); }
.vbe-colsum { display: flex; flex-wrap: wrap; gap: var(--ek-space-2); margin: 0; padding: 0; list-style: none; }
.vbe-colsum li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.vbe-diffwrap { max-height: max(240px, calc(100dvh - 520px)); overflow: auto; border: 1px solid var(--ek-color-border-default); border-radius: var(--ek-radius-card); }
.vbe-diff { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--ek-type-table-size); line-height: var(--ek-type-table-line); }
.vbe-diff th, .vbe-diff td { padding: var(--ek-space-2) var(--ek-space-3); border-bottom: 1px solid var(--ek-color-border-subtle); text-align: left; }
.vbe-diff thead th {
  position: sticky; top: 0; z-index: 1;
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.vbe-diff tbody th { font-weight: 600; color: var(--ek-color-content-strong); }
.vbe-diff__sub { display: block; font-weight: 400; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }
.vbe-diff .is-num { text-align: right; font-variant-numeric: tabular-nums; }
.vbe-diff__before { color: var(--ek-color-content-muted); text-decoration: line-through; text-decoration-color: var(--ek-color-border-strong); }
.vbe-diff__after { color: var(--ek-color-content-strong); font-weight: 600; }
.vbe-more { margin: 0; padding: var(--ek-space-2) var(--ek-space-3); color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }

@media (max-width: 600px) {
  .vbe-root { width: 100%; }
  .vbe-corner, .vbe-rowhead { min-width: 140px; max-width: 160px; }
  .vbe-cell { min-width: 108px; }
  .vbe-hint, .vbe-foot__keys { display: none; }
  .vbe-foot__actions { width: 100%; }
  .vbe-foot__actions > * { flex: 1 1 auto; }
}
@media (prefers-reduced-motion: reduce) { .vbe-seg__btn { transition: none; } }
</style>
