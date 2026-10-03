<!--
  DS-v2 A6a — TOPLU VARYANT DÜZENLEYİCİ (tablo). Yalnız mevcut veri yolu: değişiklikler bir TASLAK üzerinde
  yapılır, "Uygula" ile formdaki `productInfoForm.variants`'a yazılır; kalıcı kayıt ürün kaydet/güncelle ile.
  Varyant ızgarasıyla (VariantGrid) aynı yapı: seçenek tanım sırası, ilk seçeneğe göre rowspan'lı grup hücresi
  (VariantGroupCell), kalan seçenekler çip olarak, arama.
  · Yatay kaydırma YOK: sabit tablo düzeni kabın genişliğine sığar; kanal fiyatları tek kanal seçilerek düzenlenir
    ("Tüm kanallara uygula" ile seçili alan tüm kanallara yazılır)
  · Sayfalama (EkPagerBar): seçim/klavye tüm satırlar üzerinde çalışır; aktif hücre başka sayfaya geçerse sayfa izler
  · Hücre / satır / kolon seçimi (tık, Shift+tık, sürükle, başlıklar, "Varyant" başlığı = tümü; Shift+oklar)
  · Seçime toplu uygula: değer ata · ± yüzde · ± tutar (stokta ± adet) · temizle; aşağı doldur, Excel'den yapıştır,
    geri al / yinele — klavye kısayolları başlıktaki klavye ikonundan açılır (kayıt: navigation/shortcuts.ts)
  · Değişiklik özeti + uygulamadan önce sayfalı önizleme (önce → sonra); hata varken uygulanmaz
