<!--
  frontend/src/components/ds/EkSidebarNav.vue

  DS-v2 — sol menü. Bölüm (ayırıcı + mikro etiket, öğe renginde — A10) → öğeler
  → alt öğeler. Durumlar: hover (`sidebar-hover`), ETKİN ekran
  (`sidebar-active` zemin + `action-emphasis` metin + solda 3px aksiyon
  göstergesi), açık grup (ok döner, alt öğeler girintili ve dikey kılavuz
  çizgili).
  UZUN METİN KESİLMEZ: etiket gerektiği kadar satıra sarılır (kırpma yok).
  `collapsed` (ray) modunda yalnızca ikonlar; ad `aria-label` + tooltip.
  Klavye: doğal Tab sırası (düğmeler); grup düğmesi `aria-expanded`.
  Etkin öğe bir grubun içindeyse grup kendiliğinden açılır.
  FR2-SHELL madde 2 (fe-r2a): grup ile yaprak arasında RENK/AĞIRLIK farkı yok — tüm öğeler aynı mürekkep ve ağırlık
  (orta); hiyerarşi yalnız girinti + ince kılavuz çizgisiyle okunur. Alt öğe metni üst öğenin METNİYLE aynı hizada
  başlar; etkin alt öğenin göstergesi kılavuz çizgisinin üstünde 2px segment. Etiketli bölümler arasında çizgi yok
  (etiket + boşluk yeter; çizgi yalnız etiketsiz bölümde). Hover yumuşak, etkin tek vurgu.
  Ek (geri uyumlu): `hookClasses` — kabukta eski spec çapası sınıfları
  (öğe/grup/grup başlığı/alt öğe) düğmelere eklemek için; `#item-trailing`
  — yaprak öğenin sağında, düğmenin KARDEŞİ olarak (iç içe düğme yok) ek
  eylem (ör. favori yıldızı); ray modunda grup tıklaması `expand-request`.
-->
<template>
  <nav class="ek-side" :class="{ 'ek-side--collapsed': collapsed }" :aria-label="label">
    <div
      v-for="(section, sIndex) in sections"
      :key="section.label || `s${sIndex}`"
      class="ek-side__section"
      :class="{ 'is-first': sIndex === 0, 'has-label': showLabel(section) }"
    >
      <div v-if="sIndex > 0" class="ek-side__section-rule" aria-hidden="true"></div>
      <!-- B4: başlık rayda da DOM'da kalır (yuvası korunur → ikonlar daralırken dikeyde kıpırdamaz); yalnız solar. -->
      <p
        v-if="showLabel(section)"
        :id="`${uid}-s${sIndex}`"
        class="ek-side__section-label ek-side__fade"
        :aria-hidden="collapsed ? 'true' : undefined"
      >{{ section.label }}</p>
      <ul class="ek-side__list" :aria-labelledby="!collapsed && showLabel(section) ? `${uid}-s${sIndex}` : undefined">
        <li
          v-for="item in section.items"
          :key="item.key"
          class="ek-side__entry"
          :class="[item.children ? hookClasses?.group : undefined, { 'has-trailing': !!$slots['item-trailing'] && !item.children }]"
        >
          <v-tooltip :eager="false" transition="fade-transition" :disabled="!collapsed" location="end" :text="item.label">
            <template #activator="{ props: tipProps }">
              <button
                v-bind="tipProps"
                type="button"
                class="ek-side__item"
                :class="[
                  hookClasses?.item,
                  item.children ? hookClasses?.groupHeader : undefined,
                  {
                    'is-muted': item.muted,
                    'is-active': isActive(item),
                    'is-hover': forceHoverKey === item.key,
                    'is-parent-active': !!item.children && isAncestor(item),
                  },
                ]"
                :data-key="item.key"
                :aria-current="item.key === activeKey ? 'page' : undefined"
                :aria-expanded="item.children && !collapsed ? isOpen(item.key) : undefined"
                :aria-label="collapsed ? item.label : undefined"
                @click="onItem(item)"
              >
                <v-icon class="ek-side__icon" :icon="outlineIcon(item.icon) ?? 'mdi-circle-small'" aria-hidden="true" />
                <span class="ek-side__label ek-side__fade">{{ item.label }}</span>
                <EkBadge v-if="item.badge" class="ek-side__fade" :variant="item.badgeVariant ?? 'count'" :tone="item.badgeTone ?? 'action'" :text="item.badge" />
                <v-icon
                  v-if="item.children"
                  class="ek-side__chevron ek-side__fade"
                  :class="{ 'is-open': isOpen(item.key) }"
                  icon="mdi-chevron-down"
                  aria-hidden="true"
                />
              </button>
            </template>
          </v-tooltip>
          <span v-if="$slots['item-trailing'] && !item.children" class="ek-side__trailing ek-side__fade ek-side__hideable">
            <slot name="item-trailing" :item="item" />
          </span>
          <!-- B4: alt liste yükseklik (grid 0fr↔1fr) + opaklıkla açılır/kapanır; kapalıyken görünmez ve odaklanamaz. -->
          <div
            v-if="item.children"
            class="ek-side__subwrap"
            :class="{ 'is-open': isOpen(item.key) && !collapsed }"
            :inert="!(isOpen(item.key) && !collapsed) || undefined"
          >
            <div class="ek-side__subclip">
              <ul class="ek-side__sublist">
                <li v-for="child in item.children" :key="child.key">
                  <button
                    type="button"
                    class="ek-side__subitem"
                    :class="[hookClasses?.subItem, { 'is-muted': child.muted, 'is-active': child.key === activeKey, 'is-hover': forceHoverKey === child.key }]"
                    :data-key="child.key"
                    :aria-current="child.key === activeKey ? 'page' : undefined"
                    @click="emit('select', child.key)"
                  >
                    <span class="ek-side__label">{{ child.label }}</span>
                    <EkBadge v-if="child.badge" :variant="child.badgeVariant ?? 'count'" :tone="child.badgeTone ?? 'neutral'" :text="child.badge" />
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { outlineIcon } from '../icons'
import { ref, useId, watch } from 'vue'
import EkBadge from './EkBadge.vue'

