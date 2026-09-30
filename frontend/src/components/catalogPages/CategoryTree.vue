<!--
  frontend/src/components/catalogPages/CategoryTree.vue

  B7 — Kategoriler sayfasının ağaç bölmesi (yalnız CategoryListView). Eski iç içe kutulu ağacın (CategoryTreeComponent —
  DEĞİŞMEDİ, Kategori Tanımları ekranında sürüyor) yerine düzleştirilmiş, tek satır yükseklikli WAI-ARIA ağacı:
    [girinti çizgileri][▸][klasör/etiket] Başlık  3            ● ● ○ 2/3   [⋯]
  • Seçim satırın kendisiyle (tıklama / Enter / Boşluk); ⚙ düğmesi yok. Tek sekme durağı (dolaşan tabindex).
  • Klavye: ↑↓ Home End · → aç / ilk çocuk · ← kapat / üst · F2 yeniden adlandır · Alt+↑↓ sıra değiştir · harf = atla.
  • Arama: eşleşme `<mark>`, ataları kendiliğinden açılır; "Eşlemesi eksik" süzgeci yalnız eksik yaprakları + atalarını bırakır.
  • Satır içi ekleme / yeniden adlandırma (CatNameInput), sürükle-bırak: ortası = içine taşı, kenar = kardeşle yer değiştir
    (eski ağaçla aynı iki uç nokta: CategoryService/moveCategory · changeOrderCategory).
  • > 300 görünür satırda sanallaştırma (v-virtual-scroll, sabit 40px satır).
  Veri/uç noktalar sayfada (CategoryListView); bu bileşen yalnız olay yayar.
-->
<template>
  <div class="cat-tree" :class="{ 'is-dragging': !!dragId }">
    <p class="ek-sr-only" aria-live="polite">{{ live }}</p>

    <div v-if="addingTop" class="cat-tree__add-top">
      <CatNameInput :label="'Yeni kategori adı'" placeholder="Yeni ana kategori adı" icon="mdi-folder-plus-outline"
        hint="Enter ile kaydedin, Esc ile vazgeçin." :busy="busy" @submit="(v) => emit('add', null, v)" @cancel="cancelEdit" />
    </div>

    <div
      ref="scrollerRef"
      class="cat-tree__scroll"
      role="tree"
      :aria-label="label"
      aria-multiselectable="false"
      @keydown="onKeydown"
    >
      <v-virtual-scroll v-if="virtual" ref="virtualRef" :items="rows" :item-height="ROW_H" class="cat-tree__virtual">
        <template v-slot:default="{ item }">
          <CategoryTreeRow v-bind="rowProps(item as NodeRow)" v-on="rowHandlers" />
        </template>
      </v-virtual-scroll>
      <TransitionGroup v-else name="cat-row" tag="div" class="cat-tree__rows">
        <template v-for="row in rows" :key="row.key">
          <div v-if="row.kind === 'add'" class="cat-tree__add" :class="`is-d${Math.min(row.depth, 8)}`" role="none">
            <CatNameInput compact :label="`${row.parentTitle} altına yeni kategori`" :placeholder="`${row.parentTitle} › yeni alt kategori`"
              icon="mdi-plus" :busy="busy" @submit="(v) => emit('add', row.parentId, v)" @cancel="cancelEdit" />
          </div>
          <CategoryTreeRow v-else v-bind="rowProps(row as NodeRow)" v-on="rowHandlers" />
        </template>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import CatNameInput from './CatNameInput.vue'
import CategoryTreeRow, { type RowMenuAction } from './CategoryTreeRow.vue'
import {
  ancestorsOf,
  canMoveInto,
  flattenRows,
  fold,
  leafMapping,
  siblingsOf,
  visibleSpec,
  type CatNode,
  type CatTree,
  type GroupStats,
  type PlatformRef,
  type TreeRow,
} from './catalogModel'

const ROW_H = 40
const VIRTUAL_AT = 300

const props = defineProps<{
  tree: CatTree
  index: Map<string, Set<string>>
  platforms: PlatformRef[]
  stats: Map<string, GroupStats>
  selectedId: string | null
  query: string
  onlyMissing: boolean
  busy?: boolean
  label: string
}>()

const emit = defineEmits<{
  /** `explicit`: kullanıcı ayrıntıyı açıkça istedi (Enter / menü); grup satırına tıklama `false`. */
  select: [node: CatNode, explicit: boolean]
  add: [parentId: string | null, title: string]
  rename: [node: CatNode, title: string]
  move: [node: CatNode, newParentId: string]
  reorder: [node: CatNode, target: CatNode]
  cancel: []
}>()

// ------------------------------------------------------------------ açık düğümler + arama/süzgeç
const expanded = ref(new Set<string>())
let savedExpanded: Set<string> | null = null
const spec = computed(() => visibleSpec(props.tree, props.query, props.onlyMissing, props.index, props.platforms))

