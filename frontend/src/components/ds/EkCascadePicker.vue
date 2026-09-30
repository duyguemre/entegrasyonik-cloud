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
  Aşama 2 eklemeleri (geri uyumlu): arama kutusunda ↓ ilk kolona/ilk sonuca
  iner; sonuç listesinde ↑/↓ gezinir, Enter seçer, Esc aramayı temizler.
  `embedded`: kimlik degradesi yerine nötr başlık bandı (sayfa içine gömülü
  kullanım; diyalog değil). `selectableBranches`: yaprak olmayan düğüm de seçilebilir.
  Veri çağırandan gelir (sunum bileşeni); `select` seçilen yolun id dizisini yayar.

  Faz 3 A9 — seviye geçişleri (mantık: `cascadeMotion.ts`, DS §4 hareket token'ları; yalnız transform + opacity):
    - Klasör seçilince sağdaki yeni seviye opaklık + `--ek-motion-distance-md` yatay kayma ile açılır
      (`--ek-duration-base`, `--ek-easing-enter`). Kolonlar SABİT 260px; sağdaki "kuyruk" paneli yeni kolonun
      yerini FLIP ile (yalnız transform) boşaltır → genişlik zıplaması / layout thrash yok.
    - Üst seviye değişince alt seviyeler derinden sığa SIRAYLA kapanır (`--ek-duration-fast`, adım fast/3,
      en fazla 2 adım), yeni seviye kapanışlar bitince açılır; toplam ≤ slow token. Geri gidişte ters yön.
    - Yaprak seçilince son seviye "Seçildi" onay durumu (kolon başlığı rozeti + kuyrukta onay kartı).
    - Dar alan (< 640px, ör. 390px telefon): kolonlar yerine ileri/geri kayan TEK panel + seviye yolu
      (breadcrumb, geri düğmesi); ileri = sağdan, geri = soldan.
    - `loadChildren` + `node.lazy`: alt seviye yüklenirken iskelet satırları, yüklenince aynı dilde çapraz geçiş.
    - `prefers-reduced-motion` veya `<html data-motion="reduced">` → anında (token'lar 0 / `is-static`).
    - Klavye: ↑/↓ Home/End kolon içinde; → / Enter klasörü açar ve odağı yeni seviyenin ilk öğesine taşır;
      ← / Backspace üst seviye; Enter yaprağı seçer. aria-live: "2. seviye: Moda, 3 öğe" / "Seçildi: …".
-->
<template>
  <div ref="rootRef" class="ek-cascade" :class="{ 'ek-cascade--embedded': embedded, 'is-compact': compact }" role="group" :aria-labelledby="titleId">
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

    <div
      v-if="!query.trim()"
      class="ek-cascade__columns"
      :class="[`is-dir-${direction}`, { 'is-static': !motionOn }]"
      :data-open-step="openStep"
      @keydown="onKeydown"
    >
      <nav v-if="compact" class="ek-cascade__trail" aria-label="Seviye yolu">
        <button
          v-if="viewCol > 0"
          type="button"
          class="ek-cascade__back"
          :aria-label="`Geri: ${columns[viewCol - 1]?.label}`"
          @click="goToLevel(viewCol - 1, true)"
        >
          <v-icon icon="mdi-arrow-left" aria-hidden="true" />
        </button>
        <ol class="ek-cascade__trail-list">
          <li v-for="(col, i) in columns.slice(0, viewCol + 1)" :key="col.key" class="ek-cascade__trail-item">
            <v-icon v-if="i > 0" icon="mdi-chevron-right" aria-hidden="true" />
            <button v-if="i < viewCol" type="button" class="ek-cascade__trail-link" @click="goToLevel(i, true)">{{ col.label }}</button>
            <span v-else class="ek-cascade__trail-current" aria-current="location">{{ col.label }}</span>
          </li>
        </ol>
        <Transition name="ek-cascade-fade" mode="out-in">
          <span v-if="columns[viewCol]?.complete" key="done" class="ek-cascade__col-done"><v-icon icon="mdi-check-circle" aria-hidden="true" />Seçildi</span>
          <span v-else :key="`n-${viewCol}`" class="ek-cascade__col-count">{{ columns[viewCol]?.loading ? '…' : columns[viewCol]?.nodes.length }}</span>
        </Transition>
      </nav>

      <div ref="trackRef" class="ek-cascade__track">
        <TransitionGroup name="ek-cascade-col" @before-leave="pinLeaving">
          <div
            v-for="col in visibleColumns"
            :key="col.key"
            class="ek-cascade__col"
            :class="{ 'is-last': col.index === columns.length - 1, 'is-complete': col.complete }"
            :data-level="col.index + 1"
          >
            <div class="ek-cascade__col-head">
              <v-icon :icon="col.index === 0 ? 'mdi-sitemap-outline' : 'mdi-folder-open-outline'" aria-hidden="true" />
              <span class="ek-cascade__col-label">{{ col.label }}</span>
              <Transition name="ek-cascade-fade">
                <span v-if="col.complete" class="ek-cascade__col-done"><v-icon icon="mdi-check-circle" aria-hidden="true" />Seçildi</span>
              </Transition>
              <span class="ek-cascade__col-count">{{ col.loading ? '…' : col.nodes.length }}</span>
            </div>
            <div class="ek-cascade__col-body">
              <Transition name="ek-cascade-swap">
                <ul v-if="col.loading" key="skeleton" class="ek-cascade__list ek-cascade__skeleton" aria-hidden="true">
                  <li v-for="n in 6" :key="n" class="ek-cascade__sk-row" :data-sk="n % 3">
                    <span class="ek-cascade__sk-icon"></span>
                    <span class="ek-cascade__sk-bar"></span>
                  </li>
                </ul>
                <div v-else-if="col.error" key="error" class="ek-cascade__col-error" role="alert">
                  <span>{{ col.error }}</span>
                  <button type="button" class="ek-cascade__retry" @click="retry(col)">Tekrar dene</button>
                </div>
                <ul v-else key="list" class="ek-cascade__list" role="listbox" :aria-label="col.label">
                  <li
                    v-for="node in col.nodes"
                    :key="node.id"
                    class="ek-cascade__item"
                    :class="{
                      'is-path': path[col.index] === node.id,
                      'is-leaf': !branch(node),
                      'is-chosen': !branch(node) && path[col.index] === node.id,
                    }"
                    role="option"
                    :aria-selected="path[col.index] === node.id"
                    :tabindex="focusCol === col.index && (path[col.index] ?? col.nodes[0]?.id) === node.id ? 0 : -1"
                    :data-col="col.index"
                    :data-id="node.id"
                    @click="onItemClick(col.index, node)"
                  >
                    <v-icon
                      class="ek-cascade__item-icon"
                      :icon="branch(node) ? (path[col.index] === node.id ? 'mdi-folder-open-outline' : 'mdi-folder-outline') : (node.icon ?? 'mdi-tag-outline')"
                      aria-hidden="true"
                    />
                    <span class="ek-cascade__item-label">{{ node.label }}</span>
                    <span v-if="node.count !== undefined" class="ek-cascade__item-count">{{ node.count }}</span>
                    <v-icon v-if="branch(node)" class="ek-cascade__item-end" icon="mdi-chevron-right" aria-hidden="true" />
                    <v-icon v-else-if="path[col.index] === node.id" class="ek-cascade__item-end is-check" icon="mdi-check-circle" aria-hidden="true" />
                    <span v-else class="ek-cascade__leaf-dot" aria-hidden="true"></span>
                  </li>
                </ul>
              </Transition>
            </div>
          </div>
          <div v-if="!compact" key="__tail" class="ek-cascade__tail">
            <Transition name="ek-cascade-swap">
              <div v-if="leafChosen" :key="`done-${path.join('/')}`" class="ek-cascade__tail-card is-done">
                <span class="ek-cascade__tail-icon"><v-icon icon="mdi-check-circle" aria-hidden="true" /></span>
                <span class="ek-cascade__tail-micro">Seçildi</span>
                <strong class="ek-cascade__tail-title">{{ pathLabels[pathLabels.length - 1] }}</strong>
                <span v-if="pathLabels.length > 1" class="ek-cascade__tail-path">{{ pathLabels.slice(0, -1).join(' › ') }}</span>
              </div>
              <div v-else :key="`hint-${columns.length}`" class="ek-cascade__tail-card">
                <span class="ek-cascade__tail-icon"><v-icon icon="mdi-arrow-left" aria-hidden="true" /></span>
                <span class="ek-cascade__tail-text">{{ tailHint }}</span>
              </div>
            </Transition>
          </div>
        </TransitionGroup>
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

    <p class="ek-sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</p>

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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import {
  cascadeKeyAction,
  closingStep,
  columnKeys,
  isBranch,
  levelAnnouncement,
  motionEnabled,
  openingStep,
  panelDirection,
  planLevels,
  readMotionPreference,
  ROOT_COLUMN,
  type CascadeDirection,
  type CascadeLevelPlan,
} from './cascadeMotion'

export interface EkCascadeNode {
  id: string
  label: string
  icon?: string
  count?: number
  children?: EkCascadeNode[]
  /** Alt seviyesi `loadChildren` ile sonradan yüklenecek klasör. */
  lazy?: boolean
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
    /** `lazy` düğümün alt seviyesini getirir (yüklenirken iskelet). */
    loadChildren?: (node: EkCascadeNode) => Promise<EkCascadeNode[]>
  }>(),
  {
    icon: 'mdi-file-tree-outline',
    rootLabel: 'Tümü',
    modelValue: () => [],
    searchPlaceholder: 'Kategori ara…',
    closable: false,
    embedded: false,
    selectableBranches: false,
    loadChildren: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [path: string[]]; select: [path: string[]]; close: [] }>()

/** Tek panel (breadcrumb) düzenine geçiş eşiği — bileşenin KENDİ genişliği (diyalog/sayfa fark etmez). */
const COMPACT_BELOW = 640

const titleId = `ek-cascade-${useId()}`
const query = ref('')
const path = ref<string[]>([...props.modelValue])
const focusCol = ref(0)
const rootRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)