-->
<template>
  <EkDialogCard class="vbe-root" title="Toplu düzenle" icon="mdi-table-edit" width="custom" hide-actions
    :description="`${variants.length === allCount ? 'Tüm' : 'Seçili'} ${variants.length} varyant · değişiklikler önce önizlenir, sonra forma yazılır`"
    @close="requestClose">
    <template #header-actions>
      <KeyboardHelpMenu :keys="shortcuts" :mouse="mouseTips" />
    </template>

    <template v-if="step === 'edit'">
      <!-- araç çubuğu: arama · görünüm · kanal · geri al/yinele -->
      <div class="vbe-tools">
        <v-text-field v-model="filterText" class="vbe-search" density="compact" variant="outlined" hide-details clearable
          prepend-inner-icon="mdi-magnify" placeholder="Stok kodu, barkod, seçenek" aria-label="Varyantlarda ara" />
        <div v-if="channels.length" class="vbe-seg" role="radiogroup" aria-label="Görünen kolonlar">
          <button v-for="p in presets" :key="p.key" type="button" role="radio" class="vbe-seg__btn"
            :aria-checked="view === p.key" :class="{ 'is-on': view === p.key }" @click="setView(p.key)">
            {{ p.label }}<span v-if="viewChangeCount(p.key)" class="vbe-dot ek-num" :aria-label="`${viewChangeCount(p.key)} değişiklik`">{{ viewChangeCount(p.key) }}</span>
          </button>
        </div>
        <span class="vbe-spacer"></span>
        <EkTooltip text="Geri al" :shortcut="['Ctrl', 'Z']">
          <EkButton size="sm" tone="ghost" icon="mdi-undo" icon-only aria-label="Geri al" :disabled="!sheet.canUndo.value" @click="sheet.undo()" />
        </EkTooltip>
        <EkTooltip text="Yinele" :shortcut="['Ctrl', 'Y']">
          <EkButton size="sm" tone="ghost" icon="mdi-redo" icon-only aria-label="Yinele" :disabled="!sheet.canRedo.value" @click="sheet.redo()" />
        </EkTooltip>
      </div>

      <!-- kanal görünümü: hangi kanal tabloda + toplu işlem hangi kanallara yazılır (kanal bağlamında, tek yerde) -->
      <div v-if="view === 'channels'" class="vbe-chanbar">
        <div class="vbe-chans" role="radiogroup" aria-label="Tabloda gösterilen kanal">
          <span class="vbe-label">Kanal</span>
          <button v-for="ch in channels" :key="ch.code" type="button" role="radio" class="vbe-chan" :class="[channelClass(ch.code), { 'is-on': ch.code === activeChannel }]"
            :aria-checked="ch.code === activeChannel" @click="setChannel(ch.code)">
            <EkPlatformMark :code="ch.code" :name="ch.title" />
            <span v-if="channelChangeCount(ch.code)" class="vbe-dot ek-num" :aria-label="`${channelChangeCount(ch.code)} değişiklik`">{{ channelChangeCount(ch.code) }}</span>
          </button>
        </div>
        <div v-if="channels.length > 1" class="vbe-scope">
          <span class="vbe-label" id="vbe-scope-label">Toplu işlem</span>
          <div class="vbe-seg" role="radiogroup" aria-labelledby="vbe-scope-label">
            <button type="button" role="radio" class="vbe-seg__btn" :aria-checked="channelScope === 'one'" :class="{ 'is-on': channelScope === 'one' }"
              @click="channelScope = 'one'">Yalnız {{ activeChannelTitle }}</button>
            <button type="button" role="radio" class="vbe-seg__btn" :aria-checked="channelScope === 'all'" :class="{ 'is-on': channelScope === 'all' }"
              @click="channelScope = 'all'"><v-icon icon="mdi-layers-outline" aria-hidden="true" />Tüm kanallar ({{ channels.length }})</button>
          </div>
        </div>
        <p class="vbe-caption vbe-chanbar__note">Kanal fiyatları yalnız “kanal bazında fiyat” işaretli varyantlarda kullanılır; değişen varyantları önizlemede işaretleyebilirsiniz.</p>
      </div>

      <!-- toplu işlem çubuğu -->
      <div class="vbe-apply" role="toolbar" aria-label="Seçime toplu işlem" data-bulk-op>
        <div class="vbe-apply__row">
        <div class="vbe-seg" role="radiogroup" aria-label="İşlem">
          <button v-for="m in modes" :key="m.key" type="button" role="radio" class="vbe-seg__btn" :disabled="m.numeric && !selectionNumeric"
            :aria-checked="mode === m.key" :class="{ 'is-on': mode === m.key }" @click="mode = m.key">{{ m.label }}</button>
        </div>
        <v-text-field v-if="mode !== 'clear'" v-model="opValue" class="vbe-value" density="compact" variant="outlined" hide-details
          :prefix="mode === 'percent' ? '%' : undefined" :placeholder="valuePlaceholder" aria-label="Değer"
          aria-describedby="vbe-op-hint" @keydown.enter.prevent="applyOp" />
        <EkButton size="sm" tone="primary" :icon="spreading ? 'mdi-layers-outline' : 'mdi-check'" :disabled="!canApplyOp" @click="applyOp">
          {{ spreading ? 'Tüm kanallara uygula' : 'Seçime uygula' }}
        </EkButton>
        <EkTooltip text="Seçimin ilk satırını alttakilere kopyalar" :shortcut="['Ctrl', 'D']">
          <EkButton size="sm" tone="ghost" icon="mdi-arrow-collapse-down" :disabled="sheet.range.value.r2 === sheet.range.value.r1" @click="sheet.fillDown()">Aşağı doldur</EkButton>
        </EkTooltip>
        </div>
        <div class="vbe-apply__meta">
          <span class="vbe-selinfo" :title="selectionText"><v-icon icon="mdi-selection" aria-hidden="true" /><span>{{ selectionText }}</span></span>
          <span id="vbe-op-hint" class="vbe-caption">{{ opHint }}</span>
        </div>
      </div>

      <!-- tablo -->
      <div class="vbe-frame" ref="frameRef">
        <div class="vbe-scroll" ref="scrollRef">
          <table v-if="rows.length" class="vbe-table" role="grid" aria-label="Toplu düzenleme tablosu" :aria-rowcount="rows.length + 1"
            :aria-colcount="columns.length + 1" aria-multiselectable="true" @keydown="onKeydown" @copy="onCopy" @paste="onPaste">
            <colgroup>
              <col v-if="showGroup" class="vbe-c-group" />
              <col class="vbe-c-row" />
              <col v-for="c in columns" :key="c.key" :class="c.kind === 'text' ? 'vbe-c-text' : 'vbe-c-num'" />
            </colgroup>
            <thead>
              <tr v-if="hasChannelCols" class="vbe-band" aria-hidden="true">
                <th :colspan="showGroup ? 2 : 1"></th>
                <th v-for="b in bands" :key="b.key" :colspan="b.span" class="vbe-band__th" :class="b.channel ? ['is-channel', channelClass(b.channel)] : undefined">
                  <EkPlatformMark v-if="b.channel" :code="b.channel" :name="b.label" />
                  <span v-else>{{ b.label }}</span>
                </th>
              </tr>
              <tr role="row" aria-rowindex="1">
                <th v-if="showGroup" class="vbe-colhead vbe-colhead--group" scope="col">{{ groupTitle }}</th>
                <th class="vbe-colhead vbe-corner" scope="col" aria-colindex="1">
                  <EkTooltip text="Tüm hücreleri seç" :shortcut="['Ctrl', 'A']">
                    <button type="button" class="vbe-head-btn" aria-label="Tüm hücreleri seç" @click="sheet.selectAll()">
                      <v-icon icon="mdi-select-all" aria-hidden="true" /><span>Varyant</span>
                    </button>
                  </EkTooltip>
                </th>
                <th v-for="(c, ci) in columns" :key="c.key" role="columnheader" scope="col" :aria-colindex="ci + 2"
                  class="vbe-colhead" :class="{ 'is-num': c.kind !== 'text', 'is-sel': colSelected(ci), 'is-channel': !!c.channel }">
                  <button type="button" class="vbe-head-btn" :title="`${c.channelName ? c.channelName + ' ' : ''}${c.label} — kolonu seç`"
                    :aria-label="`${c.channelName ? c.channelName + ' ' : ''}${c.label} kolonunu seç`"
                    @click="(e: MouseEvent) => sheet.selectCol(ci, e.shiftKey)"><span class="vbe-ellipsis">{{ c.label }}</span></button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pageRows" :key="rowId(r.variant)" role="row" :aria-rowindex="r.index + 2"
                :class="{ 'is-group-start': r.groupStart && r.index !== pageStart, 'is-group-odd': r.groupIndex % 2 === 1 }">
                <VariantGroupCell v-if="showGroup && spans.has(r.index)" :rowspan="spans.get(r.index)" class="vbe-group"
                  :title="grouping.groupLabel(r.variant)" :count="r.groupSize" :alt="r.groupIndex % 2 === 1" />
                <th scope="row" class="vbe-rowhead" :class="{ 'is-sel': rowSelected(r.index) }" aria-colindex="1">
                  <button type="button" class="vbe-head-btn vbe-rowbtn" :title="rowTitle(r.variant)" :aria-label="`${rowTitle(r.variant)} satırını seç`"
                    @click="(e: MouseEvent) => sheet.selectRow(r.index, e.shiftKey)">
                    <span class="vbe-rowbtn__title">{{ rowLine(r.variant) }}</span>
                    <span class="vbe-rowbtn__sub">{{ r.variant.stockcode || '—' }}</span>
                  </button>
                </th>
                <td v-for="(c, ci) in columns" :key="c.key" role="gridcell" :aria-colindex="ci + 2"
                  :aria-selected="sheet.isSelected(r.index, ci)" :tabindex="sheet.isActive(r.index, ci) ? 0 : -1"
                  :aria-invalid="issueOf(r.variant, r.index, ci)?.level === 'error' ? 'true' : undefined"
                  :data-r="r.index" :data-c="ci" class="vbe-cell" :class="cellClass(r.variant, r.index, ci)"
                  :title="cellTitle(r.variant, r.index, ci)"
                  @mousedown="(e: MouseEvent) => onCellDown(e, r.index, ci)" @mouseenter="onCellEnter(r.index, ci)"
                  @dblclick="sheet.activate(r.index, ci); sheet.startEdit()">
                  <input v-if="sheet.isEditing(r.index, ci) && sheet.editing.value" class="vbe-input" :class="{ 'is-num': c.kind !== 'text' }"
                    :value="sheet.editing.value.draft" :aria-label="`${c.channelName ? c.channelName + ' ' : ''}${c.label}, ${rowTitle(r.variant)}`"
                    :aria-invalid="sheet.editing.value.error ? 'true' : undefined" :inputmode="c.kind === 'text' ? undefined : 'decimal'"
                    autocomplete="off" spellcheck="false"
                    @input="(e: Event) => { if (sheet.editing.value) sheet.editing.value.draft = (e.target as HTMLInputElement).value }"
                    @blur="onEditBlur(r.index, ci)" />
                  <span v-else class="vbe-val" :class="{ 'ek-num': c.kind !== 'text', 'is-empty': isEmpty(r.variant, c.key) }">
                    <span class="vbe-ellipsis">{{ display(r.variant, c) }}</span>
                    <span v-if="issueOf(r.variant, r.index, ci)" class="vbe-issue" :class="`vbe-issue--${issueOf(r.variant, r.index, ci)!.level}`">
                      <v-icon :icon="issueOf(r.variant, r.index, ci)!.level === 'error' ? 'mdi-alert-circle-outline' : 'mdi-alert-outline'" aria-hidden="true" />
                      <span class="ek-sr-only">{{ issueOf(r.variant, r.index, ci)!.message }}</span>
                    </span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <EkEmptyState v-else class="vbe-empty" variant="no-results" title="Aramaya uyan varyant yok"
            message="Stok kodu, barkod, raf veya seçenek adıyla aradınız. Aramayı temizleyip tekrar deneyin."
            show-action action-text="Aramayı temizle" action-icon="mdi-close" @action="filterText = ''" />
        </div>
        <EkPagerBar v-if="draft.length > PAGE_SIZES[0]" :page="page" :page-size="pageSize" :total="rows.length" :page-size-options="PAGE_SIZES"
          label="Varyant sayfaları" @update:page="goPage" @update:page-size="setPageSize" />
      </div>

      <div class="vbe-foot">
        <div class="vbe-foot__summary" role="status">
          <span class="vbe-sum" :class="{ 'is-on': changes.length > 0 }"><strong class="ek-num">{{ changes.length }}</strong> değişiklik</span>
          <span v-if="issueTotals.errors" class="vbe-sum vbe-sum--error"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ issueTotals.errors }} hata</span>
          <span v-if="issueTotals.warnings" class="vbe-sum vbe-sum--warning"><v-icon icon="mdi-alert-outline" aria-hidden="true" />{{ issueTotals.warnings }} uyarı</span>
          <button v-if="issueTotals.errors" type="button" class="vbe-link" @click="goToFirstError">İlk hataya git</button>
        </div>
        <div v-if="confirmDiscard" class="vbe-discard" role="alert">
          <v-icon icon="mdi-alert-outline" aria-hidden="true" />
          <span><strong>{{ changes.length }} değişiklik uygulanmadı.</strong> Çıkarsanız bu değişiklikler kaybolur.</span>
          <EkButton size="sm" @click="confirmDiscard = false">Düzenlemeye dön</EkButton>
          <EkButton size="sm" tone="danger" icon="mdi-trash-can-outline" @click="emit('close')">Değişiklikleri at</EkButton>
        </div>
        <div v-else class="vbe-foot__actions">
          <EkButton @click="requestClose">Vazgeç</EkButton>
          <EkButton tone="primary" icon="mdi-eye-outline" :disabled="!changes.length" @click="openPreview">
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
            <EkPlatformMark v-if="s.channel" :code="s.channel" :name="s.channelName ?? ''" />
            <span>{{ s.label }}</span><strong class="ek-num">{{ s.count }}</strong>
          </li>
        </ul>
        <div class="vbe-frame">
          <div class="vbe-diffwrap">
            <table class="vbe-diff">
              <caption class="ek-sr-only">Değişiklik önizlemesi</caption>
              <colgroup><col class="vbe-d-variant" /><col class="vbe-d-field" /><col /><col /></colgroup>
              <thead><tr><th scope="col">Varyant</th><th scope="col">Alan</th><th scope="col" class="is-num">Önce</th><th scope="col" class="is-num">Sonra</th></tr></thead>
              <tbody>
                <tr v-for="ch in previewRows" :key="ch.id + ch.key">
                  <th scope="row"><span class="vbe-ellipsis">{{ ch.variantTitle }}</span><span class="vbe-diff__sub">{{ ch.stockcode }}</span></th>
                  <td><span class="vbe-diff__field"><EkPlatformMark v-if="ch.channel" :code="ch.channel" :name="ch.channelName ?? ''" /><span class="vbe-ellipsis">{{ ch.label }}</span></span></td>
                  <td class="is-num vbe-diff__before">{{ ch.before }}</td>
                  <td class="is-num vbe-diff__after">{{ ch.after }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <EkPagerBar v-if="changes.length > PAGE_SIZES[0]" :page="previewPage" :page-size="previewSize" :total="changes.length" :page-size-options="PAGE_SIZES"
            label="Önizleme sayfaları" @update:page="(p: number) => previewPage = p" @update:page-size="(n: number) => { previewSize = n; previewPage = 1 }" />
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EkDialogCard, EkButton, EkIconTile, EkTooltip, EkPlatformMark, EkPagerBar, EkEmptyState } from '@entegrasyonik/ui/components'
import KeyboardHelpMenu, { type KeyHelp, type MouseHelp } from '../../KeyboardHelpMenu.vue'
import { channelClass } from '@entegrasyonik/ui/tokens'
import { formatMoney } from '@entegrasyonik/ui/format'
import { useChoicesStore } from '@/stores/choicesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import VariantGroupCell from '../VariantGroupCell.vue'
import { useVariantGrouping } from '../useVariantGrouping'
import {
  BASE_COLUMNS, channelColumns, diff, duplicateIndex, getCell, rowId, setCell, snapshot, validateCell, windowRowspans,
  type BulkMode, type CellValue, type ColumnKey, type SheetColumn,
} from './variantSheet'
import { useVariantSheet } from './useVariantSheet'

