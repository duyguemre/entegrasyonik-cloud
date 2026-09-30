<!--
  frontend/src/components/ds/EkSmartSearch.vue

  DS-v2 — akıllı arama (üst bar). Odaklanınca açılır; sonuçlar GRUPLU:
    grup başlığı: [ikon] Grup adı ................ [n sonuç]
    satır: [avatar/monogram] Eşleşen kısmı VURGULU başlık [tür rozeti]
           anahtar alanlar küçük "ETİKET değer" çipleri ............ [›]
  Alt şerit: ↑↓ gezin · Enter aç · Esc kapat.
  ARIA combobox deseni: input `role=combobox` + `aria-activedescendant`,
  sonuç listesi `role=listbox`, satır `role=option`. Veri çağırandan gelir
  (sunum bileşeni); `select` yayılır. `forceOpen` yalnızca vitrin içindir.
  Ek (geri uyumlu): `openOnFocus` — sorgu boşken de odakta açılır (ör. "Son
  açılanlar" grubu); `emptyText` — sonuç yok metni; öğede `platform` →
  başlık yanında kanal marka renkli nokta (EkPlatformMark `dot`); Esc →
  `dismiss` (çağıran odağı önceki yere döndürebilir).
-->
<template>
  <div ref="rootRef" class="ek-search" :class="{ 'is-open': isOpen, 'is-focused': focused }">
    <div class="ek-search__field">
      <v-icon class="ek-search__icon" :icon="SHELL_ICONS.search" aria-hidden="true" />
      <input
        ref="inputRef"
        :value="modelValue"
        class="ek-search__input"
        type="search"
        role="combobox"
        :placeholder="placeholder"
        :aria-label="label"
        :aria-expanded="isOpen"
        :aria-controls="isOpen && !loading && flat.length ? listId : undefined"
        aria-autocomplete="list"
        :aria-activedescendant="isOpen && !loading && activeId ? activeId : undefined"
        autocomplete="off"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <EkKbd v-if="!modelValue" class="ek-search__hint" :keys="['Ctrl', 'K']" tone="chrome" />
      <button v-else type="button" class="ek-search__clear" aria-label="Aramayı temizle" @mousedown.prevent @click="clear">
        <v-icon icon="mdi-close" aria-hidden="true" />
      </button>
    </div>

    <div v-if="isOpen" class="ek-search__panel">
      <div v-if="loading" class="ek-search__results">
        <div v-for="n in 3" :key="n" class="ek-search__skeleton" aria-hidden="true">
          <span class="ek-search__skeleton-avatar"></span>
          <span class="ek-search__skeleton-lines"><span></span><span></span></span>
        </div>
        <p class="ek-sr-only" role="status">Aranıyor</p>
      </div>
      <div v-else-if="flat.length" :id="listId" class="ek-search__results" role="listbox" :aria-label="`${label} sonuçları`">
        <div v-for="group in visibleGroups" :key="group.key" class="ek-search__group" role="group" :aria-labelledby="`${listId}-${group.key}`">
          <div :id="`${listId}-${group.key}`" class="ek-search__group-head">
            <v-icon v-if="group.icon" :icon="group.icon" aria-hidden="true" />
            <span class="ek-search__group-label">{{ group.label }}</span>
            <span class="ek-search__group-count">{{ group.items.length }} sonuç</span>
          </div>
          <div
            v-for="item in group.items"
            :id="optionId(item)"
            :key="item.id"
            class="ek-search__option"
            :class="{ 'is-active': optionId(item) === activeId }"
            role="option"
            :aria-selected="optionId(item) === activeId"
            @mousedown.prevent
            @mousemove="activeId = optionId(item)"
            @click="choose(item)"
          >
            <span class="ek-search__avatar" :class="`ek-search__avatar--${item.tone ?? 'action'}`" aria-hidden="true">
              <v-icon v-if="item.icon" :icon="outlineIcon(item.icon)" />
              <template v-else>{{ monogram(item.title) }}</template>
            </span>
            <span class="ek-search__option-main">
              <span class="ek-search__option-title">
                <span class="ek-search__option-text"><template v-for="(part, pi) in highlight(item.title)" :key="pi"><mark v-if="part.match" class="ek-search__mark">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
                <EkPlatformMark v-if="item.platform" class="ek-search__platform" variant="dot" :name="item.platform.name" :code="item.platform.code" />
                <EkBadge v-if="item.typeLabel" :tone="item.tone ?? 'action'" :text="item.typeLabel" />
              </span>
              <span v-if="item.meta?.length" class="ek-search__meta">
                <span v-for="m in item.meta" :key="m.label" class="ek-search__meta-chip">
                  <span class="ek-search__meta-label">{{ m.label }}</span>
                  <span class="ek-search__meta-value">{{ m.value }}</span>
                </span>
              </span>
            </span>
            <v-icon class="ek-search__chevron" icon="mdi-chevron-right" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div v-else class="ek-search__results">
        <p class="ek-search__empty" role="status">
          <v-icon icon="mdi-text-search" aria-hidden="true" />
          <span>{{ emptyText ?? `"${modelValue}" için sonuç yok — sipariş no, ürün adı, barkod veya SKU deneyin.` }}</span>
        </p>
      </div>
      <div class="ek-search__footer" aria-hidden="true">
        <span><EkKbd :keys="['↑', '↓']" /> gezin</span>
        <span><EkKbd keys="Enter" /> aç</span>
        <span><EkKbd keys="Esc" /> kapat</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SHELL_ICONS, outlineIcon } from '../icons'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import EkBadge from './EkBadge.vue'
