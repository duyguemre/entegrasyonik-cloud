<!--
  frontend/src/components/catalogPages/BrandCollection.vue

  B7 — Markalar sayfasının koleksiyonu (yalnız BrandListView). İki görünüm, aynı veri:
    ızgara : kart = baş harf avatarı (nötr) + ad + eşleme noktaları / "2/3 platformda eşli"
    liste  : satır = avatar + ad + platform platform eşleme çipi (dar kapta yalnız noktalar)
  `role="listbox"` + dolaşan tabindex: ok tuşları (ızgarada ↑↓ satır atlar), Home/End, Enter/Boşluk seçer, harf = atla.
  Logo alanı backend'de yok → her zaman baş harf avatarı.
-->
<template>
  <div class="brand-col" :class="`is-${view}`">
    <div v-if="adding" class="brand-col__add">
      <CatNameInput label="Yeni marka adı" placeholder="Yeni marka adı" icon="mdi-tag-plus-outline"
        hint="Enter ile kaydedin, Esc ile vazgeçin." :busy="busy" @submit="(v) => emit('add', v)" @cancel="emit('cancel-add')" />
    </div>

    <ul ref="listRef" class="brand-col__items" role="listbox" :aria-label="label" :aria-orientation="view === 'grid' ? undefined : 'vertical'" @keydown="onKey">
      <li
        v-for="(b, i) in items"
        :id="`brand-opt-${b.id}`"
        :key="b.id"
        role="option"
        class="brand-col__item"
        :class="{ 'is-selected': b.id === selectedId }"
        :aria-selected="b.id === selectedId"
        :aria-label="`${b.title}, ${mappingSummary(b.mapping)}`"
        :tabindex="b.id === tabStop ? 0 : -1"
        :data-brand-title="b.title"
        @click="choose(b, i)"
        @focus="focusIndex = i"
      >
        <span class="brand-col__avatar" aria-hidden="true">{{ b.initials }}</span>
        <span class="brand-col__text" aria-hidden="true">
          <span class="brand-col__title">
            <template v-for="(p, k) in highlightParts(b.title, query)" :key="k"><mark v-if="p.match" class="brand-col__mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
          </span>
          <span v-if="view === 'grid'" class="brand-col__sub">
            <CatMappingDots v-if="b.mapping.length" :states="b.mapping" :show-count="false" />
            <span class="brand-col__sub-text" :class="{ 'is-full': b.mapping.length && b.mappedCount === b.mapping.length }">
              {{ mappingShort(b.mapping) }}
            </span>
          </span>
        </span>
        <span v-if="view === 'list'" class="brand-col__maps" aria-hidden="true">
          <span v-for="m in b.mapping" :key="m.code" class="brand-col__chip" :class="[channelClass(m.code), m.mapped ? 'is-on' : 'is-off']">
            <span class="brand-col__chip-dot"></span>{{ m.name }}
          </span>
          <CatMappingDots v-if="b.mapping.length" class="brand-col__dots-narrow" :states="b.mapping" />
        </span>
        <v-icon v-if="view === 'list'" icon="mdi-chevron-right" size="18" class="brand-col__go" aria-hidden="true" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { channelClass } from '@/design/channels'
import CatMappingDots from './CatMappingDots.vue'
import CatNameInput from './CatNameInput.vue'
import { fold, highlightParts, mappingShort, mappingSummary, type BrandItem } from './catalogModel'

const props = defineProps<{
  items: BrandItem[]
  selectedId: string | null
  view: 'grid' | 'list'
  query: string
  adding: boolean
  busy?: boolean
  label: string
}>()
const emit = defineEmits<{ select: [item: BrandItem]; add: [title: string]; 'cancel-add': [] }>()

const listRef = ref<HTMLElement | null>(null)
const focusIndex = ref(-1)
const tabStop = computed(() => {
  if (focusIndex.value >= 0 && props.items[focusIndex.value]) return props.items[focusIndex.value].id
  if (props.selectedId && props.items.some((b) => b.id === props.selectedId)) return props.selectedId
  return props.items[0]?.id ?? null
})

function choose(b: BrandItem, i: number) {
  focusIndex.value = i
  emit('select', b)
}