const PAGE_SIZES = [10, 25, 50, 100]

const props = defineProps<{
  variants: any[]
  allCount: number
  productInfoForm: any
  preset?: 'all' | 'prices' | 'channelPrices'
}>()
const emit = defineEmits<{ close: []; applied: [count: number] }>()

const choicesStore = useChoicesStore()
const integrationStore = useIntegrationStore()
const grouping = useVariantGrouping()

// ── taslak: yalnız düzenlenen alanların kopyası; kaynak nesneye Uygula'da yazılır ──
const channels = computed(() => [...(integrationStore.getClientMarketplaces() || []), ...(integrationStore.getClientECommerces() || [])]
  .map((p: any) => ({ code: p.code, title: integrationStore.getIntegrationTitle(p.code) || p.title || p.code })))
const allColumns = computed<SheetColumn[]>(() => [...BASE_COLUMNS, ...channelColumns(channels.value)])

function cloneDraft(v: any) {
  const d: any = { tempId: rowId(v), choices: v.choices, stockcode: v.stockcode, barcode: v.barcode, stock: v.stock, shelf: v.shelf, costPrice: v.costPrice,
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

// ── satırlar: varyant ızgarasıyla aynı sıra (grup tanım sırası → seçenek tanım sırası) + arama ──
const { valueTitle } = grouping
const filterText = ref<string | null>('')
const matches = (v: any, q: string) => {
  if (!q) return true
  const hay = [v.stockcode, v.barcode, v.shelf, ...(v.choices || []).map((c: any) => valueTitle(c.choiceValueId))]
    .filter(Boolean).join(' ').toLocaleLowerCase('tr')
  return q.split(/\s+/).every((t) => hay.includes(t))
}
const ordered = computed(() => grouping.order(draft.value))
const rows = computed(() => {
  const q = (filterText.value || '').trim().toLocaleLowerCase('tr')
  return q ? ordered.value.filter((v) => matches(v, q)) : ordered.value
})
const grouped = computed(() => grouping.group(rows.value))
const groupTitle = computed(() => grouping.groupTitle(draft.value))

// ── görünüm: genel kolonlar ya da TEK kanal (yatay kaydırma olmasın) ──
type View = 'general' | 'channels'
const presets: Array<{ key: View; label: string }> = [{ key: 'general', label: 'Genel' }, { key: 'channels', label: 'Kanal fiyatları' }]
const view = ref<View>(props.preset === 'channelPrices' && channels.value.length ? 'channels' : 'general')
const activeChannel = ref<string>(channels.value[0]?.code || '')
watch(channels, (list) => { if (!list.some((c) => c.code === activeChannel.value)) activeChannel.value = list[0]?.code || '' })
const columns = computed<SheetColumn[]>(() => {
  if (view.value === 'general') return BASE_COLUMNS
  const ch = channels.value.find((c) => c.code === activeChannel.value)
  return [...BASE_COLUMNS.filter((c) => c.key === 'salePrice' || c.key === 'marketPrice'), ...(ch ? channelColumns([ch]) : [])]
})
function setView(v: View) { if (view.value === v) return; view.value = v; sheet.activate(pageStart.value, view.value === 'channels' ? 2 : 0) }
function setChannel(code: string) { activeChannel.value = code; const { row, col } = sheet.active.value; sheet.activate(row, col) }
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

// ── sayfalama: seçim/klavye tüm satırlarda; aktif hücre başka sayfadaysa sayfa izler ──
const page = ref(1)
const pageSize = ref(25)
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
const pageStart = computed(() => (page.value - 1) * pageSize.value)
const pageEnd = computed(() => Math.min(rows.value.length, pageStart.value + pageSize.value))
const pageRows = computed(() => grouped.value.slice(pageStart.value, pageEnd.value))
const spans = computed(() => windowRowspans(grouped.value, pageStart.value, pageEnd.value))
const pageOf = (row: number) => Math.floor(row / pageSize.value) + 1
watch(pageCount, (n) => { if (page.value > n) page.value = n })
watch(filterText, () => {
  page.value = 1
  sheet.cancelEdit()
  const cell = { row: 0, col: sheet.active.value.col }
  sheet.active.value = cell
  sheet.anchor.value = { ...cell }
  sheet.selectionMode.value = 'cells'
})
/** Pager ile sayfa değişince tek hücre seçiliyse aktif hücre yeni sayfanın başına taşınır (çok hücreli seçim korunur). */
function goPage(p: number) {
  page.value = p
  if (sheet.selectedCount.value <= 1) {
    const cell = { row: pageStart.value, col: sheet.active.value.col }
    sheet.active.value = cell
    sheet.anchor.value = { ...cell }
  }
}
function setPageSize(n: number) { pageSize.value = n; page.value = pageOf(sheet.active.value.row) }

// ── grup kolonu: dar kapta ve tek seçenekli üründe gizli (çipler satır başında) ──
const frameRef = ref<HTMLElement | null>(null)
const narrow = ref(false)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !frameRef.value) return
  let frame = 0
  ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { narrow.value = (frameRef.value?.clientWidth || 1000) < 720 })
  })
  ro.observe(frameRef.value)
})
onBeforeUnmount(() => ro?.disconnect())
const showGroup = computed(() => !narrow.value && draft.value.some((v) => (v.choices?.length || 0) > 1))
/** Grup etiketi yapışık başlığın altında dursun (bant 28px + başlık 40px). */
const groupTop = computed(() => (hasChannelCols.value ? '68px' : '40px'))

