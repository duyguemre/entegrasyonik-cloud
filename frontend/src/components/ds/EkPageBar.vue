<!--
  frontend/src/components/ds/EkPageBar.vue

  DS-v2 Aşama 5 — TÜM sayfaların tek başlık deseni (kullanıcı geri bildirimi madde 1 + 6). Büyük "başlık + açıklama"
  bloğu kalktı; hiyerarşi: üst bar → sekme şeridi → BU SATIR → filtre → içerik.

    [Bölüm ›] H1 Sayfa adı (i) · meta ......................................... [#actions]
    ╰─ (i) → yumuşak açılan "Sayfa hakkında" paneli: Amaç (açıklama) · İpuçları · Kısayollar

  - Sayfada TEK H1 burasıdır (breadcrumb'ın son halkası = sayfa adı; bölüm tıklanabilir DEĞİL — Karar 2.3).
  - Panel varsayılan KAPALI; tercih tüm sayfalarda ortak ve hatırlanır (`usePageAbout`). Geçiş `EkCollapse`.
  - `meta`: açıklama değil DURUM metni (ör. "Son güncelleme 14:02") — başlık satırında küçük, her zaman görünür.
  - Kısayollar kabuk kaydından (`navigation/shortcuts.ts`); "Tüm kısayollar" `ek:shortcut-help` olayıyla diyaloğu açar.
-->
<template>
  <div ref="rootRef" class="ek-page-bar" :class="{ 'is-open': about.open.value, 'is-narrow': narrow }">
    <div class="ek-page-bar__row">
      <div class="ek-page-bar__titles">
        <!-- A7: tek breadcrumb deseni — kök (modül ikonu + bölüm) / ara ekranlar / SON = sayfa başlığı (H1). -->
        <nav class="ek-crumbs" aria-label="Sayfa konumu">
          <ol class="ek-crumbs__list">
            <li v-if="section && view.showRoot" class="ek-crumbs__item ek-crumbs__item--root">
              <span class="ek-crumbs__chip ek-crumbs__chip--static">
                <v-icon v-if="rootIcon" class="ek-crumbs__chip-icon" :icon="rootIcon" size="14" aria-hidden="true" />
                <span class="ek-crumbs__text">{{ section }}</span>
              </span>
            </li>
            <li v-if="view.folded.length" class="ek-crumbs__item">
              <span v-if="section && view.showRoot" class="ek-crumbs__sep" aria-hidden="true"><v-icon icon="mdi-chevron-right" size="16" /></span>
              <EkContextMenu :groups="foldedGroups" label="Üst sayfalar" location="bottom start" @select="onFolded">
                <template #activator="{ props: menuProps }">
                  <button type="button" class="ek-crumbs__more ek-crumbs__chip" v-bind="menuProps"
                    :aria-label="`${view.folded.length} üst sayfa daha`" :title="view.folded.map((c) => c.label).join(' / ')">
                    <v-icon icon="mdi-dots-horizontal" size="16" aria-hidden="true" />
                  </button>
                </template>
              </EkContextMenu>
            </li>
            <li v-for="(crumb, i) in view.middle" :key="`${i}-${crumb.label}`" class="ek-crumbs__item">
              <span v-if="(section && view.showRoot) || view.folded.length || i > 0" class="ek-crumbs__sep" aria-hidden="true"><v-icon icon="mdi-chevron-right" size="16" /></span>
              <button v-if="narrow && i === 0 && view.back" type="button" class="ek-crumbs__back ek-crumbs__chip" :aria-label="`Geri: ${view.back.label}`"
                :title="`Geri: ${view.back.label}`" @click="view.back.onSelect?.()">
                <v-icon :icon="icons.back" size="16" aria-hidden="true" />
              </button>
              <button v-if="crumb.onSelect" type="button" class="ek-crumbs__link ek-crumbs__chip" :title="crumb.label" @click="crumb.onSelect()">{{ crumb.label }}</button>
              <span v-else class="ek-crumbs__text" :title="crumb.label">{{ crumb.label }}</span>
            </li>
            <li class="ek-crumbs__item ek-crumbs__item--current">
              <span v-if="(section && view.showRoot) || view.folded.length || view.middle.length" class="ek-crumbs__sep" aria-hidden="true"><v-icon icon="mdi-chevron-right" size="16" /></span>
              <h1 class="ek-page-bar__title" aria-current="page" :title="title">{{ title }}</h1>
              <span v-if="record?.code" class="ek-record-id" :class="channelClass(record.channel)">
                <span v-if="record.channel" class="ek-record-id__dot" aria-hidden="true"></span>
                <span class="ek-sr-only">{{ record.label || 'Kayıt' }}:</span>
                <span class="ek-record-id__code">{{ record.code }}</span>
                <EkTooltip :text="copied ? 'Kopyalandı' : `${record.label || 'Kaydı'} kopyala`">
                  <button type="button" class="ek-record-id__copy"
                    :aria-label="`${record.label || 'Kayıt kodunu'} kopyala: ${record.code}`" @click="copyRecord">
                    <v-icon :icon="copied ? 'mdi-check' : icons.copy" size="14" aria-hidden="true" />
                  </button>
                </EkTooltip>
              </span>
              <!-- B4: zarif yardım tetikleyicisi — küçük yuvarlak nötr düğme, ince çizgili soru işareti; ipucu +
                   odak halkası. Davranış/API aynı (aria-expanded/controls, "Sayfa hakkında" paneli). -->
              <EkTooltip :text="about.open.value ? 'Sayfa hakkında bilgiyi gizle' : 'Sayfa hakkında'" :open-delay="300">
                <button
                  type="button"
                  class="ek-page-bar__info"
                  :class="{ 'is-on': about.open.value }"
                  :aria-expanded="about.open.value"
                  :aria-controls="panelId"
                  :aria-label="`Sayfa hakkında: ${title}`"
                  @click="about.toggle()"
                >
                  <v-icon icon="mdi-help" size="14" aria-hidden="true" />
                </button>
              </EkTooltip>
            </li>
          </ol>
        </nav>
        <span v-if="meta" class="ek-page-bar__meta ek-page-header__description">{{ meta }}</span>
      </div>
      <div v-if="$slots.actions" class="ek-page-bar__actions"><slot name="actions" /></div>
      <!-- Aşama 6b (Standart 9): tek yenile düğmesi — satırın EN SAĞI, her sayfada aynı yer (dar ekranda başlık satırında). -->
      <span v-if="refreshable" class="ek-page-bar__refresh">
        <EkRefreshButton :loading="refreshing" :label="refreshLabel" :last-updated="lastUpdated" @refresh="emit('refresh')" />
      </span>
    </div>

    <EkCollapse :id="panelId" :open="about.open.value" role="region" :aria-label="`${title} sayfası hakkında`">
      <div class="ek-page-bar__about">
        <section class="ek-page-bar__block">
          <h2 class="ek-page-bar__label">Bu sayfa</h2>
          <p class="ek-page-bar__text">{{ description || `${title} ekranı.` }}</p>
        </section>
        <section v-if="tips?.length" class="ek-page-bar__block">
          <h2 class="ek-page-bar__label">İpuçları</h2>
          <ul class="ek-page-bar__tips">
            <li v-for="tip in tips" :key="tip">{{ tip }}</li>
          </ul>
        </section>
        <section class="ek-page-bar__block ek-page-bar__block--keys">
          <h2 class="ek-page-bar__label">Kısayollar</h2>
          <dl class="ek-page-bar__keys">
            <div v-for="k in keys" :key="k.id" class="ek-page-bar__key">
              <dt>{{ k.label }}</dt>
              <dd><EkKbd :keys="[...k.keys]" /></dd>
            </div>
          </dl>
          <button type="button" class="ek-page-bar__all" @click="openShortcutHelp">Tüm kısayollar</button>
        </section>
      </div>
    </EkCollapse>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import EkCollapse from './EkCollapse.vue'
import EkContextMenu from './EkContextMenu.vue'
import EkKbd from './EkKbd.vue'
import EkRefreshButton from './EkRefreshButton.vue'
import EkTooltip from './EkTooltip.vue'
import type { EkMenuGroup, EkMenuItem } from './EkMenuPanel.vue'
import { buildTrail, type EkCrumb, type EkRecordRef } from './pageTrail'
import { icons } from '@/design/icons'
import { channelClass } from '@/design/channels'
import { SHORTCUTS, type ShortcutId } from '@/navigation/shortcuts'
import { usePageAbout } from '@/composables/usePageAbout'
import { usePageContext } from '@/composables/usePageContext'
import { useToast } from '@/composables/useToast'

const props = withDefaults(defineProps<{
  title: string
  /** Kayıt defterindeki bölüm adı (breadcrumb kökü; tıklanabilir değil — ADR-0015 Karar 2.3). */
  section?: string
  /** A7: kök ikonu (verilmezse sekmenin menü kaydındaki modül ikonu). */
  sectionIcon?: string
  /** A7: kök ile başlık arasındaki üst ekranlar (`onSelect` → bağlantı). Uzun yolda katlanır. */
  trail?: EkCrumb[]
  /** A7: kayıt detayında başlığın yanındaki kayıt kimliği (kanal noktası + kısa kod + kopyala). */
  record?: EkRecordRef | null
  /** Sayfanın amacı — "Sayfa hakkında" panelinde. */
  description?: string
  /** Kısa kullanım ipuçları (panelde madde listesi). */
  tips?: string[]
  /** Başlık satırında her zaman görünen kısa durum metni (açıklama DEĞİL). */
  meta?: string
  /** Aşama 6b: sayfanın yenile düğmesi (satırın en sağı; Alt+R). */
  refreshable?: boolean
  refreshing?: boolean
  refreshLabel?: string
  lastUpdated?: Date | string | number | null
}>(), { refreshLabel: 'Yenile' })
const emit = defineEmits<{ refresh: [] }>()

const PAGE_KEYS: Array<{ id: ShortcutId; label: string }> = [
  { id: 'search', label: 'Akıllı arama' },
  { id: 'tabClose', label: 'Sekmeyi kapat' },
  { id: 'headerToggle', label: 'Üst bölümü daralt' },
  { id: 'focusMode', label: 'Tam ekran' },
  { id: 'pageRefresh', label: 'Sayfayı yenile' },
]
const keys = PAGE_KEYS.map((k) => ({ ...k, keys: SHORTCUTS.find((s) => s.id === k.id)?.keys ?? [] }))

const about = usePageAbout()
const panelId = `ek-page-about-${useId()}`

function openShortcutHelp() {
  window.dispatchEvent(new CustomEvent('ek:shortcut-help'))
}

// ---- A7 breadcrumb ----
/** Kap genişliği (görünüm alanı değil — sekme/yan panel içinde de doğru). */
const NARROW_MAX = 560
const rootRef = ref<HTMLElement | null>(null)
const width = ref(0)
// Yalnız GENİŞLİK izlenir ve bir sonraki kareye ertelenir: gözlemci geri çağrısında düzen değiştirmek
// ("ResizeObserver loop completed…" genel hatası) ve yükseklik değişiminin (dar kapta iki satır) döngüsü önlenir.
let raf = 0
useResizeObserver(rootRef, (entries) => {
  const w = Math.round(entries[0]?.contentRect.width ?? 0)
  if (w === width.value) return
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => (width.value = w))
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
const narrow = computed(() => width.value > 0 && width.value < NARROW_MAX)

const page = usePageContext()
// Menüde karşılığı olmayan klon sekmede (kayıt detayı) modül = ilk üst ekranın ikonu.
const rootIcon = computed(() => props.sectionIcon || page?.moduleIcon.value || props.trail?.[0]?.icon)
// Sığdırma: ara öğe kısalmak zorunda kalırsa bir kademe daha katla (2 → 1 → 0). Genişlik/yol değişince baştan ölç.
const keep = ref(2)
const view = computed(() => buildTrail(props.trail, { narrow: narrow.value, hasRoot: !!props.section, keep: keep.value }))
function crumbsClipped(): boolean {
  const root = rootRef.value
  if (!root) return false
  return Array.from(root.querySelectorAll<HTMLElement>('.ek-crumbs__item:not(.ek-crumbs__item--current) > .ek-crumbs__link, .ek-crumbs__item:not(.ek-crumbs__item--current):not(.ek-crumbs__item--root) > .ek-crumbs__text'))
    .some((el) => el.scrollWidth > el.clientWidth + 1)
}
async function fit() {
  keep.value = 2
  await nextTick()
  while (keep.value > 0 && crumbsClipped()) {
    keep.value -= 1
    await nextTick()
  }
}
watch([width, () => props.trail, () => props.title, () => props.record?.code], () => { if (width.value > 0) void fit() }, { flush: 'post' })
const foldedGroups = computed<EkMenuGroup[]>(() => [
  { items: view.value.folded.map((c, i) => ({ key: String(i), label: c.label, icon: c.icon, disabled: !c.onSelect })) },
])
function onFolded(item: EkMenuItem) {
  view.value.folded[Number(item.key)]?.onSelect?.()
}

const { showToast } = useToast()
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copyRecord() {
  const code = props.record?.code
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1600)
    showToast({ tone: 'success', message: `${code} panoya kopyalandı.` })
  } catch {
    showToast({ tone: 'error', message: 'Panoya kopyalanamadı. Kodu seçip elle kopyalayın.' })
  }
}
</script>

<style scoped>
.ek-page-bar {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Izgara: [başlıklar] [eylemler] [yenile]. Dar ekranda eylemler alt satıra iner, yenile başlık satırında kalır. */
.ek-page-bar__row {
  display: grid;
  /* A7: başlık sütunu esner (uzun yol kısalır), eylemler kendi genişliğinde — üst üste binme yok. */
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-areas: 'titles actions refresh';
  width: 100%;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  min-height: 40px;
}

.ek-page-bar__titles { grid-area: titles; }
.ek-page-bar__actions { grid-area: actions; }
.ek-page-bar__refresh { grid-area: refresh; display: inline-flex; justify-self: end; }

.ek-page-bar__titles {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

/* ---- A7 → B4 breadcrumb: [kök çip] › [ara çip] › H1 — nötr, ince kenarlı küçük çipler; ayraç sade chevron ----
   Çip = 28px (`chip-h-md`, etkileşimli), `radius-chip`, 1px `border-default`, çok hafif zemin (`surface-muted`), metin
   `content-muted`; bağlantı çipinde hover → zemin `surface` + kenarlık `border-strong` + metin `content-strong`.
   Kök (bölüm) aynı çip ama statik (tıklanmaz — Karar 2.3), modül ikonu çipin içinde nötr tonda. Vurgu rengi YOK:
   hiyerarşinin tek güçlü noktası H1. Durumlar geometri değiştirmez (layout shift 0). */
.ek-crumbs {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-crumbs__list {
  display: flex;
  align-items: center;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-crumbs__item {
  display: inline-flex;
  align-items: center;
  flex: none;
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
  white-space: nowrap;
}

.ek-crumbs__item--current {
  flex: 0 1 auto;
  gap: var(--ek-space-2);
}

/* Yer darsa ÖNCE ara öğeler kısalır (yüksek küçülme ağırlığı), başlık en son. */
.ek-crumbs__item:not(.ek-crumbs__item--current):not(.ek-crumbs__item--root) {
  flex: 0 1000 auto;
  min-width: 3.5em;
}

.ek-crumbs__item:not(.ek-crumbs__item--current) > .ek-crumbs__link,
.ek-crumbs__item:not(.ek-crumbs__item--current) > .ek-crumbs__text {
  min-width: 0;
}

.ek-page-bar__title {
  min-width: 4em;
}

.ek-crumbs__item--current > .ek-crumbs__sep {
  margin-right: 0;
}

/* Ara öğeler uzun olabilir (ör. entegrasyon adı): her biri en çok 14em, üç nokta + tam ad ipucunda. */
.ek-crumbs__link,
.ek-crumbs__item > .ek-crumbs__text {
  max-width: 14em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-crumbs__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: var(--ek-app-chip-h-md);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font: inherit;
  white-space: nowrap;
  transition: var(--ek-transition-colors);
}

.ek-crumbs__chip--static {
  padding-left: var(--ek-space-2);
}

.ek-crumbs__chip-icon {
  flex: none;
  color: var(--ek-color-content-muted);
}

.ek-crumbs__chip--static .ek-crumbs__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-crumbs__sep {
  display: inline-flex;
  align-items: center;
  margin: 0 var(--ek-space-1);
  color: var(--ek-color-content-subtle);
  user-select: none;
}

.ek-crumbs__link,
.ek-crumbs__more,
.ek-crumbs__back {
  cursor: pointer;
}

.ek-crumbs__link {
  display: inline-block;
  line-height: calc(var(--ek-app-chip-h-md) - 2px);
}

.ek-crumbs__more,
.ek-crumbs__back {
  justify-content: center;
  width: var(--ek-app-chip-h-md);
  padding: 0;
}

.ek-crumbs__back {
  margin-right: var(--ek-space-2);
  color: var(--ek-color-content-default);
}

.ek-crumbs__link:hover,
.ek-crumbs__more:hover,
.ek-crumbs__back:hover,
.ek-crumbs__more[aria-expanded='true'] {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
}

/* SON öğe = sayfa başlığı: tipografi ölçeğinden `title` rolü — hiyerarşinin tek güçlü noktası. */
.ek-page-bar__title {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Kayıt kimliği: kanal noktası + kısa kod (eş aralıklı) + kopyala. */
.ek-record-id {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-app-chip-h-md);
  padding: 0 2px 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
}

.ek-record-id__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

.ek-record-id__code {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  font-variant-numeric: tabular-nums;
}

.ek-record-id__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-record-id__copy:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-action);
}

/* B4 — yardım tetikleyicisi: 24px yuvarlak NÖTR düğme, ince kenarlık, ince çizgili "?" (dolgu/renk yok). Açıkken
   yalnız kenarlık + metin koyulaşır ve zemin hafifçe dolar (seçili ama sakin). İpucu `EkTooltip`; odak halkası token. */
.ek-page-bar__info {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-page-bar__info:hover {
  border-color: var(--ek-color-border-strong);
  color: var(--ek-color-content-strong);
}

.ek-page-bar__info.is-on {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

/* EkTooltip çapası satırın hizasını bozmasın. */
.ek-crumbs__item--current :deep(.ek-tooltip__anchor) {
  display: inline-flex;
  flex: none;
}

.ek-crumbs__link:focus-visible,
.ek-crumbs__more:focus-visible,
.ek-crumbs__back:focus-visible,
.ek-record-id__copy:focus-visible,
.ek-page-bar__info:focus-visible,
.ek-page-bar__all:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-page-bar__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* Dar kap: iki satır — üstte [← ebeveyn] (ya da kök), altta başlık + kayıt + (i). Başlık her zaman görünür. */
.is-narrow .ek-crumbs__list {
  flex-wrap: wrap;
  row-gap: var(--ek-space-1);
}

.is-narrow .ek-crumbs__item--current {
  flex: 1 1 100%;
}

.is-narrow .ek-crumbs__item--current > .ek-crumbs__sep {
  display: none;
}

/* Dar: başlık + (i) önce; kayıt kimliği sığmazsa alt satıra iner (başlığı kesmez). */
.is-narrow .ek-crumbs__item--current {
  flex-wrap: wrap;
  row-gap: var(--ek-space-2);
}

.is-narrow .ek-crumbs__item--current > :deep(.ek-tooltip__anchor) {
  order: 1;
}

.is-narrow .ek-record-id {
  order: 2;
}

.is-narrow .ek-page-bar__title {
  max-width: calc(100% - 32px);
}

/* Yenile düğmesi başlık satırıyla (alt satır) aynı hizada. */
.is-narrow .ek-page-bar__refresh {
  align-self: end;
}

.ek-page-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  margin-left: auto;
}

/* Panel: başlık satırının hemen altında, sayfa zemininde ince çerçeveli bilgi yüzeyi (kart değil — içerikle yarışmaz). */
.ek-page-bar__about {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--ek-space-3) var(--ek-space-6);
  margin-top: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-action-subtle);
}

.ek-page-bar__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-page-bar__label {
  margin: 0;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-page-bar__text,
.ek-page-bar__tips {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.ek-page-bar__tips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: var(--ek-space-4);
}

.ek-page-bar__keys {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
}

.ek-page-bar__key {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-page-bar__key dd {
  margin: 0;
}

.ek-page-bar__all {
  align-self: flex-start;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.ek-page-bar__all:hover {
  text-decoration: underline;
}

@media (max-width: 1023px) {
  .ek-page-bar__about {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .ek-page-bar__block--keys {
    grid-column: 1 / -1;
  }
}

@media (max-width: 599px) {
  .ek-page-bar__about {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-page-bar__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'titles refresh' 'actions actions';
  }

  .ek-page-bar__actions {
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }
}
</style>