const loaded = reactive(new Map<string, EkCascadeNode[]>())
const loading = reactive(new Set<string>())
const failed = reactive(new Map<string, string>())

const compact = ref(false)
const viewCol = ref(0)
const direction = ref<CascadeDirection>('none')
const plan = ref<CascadeLevelPlan>(planLevels([], []))
const openStep = computed(() => (direction.value === 'replace' ? openingStep(plan.value) : 0))
const motionOn = ref(true)
const announcement = ref('')
/** Yüklenmesi beklenen seviyeye odak taşınacak mı (klavye ile açıldıysa). */
const pendingFocus = ref<string | null>(null)

function childrenOf(node: EkCascadeNode): EkCascadeNode[] {
  return node.children?.length ? node.children : loaded.get(node.id) ?? []
}

function branch(node: EkCascadeNode): boolean {
  return isBranch(node, loaded)
}

function nodeAt(ids: string[]): EkCascadeNode[] {
  const out: EkCascadeNode[] = []
  let level = props.nodes
  for (const id of ids) {
    const n = level.find((x) => x.id === id)
    if (!n) break
    out.push(n)
    level = childrenOf(n)
  }
  return out
}

const pathNodes = computed(() => nodeAt(path.value))
const pathLabels = computed(() => pathNodes.value.map((n) => n.label))
const leafChosen = computed(() => {
  const last = pathNodes.value[pathNodes.value.length - 1]
  return !!last && (props.selectableBranches || !branch(last))
})

