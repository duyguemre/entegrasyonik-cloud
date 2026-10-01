<!--
  frontend/src/components/ds/EkWorkspaceTabs.vue

  DS-v2 — workspace sekmeleri (çok görevli çalışma alanı). Gerçek (klasör) sekme hissi:
    - şerit `tabstrip-bg` tonunda; pasif sekmeler geri planda (zeminle aynı, soluk metin, ince ayraç)
    - ETKİN sekme `tab-active` (= içerik zemini) ile altındaki içerikle TEK PARÇA birleşir: arada çizgi
      YOK (şeridin alt çizgisi etkin sekmenin altında kesilir), alt köşelerde içbükey geçiş (klasör sekmesi),
      yukarı doğru yumuşak gölge, üst kenarda 2px aksiyon çizgisi, yarı-kalın başlık (Aşama 5)
    - kapatma düğmesi küçük (20px) ve zarif: etkin sekmede ve hover/odakta görünür (yeri HER ZAMAN ayrılı)
    - A12 pasif sekme: şerit zemininde sakin, ikincil ton (`content-muted`); hover = ayrı bir ışıma katmanı
      (`__wash`: `tab-hover` zemin + üstte `action-border` saç çizgisi) YALNIZ opaklıkla girer/çıkar — boyut,
      dolgu, kalınlık, kenarlık değişmez (layout shift 0); başlık kalın genişliğini hayalet metinle ayırır
    - uzun başlık tek satırda kesilir (…), tam başlık tooltip'te
  Soldaki anlamsız boşluk YOK: ilk sekme şeridin başından başlar (#leading
  slot'u isteğe bağlı sabit öğe içindir, ör. modül başlatıcı).
  Klavye: ←/→ sekmeler arası, Home/End, Enter/Space etkinleştir, Delete kapat
  (WAI-ARIA tabs deseni, roving tabindex). Taşma (Aşama 5 → FR2 madde 9): YALNIZ yatay; kaydırma çubuğu gizli,
  taşan kenarda solma; ok düğmeleri YERİNE sağda "+N ⌄" daha fazla listesi (tam görünmeyen sekmeler); tekerlek
  yatay kaydırır, etkin sekme görünür alana getirilir.
  Dikey kaydırma hiçbir koşulda oluşmaz (kap `overflow-y: hidden` + çubuk alanı 0).
  Ek (geri uyumlu): başlık gerçekten kesildiyse (…) tam başlık v-tooltip'te
  (yalnızca taşan sekmede — kesilmeyen başlıkta tekrar eden ipucu yok);
  sağ tık / Shift+F10 / Menü tuşu → `contextmenu(id, {x,y})`; orta tık kapatır.
-->
<template>
  <div class="ek-tabs">
    <div v-if="$slots.leading" class="ek-tabs__leading"><slot name="leading" /></div>
    <div class="ek-tabs__viewport" :class="{ 'can-left': canLeft, 'can-right': canRight }">
    <div ref="listRef" class="ek-tabs__list" role="tablist" :aria-label="label" @keydown="onKeydown" @scroll.passive="updateOverflow" @wheel="onWheel">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="ek-tab"
        :class="{ 'is-active': tab.id === modelValue, 'is-hover': forceHoverId === tab.id }"
        @contextmenu.prevent="emit('contextmenu', tab.id, { x: $event.clientX, y: $event.clientY })"
        @auxclick="onAuxClick($event, tab)"
      >
        <span class="ek-tab__flare ek-tab__flare--start" aria-hidden="true"></span>
        <span class="ek-tab__flare ek-tab__flare--end" aria-hidden="true"></span>
        <span class="ek-tab__wash" aria-hidden="true"></span>
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
              <v-icon v-if="tab.icon" class="ek-tab__icon" :icon="outlineIcon(tab.icon)" aria-hidden="true" />
              <span class="ek-tab__title" :data-title-id="tab.id" :data-text="tab.title">{{ tab.title }}</span>
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
    </div>
    <!-- FR2-SHELL madde 9 (fe-r2a): sekmeler taşarsa kenar okları + kaydırma YERİNE sağda "daha fazla" listesi —
         şeritte tam görünmeyen sekmeler sayısıyla; seçilen sekme etkinleşir ve şeritte görünür alana gelir. -->
    <v-menu v-if="hiddenTabs.length" v-model="moreOpen" location="bottom end" :offset="6">
      <template #activator="{ props: menuProps }">
        <button v-bind="menuProps" type="button" class="ek-tabs__more" :class="{ 'is-open': moreOpen }"
          :aria-label="`Daha fazla sekme (${hiddenTabs.length})`" data-tabs-more>
          <span class="ek-num">+{{ hiddenTabs.length }}</span>
          <v-icon icon="mdi-chevron-down" aria-hidden="true" />
        </button>
      </template>
      <EkMenuPanel autofocus :groups="moreGroups" label="Daha fazla sekme" @select="onMoreSelect" @close="moreOpen = false" />
    </v-menu>
    <div v-if="$slots.trailing" class="ek-tabs__trailing"><slot name="trailing" /></div>
    <span :id="closeHintId" class="ek-sr-only">Kapatmak için Delete tuşuna basın</span>
  </div>
</template>

<script setup lang="ts">
import { outlineIcon } from '../icons'
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId, watch } from 'vue'
import EkMenuPanel, { type EkMenuGroup, type EkMenuItem } from './EkMenuPanel.vue'

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