function focusAt(i: number) {
  const n = props.items.length
  if (!n) return
  const j = Math.max(0, Math.min(n - 1, i))
  focusIndex.value = j
  nextTick(() => {
    const el = document.getElementById(`brand-opt-${props.items[j].id}`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  })
}

/** Izgarada bir satırdaki kart sayısı (ilk satırın üst kenarıyla aynı hizadakiler). */
function columns(): number {
  const els = listRef.value?.querySelectorAll<HTMLElement>('[role="option"]')
  if (!els?.length || props.view !== 'grid') return 1
  const top = els[0].offsetTop
  let c = 0
  for (let k = 0; k < els.length; k++) {
    if (els[k].offsetTop !== top) break
    c++
  }
  return Math.max(1, c)
}

let typeahead = ''
let timer: ReturnType<typeof setTimeout> | undefined

function onKey(e: KeyboardEvent) {
  if (!(e.target as HTMLElement)?.matches?.('[role="option"]')) return
  const i = focusIndex.value < 0 ? 0 : focusIndex.value
  const cols = columns()
  const keys: Record<string, number> = {
    ArrowDown: i + cols,
    ArrowUp: i - cols,
    ArrowRight: i + 1,
    ArrowLeft: i - 1,
    Home: 0,
    End: props.items.length - 1,
  }
  if (props.view === 'list' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return
  if (e.key in keys) {
    e.preventDefault()
    focusAt(keys[e.key])
    return
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const b = props.items[i]
    if (b) emit('select', b)
    return
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
    typeahead += fold(e.key)
    clearTimeout(timer)
    timer = setTimeout(() => (typeahead = ''), 700)
    const order = [...props.items.slice(i + 1), ...props.items.slice(0, i + 1)]
    const hit = order.find((b) => fold(b.title).startsWith(typeahead))
    if (hit) focusAt(props.items.indexOf(hit))
  }
}

defineExpose({ focusFirst: () => focusAt(Math.max(0, props.items.findIndex((b) => b.id === props.selectedId))) })
</script>

<style scoped>
.brand-col {
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.brand-col__add {
  padding: var(--ek-space-3) var(--ek-space-4) 0;
}

.brand-col__items {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4);
  overflow-y: auto;
  list-style: none;
}

.brand-col.is-grid .brand-col__items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
  align-content: start;
  gap: var(--ek-space-3);
}

.brand-col.is-list .brand-col__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-inline: var(--ek-space-2);
}

.brand-col__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-tile);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.brand-col.is-grid .brand-col__item {
  padding: var(--ek-space-3);
  border-color: var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
}

.brand-col.is-grid .brand-col__item:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-sunken);
}

.brand-col.is-list .brand-col__item {
  min-height: 48px;
  padding: var(--ek-space-1) var(--ek-space-2) var(--ek-space-1) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
}

.brand-col.is-list .brand-col__item:hover {
  background: var(--ek-color-surface-sunken);
}

.brand-col__item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.brand-col__item.is-selected {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.brand-col.is-grid .brand-col__item.is-selected:hover {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
}

.brand-col.is-list .brand-col__item.is-selected::before {
  content: '';
  position: absolute;
  inset: 10px auto 10px 0;
  width: 3px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action);
}

/* Baş harf avatarı: nötr (renk anlamı yüklenmez). */
.brand-col__avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.02em;
}

.brand-col.is-list .brand-col__avatar {
  width: 32px;
  height: 32px;
  font-size: var(--ek-type-caption-size);
}

.brand-col__item.is-selected .brand-col__avatar {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
}

.brand-col__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.brand-col__title {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-col__item.is-selected .brand-col__title {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.brand-col__mark {
  padding: 0 1px;
  border-radius: 3px;
  background: var(--ek-color-highlight);
  color: var(--ek-color-content-strong);
}

.brand-col__sub {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
}

.brand-col__sub-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-col__sub .is-full {
  color: var(--ek-color-success-emphasis);
}

.brand-col__maps {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ek-space-1);
}

.brand-col__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 var(--ek-space-2) 0 7px;
  border: 1px solid;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  white-space: nowrap;
}

.brand-col__chip.is-on {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
}

.brand-col__chip.is-off {
  border-color: var(--ek-color-border-default);
  border-style: dashed;
  background: transparent;
  color: var(--ek-color-content-muted);
}

.brand-col__chip-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--ek-radius-chip);
  box-sizing: border-box;
}

.brand-col__chip.is-on .brand-col__chip-dot {
  background: var(--ek-ch-solid);
}

.brand-col__chip.is-off .brand-col__chip-dot {
  border: 1.5px solid var(--ek-color-border-strong);
}

.brand-col__dots-narrow {
  display: none;
}

.brand-col__go {
  flex: none;
  color: var(--ek-color-content-subtle);
}

@container (max-width: 560px) {
  .brand-col__chip {
    display: none;
  }

  .brand-col__dots-narrow {
    display: inline-flex;
  }
}

@container (max-width: 440px) {
  .brand-col.is-grid .brand-col__items {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