watch(
  () => [props.query.trim(), props.onlyMissing] as const,
  ([q, only], old) => {
    const wasFiltering = !!old && (!!old[0] || old[1])
    const filtering = !!q || only
    if (filtering && !wasFiltering) savedExpanded = new Set(expanded.value)
    if (filtering) expanded.value = new Set(spec.value.expand)
    else if (wasFiltering) {
      const next = new Set(savedExpanded ?? [])
      if (props.selectedId) ancestorsOf(props.tree, props.selectedId).forEach((a) => next.add(a))
      expanded.value = next
      savedExpanded = null
    }
  },
)

// Ağaç yeniden yüklendiğinde artık olmayan düğümleri bırak.
watch(
  () => props.tree,
  (t) => {
    const next = new Set([...expanded.value].filter((id) => t.byId.has(id)))
    if (next.size !== expanded.value.size) expanded.value = next
  },
)

// ------------------------------------------------------------------ satır içi düzenleme
type Edit = { mode: 'rename'; id: string } | { mode: 'add'; parentId: string | null } | null
const edit = ref<Edit>(null)
const addingTop = computed(() => edit.value?.mode === 'add' && edit.value.parentId === null)

interface NodeRow extends TreeRow {
  kind: 'node'
  key: string
}
interface AddRow {
  kind: 'add'
  key: string
  depth: number
  parentId: string
  parentTitle: string
}
type AnyRow = NodeRow | AddRow

const rows = computed<AnyRow[]>(() => {
  const base: AnyRow[] = flattenRows(props.tree, expanded.value, spec.value.visible).map((r) => ({ ...r, kind: 'node', key: r.node.id }))
  const e = edit.value
  if (e?.mode === 'add' && e.parentId) {
    const parent = props.tree.byId.get(e.parentId)
    if (parent) {
      // Ebeveynin görünür alt ağacının sonuna.
      let at = base.findIndex((r) => r.kind === 'node' && r.node.id === parent.id)
      if (at >= 0) {
        let end = at + 1
        while (end < base.length && base[end].kind === 'node' && (base[end] as NodeRow).depth > parent.depth) end++
        base.splice(end, 0, { kind: 'add', key: `add-${parent.id}`, depth: parent.depth + 1, parentId: parent.id, parentTitle: parent.title })
      }
    }
  }
  return base
})

const nodeRows = computed(() => rows.value.filter((r): r is NodeRow => r.kind === 'node'))
const virtual = computed(() => rows.value.length > VIRTUAL_AT && !edit.value)

function cancelEdit() {
  const back = edit.value?.mode === 'rename' ? edit.value.id : edit.value?.mode === 'add' ? edit.value.parentId : null
  edit.value = null
  emit('cancel')
  if (back) focusRow(back)
}

function startAdd(parentId: string | null) {
  if (parentId) {
    const next = new Set(expanded.value)
    next.add(parentId)
    expanded.value = next
  }
  edit.value = { mode: 'add', parentId }
}

function startRename(id: string) {
  edit.value = { mode: 'rename', id }
}

/** Düğümü görünür kıl (ataları aç), odağı taşı. */
function reveal(id: string, focus = true) {
  const anc = ancestorsOf(props.tree, id)
  if (anc.some((a) => !expanded.value.has(a))) {
    const next = new Set(expanded.value)
    anc.forEach((a) => next.add(a))
    expanded.value = next
  }
  if (focus) focusRow(id)
  else nextTick(() => scrollToRow(id))
}

defineExpose({ startAdd, startRename, reveal, finishEdit: () => (edit.value = null), expandAll, collapseAll, focusTree: () => focusRow(focusId.value ?? nodeRows.value[0]?.node.id) })

function expandAll() {
  const next = new Set<string>()
  for (const n of props.tree.byId.values()) if (n.children.length) next.add(n.id)
  expanded.value = next
  announce('Tüm kategoriler açıldı')
}

function collapseAll() {
  expanded.value = new Set()
  announce('Tüm kategoriler kapatıldı')
}

// ------------------------------------------------------------------ odak (dolaşan tabindex)
const focusId = ref<string | null>(null)
const scrollerRef = ref<HTMLElement | null>(null)
const virtualRef = ref<{ scrollToIndex: (i: number) => void } | null>(null)
const tabStop = computed(() => {
  const ids = nodeRows.value.map((r) => r.node.id)
  if (focusId.value && ids.includes(focusId.value)) return focusId.value
  if (props.selectedId && ids.includes(props.selectedId)) return props.selectedId
  return ids[0] ?? null
})

