<!--
  frontend/src/components/ds/EkWorkspaceTabs.vue

  DS-v2 — workspace sekmeleri (çok görevli çalışma alanı). Gerçek sekme hissi:
    - şerit `tabstrip-bg` tonunda; pasif sekmeler zeminle aynı, aralarında ince ayraç
    - ETKİN sekme `tab-active` (= içerik zemini) ile altındaki içerikle BİRLEŞİR,
      üst kenarda 2px aksiyon çizgisi, yarı-kalın başlık
    - kapatma düğmesi küçük (20px) ve zarif: etkin sekmede ve hover/odakta görünür
    - uzun başlık tek satırda kesilir (…), tam başlık tooltip'te
  Soldaki anlamsız boşluk YOK: ilk sekme şeridin başından başlar (#leading
  slot'u isteğe bağlı sabit öğe içindir, ör. modül başlatıcı).
  Klavye: ←/→ sekmeler arası, Home/End, Enter/Space etkinleştir, Delete kapat
  (WAI-ARIA tabs deseni, roving tabindex). Taşma: yatay kaydırma.
  Ek (geri uyumlu): başlık gerçekten kesildiyse (…) tam başlık v-tooltip'te
  (yalnızca taşan sekmede — kesilmeyen başlıkta tekrar eden ipucu yok);
  sağ tık / Shift+F10 / Menü tuşu → `contextmenu(id, {x,y})`; orta tık kapatır.
-->
<template>
  <div class="ek-tabs">
    <div v-if="$slots.leading" class="ek-tabs__leading"><slot name="leading" /></div>
    <div ref="listRef" class="ek-tabs__list" role="tablist" :aria-label="label" @keydown="onKeydown">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="ek-tab"
        :class="{ 'is-active': tab.id === modelValue, 'is-hover': forceHoverId === tab.id }"
        @contextmenu.prevent="emit('contextmenu', tab.id, { x: $event.clientX, y: $event.clientY })"
        @auxclick="onAuxClick($event, tab)"
      >
        <v-tooltip :eager="false" transition="fade-transition" :disabled="!truncated.has(tab.id)" location="bottom" :open-delay="500" :text="tab.title">
          <template #activator="{ props: tipProps }">
            <button
              v-bind="tipProps"
              :id="`ek-tab-${tab.id}`"
              type="button"
              class="ek-tab__button"
              role="tab"
              :data-tab-id="tab.id"
              :aria-selected="tab.id === modelValue"
              :aria-controls="panelIdPrefix ? `${panelIdPrefix}-${tab.id}` : undefined"
              :tabindex="tab.id === focusId ? 0 : -1"
              :aria-describedby="describedBy(tipProps, tab)"
              @click="activate(tab.id)"
            >
              <v-icon v-if="tab.icon" class="ek-tab__icon" :icon="tab.icon" aria-hidden="true" />
              <span class="ek-tab__title" :data-title-id="tab.id">{{ tab.title }}</span>
              <span v-if="tab.dirty" class="ek-tab__dirty" aria-label="Kaydedilmemiş değişiklik var"></span>
            </button>
          </template>
        </v-tooltip>
        <!-- Kapatma: fareyle bu simge (veya orta tık), klavyeyle sekme odaktayken
             Delete. tablist içinde ikinci bir düğme ARIA sözleşmesini bozacağı için
             simge ekran okuyucudan gizlidir; sekmenin açıklaması kısayolu söyler. -->
        <span
          v-if="tab.closable !== false"
          class="ek-tab__close"
          aria-hidden="true"
          :title="`${tab.title} sekmesini kapat`"
          @click.stop="emit('close', tab.id)"
        >
          <v-icon icon="mdi-close" />
        </span>
      </div>
    </div>
    <div v-if="$slots.trailing" class="ek-tabs__trailing"><slot name="trailing" /></div>
    <span :id="closeHintId" class="ek-sr-only">Kapatmak için Delete tuşuna basın</span>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId, watch } from 'vue'

export interface EkWorkspaceTab {
  id: string
  title: string
  icon?: string
  closable?: boolean
  dirty?: boolean
}

const props = defineProps<{
  tabs: EkWorkspaceTab[]
  modelValue: string
  label: string
  panelIdPrefix?: string
  forceHoverId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
  close: [id: string]
  contextmenu: [id: string, point: { x: number; y: number }]
}>()

const closeHintId = `ek-tabs-close-hint-${useId()}`
const listRef = ref<HTMLElement | null>(null)
const focusId = ref(props.modelValue)
watch(
  () => props.modelValue,
  (id) => (focusId.value = id),
)

/** Başlığı gerçekten kesilen (…) sekmeler — yalnızca onlarda tooltip açılır. */
const truncated = ref(new Set<string>())
let resizeObserver: ResizeObserver | undefined

function measure() {
  const next = new Set<string>()
  listRef.value?.querySelectorAll<HTMLElement>('[data-title-id]').forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 1) next.add(el.dataset.titleId as string)
  })
  const same = next.size === truncated.value.size && [...next].every((id) => truncated.value.has(id))
  if (!same) truncated.value = next
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && listRef.value) {
    resizeObserver = new ResizeObserver(() => measure())
    resizeObserver.observe(listRef.value)
  }
})
onUpdated(() => nextTick(measure))
onBeforeUnmount(() => resizeObserver?.disconnect())