// ── seçim + etkileşim ──
const live = ref('')
const sheet = useVariantSheet({
  rows, columns,
  onActivate: (c) => { const p = pageOf(c.row); if (p !== page.value) page.value = p; focusActive() },
  announce: (m) => { live.value = m },
})
const colSelected = (ci: number) => sheet.range.value.c1 <= ci && ci <= sheet.range.value.c2 && sheet.selectionMode.value !== 'cells' && sheet.selectionMode.value !== 'rows'
const rowSelected = (ri: number) => sheet.range.value.r1 <= ri && ri <= sheet.range.value.r2 && sheet.selectionMode.value !== 'cells' && sheet.selectionMode.value !== 'cols'
const selectedColumns = computed(() => columns.value.slice(sheet.range.value.c1, sheet.range.value.c2 + 1))
const selectionNumeric = computed(() => selectedColumns.value.some((c) => c.kind !== 'text'))
const selectionText = computed(() => {
  const g = sheet.range.value
  const cols = selectedColumns.value.map((c) => (c.channelName ? `${c.channelName} ${c.label.toLocaleLowerCase('tr')}` : c.label))
  const colText = cols.length <= 2 ? cols.join(', ') : `${cols.length} kolon`
  const pages = pageOf(g.r2) - pageOf(g.r1) + 1
  return `${sheet.selectedCount.value} hücre · ${g.r2 - g.r1 + 1} satır${pages > 1 ? ` (${pages} sayfa)` : ''} · ${colText}`
})