import EkKbd from './EkKbd.vue'
import EkPlatformMark from './EkPlatformMark.vue'

export interface EkSearchItem {
  id: string
  title: string
  typeLabel?: string
  tone?: 'action' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  icon?: string
  meta?: Array<{ label: string; value: string }>
  /** Kanal (pazaryeri/entegrasyon) — başlık yanında marka renkli nokta + ad. */
  platform?: { name: string; code?: string }
}

export interface EkSearchGroup {
  key: string
  label: string
  icon?: string
  items: EkSearchItem[]
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    groups: EkSearchGroup[]
    placeholder?: string
    label?: string
    loading?: boolean
    forceOpen?: boolean
    initialActiveIndex?: number
    openOnFocus?: boolean
    emptyText?: string
  }>(),
  {
    placeholder: 'Sipariş no, ürün, barkod, müşteri ara…',
    label: 'Akıllı arama',
    loading: false,
    forceOpen: false,
    initialActiveIndex: 0,
    openOnFocus: false,
    emptyText: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; select: [item: EkSearchItem]; dismiss: [] }>()

const uid = useId()
const listId = `ek-search-list-${uid}`
const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const activeId = ref('')

/**
 * Açılır, arama alanının ortasına hizalanır ama görünüm alanından TAŞMAZ (dar/orta ekranda alan
 * kenara yakınsa kaydırılır). Konum CSS değişkenleriyle verilir (şablonda satır içi stil yok).
 */
const panelLeft = ref('50%')
const panelWidth = ref('min(560px, calc(100vw - 32px))')
const panelShift = ref('-50%')
const VIEWPORT_GUTTER = 16

function placePanel() {
  const field = rootRef.value?.getBoundingClientRect()
  if (!field || typeof window === 'undefined') return
  const vw = window.innerWidth
  const width = Math.max(field.width, Math.min(560, vw - VIEWPORT_GUTTER * 2))
  const ideal = field.left + field.width / 2 - width / 2
  const left = Math.min(Math.max(ideal, VIEWPORT_GUTTER), vw - VIEWPORT_GUTTER - width)
  panelLeft.value = `${Math.round(left - field.left)}px`
  panelWidth.value = `${Math.round(width)}px`
  panelShift.value = '0px'
}

const visibleGroups = computed(() => props.groups.filter((g) => g.items.length))
const flat = computed(() => visibleGroups.value.flatMap((g) => g.items))
const isOpen = computed(
  () =>
    props.forceOpen ||
    (focused.value &&
      (props.modelValue.trim().length > 0 || (props.openOnFocus && (props.loading || visibleGroups.value.length > 0)))),
)
const optionId = (item: EkSearchItem) => `${listId}-opt-${item.id}`

watch(isOpen, (open) => {
  if (typeof window === 'undefined') return
  if (open) {
    nextTick(placePanel)
    window.addEventListener('resize', placePanel)
  } else {
    window.removeEventListener('resize', placePanel)
  }
}, { immediate: true })
onMounted(() => isOpen.value && placePanel())
onBeforeUnmount(() => typeof window !== 'undefined' && window.removeEventListener('resize', placePanel))

watch(
  flat,
  (items) => {
    const start = items[Math.min(props.initialActiveIndex, items.length - 1)]
    activeId.value = start ? optionId(start) : ''
  },
  { immediate: true },
)

function monogram(text: string) {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toLocaleUpperCase('tr-TR')
}

/** Eşleşen kısmı `<mark>` ile ayırır (v-html YOK — XSS güvenli). */
function highlight(text: string) {
  const q = props.modelValue.trim()
  if (!q) return [{ text, match: false }]
  const index = text.toLocaleLowerCase('tr-TR').indexOf(q.toLocaleLowerCase('tr-TR'))
  if (index < 0) return [{ text, match: false }]
  return [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, index + q.length), match: true },
    { text: text.slice(index + q.length), match: false },
  ].filter((p) => p.text)
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function onFocus() {
  focused.value = true
}

function onBlur() {
  focused.value = false
}

function clear() {
  emit('update:modelValue', '')
  inputRef.value?.focus()
}

function choose(item: EkSearchItem) {
  emit('select', item)
  focused.value = false
  inputRef.value?.blur()
}