/** Yatay taşma: hangi kenarda gizli sekme var (solma + ok yalnız o kenarda). */
const canLeft = ref(false)
const canRight = ref(false)

/** Şeritte TAM görünmeyen sekmelerin kimlikleri ("daha fazla" listesi). */
const hiddenIds = ref<string[]>([])
const moreOpen = ref(false)
// Etkin sekme listede yer almaz: her zaman şeritte görünür alana getirilir (revealActive).
const hiddenTabs = computed(() => props.tabs.filter((t) => t.id !== props.modelValue && hiddenIds.value.includes(t.id)))
const moreGroups = computed<EkMenuGroup[]>(() => [
  { items: hiddenTabs.value.map((t) => ({ key: t.id, label: t.title, icon: t.icon ? outlineIcon(t.icon) : undefined })) },
])

function updateOverflow() {
  const el = listRef.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  canLeft.value = el.scrollLeft > 1
  canRight.value = max - el.scrollLeft > 1
  const left = el.scrollLeft
  const right = left + el.clientWidth
  const next: string[] = []
  if (max > 1) {
    el.querySelectorAll<HTMLElement>('.ek-tab').forEach((tab) => {
      const id = tab.querySelector<HTMLElement>('[data-tab-id]')?.dataset.tabId
      if (id && (tab.offsetLeft < left - 1 || tab.offsetLeft + tab.offsetWidth > right + 1)) next.push(id)
    })
  }
  if (next.join('|') !== hiddenIds.value.join('|')) hiddenIds.value = next
}

function onMoreSelect(item: EkMenuItem) {
  moreOpen.value = false
  emit('update:modelValue', item.key)
  nextTick(() => focusTab(item.key))
}

/** Dikey tekerlek yatay kaydırır (yalnız taşma varken; aksi halde sayfa davranışı bozulmaz). */
function onWheel(event: WheelEvent) {
  const el = listRef.value
  if (!el || el.scrollWidth <= el.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  event.preventDefault()
  el.scrollLeft += event.deltaY
}

/** Etkin sekme görünür alanda kalsın (klavye/kısayolla etkinleşen, şeridin dışında kalan sekme). */
function revealActive() {
  const el = listRef.value
  const tab = el?.querySelector<HTMLElement>(`[data-tab-id="${props.modelValue}"]`)?.closest<HTMLElement>('.ek-tab')
  if (!el || !tab) return
  const pad = 32
  if (tab.offsetLeft < el.scrollLeft + pad) el.scrollLeft = Math.max(0, tab.offsetLeft - pad)
  else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth - pad) el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth + pad
  updateOverflow()
}

watch(
  () => [props.modelValue, props.tabs.length],
  () => nextTick(revealActive),
)

// "Daha fazla" düğmesi belirince/kaybolunca şerit genişliği değişir → etkin sekme yeniden görünür alana alınır.
watch(
  () => hiddenTabs.value.length > 0,
  () => nextTick(revealActive),
)

