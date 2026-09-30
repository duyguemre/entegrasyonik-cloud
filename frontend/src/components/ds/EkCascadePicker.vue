<!--
  frontend/src/components/ds/EkCascadePicker.vue

  DS-v2 — kademeli çok kolonlu seçici (Miller kolonları). Kullanım alanları:
  ürün KATEGORİ AĞACI seçimi (pazaryeri kategori eşleme), modül/ekran başlatıcı.
    başlık (kimlik degradesi): [ikon] Başlık / açıklama ...... [🔍 ara] [×]
    kolonlar: her kolonun mikro başlığı = üst düğümün adı; klasör (alt öğesi
    olan) öğe ›, yaprak öğe ● ile biter. SEÇİLİ YOL her kolonda vurgulu
    (`action-subtle`), seçili yaprak onay işaretli.
    alt çubuk: seçili yol kırıntısı ........ Vazgeç · Seç
  Arama: yazınca kolonlar yerine eşleşen YAPRAKLAR tam yollarıyla listelenir.
  Klavye: ↑/↓ kolon içinde, → alt kolona geç, ← üst kolona dön, Enter yaprağı seç.
  Aşama 2 eklemeleri (geri uyumlu): arama kutusunda ↓ ilk kolona/ilk sonuca
  iner; sonuç listesinde ↑/↓ gezinir, Enter seçer, Esc aramayı temizler.
  Seçim ilerledikçe kolon şeridi son kolona kayar. `embedded`: kimlik
  degradesi yerine nötr başlık bandı (sayfa içine gömülü kullanım; diyalog
  değil). `selectableBranches`: yaprak olmayan düğüm de seçilebilir.
  Veri çağırandan gelir (sunum bileşeni); `select` seçilen yolun id dizisini yayar.
-->
<template>
  <div class="ek-cascade" :class="{ 'ek-cascade--embedded': embedded }" role="group" :aria-labelledby="titleId">
    <header class="ek-cascade__head">
      <span class="ek-cascade__head-icon" aria-hidden="true"><v-icon :icon="icon" /></span>
      <div class="ek-cascade__titles">
        <h2 :id="titleId" class="ek-cascade__title">{{ title }}</h2>
        <p v-if="subtitle" class="ek-cascade__subtitle">{{ subtitle }}</p>
      </div>
      <label class="ek-cascade__search">
        <v-icon icon="mdi-magnify" aria-hidden="true" />
        <input v-model="query" type="search" :placeholder="searchPlaceholder" :aria-label="searchPlaceholder" autocomplete="off" @keydown="onSearchKeydown" />
      </label>
      <button v-if="closable" type="button" class="ek-cascade__close" aria-label="Kapat" @click="emit('close')">
        <v-icon icon="mdi-close" aria-hidden="true" />
      </button>
    </header>

    <div v-if="!query.trim()" ref="columnsRef" class="ek-cascade__columns" @keydown="onKeydown">
      <div v-for="(col, ci) in columns" :key="col.parentId ?? 'root'" class="ek-cascade__col" :class="{ 'is-last': ci === columns.length - 1 }">
        <div class="ek-cascade__col-head">
          <v-icon :icon="ci === 0 ? 'mdi-sitemap-outline' : 'mdi-folder-open-outline'" aria-hidden="true" />
          <span>{{ col.label }}</span>
          <span class="ek-cascade__col-count">{{ col.nodes.length }}</span>
        </div>
        <ul class="ek-cascade__list" role="listbox" :aria-label="col.label">
          <li
            v-for="node in col.nodes"
            :key="node.id"
            class="ek-cascade__item"
            :class="{
              'is-path': path[ci] === node.id,
              'is-leaf': !node.children?.length,
              'is-chosen': !node.children?.length && path[ci] === node.id,
            }"
            role="option"
            :aria-selected="path[ci] === node.id"
            :tabindex="focusCol === ci && (path[ci] ?? col.nodes[0]?.id) === node.id ? 0 : -1"
            :data-col="ci"
            :data-id="node.id"
            @click="choose(ci, node)"
          >
            <v-icon
              class="ek-cascade__item-icon"
              :icon="node.children?.length ? (path[ci] === node.id ? 'mdi-folder-open-outline' : 'mdi-folder-outline') : (node.icon ?? 'mdi-tag-outline')"
              aria-hidden="true"
            />
            <span class="ek-cascade__item-label">{{ node.label }}</span>
            <span v-if="node.count !== undefined" class="ek-cascade__item-count">{{ node.count }}</span>
            <v-icon v-if="node.children?.length" class="ek-cascade__item-end" icon="mdi-chevron-right" aria-hidden="true" />
            <v-icon v-else-if="path[ci] === node.id" class="ek-cascade__item-end is-check" icon="mdi-check-circle-outline" aria-hidden="true" />
            <span v-else class="ek-cascade__leaf-dot" aria-hidden="true"></span>
          </li>
        </ul>
      </div>
    </div>

    <div v-else ref="resultsRef" class="ek-cascade__results">
      <p class="ek-cascade__results-head" role="status">{{ matches.length }} eşleşme</p>
      <ul v-if="matches.length" class="ek-cascade__list" role="listbox" aria-label="Arama sonuçları" @keydown="onResultsKeydown">
        <li
          v-for="(m, mi) in matches"
          :key="m.ids.join('/')"
          class="ek-cascade__item ek-cascade__item--result"
          role="option"
          :aria-selected="m.ids.join('/') === path.join('/')"
          :class="{ 'is-chosen': m.ids.join('/') === path.join('/') }"
          :tabindex="mi === 0 ? 0 : -1"
          :data-result="mi"
          @click="pickPath(m.ids)"
        >
          <v-icon class="ek-cascade__item-icon" icon="mdi-tag-outline" aria-hidden="true" />
          <span class="ek-cascade__item-label">
            <span class="ek-cascade__result-name">
              <template v-for="(part, pi) in highlight(m.labels[m.labels.length - 1])" :key="pi">
                <mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
              </template>
            </span>
            <span class="ek-cascade__result-path">{{ m.labels.slice(0, -1).join(' › ') }}</span>
          </span>
        </li>
      </ul>
      <p v-else class="ek-cascade__none" role="status">"{{ query }}" ile eşleşen kategori yok — farklı bir kelime deneyin.</p>
    </div>

    <footer class="ek-cascade__foot">
      <nav class="ek-cascade__crumbs" aria-label="Seçili yol">
        <template v-if="pathLabels.length">
          <template v-for="(label, i) in pathLabels" :key="i">
            <v-icon v-if="i > 0" icon="mdi-chevron-right" aria-hidden="true" />
            <span :class="{ 'is-leaf': i === pathLabels.length - 1 && leafChosen }">{{ label }}</span>
          </template>
        </template>
        <span v-else class="ek-cascade__crumbs-empty">Henüz seçim yok</span>
      </nav>
      <slot name="actions" :leaf-chosen="leafChosen" :path="path" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'

