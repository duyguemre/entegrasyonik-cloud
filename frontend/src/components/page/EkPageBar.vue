<!--
  frontend/src/components/page/EkPageBar.vue

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
  <div ref="rootRef" class="ek-page-bar" :class="{ 'is-open': about.open.value, 'is-narrow': narrow, 'is-stacked': stacked }">
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
      <!-- FR2-HELP madde 16 (fe-r2a): rehber kartı — başlık (ikon + "<Sayfa> hakkında" + kapat), üç sütun: amaç (okunur
           gövde metni + "Yardım merkezinde oku →"), numaralı ipuçları, kısayollar (tuş satırları). Nötr yüzey + ince
           aksiyon tonlu üst şerit; içerikle yarışmaz. Esc ya da × kapatır (tercih ortak, `usePageAbout`). -->
      <div class="ek-page-bar__about" @keydown.esc.stop="closeAbout">
        <header class="ek-about__head">
          <span class="ek-about__glyph" aria-hidden="true"><v-icon icon="mdi-lightbulb-on-outline" /></span>
          <div class="ek-about__heading">
            <p class="ek-about__eyebrow">Sayfa rehberi</p>
            <h2 class="ek-about__title">{{ title }} hakkında</h2>
          </div>
          <button type="button" class="ek-about__close" aria-label="Sayfa hakkında bilgiyi kapat" @click="closeAbout">
            <v-icon icon="mdi-close" aria-hidden="true" />
          </button>
        </header>
        <div class="ek-about__grid">
          <section class="ek-page-bar__block ek-page-bar__block--purpose">
            <h3 class="ek-page-bar__label">Bu sayfa</h3>
            <p class="ek-page-bar__text">{{ purpose || `${title} ekranı.` }}</p>
            <button v-if="help?.article" type="button" class="ek-link ek-page-bar__read" data-page-help-read @click="nav.openHelp(help.article)">
              Yardım merkezinde oku
              <v-icon class="ek-link__arrow" icon="mdi-arrow-right" aria-hidden="true" />
            </button>
          </section>
          <section v-if="tipList?.length" class="ek-page-bar__block ek-page-bar__block--tips">
            <h3 class="ek-page-bar__label">İpuçları</h3>
            <ol class="ek-page-bar__tips">
              <li v-for="(tip, i) in tipList" :key="tip">
                <span class="ek-page-bar__tip-n ek-num" aria-hidden="true">{{ i + 1 }}</span>
                <span>{{ tip }}</span>
              </li>
            </ol>
          </section>
          <section class="ek-page-bar__block ek-page-bar__block--keys">
            <h3 class="ek-page-bar__label">Kısayollar</h3>
            <dl class="ek-page-bar__keys">
              <div v-for="k in keys" :key="k.id" class="ek-page-bar__key">
                <dt>{{ k.label }}</dt>
                <dd><EkKbd :keys="[...k.keys]" /></dd>
              </div>
            </dl>
            <button type="button" class="ek-link ek-link--sm ek-page-bar__all" @click="openShortcutHelp">
              Tüm kısayollar
              <v-icon class="ek-link__arrow" icon="mdi-arrow-right" aria-hidden="true" />
            </button>
          </section>
        </div>
      </div>
    </EkCollapse>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { EkCollapse, EkContextMenu, EkKbd, EkRefreshButton, EkTooltip } from '@entegrasyonik/ui/components'
import type { EkMenuGroup, EkMenuItem } from '@entegrasyonik/ui/components'
import { buildTrail, type EkCrumb, type EkRecordRef } from '@entegrasyonik/ui/components/pageTrail'
import { icons } from '@entegrasyonik/ui/icons'
import { channelClass } from '@entegrasyonik/ui/tokens'
import { SHORTCUTS, type ShortcutId } from '@entegrasyonik/ui/shortcuts'
import { usePageAbout } from '@/composables/usePageAbout'
import { usePageContext } from '@/composables/usePageContext'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { useTabScope } from '@entegrasyonik/ui/composables/useTabScope'
import { pageHelpFor } from '@/help/pageHelpLookup'
import { useHelpNavigation } from '@/help/useHelpNavigation'

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
  /** Sayfa yardımı anahtarı (`help/pageHelp.ts`); verilmezse içinde bulunulan çalışma alanı sekmesinin kodu. */
  helpKey?: string
}>(), { refreshLabel: 'Yenile' })
const emit = defineEmits<{ refresh: [] }>()