export interface EkSideItem {
  key: string
  label: string
  icon?: string
  badge?: string | number
  badgeTone?: 'action' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  /** Ek (geri uyumlu): rozet biçimi — varsayılan `count` (dolu sayaç); `label` sakin çerçeveli etiket (ör. "Yakında"). */
  badgeVariant?: 'count' | 'label'
  /** Ek (geri uyumlu): henüz hazır olmayan ekran — etiket soluk; tıklanabilir kalır. */
  muted?: boolean
  children?: EkSideItem[]
}

export interface EkSideSection {
  label: string
  items: EkSideItem[]
}

const props = withDefaults(
  defineProps<{
    sections: EkSideSection[]
    activeKey?: string
    label?: string
    collapsed?: boolean
    defaultOpen?: string[]
    forceHoverKey?: string
    /** Kabuk entegrasyonu: düğmelere eklenecek ek sınıflar (spec çapaları). */
    hookClasses?: { item?: string; group?: string; groupHeader?: string; subItem?: string }
  }>(),
  { label: 'Ana menü', collapsed: false, defaultOpen: () => [] },
)

const emit = defineEmits<{ select: [key: string]; 'expand-request': [key: string] }>()
const open = ref(new Set(props.defaultOpen))

// Etkin öğe kapalı bir grubun içindeyse grubu aç (kullanıcı nerede olduğunu görsün).
watch(
  () => [props.activeKey, props.sections] as const,
  () => {
    for (const section of props.sections) {
      for (const item of section.items) {
        if (item.children?.some((c) => c.key === props.activeKey) && !open.value.has(item.key)) {
          open.value = new Set([...open.value, item.key])
        }
      }
    }
  },
  { immediate: true },
)

const uid = `ek-side-${useId()}`

/** Tek öğeli bölümde başlık öğenin adını tekrar ediyorsa (ör. "ENTEGRASYONLAR › Entegrasyonlar") gösterilmez —
 *  yalnız ayırıcı kalır; tekrar eden etiket gürültüdür ve grubu "ayrı bir şey" gibi gösterir (A10). */
const norm = (text: string) => text.trim().toLocaleLowerCase('tr')
function showLabel(section: EkSideSection) {
  if (!section.label) return false
  return !(section.items.length === 1 && norm(section.items[0].label) === norm(section.label))
}