const modes: Array<{ key: BulkMode; label: string; numeric: boolean }> = [
  { key: 'set', label: 'Değer ata', numeric: false },
  { key: 'percent', label: '± Yüzde', numeric: true },
  { key: 'amount', label: '± Tutar / adet', numeric: true },
  { key: 'clear', label: 'Temizle', numeric: false },
]
const mode = ref<BulkMode>('set')
const opValue = ref<string>('')
watch(selectionNumeric, (n) => { if (!n && (mode.value === 'percent' || mode.value === 'amount')) mode.value = 'set' })
const valuePlaceholder = computed(() => ({ set: 'Değer, ör. 249,90', percent: 'ör. 10 veya -15', amount: 'ör. 20 veya -5', clear: '' })[mode.value])
const opHint = computed(() => {
  if (mode.value === 'percent') return 'Pozitif artırır, negatif indirir. Sonuç 0’ın altına düşmez; fiyat 2 haneye yuvarlanır.'
  if (mode.value === 'amount') return 'Fiyatta tutar, stokta adet eklenir/çıkarılır (negatif = çıkar).'
  if (mode.value === 'clear') return 'Seçili hücreler boşaltılır (sayılar 0 olur).'
  if (spreading.value) return `Seçili kanal fiyatları ${channels.value.length} kanalın hepsine aynı değerle yazılır.`
  return 'Seçili tüm hücrelere aynı değer yazılır. Metin ve sayı kolonları birlikte seçilebilir.'
})
const canApplyOp = computed(() => mode.value === 'clear' || String(opValue.value ?? '').trim() !== '')
/** Kanal görünümünde seçili kanal fiyat alanını diğer kanallara da yay. */
const channelScope = ref<'one' | 'all'>('one')
const activeChannelTitle = computed(() => channels.value.find((c) => c.code === activeChannel.value)?.title || 'bu kanal')
/** Toplu işlem görünmeyen kanallara da yazılacak mı (kanal görünümü + kapsam "Tüm kanallar" + seçimde kanal kolonu). */
const spreading = computed(() => view.value === 'channels' && channelScope.value === 'all' && channels.value.length > 1 && selectedColumns.value.some((c) => c.channel))
const spread = (col: SheetColumn) => (col.channel
  ? allColumns.value.filter((c) => c.channel && c.key.endsWith(col.key.slice(col.key.lastIndexOf(':'))))
  : [col])