const PAGE_KEYS: Array<{ id: ShortcutId; label: string }> = [
  { id: 'search', label: 'Akıllı arama' },
  { id: 'tabClose', label: 'Sekmeyi kapat' },
  { id: 'headerToggle', label: 'Üst bölümü daralt' },
  { id: 'focusMode', label: 'Tam ekran' },
  { id: 'pageRefresh', label: 'Sayfayı yenile' },
]
// Bağlamsal yardım (faz3-fe-help): "Sayfa hakkında" içeriğinin TEK kaydı `help/pageHelp.ts` (ekran → amaç, ipuçları,
// kısayollar, makale). Anahtar sekme kabından (`WorkspaceTabHost` → `ek-tab-host-<kod>`) gelir; kayıtta yoksa sayfanın
// kendi `description`/`tips` değerleri kullanılır (vitrin, sekme dışı kullanım).
const scope = useTabScope()
const nav = useHelpNavigation()
const tabCode = scope?.hostId.replace(/^ek-tab-host-/, '')
const help = computed(() => pageHelpFor(props.helpKey ?? tabCode))
const purpose = computed(() => help.value?.purpose ?? props.description)
const tipList = computed(() => help.value?.tips ?? props.tips)

const SHORT_LABEL: Partial<Record<ShortcutId, string>> = Object.fromEntries(PAGE_KEYS.map((k) => [k.id, k.label]))
const keys = computed(() => {
  const ids = (help.value?.shortcuts?.length ? help.value.shortcuts : PAGE_KEYS.map((k) => k.id)) as ShortcutId[]
  return ids
    .map((id) => SHORTCUTS.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ id: s.id, label: SHORT_LABEL[s.id] ?? s.label, keys: s.keys }))
})

const about = usePageAbout()
const panelId = `ek-page-about-${useId()}`