interface CascadeColumn {
  key: string
  index: number
  label: string
  nodes: EkCascadeNode[]
  loading: boolean
  error?: string
  parent?: EkCascadeNode
  complete: boolean
}

const columns = computed<CascadeColumn[]>(() => {
  const cols: CascadeColumn[] = [{ key: ROOT_COLUMN, index: 0, label: props.rootLabel, nodes: props.nodes, loading: false, complete: false }]
  for (const n of pathNodes.value) {
    if (!branch(n)) break
    cols.push({
      key: n.id,
      index: cols.length,
      label: n.label,
      nodes: childrenOf(n),
      loading: loading.has(n.id),
      error: failed.get(n.id),
      parent: n,
      complete: false,
    })
  }
  // Yaprak seçildiyse onu içeren (son) kolon "Seçildi" onay durumunda.
  if (leafChosen.value && !branch(pathNodes.value[pathNodes.value.length - 1])) cols[cols.length - 1].complete = true
  return cols
})

const visibleColumns = computed(() => (compact.value ? columns.value.slice(viewCol.value, viewCol.value + 1) : columns.value))

const tailHint = computed(() => {
  if (columns.value.length === 1) return `${props.rootLabel} listesinden seçin — alt kategoriler burada açılır`
  return `“${columns.value[columns.value.length - 1].label}” altından bir kategori seçin`
})