function applyOp() {
  if (!canApplyOp.value) return
  const onlyNumeric = mode.value === 'percent' || mode.value === 'amount'
  const r = sheet.applyToSelection({ mode: mode.value, value: opValue.value }, onlyNumeric ? ['money', 'moneyOpt', 'int'] : undefined,
    spreading.value ? spread : undefined)
  live.value = `${r.changed} hücre değişti${r.skipped ? `, ${r.skipped} hücre atlandı` : ''}`
}

// ── kısayollar (varyant tablosundaki kartla aynı satırlar + toplu düzenleyiciye özgü olanlar) ──
const shortcuts: KeyHelp[] = [
  { keys: ['↑', '↓', '←', '→'], text: 'hücreler arasında gezin' },
  { keys: ['Shift', '↓'], text: 'seçimi genişlet' },
  { keys: 'Enter', text: 'düzenle / kaydet ve aşağı in' },
  { keys: 'Esc', text: 'düzenlemeden vazgeç' },
  { keys: ['Ctrl', 'A'], text: 'tüm hücreleri seç' },
  { keys: ['Ctrl', 'D'], text: 'aşağı doldur' },
  { keys: 'Delete', text: 'seçili hücreleri temizle' },
  { keys: ['Ctrl', 'C'], text: 'kopyala' },
  { keys: ['Ctrl', 'V'], text: 'tablodan yapıştır (Excel)' },
  { keys: ['Ctrl', 'Z'], text: 'geri al' },
  { keys: ['Ctrl', 'Y'], text: 'yinele' },
]
const mouseTips: MouseHelp[] = [
  { how: 'Sürükle / Shift+tık', text: 'aralık seç' },
  { how: 'Başlığa tık', text: 'satır ya da kolon seç' },
  { how: '“Varyant” başlığı', text: 'tümünü seç' },
  { how: 'Çift tık', text: 'hücreyi düzenle' },
]

// ── görüntü / doğrulama / özet ──
const rowTitle = (v: any) => (v.choices || []).map((c: any) => valueTitle(c.choiceValueId)).filter(Boolean).join(' / ') || v.stockcode || 'Varyant'
/** Satır başı: grup kolonu görünüyorsa kalan seçenekler, değilse tümü — "Beden: 42 · Kumaş: Pamuk" (varyant tablosuyla aynı). */
function rowLine(v: any) {
  const parts = (v.choices || []).slice(showGroup.value ? 1 : 0)
    .map((c: any) => `${choicesStore.getChoiceTitle(c.choiceId) || ''}: ${choicesStore.getChoiceValueName(c.choiceId, c.choiceValueId) || '—'}`)
  return parts.length ? parts.join(' · ') : 'Tek seçenek'
}
const isEmpty = (v: any, key: ColumnKey) => { const x = getCell(v, key); return x === undefined || x === null || x === '' }
const fmt = (c: SheetColumn | undefined, x: CellValue) => (x === undefined || x === null || x === '' ? '—' : c?.kind === 'money' || c?.kind === 'moneyOpt' ? formatMoney(Number(x)) : String(x))
const display = (v: any, c: SheetColumn) => fmt(c, getCell(v, c.key))
const dupes = computed(() => {
  // Taslakta olmayan (kapsam dışı) varyantların kodları da tekrarlama denetimine girer.
  const inScope = new Set(draft.value.map(rowId))
  const merged = [...draft.value, ...(props.productInfoForm.variants || []).filter((v: any) => !inScope.has(rowId(v)))]
  return { barcode: duplicateIndex(merged, 'barcode'), stockcode: duplicateIndex(merged, 'stockcode') }
})
function issueOf(v: any, r: number, ci: number) {
  if (sheet.isEditing(r, ci) && sheet.editing.value?.error) return { level: 'error' as const, message: sheet.editing.value.error }
  return validateCell(v, columns.value[ci], dupes.value)
}
function cellTitle(v: any, r: number, ci: number) {
  const issue = issueOf(v, r, ci)
  const text = display(v, columns.value[ci])
  return issue ? `${text} — ${issue.message}` : text
}
const changes = computed(() => diff(base.value, draft.value, allColumns.value))
const changedSet = computed(() => new Set(changes.value.map((c) => `${c.id}|${c.key}`)))
const channelChangeCount = (code: string) => changes.value.filter((c) => c.key.startsWith(`ch:${code}:`)).length
const viewChangeCount = (v: View) => changes.value.filter((c) => (v === 'channels') === c.key.startsWith('ch:')).length
function cellClass(v: any, r: number, ci: number) {
  const issue = issueOf(v, r, ci)
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
/** İlk hatalı hücreye gider: önce görünen kolonlar; gerekirse aramayı temizler, görünümü/kanalı değiştirir. */
function goToFirstError() {
  const find = (list: any[], cols: SheetColumn[]) => {
    for (let r = 0; r < list.length; r++) for (const c of cols) if (validateCell(list[r], c, dupes.value)?.level === 'error') return { r, c }
    return null
  }
  let hit = find(rows.value, columns.value)
  if (!hit) {
    if (filterText.value) filterText.value = ''
    hit = find(ordered.value, allColumns.value)
    if (!hit) return
    if (hit.c.channel) { view.value = 'channels'; activeChannel.value = hit.c.channel } else view.value = 'general'
  }
  const { r, c } = hit
  // Arama temizlendiyse satırlar = tüm sıra; izleyici (filterText) önce çalışır, etkinleştirme ondan sonra.
  nextTick(() => sheet.activate(r, Math.max(0, columns.value.findIndex((x) => x.key === c.key))))
}
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
const previewPage = ref(1)
const previewSize = ref(25)
const previewRows = computed(() => changes.value.slice((previewPage.value - 1) * previewSize.value, previewPage.value * previewSize.value).map((ch) => {
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
function openPreview() { previewPage.value = 1; step.value = 'preview' }
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

// ── odak ──
const scrollRef = ref<HTMLElement | null>(null)
onMounted(() => nextTick(() => sheet.activate(0, view.value === 'channels' ? 2 : 0)))
/**
 * Diyalog ekranda ortalı: arama/sayfa boyutu tabloyu kısaltınca diyalog da kısalıp zıplıyordu. Tablo alanının
 * açılıştaki yüksekliği alt sınır olur (en fazla ekranın izin verdiği kadar) → filtrelerken diyalog yerinde kalır.
 */
const lockH = ref(0)
const lockMin = computed(() => (lockH.value ? `min(${lockH.value}px, max(280px, calc(100dvh - 470px)))` : '0px'))
onMounted(() => nextTick(() => requestAnimationFrame(() => { lockH.value = scrollRef.value?.offsetHeight || 0 })))

/** Odak tablo dışındaki bir yazı alanındaysa (arama, değer kutusu) hücreye taşınmaz — yazılan karakter hücreye kaçmasın. */
function typingOutside() {
  const el = document.activeElement as HTMLElement | null
  return !!el && !scrollRef.value?.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}
function focusActive() {
  nextTick(() => {
    if (typingOutside()) return
    const { row, col } = sheet.active.value
    const el = scrollRef.value?.querySelector<HTMLElement>(`td[data-r="${row}"][data-c="${col}"]`)
    if (!el) return
    const input = el.querySelector<HTMLInputElement>('input.vbe-input')
    ;(input || el).focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest' })
  })
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
.vbe-root :deep(.ek-dialog__body) { display: flex; flex-direction: column; gap: var(--ek-space-3); padding-bottom: 0; overflow-x: hidden; }

/* araç çubuğu */
.vbe-tools, .vbe-chans, .vbe-scope, .vbe-apply__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-2); min-width: 0; }
.vbe-search { flex: 0 1 300px; min-width: 200px; }
.vbe-spacer { flex: 1 1 auto; }
.vbe-apply {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}
.vbe-apply__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-4);
  padding-top: var(--ek-space-2);
  border-top: 1px dashed var(--ek-color-border-default);
}
.vbe-selinfo {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
  max-width: 100%;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: 600;
}
.vbe-selinfo > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbe-selinfo .v-icon { font-size: var(--ek-icon-sm); }
.vbe-caption { margin: 0; min-width: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.vbe-value { flex: 0 1 180px; min-width: 130px; }
.vbe-label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

/* kanal çubuğu: sol kanal seçimi, sağ toplu işlem kapsamı, altta not */
.vbe-chanbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
}
.vbe-chanbar__note { flex: 1 1 100%; }
.vbe-seg__btn .v-icon { font-size: var(--ek-icon-sm); }

.vbe-seg {
  display: inline-flex;
  flex-wrap: wrap;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}
.vbe-seg__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 30px;
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
.vbe-dot {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: 18px;
  font-weight: 700;
  text-align: center;
}

/* kanal seçimi */
.vbe-chan {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  transition: var(--ek-transition-colors);
}
.vbe-chan:hover { background: var(--ek-color-surface-muted); }
/* D3: etkin öğe tek vurgu rengi (kanal marka rengi yalnız rozette) */
.vbe-chan.is-on { border-color: var(--ek-color-action-border); background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); font-weight: 600; }
.vbe-chan:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