function closeAbout() {
  about.setOpen(false)
}

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
/** B4: yol en kısa hâlinde bile başlık sütununa sığmıyorsa eylemler (arama vb.) alt satıra iner — üst üste binmez. */
const stacked = ref(false)
function titlesOverflow(): boolean {
  const titles = rootRef.value?.querySelector<HTMLElement>('.ek-page-bar__titles')
  return !!titles && titles.scrollWidth > titles.clientWidth + 1
}
async function fit() {
  keep.value = 2
  stacked.value = false
  await nextTick()
  while (keep.value > 0 && crumbsClipped()) {
    keep.value -= 1
    await nextTick()
  }
  if (!narrow.value && titlesOverflow()) stacked.value = true
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

/* ---- FR2-SHELL madde 1 (fe-r2a): çip/kenarlık KALKTI ("amatör" geri bildirimi). Yol artık sakin bir metin izi:
   [modül ikonu karosu] Bölüm  ›  Ara ekran  ›  H1 — kök ve ara halkalar `content-muted` metin (ara halkalar sessiz
   bağlantı, hover'da koyulaşıp alt çizgi dolar), ayraç `border-strong` ince chevron, H1 tek güçlü nokta.
   Önceki (A7 → B4) not korunur: ---- [kök çip] › [ara çip] › H1 — nötr, ince kenarlı küçük çipler; ayraç sade chevron ----
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

/* fe-polish: alt sınır başlığın kendisinde değil, başlık halkasında — kısa başlıklar ("ERP", "Kargo") 4em'e
   genişleyip (?) düğmesini sağa itiyordu. Halka yine en az ~4 başlık harfi + (?) kadar yer tutar. */
.ek-page-bar__title {
  min-width: 0;
}

.ek-crumbs__item--current {
  min-width: calc(var(--ek-type-title-size) * 4 + 32px);
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
  gap: 6px;
  height: var(--ek-app-chip-h-md);
  padding: 0 var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  white-space: nowrap;
  transition: var(--ek-transition-colors);
}

.ek-crumbs__chip--static {
  min-width: 0;
  max-width: 100%;
  padding-left: 0;
}

/* Kök çip de kısalabilir (en son ara öğelerden sonra): dar satırda metin üç noktaya, en kötü ikon çipine iner —
   başlık ve eylemler üst üste binmez (800px'te arama alanı H1'in üstüne biniyordu). */
.ek-crumbs__item--root {
  flex: 0 100 auto;
  min-width: calc(var(--ek-app-chip-h-md) + var(--ek-space-2));
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
  margin: 0 2px;
  color: var(--ek-color-border-strong);
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

/* Ara bağlantı: sessiz metin bağlantısı (FR2 madde 6 dili) — hover'da koyulaşır, 1px alt çizgi soldan dolar. */
.ek-crumbs__link {
  background-image: linear-gradient(currentColor, currentColor);
  background-repeat: no-repeat;
  background-position: var(--ek-space-1) calc(100% - 5px);
  background-size: 0% 1px;
  transition:
    background-size var(--ek-duration-base) var(--ek-easing-standard),
    color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-crumbs__link:hover {
  color: var(--ek-color-content-strong);
  background-size: calc(100% - 2 * var(--ek-space-1)) 1px;
}

.ek-crumbs__more:hover,
.ek-crumbs__back:hover,
.ek-crumbs__more[aria-expanded='true'] {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ek-crumbs__link:focus-visible,
.ek-crumbs__more:focus-visible,
.ek-crumbs__back:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
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

/* fe-polish: dar kapta meta (ör. "Son güncelleme …") başlığın yanında değil altında — 390px'te başlığı "Genel …"e
   kısaltıyordu. */
.is-narrow .ek-page-bar__titles {
  flex-wrap: wrap;
  row-gap: var(--ek-space-1);
}

.is-narrow .ek-page-bar__meta {
  flex: 1 1 100%;
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

/* B4: yığılı düzen — başlık satırı tek başına, eylemler alt satırda sola yaslı (yenile başlık satırında kalır). */
.is-stacked .ek-page-bar__row {
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'titles refresh' 'actions actions';
}

.is-stacked .ek-page-bar__actions {
  width: 100%;
  justify-content: flex-start;
  margin-left: 0;
}

/* FR2-HELP madde 16: rehber kartı. Nötr yüzey (kart dili), üstte 3px aksiyon şeridi yerine ince aksiyon tonlu
   başlık bandı; gövde üç sütun. Metin okunur boyda (body), ipuçları numaralı; tuş satırları noktalı kılavuzla. */
.ek-page-bar__about {
  margin-top: var(--ek-space-3);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-about__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: linear-gradient(90deg, var(--ek-color-action-subtle), var(--ek-color-surface) 70%);
}

.ek-about__glyph {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
  color: var(--ek-color-action);
  font-size: var(--ek-icon-md);
}

.ek-about__heading {
  flex: 1;
  min-width: 0;
}

.ek-about__eyebrow {
  margin: 0;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-about__title {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-about__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-about__close:hover {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ek-about__close:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-about__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.5fr) minmax(0, 1fr);
}

.ek-page-bar__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
  padding: var(--ek-space-4);
}

.ek-page-bar__block + .ek-page-bar__block {
  border-left: 1px solid var(--ek-color-border-subtle);
}

.ek-page-bar__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-page-bar__text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-page-bar__tips {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.ek-page-bar__tips > li {
  display: flex;
  gap: var(--ek-space-2);
}

.ek-page-bar__tip-n {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-page-bar__block--keys {
  background: var(--ek-color-surface-muted);
}

.ek-page-bar__keys {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
}

.ek-page-bar__key {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

/* Etiket ile tuşlar arasında noktalı kılavuz — göz satırı kolay izler. */
.ek-page-bar__key dt {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-page-bar__key dt::after {
  content: '';
  flex: 1;
  min-width: var(--ek-space-3);
  border-bottom: 1px dotted var(--ek-color-border-strong);
}

.ek-page-bar__key dd {
  margin: 0;
}

.ek-page-bar__all,
.ek-page-bar__read {
  align-self: flex-start;
  margin-top: var(--ek-space-1);
}

@media (max-width: 1023px) {
  .ek-about__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .ek-page-bar__block--keys {
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid var(--ek-color-border-subtle);
  }
}

@media (max-width: 599px) {
  .ek-about__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ek-page-bar__block + .ek-page-bar__block {
    border-left: 0;
    border-top: 1px solid var(--ek-color-border-subtle);
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