function motionNow(): boolean {
  if (typeof window === 'undefined') return true
  const system = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return motionEnabled(system, readMotionPreference(document.documentElement))
}

/** Yol değişimini uygular: önce geçiş planı/yönü (DOM yaması aynı tick'te bu sınıflarla yapılır), sonra yol. */
function applyPath(next: string[]) {
  const prevKeys = columns.value.map((c) => c.key)
  const nextKeys = columnKeys(props.nodes, next, loaded)
  motionOn.value = motionNow()
  const p = planLevels(prevKeys, nextKeys)
  plan.value = p
  const prevView = viewCol.value
  const nextView = nextKeys.length - 1
  direction.value = compact.value ? panelDirection(prevView, nextView) : p.direction
  path.value = next
  viewCol.value = nextView
}

function goToLevel(index: number, focus = false) {
  const target = Math.max(0, Math.min(index, columns.value.length - 1))
  motionOn.value = motionNow()
  direction.value = panelDirection(viewCol.value, target)
  viewCol.value = target
  if (focus) focusItem(target, path.value[target] ?? columns.value[target]?.nodes[0]?.id)
}

watch(
  () => props.modelValue,
  (v) => {
    if (v.join('/') !== path.value.join('/')) applyPath([...v])
  },
)

/** Kapanan kolonu bulunduğu yerde sabitler (akıştan çıkar) → kalanlar/kuyruk FLIP ile kayar, genişlik zıplamaz. */
function pinLeaving(el: Element) {
  const node = el as HTMLElement
  if (!node.classList?.contains('ek-cascade__col')) return
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = node
  node.style.position = 'absolute'
  node.style.left = `${offsetLeft}px`
  node.style.top = `${offsetTop}px`
  node.style.width = `${offsetWidth}px`
  node.style.height = `${offsetHeight}px`
  // Derindeki önce kapanır: kolonun ÖNCEKİ listedeki anahtarı → plandaki kapanış adımı (tek panelde adım yok).
  const previous = [...plan.value.kept, ...[...plan.value.closing].reverse()]
  const key = previous[Number(node.dataset.level) - 1]
  node.dataset.closeStep = String(!compact.value && key ? closingStep(plan.value, key) : 0)
}

async function ensureChildren(node: EkCascadeNode) {
  if (!node.lazy || node.children?.length || loaded.has(node.id) || loading.has(node.id) || !props.loadChildren) return
  loading.add(node.id)
  failed.delete(node.id)
  try {
    const kids = await props.loadChildren(node)
    loaded.set(node.id, kids)
  } catch {
    failed.set(node.id, 'Alt kategoriler yüklenemedi.')
  } finally {
    loading.delete(node.id)
  }
  const ci = columns.value.findIndex((c) => c.key === node.id)
  if (ci < 0) return
  const col = columns.value[ci]
  if (pendingFocus.value === node.id) {
    pendingFocus.value = null
    focusItem(ci, col.nodes[0]?.id)
  }
  if (!col.error && path.value[ci - 1] === node.id) announce(levelAnnouncement({ depth: ci + 1, label: col.label, count: col.nodes.length }))
}

function retry(col: CascadeColumn) {
  if (col.parent) void ensureChildren(col.parent)
}

function announce(text: string) {
  announcement.value = ''
  nextTick(() => (announcement.value = text))
}

