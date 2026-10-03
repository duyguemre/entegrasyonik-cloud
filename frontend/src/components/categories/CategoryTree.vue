<!--
  frontend/src/components/categories/CategoryTree.vue

  Kategori AĞACI (ana liste; ARIA tree): satır = aç/kapa oku + kutucuk + ad (arama eşleşmesi vurgulu) + altında
  muted meta (alt kategori sayısı · "2/4 kanalda eşli") + sağda kanal kapsamı karoları (eşli ✓ rozetler, eksikler
  "+n" hapı → bilgi kartı). Girinti + ince kılavuz çizgileri. Klavye: ↑/↓ gezin, → aç / ilk alt, ← kapat / üst,
  Home/End, Enter/Boşluk seç. Sürükle-bırak eski ağaçla AYNI kurallar: satırın ORTASINA bırak = altına taşı
  (moveCategory), ÜST/ALT kenarına bırak (kardeşse) = yeriyle değiştir (changeOrderCategory).
  Bu bileşen yalnız sunar ve olay yayar; API çağrılarını CategoryManager yapar.
-->
<template>
  <div ref="rootRef" class="cat-tree" role="tree" aria-label="Kategori ağacı" :aria-busy="busy || undefined" @keydown="onKeydown">
    <CategoryNewRow v-if="adding && adding.parentId === null" :level="0" label="Yeni kategori adı" placeholder="Kategori adı"
      :busy="addBusy" :error="addError" @submit="(t: string) => emit('add-submit', t)" @cancel="emit('add-cancel')" />

    <template v-for="row in rows" :key="row.node.id">
      <div :data-id="row.node.id" role="treeitem" class="cat-row"
        :class="{
          'is-selected': selectedId === row.node.id,
          'is-dragging': draggingId === row.node.id,
          'is-drop-into': dropTarget?.id === row.node.id && dropTarget.zone === 'into',
          'is-drop-before': dropTarget?.id === row.node.id && dropTarget.zone === 'before',
          'is-drop-after': dropTarget?.id === row.node.id && dropTarget.zone === 'after',
          'is-match': matchIds?.has(row.node.id),
        }"
        :aria-level="row.level + 1" :aria-setsize="row.setSize" :aria-posinset="row.posInSet"
        :aria-expanded="row.hasChildren ? row.expanded : undefined" :aria-selected="selectedId === row.node.id"
        :aria-label="row.node.title" :aria-describedby="`${uid}-meta-${row.node.id}`"
        :tabindex="focusedId === row.node.id ? 0 : -1" draggable="true"
        @click="onRowClick(row)" @focus="focusedId = row.node.id"
        @dragstart="onDragStart($event, row)" @dragend="onDragEnd" @dragover="onDragOver($event, row)"
        @dragleave="onDragLeave(row)" @drop.prevent="onDrop($event, row)">
        <span v-for="n in row.level" :key="n" class="cat-row__guide" aria-hidden="true" />
        <button v-if="row.hasChildren" type="button" class="cat-row__toggle" tabindex="-1" aria-hidden="true"
          @click.stop="emit('set-expanded', row.node.id, !row.expanded)">
          <v-icon :icon="row.expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'" size="16" />
        </button>
        <span v-else class="cat-row__toggle cat-row__toggle--none" aria-hidden="true" />
        <span class="cat-row__tile" :class="{ 'is-leaf': !row.hasChildren }" aria-hidden="true"><v-icon :icon="row.hasChildren ? 'mdi-folder-outline' : 'mdi-tag-outline'" size="16" /></span>
        <span class="cat-row__text">
          <span class="cat-row__name">
            <template v-for="(p, i) in highlight(row.node.title)" :key="i"><mark v-if="p.hit" class="cat-mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
          </span>
          <span :id="`${uid}-meta-${row.node.id}`" class="cat-row__meta">{{ metaOf(row) }}</span>
        </span>

        <span v-if="dropHint(row)" class="cat-row__drop-hint" aria-hidden="true">{{ dropHint(row) }}</span>

        <span v-if="!row.hasChildren && channels.length && mappingReady" class="cat-row__cov">
          <template v-for="code in coverageOf(row.node.id)?.mapped ?? []" :key="code">
            <span class="cat-cov" aria-hidden="true">
              <EkChannelBadge :code="code" :name="channelTitle(code)" form="short" size="xs" />
              <v-icon icon="mdi-check-circle-outline" class="cat-cov__glyph" />
            </span>
          </template>
          <v-menu v-if="coverageOf(row.node.id)?.missing.length" :close-on-content-click="false" location="bottom end"
            transition="fade-transition" offset="8">
            <template #activator="{ props: absentProps }">
              <button type="button" v-bind="absentProps" class="cat-absent" tabindex="-1" @click.stop
                :aria-label="`${coverageOf(row.node.id)!.missing.length} kanalda eşlenmedi. Ayrıntı`">
                <span aria-hidden="true">+{{ coverageOf(row.node.id)!.missing.length }}</span>
              </button>
            </template>
            <section class="cat-absent-card" role="dialog" :aria-label="`${row.node.title} — eşlenmeyen kanallar`">
              <header class="cat-absent-card__head">
                <span class="cat-absent-card__title">Eşlenmeyen kanallar</span>
                <span class="cat-absent-card__sub">{{ row.node.path.join(' › ') }}</span>
              </header>
              <ul class="cat-absent-card__list">
                <li v-for="code in coverageOf(row.node.id)!.missing" :key="code">
                  <EkChannelBadge :code="code" :name="channelTitle(code)" size="xs" />
                  <span class="cat-absent-card__state">Eşlenmedi</span>
                </li>
              </ul>
              <p class="cat-absent-card__hint">
                <v-icon icon="mdi-information-outline" aria-hidden="true" />
                Eşlemek için kategoriyi seçin ve “Kanal eşlemeleri” bölümünden “Eşle”ye basın.
              </p>
            </section>
          </v-menu>
        </span>

        <span class="cat-row__actions">
          <EkActionButton v-if="narrow && row.hasChildren" action="settings" :label="`${row.node.title} ayrıntısı`" tabindex="-1"
            @click.stop="emit('select', row.node.id)" />
          <EkActionButton action="add" :label="`${row.node.title} altına kategori ekle`" tabindex="-1"
            @click.stop="emit('add-child', row.node.id)" />
        </span>
      </div>

      <CategoryNewRow v-if="adding && adding.parentId === row.node.id" :level="row.level + 1" :label="`${row.node.title} altına yeni kategori adı`"
        placeholder="Alt kategori adı" :busy="addBusy" :error="addError" @submit="(t: string) => emit('add-submit', t)" @cancel="emit('add-cancel')" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { EkActionButton, EkChannelBadge } from '@entegrasyonik/ui/components'