export interface EkCascadeNode {
  id: string
  label: string
  icon?: string
  count?: number
  children?: EkCascadeNode[]
}

const props = withDefaults(
  defineProps<{
    nodes: EkCascadeNode[]
    title: string
    subtitle?: string
    icon?: string
    rootLabel?: string
    modelValue?: string[]
    searchPlaceholder?: string
    closable?: boolean
    embedded?: boolean
    selectableBranches?: boolean
  }>(),
  {
    icon: 'mdi-file-tree-outline',
    rootLabel: 'Tümü',
    modelValue: () => [],
    searchPlaceholder: 'Kategori ara…',
    closable: false,
    embedded: false,
    selectableBranches: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [path: string[]]; select: [path: string[]]; close: [] }>()

const titleId = `ek-cascade-${useId()}`
const query = ref('')
const path = ref<string[]>([...props.modelValue])
const focusCol = ref(0)
const columnsRef = ref<HTMLElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)

watch(
  () => props.modelValue,
  (v) => (path.value = [...v]),
)

function nodeAt(ids: string[]): EkCascadeNode[] {
  const out: EkCascadeNode[] = []
  let level = props.nodes
  for (const id of ids) {
    const n = level.find((x) => x.id === id)
    if (!n) break
    out.push(n)
    level = n.children ?? []
  }
  return out
}

const pathNodes = computed(() => nodeAt(path.value))
const pathLabels = computed(() => pathNodes.value.map((n) => n.label))
const leafChosen = computed(() => {
  const last = pathNodes.value[pathNodes.value.length - 1]
  return !!last && (props.selectableBranches || !last.children?.length)
})

const columns = computed(() => {
  const cols = [{ parentId: undefined as string | undefined, label: props.rootLabel, nodes: props.nodes }]
  for (const n of pathNodes.value) {
    if (n.children?.length) cols.push({ parentId: n.id, label: n.label, nodes: n.children })
  }
  return cols
})