function choose(ci: number, node: EkCascadeNode, opts: { announce?: boolean } = {}) {
  const already = path.value[ci] === node.id
  const next = already && branch(node) ? path.value : [...path.value.slice(0, ci), node.id]
  applyPath(next)
  focusCol.value = ci
  emit('update:modelValue', path.value)
  if (!branch(node) || props.selectableBranches) emit('select', path.value)
  if (branch(node)) void ensureChildren(node)
  if (opts.announce) {
    if (!branch(node)) announce(levelAnnouncement({ depth: ci + 1, label: node.label, chosenPath: pathLabels.value }))
    else if (loading.has(node.id)) announce(levelAnnouncement({ depth: ci + 2, label: node.label, loading: true }))
    else announce(levelAnnouncement({ depth: ci + 2, label: node.label, count: childrenOf(node).length }))
  }
  // yeni açılan kolon görünür olsun (masaüstünde şerit taşarsa yatay kayar)
  nextTick(() => {
    const el = trackRef.value
    if (el && !compact.value) el.scrollTo?.({ left: el.scrollWidth, behavior: motionOn.value ? 'smooth' : 'auto' })
  })
}

function onItemClick(ci: number, node: EkCascadeNode) {
  choose(ci, node, { announce: true })
}

function pickPath(ids: string[]) {
  applyPath(ids)
  query.value = ''
  emit('update:modelValue', ids)
  emit('select', ids)
  announce(levelAnnouncement({ depth: ids.length, label: '', chosenPath: pathLabels.value }))
}

const matches = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('tr-TR')
  const out: Array<{ ids: string[]; labels: string[] }> = []
  const walk = (nodes: EkCascadeNode[], ids: string[], labels: string[]) => {
    for (const n of nodes) {
      const nextIds = [...ids, n.id]
      const nextLabels = [...labels, n.label]
      const hit = n.label.toLocaleLowerCase('tr-TR').includes(q)
      const kids = childrenOf(n)
      if (kids.length) {
        if (props.selectableBranches && hit) out.push({ ids: nextIds, labels: nextLabels })
        walk(kids, nextIds, nextLabels)
      } else if (hit && !n.lazy) out.push({ ids: nextIds, labels: nextLabels })
    }
  }
  if (q) walk(props.nodes, [], [])
  return out.slice(0, 50)
})

function focusItem(ci: number, id: string | undefined) {
  if (!id) return
  focusCol.value = ci
  nextTick(() => rootRef.value?.querySelector<HTMLElement>(`.ek-cascade__track [data-col="${ci}"][data-id="${CSS.escape(id)}"]`)?.focus())
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
      const ci = compact.value ? viewCol.value : Math.max(0, Math.min(path.value.length, columns.value.length) - 1)
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
  if (!col) return
  const index = col.nodes.findIndex((n) => n.id === id)
  const node = col.nodes[index]
  const action = cascadeKeyAction(event.key, { col: ci, index, count: col.nodes.length, branch: branch(node) })
  if (!action) return
  event.preventDefault()
  if (action.type === 'move') {
    // seçim odağı izler (Miller kolonları); klasörlerde alt seviye sessizce yenilenir (duyuru yok)
    const next = col.nodes[action.index]
    choose(ci, next)
    focusItem(ci, next.id)
  } else if (action.type === 'open') {
    const already = path.value[ci] === node.id
    choose(ci, node, { announce: true })
    const kids = childrenOf(node)
    if (loading.has(node.id) || (!kids.length && node.lazy)) pendingFocus.value = node.id
    // zaten açık bir seviyeye dönülüyorsa oradaki seçili öğe, yeni açıldıysa İLK öğe
    else focusItem(ci + 1, (already ? path.value[ci + 1] : undefined) ?? kids[0]?.id)
  } else if (action.type === 'pick') {
    choose(ci, node, { announce: true })
  } else if (action.type === 'up') {
    if (compact.value) goToLevel(ci - 1)
    focusItem(ci - 1, path.value[ci - 1])
  }
}

let resizeObserver: ResizeObserver | undefined
let motionQuery: MediaQueryList | undefined
const onMotionChange = () => (motionOn.value = motionNow())