import CategoryNewRow from '@/components/categories/CategoryNewRow.vue'
import { canMoveInto, canSwapOrder, highlightParts, type CatCoverage, type CatNode, type CatRow, type CatTree } from '@/composables/categoryTree'

const props = defineProps<{
  rows: CatRow[]
  tree: CatTree
  selectedId?: string | null
  coverage: Map<string, CatCoverage>
  channels: Array<{ code: string; title: string }>
  mappingReady: boolean
  query: string
  matchIds?: Set<string>
  adding: { parentId: string | null } | null
  addBusy?: boolean
  addError?: string
  busy?: boolean
  /** Dar ekran: üst kategori satırına dokunmak yalnız açar/kapatır; ayrıntı için satırdaki "Ayrıntı" düğmesi. */
  narrow?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  'set-expanded': [id: string, expanded: boolean]
  'add-child': [id: string]
  'add-submit': [title: string]
  'add-cancel': []
  move: [dragId: string, targetId: string]
  swap: [fromId: string, toId: string]
}>()

const uid = useId()
const rootRef = ref<HTMLElement | null>(null)
const focusedId = ref<string | null>(null)

const channelTitle = (code: string) => props.channels.find((c) => c.code === code)?.title ?? code
const coverageOf = (id: string) => props.coverage.get(id)
const highlight = (text: string) => highlightParts(text, props.query)

function metaOf(row: CatRow): string {
  const parts: string[] = []
  const cov = coverageOf(row.node.id)
  if (row.hasChildren) {
    parts.push(`${row.node.children.length} alt kategori`)
    if (props.mappingReady && props.channels.length && cov?.incompleteLeafCount) parts.push(`${cov.incompleteLeafCount} eksik eşleme`)
  } else if (props.mappingReady && props.channels.length && cov) {
    parts.push(`${cov.mapped.length}/${props.channels.length} kanalda eşli`)
  } else parts.push('Alt kategorisi yok')
  return parts.join(' · ')
}

// ---- Odak (roving tabindex) ---------------------------------------------------------------------------------------------
watch(() => props.rows, (rows) => {
  if (!rows.some((r) => r.node.id === focusedId.value)) focusedId.value = (props.selectedId && rows.find((r) => r.node.id === props.selectedId)?.node.id) || rows[0]?.node.id || null
}, { immediate: true })

function focusRow(id: string | null | undefined) {
  if (!id) return
  focusedId.value = id
  nextTick(() => rootRef.value?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus())
}