const isOpen = (key: string) => open.value.has(key)
const isAncestor = (item: EkSideItem) => !!item.children?.some((c) => c.key === props.activeKey)
const isActive = (item: EkSideItem) => item.key === props.activeKey || (props.collapsed && isAncestor(item))

function onItem(item: EkSideItem) {
  if (!item.children) return emit('select', item.key)
  if (props.collapsed) return emit('expand-request', item.key)
  const next = new Set(open.value)
  if (next.has(item.key)) next.delete(item.key)
  else next.add(item.key)
  open.value = next
}
</script>

<style scoped>
/* ---- B4: renk disiplini — YALNIZ etkin sayfa vurgu renginde ----
   Bölüm başlıkları ve grup başlıkları/ikonları nötr (ikincil metin tonu); etkin öğenin grubu vurgu almaz (yalnız
   metni bir kademe koyulaşır). Etkin = hafif ton zemin (`sidebar-active`) + solda 3px aksiyon çizgisi + vurgulu
   metin/ikon. Hover/odak/etkin durumları GEOMETRİ değiştirmez (ağırlık sabit, zemin sahte öğede) → layout shift 0.

   ---- B4: daralma/genişleme (ray) ----
   İçerik (etiket, rozet, ok, bölüm başlığı) DOM'da kalır ve yalnız OPAKLIKLA solar — kırpılarak kaybolmaz; etiket
   sabit genişlikte kaldığı için yeniden sarılmaz (dikey kıpırtı yok). Ardından zemin/odak "hapı" (`::after`) ve
   bölüm ayırıcısı ikon sütununa daralır; kabuk çekmecesi aynı süre/eğriyle daralır (--ek-app-nav-*). İkon x
   konumu iki durumda aynıdır (ray merkezi). reduced-motion / data-motion=reduced → anında (app.css). */
.ek-side {
  --ek-side-pad: var(--ek-space-3);
  --ek-side-rail-item: var(--ek-control-h-lg);
  /* Hedef = GENİŞ: geometri hemen, içerik genişliğin yarısında belirir. */
  --ek-side-geo: var(--ek-app-nav-move, 0ms) var(--ek-easing-enter) 0ms;
  --ek-side-fade-t: opacity var(--ek-duration-base) var(--ek-easing-enter) var(--ek-app-nav-reveal, 0ms);
  display: flex;
  flex-direction: column;
  padding: var(--ek-space-3) var(--ek-side-pad) var(--ek-space-4);
  background: var(--ek-color-sidebar-bg);
  color: var(--ek-color-sidebar-text);
}

/* Hedef = RAY: içerik hemen solar, geometri yarım solma kadar gecikir. */
.ek-side--collapsed {
  --ek-side-geo: var(--ek-app-nav-move, 0ms) var(--ek-easing-enter) var(--ek-app-nav-lag, 0ms);
  --ek-side-fade-t: opacity var(--ek-app-nav-fade, 0ms) var(--ek-easing-standard) 0ms;
}

.ek-side__fade {
  transition: var(--ek-side-fade-t);
}

.ek-side--collapsed .ek-side__fade {
  opacity: 0;
}

/* Rayda odaklanabilir kalmasın (favori yıldızı vb.): görünürlük solma bittikten sonra kapanır. */
.ek-side__hideable {
  transition: var(--ek-side-fade-t), visibility 0ms linear 0ms;
}

.ek-side--collapsed .ek-side__hideable {
  visibility: hidden;
  transition: var(--ek-side-fade-t), visibility 0ms linear var(--ek-app-nav-fade, 0ms);
}

.ek-side__section + .ek-side__section {
  margin-top: var(--ek-space-4);
}

/* Etiketli bölümde ayırıcı çizgi gizli (etiket + boşluk ayırır); rayda etiket solduğu için çizgi geri gelir. */
.ek-side__section.has-label > .ek-side__section-rule {
  opacity: 0;
  margin-bottom: 0;
  height: 0;
}

.ek-side--collapsed .ek-side__section.has-label > .ek-side__section-rule {
  opacity: 1;
  height: 1px;
  margin-bottom: var(--ek-space-3);
}