function choose(ci: number, node: EkCascadeNode) {
  path.value = [...path.value.slice(0, ci), node.id]
  focusCol.value = ci
  emit('update:modelValue', path.value)
  if (!node.children?.length || props.selectableBranches) emit('select', path.value)
  // yeni açılan kolon görünür olsun (dar ekranda şerit yatay kayar)
  nextTick(() => {
    const el = columnsRef.value
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'auto' })
  })
}

function pickPath(ids: string[]) {
  path.value = ids
  query.value = ''
  emit('update:modelValue', ids)
  emit('select', ids)
}

const matches = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('tr-TR')
  const out: Array<{ ids: string[]; labels: string[] }> = []
  const walk = (nodes: EkCascadeNode[], ids: string[], labels: string[]) => {
    for (const n of nodes) {
      const nextIds = [...ids, n.id]
      const nextLabels = [...labels, n.label]
      const hit = n.label.toLocaleLowerCase('tr-TR').includes(q)
      if (n.children?.length) {
        if (props.selectableBranches && hit) out.push({ ids: nextIds, labels: nextLabels })
        walk(n.children, nextIds, nextLabels)
      } else if (hit) out.push({ ids: nextIds, labels: nextLabels })
    }
  }
  if (q) walk(props.nodes, [], [])
  return out.slice(0, 50)
})

function focusItem(ci: number, id: string | undefined) {
  if (!id) return
  focusCol.value = ci
  nextTick(() => columnsRef.value?.querySelector<HTMLElement>(`[data-col="${ci}"][data-id="${CSS.escape(id)}"]`)?.focus())
}

/** Sonuç adında aranan parçayı `<mark>` ile vurgulamak için böler (tr-TR harf duyarsız). */
function highlight(label: string): Array<{ text: string; hit: boolean }> {
  const q = query.value.trim().toLocaleLowerCase('tr-TR')
  const at = q ? label.toLocaleLowerCase('tr-TR').indexOf(q) : -1
  if (at < 0) return [{ text: label, hit: false }]
  return [
    { text: label.slice(0, at), hit: false },
    { text: label.slice(at, at + q.length), hit: true },
    { text: label.slice(at + q.length), hit: false },
  ].filter((p) => p.text)
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && query.value) {
    event.preventDefault()
    event.stopPropagation()
    query.value = ''
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (query.value.trim()) focusResult(0)
    else {
      const ci = Math.max(0, Math.min(path.value.length, columns.value.length) - 1)
      focusItem(ci, path.value[ci] ?? columns.value[ci]?.nodes[0]?.id)
    }
  } else if (event.key === 'Enter' && matches.value.length === 1) {
    event.preventDefault()
    pickPath(matches.value[0].ids)
  }
}

function focusResult(index: number) {
  nextTick(() => resultsRef.value?.querySelector<HTMLElement>(`[data-result="${index}"]`)?.focus())
}

function onResultsKeydown(event: KeyboardEvent) {
  const index = Number((event.target as HTMLElement).dataset.result)
  if (Number.isNaN(index)) return
  const count = matches.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    focusResult((index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    focusResult(event.key === 'Home' ? 0 : count - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    pickPath(matches.value[index].ids)
  }
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  const ci = Number(target.dataset.col)
  const id = target.dataset.id
  if (Number.isNaN(ci) || !id) return
  const col = columns.value[ci]
  const index = col.nodes.findIndex((n) => n.id === id)
  const node = col.nodes[index]
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const next = col.nodes[(index + (event.key === 'ArrowDown' ? 1 : -1) + col.nodes.length) % col.nodes.length]
    choose(ci, next)
    focusItem(ci, next.id)
  } else if (event.key === 'ArrowRight' && node.children?.length) {
    event.preventDefault()
    choose(ci, node)
    focusItem(ci + 1, node.children[0].id)
  } else if (event.key === 'ArrowLeft' && ci > 0) {
    event.preventDefault()
    focusItem(ci - 1, path.value[ci - 1])
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    choose(ci, node)
  }
}
</script>

<style scoped>
.ek-cascade {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-dialog);
  box-shadow: var(--ek-shadow-dialog);
}

.ek-cascade__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-5);
  background: var(--ek-gradient-chrome);
  color: var(--ek-color-chrome-text);
}

.ek-cascade__head-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-chrome-raised);
  font-size: var(--ek-icon-md);
}