function onRowClick(row: CatRow) {
  focusedId.value = row.node.id
  if (props.narrow && row.hasChildren) { emit('set-expanded', row.node.id, !row.expanded); return }
  emit('select', row.node.id)
  if (row.hasChildren && !row.expanded) emit('set-expanded', row.node.id, true)
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const rowEl = target.closest<HTMLElement>('[role="treeitem"]')
  if (!rowEl || target !== rowEl) return // alan/düğmelerdeki tuşlara karışma
  const idx = props.rows.findIndex((r) => r.node.id === rowEl.dataset.id)
  const row = props.rows[idx]
  if (!row) return
  const go = (i: number) => { e.preventDefault(); focusRow(props.rows[Math.max(0, Math.min(props.rows.length - 1, i))]?.node.id) }
  switch (e.key) {
    case 'ArrowDown': return go(idx + 1)
    case 'ArrowUp': return go(idx - 1)
    case 'Home': return go(0)
    case 'End': return go(props.rows.length - 1)
    case 'ArrowRight':
      e.preventDefault()
      if (row.hasChildren && !row.expanded) emit('set-expanded', row.node.id, true)
      else if (row.expanded) focusRow(props.rows[idx + 1]?.node.id)
      return
    case 'ArrowLeft':
      e.preventDefault()
      if (row.expanded) emit('set-expanded', row.node.id, false)
      else if (row.node.parentId) focusRow(row.node.parentId)
      return
    case 'Enter':
    case ' ':
      e.preventDefault()
      emit('select', row.node.id)
      return
  }
}

// ---- Sürükle-bırak ------------------------------------------------------------------------------------------------------
type Zone = 'before' | 'into' | 'after'
const draggingId = ref<string | null>(null)
const dropTarget = ref<{ id: string; zone: Zone } | null>(null)
const nodeOf = (id: string | null | undefined): CatNode | undefined => (id ? props.tree.byId.get(id) : undefined)

function zoneOf(e: DragEvent, el: HTMLElement): Zone {
  const r = el.getBoundingClientRect()
  const y = (e.clientY - r.top) / Math.max(1, r.height)
  return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'
}

function validZone(drag: CatNode, target: CatNode, zone: Zone): boolean {
  return zone === 'into' ? canMoveInto(drag, target) : canSwapOrder(drag, target)
}

function onDragStart(e: DragEvent, row: CatRow) {
  draggingId.value = row.node.id
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.node.id) }
}
function onDragEnd() { draggingId.value = null; dropTarget.value = null }
function onDragOver(e: DragEvent, row: CatRow) {
  const drag = nodeOf(draggingId.value)
  if (!drag) return
  const zone = zoneOf(e, e.currentTarget as HTMLElement)
  if (!validZone(drag, row.node, zone)) { dropTarget.value = null; return }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTarget.value = { id: row.node.id, zone }
}
function onDragLeave(row: CatRow) { if (dropTarget.value?.id === row.node.id) dropTarget.value = null }
function onDrop(e: DragEvent, row: CatRow) {
  const drag = nodeOf(draggingId.value)
  const zone = zoneOf(e, e.currentTarget as HTMLElement)
  draggingId.value = null
  dropTarget.value = null
  if (!drag || !validZone(drag, row.node, zone)) return
  if (zone === 'into') emit('move', drag.id, row.node.id)
  else emit('swap', drag.id, row.node.id)
}
const dropHint = (row: CatRow) => (dropTarget.value?.id === row.node.id ? (dropTarget.value.zone === 'into' ? 'Altına taşı' : 'Yeriyle değiştir') : '')

defineExpose({ focusRow })
</script>

<style scoped>
.cat-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-2);
}

.cat-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 52px;
  padding: var(--ek-space-1) var(--ek-space-2) var(--ek-space-1) var(--ek-space-1);
  border-radius: var(--ek-radius-control);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-row:hover {
  background: var(--ek-color-surface-muted);
}

.cat-row.is-selected {
  background: var(--ek-color-action-subtle);
}

.cat-row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.cat-row.is-dragging {
  opacity: 0.5;
}

.cat-row.is-drop-into {
  background: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action);
}

.cat-row.is-drop-before::before,
.cat-row.is-drop-after::after {
  content: '';
  position: absolute;
  inset-inline: var(--ek-space-2);
  height: 2px;
  background: var(--ek-color-action);
}

.cat-row.is-drop-before::before {
  top: -2px;
}

.cat-row.is-drop-after::after {
  bottom: -2px;
}

.cat-row__guide {
  flex: none;
  align-self: stretch;
  width: var(--ek-space-5);
  margin-block: calc(-1 * var(--ek-space-1));
  border-inline-start: 1px solid var(--ek-color-border-subtle);
}

.cat-row__toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-content-muted);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-row__toggle:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.cat-row__toggle--none {
  cursor: default;
}