function measure(width: number) {
  const next = width > 0 && width < COMPACT_BELOW
  if (next !== compact.value) {
    direction.value = 'none'
    compact.value = next
    viewCol.value = columns.value.length - 1
  }
}

onMounted(() => {
  motionOn.value = motionNow()
  viewCol.value = columns.value.length - 1
  const el = rootRef.value
  if (el) {
    measure(el.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0))
      resizeObserver.observe(el)
    }
  }
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  motionQuery?.addEventListener?.('change', onMotionChange)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  motionQuery?.removeEventListener?.('change', onMotionChange)
})
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
  flex-direction: column;
  min-height: 280px;
  background: var(--ek-color-surface-muted);
}

/* Kolon şeridi: kapanan kolonlar burada `position:absolute` ile sabitlenir (pinLeaving). */
.ek-cascade__track {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.ek-cascade__col {
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
}

.ek-cascade__col-body {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

/* Kuyruk: son kolonun sağındaki boşluk (ipucu / onay kartı). Genişliği esner; yeni kolon eklenince
   FLIP (`ek-cascade-col-move`, yalnız transform) ile kayar → hiçbir kolonun genişliği değişmez. */
.ek-cascade__tail {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  container-type: inline-size;
}

.ek-cascade__tail-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-1);
  max-width: 320px;
  margin: var(--ek-space-6) var(--ek-space-5);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-cascade__tail-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  margin-bottom: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.ek-cascade__tail-card.is-done .ek-cascade__tail-icon {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success);
}