.ek-side__section-rule {
  width: calc(100% - 2 * var(--ek-space-3));
  height: 1px;
  margin: 0 0 var(--ek-space-3) var(--ek-space-3);
  background: var(--ek-color-sidebar-border);
  transition: width var(--ek-side-geo), margin-left var(--ek-side-geo);
}

/* Ray: ayırıcı ikon sütununun ortasında kısa çizgi (24px). */
.ek-side--collapsed .ek-side__section-rule {
  width: var(--ek-space-6);
  margin-left: calc((var(--ek-side-rail-item) - var(--ek-space-6)) / 2);
}

/* Bölüm başlığı: ikincil metin tonu (nötr, AA) mikro etiket — grup "renkli/açık" görünmez (B4 geri bildirimi). */
.ek-side__section-label {
  margin: 0;
  padding: 0 var(--ek-space-3) var(--ek-space-1);
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  white-space: nowrap;
}

.ek-side__section.is-first.has-label .ek-side__section-label {
  padding-top: var(--ek-space-1);
}

.ek-side__list,
.ek-side__sublist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-side__item,
.ek-side__subitem {
  --ek-side-fill: transparent;
  --ek-side-ink: var(--ek-color-content-default);
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: var(--ek-control-h-md);
  /* İkon merkezi = ray merkezi (pad + item/2): sol iç boşluk ikon genişliğinin yarısı kadar dengelenir. */
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-2) calc((var(--ek-side-rail-item) - var(--ek-icon-md)) / 2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-side-ink);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
  text-align: left;
  cursor: pointer;
  transition: color var(--ek-duration-fast) var(--ek-easing-enter);
}

.ek-side__subitem {
  padding-left: var(--ek-space-3);
}


/* Zemin + odak halkası sahte öğede: rayda ikon sütununa (40px) daralır; düğmenin kutusu hiç değişmez. */
.ek-side__item::after,
.ek-side__subitem::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--ek-side-fill);
  transition:
    background-color var(--ek-duration-fast) var(--ek-easing-enter),
    box-shadow var(--ek-duration-fast) var(--ek-easing-enter),
    right var(--ek-side-geo);
}

.ek-side--collapsed .ek-side__item::after {
  right: calc(100% - var(--ek-side-rail-item));
}

.ek-side__item:hover,
.ek-side__item.is-hover,
.ek-side__subitem:hover,
.ek-side__subitem.is-hover {
  --ek-side-fill: var(--ek-color-sidebar-hover);
  --ek-side-ink: var(--ek-color-content-strong);
}

.ek-side__item:focus-visible,
.ek-side__subitem:focus-visible {
  outline: none;
}

.ek-side__item:focus-visible::after,
.ek-side__subitem:focus-visible::after {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

/* ETKİN: tek vurgulu öğe. */
.ek-side__item.is-active,
.ek-side__subitem.is-active {
  --ek-side-fill: var(--ek-color-sidebar-active);
  --ek-side-ink: var(--ek-color-action-emphasis);
}

.ek-side__item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--ek-space-2);
  bottom: var(--ek-space-2);
  width: 3px;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background: var(--ek-color-action);
}

/* Ray'da etkin öğe grubun içindeyse grup ikonu etkinliği taşır — ama yalnız alt liste SOLDUKTAN sonra belirir
   (aynı anda iki vurgulu hap görünmesin). */
.ek-side--collapsed .ek-side__item.is-parent-active::after {
  transition:
    background-color var(--ek-duration-base) var(--ek-easing-enter) var(--ek-app-nav-fade, 0ms),
    box-shadow var(--ek-duration-fast) var(--ek-easing-enter),
    right var(--ek-side-geo);
}

.ek-side--collapsed .ek-side__item.is-parent-active::before {
  animation: ek-side-reveal var(--ek-duration-base) var(--ek-easing-enter) var(--ek-app-nav-fade, 0ms) both;
}

@keyframes ek-side-reveal {
  from {
    opacity: 0;
  }
}

/* Etkin öğenin grubu: NÖTR — yalnız metin bir kademe koyu (renk/ikon vurgusu yok, ağırlık sabit). */
.ek-side__item.is-parent-active:not(.is-active) {
  --ek-side-ink: var(--ek-color-content-strong);
}