.cat-row__tile {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-sm);
  background: color-mix(in srgb, var(--ek-color-action) 14%, var(--ek-color-surface));
  color: var(--ek-color-action);
}

.cat-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.cat-row__name {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-type-body-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-row__meta {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-mark {
  padding: 0;
  border-radius: 2px;
  background: var(--ek-color-highlight);
  color: inherit;
}

.cat-row__drop-hint {
  flex: none;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.cat-row__cov {
  display: inline-flex;
  flex: none;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px 6px;
}

.cat-cov {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.cat-cov :deep(.ek-chb) {
  min-width: 28px;
}

.cat-cov__glyph {
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-icon-sm);
}

.cat-absent {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-absent:hover,
.cat-absent[aria-expanded='true'] {
  border-color: var(--ek-color-action);
  border-style: solid;
  background: color-mix(in srgb, var(--ek-color-action) 8%, var(--ek-color-surface));
  color: var(--ek-color-action);
}

.cat-absent:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cat-row__actions {
  display: inline-flex;
  flex: none;
  opacity: 0;
  transition: var(--ek-transition-colors);
}

.cat-row:hover .cat-row__actions,
.cat-row:focus-within .cat-row__actions,
.cat-row.is-selected .cat-row__actions {
  opacity: 1;
}

@media (hover: none) {
  .cat-row__actions {
    opacity: 1;
  }
}

@media (max-width: 599px) {
  .cat-row__cov {
    display: none;
  }
}

/* ================= FE-LOCAL-1048 — ağaç: düz satırlar + ince çizgi =================
   Satırlar kartın kenarından kenarına düz yüzey, aralarında saç çizgisi; seçili satır eylem renginin açık tonu + ince
   çerçeve (kalın şerit / gölge yok). Kutucuklar çerçeveli kapsül (üst kategori = eylem tonu, uç kategori = nötr).
   Eksik eşleme sayacı düz uyarı tonu rozet; aç/kapa oku sakin. */
.cat-tree {
  gap: 0;
  padding: 0;
}

.cat-row {
  padding: var(--ek-space-1) var(--ek-space-3) var(--ek-space-1) var(--ek-space-2);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  border-radius: 0;
}

.cat-row.is-selected {
  background: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
}

.cat-row.is-selected:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.cat-row__guide {
  margin-block: calc(-1 * var(--ek-space-1) - 1px);
}

.cat-row__toggle {
  border-radius: var(--ek-radius-md);
}

.cat-row__toggle:hover {
  background: var(--ek-color-surface);
}

.cat-row__tile {
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.cat-row__tile.is-leaf {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.cat-row.is-selected .cat-row__tile.is-leaf {
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}

.cat-absent {
  border: 1px solid var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.cat-absent:hover,
.cat-absent[aria-expanded='true'] {
  border-color: var(--ek-color-warning-emphasis);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}
</style>

<style>
/* "+n" bilgi kartı (teleport edilir → kapsamsız; önek bu bileşene özgü). */
.cat-absent-card {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 240px;
  max-width: 300px;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-popover);
}
.cat-absent-card__head { display: flex; flex-direction: column; gap: 1px; }
.cat-absent-card__title { color: var(--ek-color-content-strong); font-size: var(--ek-type-label-size); font-weight: var(--ek-font-weight-semibold); }
.cat-absent-card__sub { color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); }
.cat-absent-card__list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.cat-absent-card__list > li {
  display: flex; align-items: center; gap: var(--ek-space-2);
  padding: 6px 8px; border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-type-caption-size);
}
.cat-absent-card__state { margin-left: auto; color: var(--ek-color-content-muted); }
.cat-absent-card__hint {
  display: flex; gap: 6px; margin: 0;
  color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line);
}
.cat-absent-card__hint .v-icon { flex: none; margin-top: 1px; font-size: var(--ek-icon-sm); color: var(--ek-color-info); }

/* FE-LOCAL-1048: bilgi kartı — mikro etiketli başlık (eylem çizgisi) + saç çizgili düz satırlar. */
.cat-absent-card { border-radius: var(--ek-radius-card); }
.cat-absent-card__title {
  display: inline-flex; align-items: center; gap: var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size); line-height: var(--ek-type-micro-line); font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking); text-transform: uppercase;
}
.cat-absent-card__title::before { content: ''; width: 12px; height: 2px; border-radius: 1px; background: var(--ek-color-action); }
.cat-absent-card__list { gap: 0; }
.cat-absent-card__list > li {
  padding: 6px 0; border-radius: 0; background: none;
  border-top: 1px solid var(--ek-color-border-subtle);
}
.cat-absent-card__state { color: var(--ek-color-warning-emphasis); font-weight: var(--ek-font-weight-semibold); }
</style>