function scrollToRow(id: string) {
  const i = rows.value.findIndex((r) => r.kind === 'node' && r.node.id === id)
  if (i < 0) return
  if (virtual.value) virtualRef.value?.scrollToIndex(i)
  else document.getElementById(rowDomId(id))?.scrollIntoView({ block: 'nearest' })
}

function focusRow(id: string | null | undefined) {
  if (!id) return
  focusId.value = id
  nextTick(() => {
    scrollToRow(id)
    nextTick(() => document.getElementById(rowDomId(id))?.focus({ preventScroll: !virtual.value }))
  })
}

const rowDomId = (id: string) => `cat-row-${id}`

// ------------------------------------------------------------------ duyuru
const live = ref('')
function announce(msg: string) {
  live.value = ''
  nextTick(() => (live.value = msg))
}

// ------------------------------------------------------------------ satır özellikleri
function rowProps(row: NodeRow) {
  const n = row.node
  const st = props.stats.get(n.id)
  return {
    domId: rowDomId(n.id),
    node: n,
    depth: row.depth,
    expanded: row.expanded,
    hasChildren: row.hasChildren,
    posinset: row.posinset,
    setsize: row.setsize,
    selected: props.selectedId === n.id,
    tabbable: tabStop.value === n.id,
    query: props.query,
    hit: spec.value.hits.has(n.id),
    childCount: n.children.length,
    missing: n.children.length ? st?.missing ?? 0 : 0,
    mapping: n.children.length ? null : leafMapping(n.id, props.index, props.platforms),
    renaming: edit.value?.mode === 'rename' && edit.value.id === n.id,
    busy: !!props.busy,
    dropZone: dropTarget.value?.id === n.id ? dropTarget.value.zone : null,
    canOutdent: !!n.parentId,
    canUp: siblingIndex(n) > 0,
    canDown: siblingIndex(n) < siblingsOf(props.tree, n.id).length - 1,
  }
}

const siblingIndex = (n: CatNode) => siblingsOf(props.tree, n.id).findIndex((s) => s.id === n.id)

const rowHandlers = {
  activate: (n: CatNode) => {
    focusId.value = n.id
    // Grup satırına tıklama: seçer ve açar; zaten seçili + açıksa kapatır (dosya ağacı alışkanlığı).
    if (n.children.length) {
      const open = expanded.value.has(n.id)
      if (!open) toggle(n, true)
      else if (props.selectedId === n.id) toggle(n, false)
    }
    emit('select', n, !n.children.length)
  },
  toggle: (n: CatNode) => toggle(n),
  focusin: (n: CatNode) => (focusId.value = n.id),
  menu: (n: CatNode, a: RowMenuAction) => runAction(n, a),
  rename: (n: CatNode, title: string) => emit('rename', n, title),
  'cancel-rename': () => cancelEdit(),
  dragstart: (n: CatNode, e: DragEvent) => onDragStart(n, e),
  dragover: (n: CatNode, e: DragEvent) => onDragOver(n, e),
  drop: (n: CatNode, e: DragEvent) => onDrop(n, e),
  dragend: () => onDragEnd(),
}

function toggle(n: CatNode, open?: boolean) {
  if (!n.children.length) return
  const next = new Set(expanded.value)
  const willOpen = open ?? !next.has(n.id)
  if (willOpen) next.add(n.id)
  else next.delete(n.id)
  expanded.value = next
  announce(`${n.title} ${willOpen ? 'açıldı' : 'kapatıldı'}`)
}

function runAction(n: CatNode, a: RowMenuAction) {
  if (a === 'rename') startRename(n.id)
  else if (a === 'add') startAdd(n.id)
  else if (a === 'up' || a === 'down') reorderBy(n, a === 'up' ? -1 : 1)
  else if (a === 'outdent') outdent(n)
  else if (a === 'select') emit('select', n, true)
}

function reorderBy(n: CatNode, delta: -1 | 1) {
  const sibs = siblingsOf(props.tree, n.id)
  const i = sibs.findIndex((s) => s.id === n.id)
  const target = sibs[i + delta]
  if (!target) return
  focusId.value = n.id
  emit('reorder', n, target)
}

function outdent(n: CatNode) {
  if (!n.parentId) return
  const parent = props.tree.byId.get(n.parentId)
  const newParent = parent?.parentId ?? props.tree.mainId
  if (!newParent) return
  emit('move', n, newParent)
}