.ek-side__icon {
  flex: none;
  font-size: var(--ek-icon-md);
  color: var(--ek-color-content-muted);
  transition: color var(--ek-duration-fast) var(--ek-easing-enter);
}

.ek-side__item:hover .ek-side__icon,
.ek-side__item.is-hover .ek-side__icon,
.ek-side__item.is-parent-active .ek-side__icon {
  color: var(--ek-color-content-default);
}

.ek-side__item.is-active .ek-side__icon {
  color: var(--ek-color-action);
}

.ek-side__item.is-muted:not(.is-active) .ek-side__label,
.ek-side__item.is-muted:not(.is-active) .ek-side__icon,
.ek-side__subitem.is-muted:not(.is-active) .ek-side__label {
  color: var(--ek-color-content-muted);
}

.ek-side__label {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.ek-side__entry {
  position: relative;
}

.ek-side__entry.has-trailing > .ek-side__item {
  padding-right: calc(var(--ek-space-3) + 24px);
}

.ek-side__trailing {
  position: absolute;
  top: 0;
  right: var(--ek-space-2);
  display: flex;
  align-items: center;
  height: var(--ek-control-h-md);
}

.ek-side__chevron {
  flex: none;
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
  transition:
    var(--ek-side-fade-t),
    transform var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-side__chevron.is-open {
  transform: rotate(180deg);
}

/* Alt liste: yükseklik 0fr↔1fr + opaklık (EkCollapse deseni); kapalıyken görünmez/odaklanamaz. */
.ek-side__subwrap {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition:
    grid-template-rows var(--ek-duration-base) var(--ek-easing-standard),
    opacity var(--ek-duration-fast) var(--ek-easing-standard),
    visibility 0ms linear var(--ek-duration-base);
}

.ek-side__subwrap.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
  visibility: visible;
  transition:
    grid-template-rows var(--ek-duration-base) var(--ek-easing-enter),
    opacity var(--ek-duration-base) var(--ek-easing-enter),
    visibility 0ms linear 0ms;
}

/* Ray'a geçerken alt liste önce solar, sonra katlanır (genişlikle aynı gecikme). */
.ek-side--collapsed .ek-side__subwrap {
  transition:
    grid-template-rows var(--ek-side-geo),
    opacity var(--ek-app-nav-fade, 0ms) var(--ek-easing-standard),
    visibility 0ms linear var(--ek-app-nav-fade, 0ms);
}

/* Kırpıcı ayrı katman: alt listenin dolgu/kenar boşluğu 0fr'de yükseklik bırakmaz (kapalı grup = 0px). */
.ek-side__subclip {
  min-height: 0;
  overflow: hidden;
}

.ek-side__sublist {
  position: relative;
  /* Kılavuz çizgisi üst öğenin ikon sütunu ortasında; alt öğe METNİ üst öğenin metniyle aynı x'te başlar. */
  margin: 2px 0 var(--ek-space-1) calc(var(--ek-side-rail-item) / 2);
  padding: 0 0 0 calc(var(--ek-icon-md) / 2 - 1px);
  border-left: 1px solid var(--ek-color-sidebar-border);
}

.ek-side__subitem {
  min-height: var(--ek-control-h-sm);
  padding-top: var(--ek-space-1);
  padding-bottom: var(--ek-space-1);
}

/* Etkin alt öğe: göstergesi kılavuz çizgisinin ÜSTÜNDE (öğe kutusunun solunda değil) — hiyerarşi çizgisi kesintisiz. */
.ek-side__subitem.is-active::before {
  content: '';
  position: absolute;
  top: var(--ek-space-1);
  bottom: var(--ek-space-1);
  left: calc(var(--ek-icon-md) / -2 - 0.5px);
  width: 2px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-action);
}

@media (prefers-reduced-motion: reduce) {
  .ek-side__chevron,
  .ek-side__subwrap,
  .ek-side__subwrap.is-open {
    transition: none;
  }

  .ek-side--collapsed .ek-side__item.is-parent-active::before {
    animation: none;
  }
}

:root[data-motion='reduced'] .ek-side__chevron,
:root[data-motion='reduced'] .ek-side__subwrap {
  transition: none;
}

:root[data-motion='reduced'] .ek-side__item::before {
  animation: none;
}
</style>