.ek-cascade__titles {
  flex: 1;
  min-width: 0;
}

.ek-cascade__title {
  margin: 0;
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-cascade__subtitle {
  margin: 0;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-cascade__search {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: min(280px, 40%);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-icon-sm);
}

.ek-cascade__search:focus-within {
  border-color: var(--ek-color-surface);
  background: var(--ek-color-surface);
  color: var(--ek-color-action);
}

.ek-cascade__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ek-color-chrome-text);
  font-family: inherit;
  font-size: var(--ek-type-body-size);
}

.ek-cascade__search:focus-within input {
  color: var(--ek-color-content-strong);
}

.ek-cascade__search input::placeholder {
  color: var(--ek-color-chrome-text-muted);
  opacity: 1;
}

.ek-cascade__search:focus-within input::placeholder {
  color: var(--ek-color-content-muted);
}

.ek-cascade__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-icon-sm);
  cursor: pointer;
}

.ek-cascade__close:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: 1px;
}

.ek-cascade__columns {
  display: flex;
  flex: 1;
  min-height: 280px;
  overflow-x: auto;
  background: var(--ek-color-surface-muted);
}

.ek-cascade__col {
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
}

.ek-cascade__col.is-last {
  flex: 1 0 260px;
  border-right: 0;
}

.ek-cascade__col-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 36px;
  padding: 0 var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-cascade__col-head :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-cascade__col-head span:nth-of-type(1) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-cascade__col-count {
  color: var(--ek-color-content-muted);
  font-variant-numeric: tabular-nums;
}

.ek-cascade__list {
  flex: 1;
  margin: 0;
  padding: var(--ek-space-2);
  overflow-y: auto;
  list-style: none;
}

.ek-cascade__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: var(--ek-control-h-md);
  padding: var(--ek-space-1) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-cascade__item + .ek-cascade__item {
  margin-top: 2px;
}

.ek-cascade__item:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ek-cascade__item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-cascade__item.is-path {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
  box-shadow: var(--ek-selection-ring);
}

.ek-cascade__item-icon {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-cascade__item.is-path .ek-cascade__item-icon {
  color: var(--ek-color-action);
}

.ek-cascade__item-label {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ek-cascade__item-count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-variant-numeric: tabular-nums;
}

.ek-cascade__item-end {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-cascade__item-end.is-check,
.ek-cascade__item.is-path .ek-cascade__item-end {
  color: var(--ek-color-action);
}

.ek-cascade__leaf-dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-success);
}

.ek-cascade__results {
  flex: 1;
  min-height: 280px;
  overflow-y: auto;
  background: var(--ek-color-surface);
}

.ek-cascade__result-name mark {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--ek-color-highlight);
  color: inherit;
}

.ek-cascade__results-head {
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-5) 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-cascade__result-name {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-cascade__result-path {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-cascade__none {
  margin: 0;
  padding: var(--ek-space-6) var(--ek-space-5);
  color: var(--ek-color-content-muted);
}

.ek-cascade__foot {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 56px;
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-2) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-cascade__crumbs {
  display: flex;
  align-items: center;
  flex: 1;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-cascade__crumbs :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-cascade__crumbs .is-leaf {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-cascade__crumbs-empty {
  font-style: italic;
}

/* Sayfa içine gömülü (diyalog değil): nötr başlık bandı, kart gölgesi. */
.ek-cascade--embedded {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
}

.ek-cascade--embedded .ek-cascade__head {
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-strong);
}

.ek-cascade--embedded .ek-cascade__head-icon {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.ek-cascade--embedded .ek-cascade__subtitle {
  color: var(--ek-color-content-muted);
}

.ek-cascade--embedded .ek-cascade__search {
  border-color: var(--ek-color-border-input);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.ek-cascade--embedded .ek-cascade__search:focus-within {
  border-color: var(--ek-color-border-focus);
  box-shadow: var(--ek-focus-ring);
}

.ek-cascade--embedded .ek-cascade__search input {
  color: var(--ek-color-content-strong);
}

.ek-cascade--embedded .ek-cascade__search input::placeholder {
  color: var(--ek-color-content-muted);
}

.ek-cascade--embedded .ek-cascade__close {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
}

@media (max-width: 767px) {
  .ek-cascade__head {
    flex-wrap: wrap;
  }

  .ek-cascade__search {
    order: 3;
    width: 100%;
  }

  .ek-cascade__col {
    flex-basis: 220px;
  }
}
</style>