// ------------------------------------------------------------------ klavye
let typeahead = ''
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  if (!target?.matches?.('[role="treeitem"]')) return
  const list = nodeRows.value
  const i = list.findIndex((r) => r.node.id === focusId.value)
  if (i < 0) return
  const row = list[i]
  const n = row.node
  const go = (j: number) => {
    const r = list[Math.max(0, Math.min(list.length - 1, j))]
    if (r) focusRow(r.node.id)
  }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    reorderBy(n, e.key === 'ArrowUp' ? -1 : 1)
    return
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      go(i + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      go(i - 1)
      break
    case 'Home':
      e.preventDefault()
      go(0)
      break
    case 'End':
      e.preventDefault()
      go(list.length - 1)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (row.hasChildren && !row.expanded) toggle(n, true)
      else if (row.expanded) go(i + 1)
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (row.expanded) toggle(n, false)
      else if (n.parentId) focusRow(n.parentId)
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      emit('select', n, true)
      break
    case 'F2':
      e.preventDefault()
      startRename(n.id)
      break
    case '*':
      e.preventDefault()
      siblingsOf(props.tree, n.id).forEach((s) => s.children.length && expanded.value.add(s.id))
      expanded.value = new Set(expanded.value)
      break
    default:
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
        typeahead += fold(e.key)
        clearTimeout(typeaheadTimer)
        typeaheadTimer = setTimeout(() => (typeahead = ''), 700)
        const order = [...list.slice(i + 1), ...list.slice(0, i + 1)]
        const hit = order.find((r) => fold(r.node.title).startsWith(typeahead))
        if (hit) focusRow(hit.node.id)
      }
  }
}

// ------------------------------------------------------------------ sürükle-bırak
const dragId = ref<string | null>(null)
const dropTarget = ref<{ id: string; zone: 'into' | 'swap' } | null>(null)

function onDragStart(n: CatNode, e: DragEvent) {
  dragId.value = n.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', n.title)
  }
}

function zoneFor(n: CatNode, e: DragEvent): 'into' | 'swap' | null {
  const from = dragId.value
  if (!from || from === n.id) return null
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const y = e.clientY - rect.top
  const edge = y < rect.height * 0.28 || y > rect.height * 0.72
  const dragged = props.tree.byId.get(from)
  const sameParent = !!dragged && dragged.parentId === n.parentId
  if (edge && sameParent) return 'swap'
  if (canMoveInto(props.tree, from, n.id)) return 'into'
  return sameParent ? 'swap' : null
}

function onDragOver(n: CatNode, e: DragEvent) {
  const zone = zoneFor(n, e)
  if (!zone) {
    dropTarget.value = null
    return
  }
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dropTarget.value?.id !== n.id || dropTarget.value.zone !== zone) dropTarget.value = { id: n.id, zone }
}

function onDrop(n: CatNode, e: DragEvent) {
  const zone = zoneFor(n, e)
  const dragged = dragId.value ? props.tree.byId.get(dragId.value) : undefined
  onDragEnd()
  if (!zone || !dragged) return
  e.preventDefault()
  if (zone === 'into') emit('move', dragged, n.id)
  else emit('reorder', dragged, n)
}

function onDragEnd() {
  dragId.value = null
  dropTarget.value = null
}

defineOptions({ name: 'CategoryTree' })
</script>

<style scoped>
.cat-tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.cat-tree__add-top {
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-1);
}

.cat-tree__scroll {
  flex: 1;
  min-height: 0;
  padding: var(--ek-space-2) var(--ek-space-2) var(--ek-space-4);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.cat-tree__virtual {
  height: 100%;
}

.cat-tree__rows {
  position: relative;
  display: flex;
  flex-direction: column;
}

.cat-tree__add {
  padding: var(--ek-space-1) var(--ek-space-2) var(--ek-space-2);
}

.cat-tree__add.is-d1 { padding-left: calc(var(--ek-space-2) + 1 * 20px + 24px); }
.cat-tree__add.is-d2 { padding-left: calc(var(--ek-space-2) + 2 * 20px + 24px); }
.cat-tree__add.is-d3 { padding-left: calc(var(--ek-space-2) + 3 * 20px + 24px); }
.cat-tree__add.is-d4 { padding-left: calc(var(--ek-space-2) + 4 * 20px + 24px); }
.cat-tree__add.is-d5 { padding-left: calc(var(--ek-space-2) + 5 * 20px + 24px); }
.cat-tree__add.is-d6 { padding-left: calc(var(--ek-space-2) + 6 * 20px + 24px); }
.cat-tree__add.is-d7 { padding-left: calc(var(--ek-space-2) + 7 * 20px + 24px); }
.cat-tree__add.is-d8 { padding-left: calc(var(--ek-space-2) + 8 * 20px + 24px); }

/* Yeni görünen satırlar: yalnız opaklık + kısa dikey kayma (A9 envanteri: base / enter). Çıkış anında (kapanış sakin). */
.cat-row-enter-active {
  transition:
    opacity var(--ek-duration-base) var(--ek-easing-enter),
    transform var(--ek-duration-base) var(--ek-easing-enter);
}

.cat-row-enter-from {
  opacity: 0;
  transform: translateY(calc(-1 * var(--ek-motion-distance-sm)));
}

.cat-row-leave-active {
  display: none;
}
</style>