function describedBy(tipProps: Record<string, unknown>, tab: EkWorkspaceTab) {
  const ids = [tipProps['aria-describedby'], tab.closable !== false ? closeHintId : undefined].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

function onAuxClick(event: MouseEvent, tab: EkWorkspaceTab) {
  if (event.button !== 1 || tab.closable === false) return
  event.preventDefault()
  emit('close', tab.id)
}

function openContextMenuFor(id: string) {
  const el = listRef.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
  const rect = el?.getBoundingClientRect()
  emit('contextmenu', id, { x: rect ? rect.left + 8 : 0, y: rect ? rect.bottom : 0 })
}

function focusTab(id: string) {
  focusId.value = id
  nextTick(() => listRef.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus())
}

function activate(id: string) {
  focusId.value = id
  emit('update:modelValue', id)
}

function onKeydown(event: KeyboardEvent) {
  const ids = props.tabs.map((t) => t.id)
  const index = ids.indexOf(focusId.value)
  if (index < 0) return
  const go = (i: number) => {
    event.preventDefault()
    focusTab(ids[(i + ids.length) % ids.length])
  }
  switch (event.key) {
    case 'ArrowRight':
      return go(index + 1)
    case 'ArrowLeft':
      return go(index - 1)
    case 'Home':
      return go(0)
    case 'End':
      return go(ids.length - 1)
    case 'Enter':
    case ' ':
      event.preventDefault()
      return activate(focusId.value)
    case 'ContextMenu':
      event.preventDefault()
      return openContextMenuFor(focusId.value)
    case 'F10':
      if (!event.shiftKey) return
      event.preventDefault()
      return openContextMenuFor(focusId.value)
    case 'Delete': {
      const tab = props.tabs[index]
      if (tab.closable !== false) emit('close', tab.id)
      return
    }
  }
}

defineExpose({ focusActive: () => focusTab(props.modelValue) })
</script>

<style scoped>
.ek-tabs {
  display: flex;
  align-items: flex-end;
  gap: var(--ek-space-2);
  min-width: 0;
  height: 40px;
  padding: 0 var(--ek-space-2) 0 0;
  background: var(--ek-color-tabstrip-bg);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-tabs__leading,
.ek-tabs__trailing {
  display: flex;
  align-items: center;
  align-self: center;
  flex: none;
}

.ek-tabs__leading {
  padding-left: var(--ek-space-2);
}

.ek-tabs__list {
  display: flex;
  align-items: flex-end;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  /* overflow-x:auto tek başına overflow-y'yi de auto yapar; sekmenin -1px alt payı (şerit kenarlığının
     üstüne binme) 1px dikey taşma üretir → klasik (yer kaplayan) kaydırma çubuklu sistemlerde (Windows)
     şeritte dikey kaydırma çubuğu çıkıyordu. Kaydırma kabı zaten kırptığı için görünüm değişmez. */
  overflow-y: hidden;
  scrollbar-width: thin;
}

.ek-tab {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 1 220px;
  min-width: 120px;
  height: 34px;
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ek-radius-tab) var(--ek-radius-tab) 0 0;
  color: var(--ek-color-content-muted);
  transition: var(--ek-transition-colors);
}

/* Pasif sekmeler arasındaki ince ayraç (etkin sekmenin iki yanında gizlenir). */
.ek-tab + .ek-tab::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 9px;
  bottom: 9px;
  width: 1px;
  background: var(--ek-color-border-strong);
}

.ek-tab.is-active::before,
.ek-tab.is-active + .ek-tab::before,
.ek-tab:hover::before,
.ek-tab.is-hover::before,
.ek-tab:hover + .ek-tab::before,
.ek-tab.is-hover + .ek-tab::before {
  opacity: 0;
}

.ek-tab:hover,
.ek-tab.is-hover {
  background: var(--ek-color-tab-hover);
  color: var(--ek-color-content-strong);
}

.ek-tab.is-active {
  height: 36px;
  background: var(--ek-color-tab-active);
  border-color: var(--ek-color-border-default);
  color: var(--ek-color-content-strong);
  box-shadow: inset 0 2px 0 var(--ek-color-action);
  z-index: 1;
}

.ek-tab__button {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 var(--ek-space-1) 0 var(--ek-space-3);
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--ek-type-tab-size);
  line-height: var(--ek-type-tab-line);
  font-weight: var(--ek-type-tab-weight);
  text-align: left;
  cursor: pointer;
}

.ek-tab.is-active .ek-tab__button {
  font-weight: var(--ek-font-weight-semibold);
}

.ek-tab__button:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-tab__icon {
  flex: none;
  font-size: var(--ek-type-tab-icon);
  color: var(--ek-color-content-muted);
}

.ek-tab.is-active .ek-tab__icon {
  color: var(--ek-color-action);
}

.ek-tab__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-tab__dirty {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-warning);
}

.ek-tab__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  margin-right: var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
  opacity: 0;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-tab.is-active .ek-tab__close,
.ek-tab:hover .ek-tab__close,
.ek-tab.is-hover .ek-tab__close,
.ek-tab:focus-within .ek-tab__close {
  opacity: 1;
}

.ek-tab__close:hover {
  background: var(--ek-color-border-subtle);
  color: var(--ek-color-content-strong);
}

@media (hover: none) {
  .ek-tab__close {
    opacity: 1;
  }
}

@media (max-width: 767px) {
  .ek-tab {
    flex-basis: 160px;
    min-width: 96px;
  }
}
</style>