function measure() {
  updateOverflow()
  const next = new Set<string>()
  listRef.value?.querySelectorAll<HTMLElement>('[data-title-id]').forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 1) next.add(el.dataset.titleId as string)
  })
  const same = next.size === truncated.value.size && [...next].every((id) => truncated.value.has(id))
  if (!same) truncated.value = next
}

onMounted(() => {
  measure()
  nextTick(revealActive)
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
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: var(--ek-space-2);
  min-width: 0;
  height: 40px;
  padding: 0 var(--ek-space-2) 0 0;
  /* Kap hiçbir yönde kaydırılmaz (dikey kaydırma çubuğu hatası — Aşama 5); taşma yalnız listede, yatay. */
  overflow: hidden;
  background: var(--ek-color-tabstrip-bg);
  /* A10 — sekme dış hattı tek token: şeridin alt çizgisi → etkin sekmenin içbükey köşesi → yan/üst kenarı
     KESİNTİSİZ aynı çizgi (renk sıçraması yok). Alt çizgi kenarlık değil iç gölge: etkin sekme üstüne biner ve
     çizgiyi KESER — sekme ile içerik arasında çizgi YOK (A5, tek parça). */
  --ek-tab-line: var(--ek-color-border-strong);
  box-shadow: inset 0 -1px 0 var(--ek-tab-line);
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

.ek-tabs__viewport {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.ek-tabs__list {
  display: flex;
  align-items: flex-end;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  /* İlk sekmenin sol içbükey köşesi kırpılmasın ve sekme sol menünün kenarına yapışmasın (köşe payı = sekme yarıçapı). */
  padding-left: var(--ek-radius-tab);
  scroll-padding-inline: var(--ek-space-8);
  /* Kaydırma çubuğu hiç yer kaplamaz (klasik çubuklu sistemlerde şeridi daraltıp dikey çubuk üretiyordu);
     taşma solma + ok düğmeleriyle anlatılır. */
  scrollbar-width: none;
}

.ek-tabs__list::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* Taşan kenarda solma: sekme metni şeridin tonuna erir (maske — renk literal'i yok). */
.ek-tabs__viewport.can-left .ek-tabs__list {
  mask-image: linear-gradient(to right, transparent 0, black 40px);
}

.ek-tabs__viewport.can-right .ek-tabs__list {
  mask-image: linear-gradient(to left, transparent 0, black 40px);
}

.ek-tabs__viewport.can-left.can-right .ek-tabs__list {
  mask-image: linear-gradient(to right, transparent 0, black 40px, black calc(100% - 40px), transparent 100%);
}

.ek-tabs__more {
  display: inline-flex;
  flex: none;
  align-self: center;
  align-items: center;
  gap: 2px;
  height: 28px;
  margin-left: var(--ek-space-1);
  padding: 0 var(--ek-space-1) 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-tabs__more .v-icon {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
  transition: transform var(--ek-motion-reveal);
}

.ek-tabs__more:hover,
.ek-tabs__more.is-open {
  border-color: var(--ek-color-border-input);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-tabs__more.is-open .v-icon {
  transform: rotate(180deg);
}

.ek-tabs__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-tab {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 1 220px;
  min-width: 120px;
  height: 34px;
  /* Tüm sekmelerde aynı (saydam) kenarlık → etkinleşince içerik 1px kaymaz. */
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ek-radius-tab) var(--ek-radius-tab) 0 0;
  color: var(--ek-color-content-muted);
  /* Etkinleşme/pasifleşme ANINDA: zemin + kenarlık + içbükey köşeler aynı karede değişir (zemin solarken köşelerin
     anında belirmesi renk sıçraması üretiyordu). Sakin geçişi gösterge çubuğu ve içerik girişi taşır; renk geçişi
     yalnız hover'a girerken. */
  transition: color var(--ek-motion-feedback);
}

/* Pasif sekmeler arasındaki ince ayraç (etkin sekmenin iki yanında gizlenir). */
.ek-tab + .ek-tab::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 10px;
  bottom: 10px;
  width: 1px;
  background: var(--ek-color-border-strong);
  transition: opacity var(--ek-motion-feedback);
}

/* A12 — pasif hover ışıması: ayrı katman, YALNIZ opaklık geçişi (giriş + çıkış simetrik, motion token'ları). Zemin
   üstten aşağı `tab-hover` → şerit tonuna sönen ışıma (düz plaka etkin sekmeyi taklit ediyordu) + üst kenarda etkin
   göstergeyle aynı geometride 2px `action-border` saç çizgisi — "buraya gelirse etkin olur" ipucu.
   Boyut/dolgu/kalınlık/kenarlık değişmez. */
.ek-tab__wash {
  position: absolute;
  /* Alt 1px şeridin alt çizgisine ayrılır: hover plakası içerikle BİRLEŞMEZ (birleşme yalnız etkin sekmenin). */
  inset: -1px -1px 1px;
  border-radius: inherit;
  background: linear-gradient(to bottom, var(--ek-color-tab-hover), color-mix(in srgb, var(--ek-color-tab-hover) 35%, transparent));
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ek-motion-feedback);
}

.ek-tab__wash::after {
  content: '';
  position: absolute;
  top: 0;
  left: var(--ek-radius-tab);
  right: var(--ek-radius-tab);
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: var(--ek-color-action-border);
}

.ek-tab:not(.is-active):hover .ek-tab__wash,
.ek-tab.is-hover:not(.is-active) .ek-tab__wash,
.ek-tab:not(.is-active):has(.ek-tab__button:focus-visible) .ek-tab__wash {
  opacity: 1;
}

/* Basılıyken saç çizgisi aksiyon rengine döner (yalnız renk): bırakınca gelecek etkin göstergenin önizlemesi. */
.ek-tab:not(.is-active):active .ek-tab__wash::after {
  background: var(--ek-color-action);
}

/* Etkinleşince ışıma ANINDA kalkar (A10: zemin/kenarlık/köşeler aynı karede değişir). */
.ek-tab.is-active .ek-tab__wash {
  opacity: 0;
  transition: none;
}

.ek-tab.is-active::before,
.ek-tab.is-active + .ek-tab::before,
.ek-tab:hover::before,
.ek-tab.is-hover::before,
.ek-tab:hover + .ek-tab::before,
.ek-tab.is-hover + .ek-tab::before {
  opacity: 0;
}

/* Hover metni bir kademe öne gelir (muted → default); `content-strong` + yarı kalın yalnız ETKİN sekmenindir. */
.ek-tab:not(.is-active):hover,
.ek-tab.is-hover:not(.is-active) {
  color: var(--ek-color-content-default);
}

/* ETKİN (A10 — klasör sekmesi): zemin = içerik zemini (`tab-active` ≡ `background`), şeridin önüne çıkar.
   Dış hat 1px `--ek-tab-line` YALNIZ üst + yanlarda (alt kenar yok → içerikle tek parça); hat alt köşelerde
   içbükey eğriyle şeridin alt çizgisine bağlanır. Gölge yalnız yukarı (şeride), içeriğe düşmez. */
.ek-tab.is-active {
  height: 36px;
  border-color: var(--ek-tab-line);
  background: var(--ek-color-tab-active);
  background-clip: padding-box;
  color: var(--ek-color-content-strong);
  box-shadow: var(--ek-shadow-tab-active);
  z-index: 1;
}

/* Etkin gösterge: üst kenarda 2px aksiyon çubuğu, yuvarlak köşelere KIVRILMAZ (köşelerden yarıçap kadar içeride)
   — önceki iç gölge köşede kalınlaşan bir "şapka" çiziyordu. Etkinleşirken kısa, sakin açılış (motion token'ları). */
.ek-tab.is-active::after {
  content: '';
  position: absolute;
  top: -1px;
  left: var(--ek-radius-tab);
  right: var(--ek-radius-tab);
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: var(--ek-color-action);
  animation: ek-tab-indicator var(--ek-motion-overlay) both;
}

@keyframes ek-tab-indicator {
  from {
    opacity: 0;
    transform: scaleX(0.6);
  }
}

/* Klasör sekmesi: alt köşelerde içbükey geçiş. Her köşe (R+1)² bir kare; merkezi dış üst köşede, yarıçapı R+1 olan
   çemberin İÇİ şerit (saydam), 1px halkası = dış hat (sekmenin yan kenarıyla aynı piksel sütununda başlar, şeridin
   alt çizgisiyle aynı piksel satırında biter), DIŞI = sekme zemini. Kenarlık kutusunun dışına 1px taşar (border). */
.ek-tab__flare {
  display: none;
  position: absolute;
  bottom: 0;
  width: calc(var(--ek-radius-tab) + 1px);
  height: calc(var(--ek-radius-tab) + 1px);
  pointer-events: none;
  --ek-flare-r: var(--ek-radius-tab);
  --ek-flare-bg: radial-gradient(
    circle at var(--ek-flare-x) 0,
    transparent calc(var(--ek-flare-r) - 0.35px),
    var(--ek-tab-line) calc(var(--ek-flare-r) + 0.25px),
    var(--ek-tab-line) calc(var(--ek-flare-r) + 0.75px),
    var(--ek-color-tab-active) calc(var(--ek-flare-r) + 1.35px)
  );
}

.ek-tab.is-active .ek-tab__flare {
  display: block;
}

.ek-tab__flare--start {
  --ek-flare-x: 0;
  left: calc(-1 * var(--ek-radius-tab) - 1px);
  background: var(--ek-flare-bg);
}

.ek-tab__flare--end {
  --ek-flare-x: 100%;
  right: calc(-1 * var(--ek-radius-tab) - 1px);
  background: var(--ek-flare-bg);
}

.ek-tab__button {
  position: relative;
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

/* A12 — klavye odağı TÜM sekmeyi (kapatma dahil) çevreler; halka sekmenin köşe yarıçapını izler. */
@supports selector(:has(*)) {
  .ek-tab__button:focus-visible {
    box-shadow: none;
  }

  .ek-tab:not(.is-active):has(.ek-tab__button:focus-visible)::after {
    content: '';
    position: absolute;
    inset: -1px -1px 0;
    z-index: 1;
    border-radius: inherit;
    box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
    pointer-events: none;
  }

  /* Etkin sekmede ::after göstergedir; halka üstüne ayrı gölgeyle biner. */
  .ek-tab.is-active:has(.ek-tab__button:focus-visible) {
    box-shadow: var(--ek-shadow-tab-active), inset 0 0 0 2px var(--ek-color-border-focus);
  }
}

.ek-tab__icon {
  flex: none;
  font-size: var(--ek-type-tab-icon);
  color: inherit;
}

.ek-tab.is-active .ek-tab__icon {
  color: var(--ek-color-action);
}

.ek-tab__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Hayalet kalın başlık: yüksekliği 0, görünmez; başlık kutusu HER durumda yarı kalın genişliği ayırır → etkin ↔ pasif
   geçişinde kirli nokta/kapatma kaymaz. */
.ek-tab__title::after {
  /* Boş alternatif metin: ekran okuyucu başlığı iki kez okumaz. */
  content: attr(data-text);
  content: attr(data-text) / '';
  display: block;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  font-weight: var(--ek-font-weight-semibold);
  pointer-events: none;
  user-select: none;
}

.ek-tab__dirty {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-warning);
}

.ek-tab__close {
  position: relative;
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
  background: var(--ek-color-tab-hover);
  color: var(--ek-color-content-strong);
}

/* Pasif hover sekmesinin zemini zaten `tab-hover` — kapatmanın kendi hover'ı bir kademe koyu (şerit tonu) olmalı. */
.ek-tab:not(.is-active) .ek-tab__close:hover {
  background: var(--ek-color-tabstrip-bg);
}

@media (prefers-reduced-motion: reduce) {
  .ek-tab,
  .ek-tab + .ek-tab::before,
  .ek-tab__wash,
  .ek-tab__close {
    transition: none;
  }

  .ek-tab.is-active::after {
    animation: none;
  }
}

@media (hover: none) {
  .ek-tab__close {
    opacity: 1;
  }

  .ek-tabs__more .v-icon {
    transition: none;
  }
}

/* Aşama 6b (Standart 4): dar ekranda sekmeler okunamayacak kadar sıkışmaz — en az 136px, taşan kısım yatay kayar
   (gizli çubuk + solma + ok; dokunmatikte kaydırma). Kapatma yalnız etkin sekmede (dar alanda yanlış dokunma yok). */
@media (max-width: 767px) {
  .ek-tab {
    flex: 0 0 auto;
    width: 152px;
    min-width: 136px;
  }

  .ek-tab:not(.is-active) .ek-tab__close {
    display: none;
  }
}
</style>