/* tablo çerçevesi */
.vbe-frame {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
}
.vbe-scroll {
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: max(280px, calc(100dvh - 470px));
  min-height: v-bind(lockMin);
  overscroll-behavior: contain;
}
.vbe-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  color: var(--ek-color-content-default);
}
.vbe-c-group { width: 128px; }
.vbe-c-row { width: 20%; }
.vbe-c-text { width: auto; }
.vbe-c-num { width: auto; }
.vbe-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
  overflow: hidden;
  white-space: nowrap;
}
.vbe-band__th.is-channel { box-shadow: inset 0 3px 0 var(--ek-ch-brand, var(--ek-color-border-strong)); border-left: 1px solid var(--ek-color-border-default); }
.vbe-band + tr th { top: 28px; }
.vbe-colhead {
  position: sticky;
  top: 0;
  z-index: 3;
  height: 40px;
  padding: 0;
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
.vbe-colhead--group { padding: 0 var(--ek-space-3); border-right: 1px solid var(--ek-color-border-default); }
.vbe-colhead.is-channel { border-left: 1px solid var(--ek-color-border-subtle); }
.vbe-colhead.is-num .vbe-head-btn { justify-content: flex-end; }
.vbe-colhead.is-sel, .vbe-rowhead.is-sel { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }
.vbe-corner { border-right: 1px solid var(--ek-color-border-default); }
.vbe-head-btn {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 0 var(--ek-space-3);
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
  text-align: inherit;
  cursor: pointer;
}
.vbe-head-btn .v-icon { font-size: var(--ek-icon-sm); }
.vbe-head-btn:hover { color: var(--ek-color-content-strong); background: var(--ek-color-surface-sunken); }
.vbe-head-btn:focus-visible { outline: none; box-shadow: inset var(--ek-focus-ring); }

/* grup (rowspan) — görünüm ortak VariantGroupCell */
.vbe-group { --ek-vgroup-top: v-bind(groupTop); }

.vbe-rowhead {
  height: 48px;
  padding: 0;
  background: var(--ek-color-surface);
  border-right: 1px solid var(--ek-color-border-default);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  text-align: left;
  font-weight: 400;
  overflow: hidden;
}
.vbe-rowbtn { flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; overflow: hidden; text-transform: none; letter-spacing: 0; }
.vbe-rowbtn__title, .vbe-rowbtn__sub { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbe-rowbtn__title { color: var(--ek-color-content-strong); font-weight: 600; }
.vbe-rowbtn__sub { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); font-variant-numeric: tabular-nums; }
tr.is-group-start > th, tr.is-group-start > td { border-top: 1px solid var(--ek-color-border-strong); }

/* hücre */
.vbe-cell {
  position: relative;
  height: 48px;
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  border-left: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
  cursor: cell;
  outline: none;
  overflow: hidden;
  white-space: nowrap;
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
.vbe-cell.is-editing { padding: 0; background: var(--ek-color-surface); box-shadow: inset 0 0 0 2px var(--ek-color-border-focus); }
.vbe-cell.is-editing.is-error, .vbe-cell.is-editing:has(.vbe-input[aria-invalid='true']) { box-shadow: inset 0 0 0 2px var(--ek-color-error); }
.vbe-cell.is-editing::after { display: none; }
.vbe-val { display: inline-flex; align-items: center; gap: var(--ek-space-1); max-width: 100%; vertical-align: middle; }
.vbe-val.is-empty { color: var(--ek-color-content-muted); }
.vbe-issue { display: inline-flex; flex: 0 0 auto; }
.vbe-issue .v-icon { font-size: var(--ek-icon-sm); }
.vbe-issue--error { color: var(--ek-color-error); }
.vbe-issue--warning { color: var(--ek-color-warning); }
.vbe-input {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  outline: none;
  box-shadow: none;
  caret-color: var(--ek-color-action);
}
.vbe-input.is-num { text-align: right; font-variant-numeric: tabular-nums; }
.vbe-input[aria-invalid='true'] { caret-color: var(--ek-color-error); }
.vbe-empty { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; padding: var(--ek-space-8) var(--ek-space-4); }


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
.vbe-sum { display: inline-flex; align-items: center; gap: var(--ek-space-1); }
.vbe-sum.is-on { color: var(--ek-color-warning-emphasis); font-weight: 600; }
.vbe-sum .v-icon { font-size: var(--ek-icon-sm); }
.vbe-sum--error { color: var(--ek-color-error-emphasis); font-weight: 600; }
.vbe-sum--error .v-icon { color: var(--ek-color-error); }
.vbe-sum--warning { color: var(--ek-color-warning-emphasis); font-weight: 600; }
.vbe-sum--warning .v-icon { color: var(--ek-color-warning); }
.vbe-link { color: var(--ek-color-action); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; border-radius: var(--ek-radius-control); }
.vbe-link:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }

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
.vbe-preview { display: flex; flex-direction: column; gap: var(--ek-space-3); min-width: 0; }
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
.vbe-diffwrap { max-height: max(240px, calc(100dvh - 540px)); overflow-x: hidden; overflow-y: auto; }
.vbe-diff { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: var(--ek-type-table-size); line-height: var(--ek-type-table-line); }
.vbe-d-variant { width: 34%; }
.vbe-d-field { width: 26%; }
.vbe-diff th, .vbe-diff td { padding: var(--ek-space-2) var(--ek-space-3); border-bottom: 1px solid var(--ek-color-border-subtle); text-align: left; overflow: hidden; }
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
.vbe-diff tbody th .vbe-ellipsis { display: block; }
.vbe-diff__sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }
.vbe-diff__field { display: flex; align-items: center; gap: var(--ek-space-2); min-width: 0; }
.vbe-diff .is-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; text-overflow: ellipsis; }
.vbe-diff__before { color: var(--ek-color-content-muted); text-decoration: line-through; text-decoration-color: var(--ek-color-border-strong); }
.vbe-diff__after { color: var(--ek-color-content-strong); font-weight: 600; }