function move(delta: number) {
  const items = flat.value
  if (!items.length) return
  const index = items.findIndex((i) => optionId(i) === activeId.value)
  const next = items[(index + delta + items.length) % items.length]
  activeId.value = optionId(next)
  rootRef.value?.querySelector(`#${CSS.escape(activeId.value)}`)?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event: KeyboardEvent) {
  if (!isOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      inputRef.value?.blur()
      emit('dismiss')
    }
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    const item = flat.value.find((i) => optionId(i) === activeId.value)
    if (item) {
      event.preventDefault()
      choose(item)
    }
  } else if (event.key === 'Escape') {
    event.preventDefault()
    focused.value = false
    inputRef.value?.blur()
    emit('dismiss')
  }
}

defineExpose({ focus: () => inputRef.value?.focus(), blur: () => inputRef.value?.blur() })
</script>

<style scoped>
.ek-search {
  position: relative;
  width: 100%;
  max-width: 560px;
}

.ek-search__field {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-2) 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  transition: var(--ek-transition-colors);
}

.ek-search.is-focused .ek-search__field,
.ek-search.is-open .ek-search__field {
  border-color: var(--ek-color-surface);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  box-shadow: 0 0 0 3px var(--ek-color-chrome-border);
}

.ek-search__icon {
  flex: none;
  font-size: var(--ek-icon-md);
  color: var(--ek-color-chrome-text-muted);
}

.ek-search.is-focused .ek-search__icon,
.ek-search.is-open .ek-search__icon {
  color: var(--ek-color-action);
}

.ek-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--ek-type-body-size);
}

.ek-search__input::placeholder {
  color: var(--ek-color-chrome-text-muted);
  opacity: 1;
}

.ek-search.is-focused .ek-search__input::placeholder,
.ek-search.is-open .ek-search__input::placeholder {
  color: var(--ek-color-content-muted);
}

.ek-search__input::-webkit-search-cancel-button {
  display: none;
}

.ek-search.is-focused .ek-search__hint,
.ek-search.is-open .ek-search__hint {
  display: none;
}

.ek-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  cursor: pointer;
}

.ek-search__clear:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ek-search__panel {
  position: absolute;
  top: calc(100% + var(--ek-space-2));
  left: v-bind(panelLeft);
  width: v-bind(panelWidth);
  transform: translateX(v-bind(panelShift));
  z-index: var(--ek-z-dropdown);
  display: flex;
  flex-direction: column;
  max-height: min(520px, calc(100vh - 120px));
  overflow: hidden;
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
  color: var(--ek-color-content-default);
}

.ek-search__results {
  flex: 1;
  overflow: auto;
  padding: var(--ek-space-1) 0;
}

.ek-search__group + .ek-search__group {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-search__group-head {
  position: sticky;
  top: calc(var(--ek-space-1) * -1);
  z-index: var(--ek-z-raised);
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
}

.ek-search__group-label {
  flex: 1;
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-search__group-count {
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-search__option {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  margin: 2px var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  cursor: pointer;
}

.ek-search__option.is-active {
  background: var(--ek-color-selection);
  box-shadow: var(--ek-selection-ring);
}

.ek-search__option.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--ek-space-2);
  bottom: var(--ek-space-2);
  width: 3px;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background: var(--ek-color-action);
}

.ek-search__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

.ek-search__avatar :deep(.v-icon) {
  font-size: var(--ek-icon-md);
}

.ek-search__avatar--success {
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-success-border);
}

.ek-search__avatar--info {
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-info-border);
}

.ek-search__avatar--warning {
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-warning-border);
}

.ek-search__avatar--neutral {
  background: var(--ek-color-neutral-subtle);
  color: var(--ek-color-neutral-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-color-neutral-border);
}

.ek-search__option-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-search__option-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-search__mark {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--ek-color-highlight);
  color: inherit;
  font-weight: var(--ek-font-weight-bold);
}

.ek-search__platform {
  flex: none;
}

.ek-search__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.ek-search__meta-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ek-space-1);
  padding: 1px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-search__meta-label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-search__meta-value {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.ek-search__chevron {
  flex: none;
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-subtle);
}

.ek-search__option.is-active .ek-search__chevron {
  color: var(--ek-color-action);
}

.ek-search__empty {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) var(--ek-space-5);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.ek-search__skeleton {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-5);
}

.ek-search__skeleton-avatar {
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.ek-search__skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-search__skeleton-lines span {
  height: 10px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ek-search__skeleton-lines span:last-child {
  width: 60%;
}

.ek-search__footer {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-search__footer > span {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

/* Dar ekranda açılır, arama alanına değil görünüm alanına yaslanır (taşma yok). */
@media (max-width: 767px) {
  .ek-search {
    position: static;
  }

  .ek-search__hint {
    display: none;
  }

  .ek-search__panel {
    position: fixed;
    top: calc(var(--ek-app-topbar-height) + var(--ek-space-1));
    left: var(--ek-space-2);
    right: var(--ek-space-2);
    width: auto;
    transform: none;
    max-height: calc(100vh - var(--ek-app-topbar-height) - var(--ek-space-4));
  }
}
</style>