.ek-cascade__tail-micro {
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-cascade__tail-title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

@container (max-width: 180px) {
  .ek-cascade__tail-card {
    display: none;
  }
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

.ek-cascade__col-label {
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

/* ---- A9: yeni seviye / geri / yenile geçişleri (yalnız transform + opacity; DS hareket token'ları) ----
   Yön değişkenleri: ileri = yeni seviye SAĞDAN gelir; geri = kapanan seviye geldiği yöne (sağa) döner;
   yenile (üst seviye değişti) = eski alt seviyeler sırayla söner, yeni seviye sonra sağdan gelir. */
.ek-cascade__columns.is-dir-forward,
.ek-cascade__columns.is-dir-replace,
.ek-cascade__columns.is-dir-none {
  --ek-cascade-enter-x: var(--ek-motion-distance-md);
  --ek-cascade-leave-x: var(--ek-motion-distance-sm);
}

.ek-cascade__columns.is-dir-back {
  --ek-cascade-enter-x: calc(-1 * var(--ek-motion-distance-md));
  --ek-cascade-leave-x: var(--ek-motion-distance-md);
}

/* Tek panelde ileri: eski panel sola çekilir (sayfa çevirme hissi, ters yön geri). */
.is-compact .ek-cascade__columns.is-dir-forward {
  --ek-cascade-leave-x: calc(-1 * var(--ek-motion-distance-md));
}

/* Sıralı adım = fast / 3; en fazla 2 adım (cascadeMotion.MAX_STAGGER_STEPS) → toplam ≤ --ek-duration-slow. */
.ek-cascade__columns[data-open-step='1'] {
  --ek-cascade-open-step: 1;
}

.ek-cascade__columns[data-open-step='2'] {
  --ek-cascade-open-step: 2;
}

.ek-cascade__col[data-close-step='1'] {
  --ek-cascade-close-step: 1;
}

.ek-cascade__col[data-close-step='2'] {
  --ek-cascade-close-step: 2;
}

.ek-cascade-col-enter-active {
  transition:
    opacity var(--ek-duration-base) var(--ek-easing-enter),
    transform var(--ek-duration-base) var(--ek-easing-enter);
  transition-delay: calc(var(--ek-cascade-open-step, 0) * var(--ek-duration-fast) / 3);
}

.ek-cascade-col-leave-active {
  z-index: 1;
  pointer-events: none;
  transition:
    opacity var(--ek-duration-fast) var(--ek-easing-standard),
    transform var(--ek-duration-fast) var(--ek-easing-standard);
  transition-delay: calc(var(--ek-cascade-close-step, 0) * var(--ek-duration-fast) / 3);
}

.ek-cascade-col-enter-from {
  opacity: 0;
  transform: translateX(var(--ek-cascade-enter-x));
}

.ek-cascade-col-leave-to {
  opacity: 0;
  transform: translateX(var(--ek-cascade-leave-x));
}

/* Kuyruk ve kalan kolonlar yeni yerlerine FLIP ile kayar (genişlik/sol animasyonu yok). */
.ek-cascade-col-move {
  transition: transform var(--ek-duration-base) var(--ek-easing-standard);
}

/* İçerik değişimi (iskelet → liste, ipucu → onay kartı): çapraz geçiş, eski katman akıştan çıkar. */
.ek-cascade-swap-enter-active {
  transition:
    opacity var(--ek-duration-base) var(--ek-easing-enter),
    transform var(--ek-duration-base) var(--ek-easing-enter);
}

.ek-cascade-swap-leave-active {
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-cascade-swap-enter-from {
  opacity: 0;
  transform: translateY(var(--ek-motion-distance-sm));
}

.ek-cascade-swap-leave-to {
  opacity: 0;
}

.ek-cascade-fade-enter-active,
.ek-cascade-fade-leave-active {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-enter);
}

.ek-cascade-fade-enter-from,
.ek-cascade-fade-leave-to {
  opacity: 0;
}

.ek-cascade__item-end.is-check {
  animation: ek-cascade-check-in var(--ek-duration-base) var(--ek-easing-enter);
}

@keyframes ek-cascade-check-in {
  from {
    opacity: 0;
  }
}

/* Uygulama "Hareket: azaltılmış" tercihi (`<html data-motion="reduced">`) — işletim sistemi ayarı zaten
   token'ları 0'a indirir (app.css); burada yalnız bileşen içi geçişler kapatılır. */
.ek-cascade__columns.is-static *,
.ek-cascade__columns.is-static *::before,
.ek-cascade__columns.is-static *::after {
  transition: none !important;
  animation: none !important;
}

/* Yaprak seçildi: son seviyenin başlığında onay rozeti. */
.ek-cascade__col-done {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-success-emphasis);
  letter-spacing: normal;
  text-transform: none;
}

.ek-cascade__col.is-complete .ek-cascade__col-head {
  background: var(--ek-color-success-subtle);
}

/* İskelet: sabit (sonsuz animasyon yok), liste gelince aynı çapraz geçişle yer değiştirir. */
.ek-cascade__sk-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: var(--ek-control-h-md);
  padding: var(--ek-space-1) var(--ek-space-3);
}

.ek-cascade__sk-icon {
  flex: none;
  width: var(--ek-icon-sm);
  height: var(--ek-icon-sm);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
}

.ek-cascade__sk-bar {
  flex: none;
  width: 70%;
  height: 10px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
}

.ek-cascade__sk-row[data-sk='1'] .ek-cascade__sk-bar {
  width: 52%;
}

.ek-cascade__sk-row[data-sk='2'] .ek-cascade__sk-bar {
  width: 61%;
}

.ek-cascade__col-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
}

.ek-cascade__retry {
  padding: 0 var(--ek-space-3);
  height: var(--ek-control-h-sm);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font: inherit;
  cursor: pointer;
}

.ek-cascade__retry:focus-visible,
.ek-cascade__back:focus-visible,
.ek-cascade__trail-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* ---- Dar alan: tek panel + seviye yolu ---- */
.ek-cascade__trail {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 44px;
  padding: var(--ek-space-1) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-cascade__back {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-icon-sm);
  cursor: pointer;
}

.ek-cascade__trail-list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-cascade__trail-item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
  color: var(--ek-color-content-muted);
}

.ek-cascade__trail-item :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-cascade__trail-link {
  padding: 0 var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.ek-cascade__trail-current {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.is-compact .ek-cascade__track {
  overflow: hidden;
}

.is-compact .ek-cascade__col {
  flex: 1 0 100%;
  border-right: 0;
}

.is-compact .ek-cascade__col-head {
  display: none;
}

.ek-cascade__trail .ek-cascade__col-done,
.ek-cascade__trail .ek-cascade__col-count {
  flex: none;
  font-size: var(--ek-type-caption-size);
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