@media (max-width: 600px) {
  .vbe-root { width: 100%; }
  .vbe-search { flex: 1 1 100%; }
  .vbe-c-row { width: 28%; }
  .vbe-cell { padding: 0 var(--ek-space-2); }
  .vbe-foot__actions { width: 100%; }
  .vbe-foot__actions > * { flex: 1 1 auto; }
}
@media (prefers-reduced-motion: reduce) { .vbe-seg__btn, .vbe-chan { transition: none; } }

/* ================= FE-LOCAL-1057 — "Toplu düzenle": uygulamanın tasarım diliyle (DESIGN_SYSTEM §35) =================
   Yalnız sunum. Satır içi etiketler ("Kanal", "Toplu işlem") kısa eylem çizgili mikro etiket; kanal seçici, sayaç ve
   özet çipleri köşeli (hap değil); kanal sütun bandında üstteki marka çizgisi 2px (uygulamadaki kanal çizgisiyle aynı);
   hatalı hücrede sol kalın şerit YOK — hata tonunun açık zemini + ince hata çerçevesi (etkin/düzenlenen hücre halkası aynı). */
.vbe-label {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  line-height: var(--ek-type-micro-line);
}

.vbe-label::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.vbe-chan,
.vbe-dot,
.vbe-colsum li {
  border-radius: var(--ek-radius-md);
}

.vbe-band__th.is-channel {
  box-shadow: inset 0 2px 0 var(--ek-ch-brand, var(--ek-color-border-strong));
}

.vbe-cell.is-error:not(.is-active):not(.is-editing) {
  box-shadow: inset 0 0 0 1px var(--ek-color-error-border);
}

.vbe-cell.is-error:not(.is-active):not(.is-editing):not(.is-sel) {
  background: var(--ek-color-error-subtle);
}

.vbe-alert {
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-tile);
}
</style>
