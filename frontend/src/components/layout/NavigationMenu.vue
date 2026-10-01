<!--
  frontend/src/components/layout/NavigationMenu.vue

  DS-v2 — sol menü (248px tam / 64px ray). İçerik `EkSidebarNav`: bölüm başlığı (nötr mikro etiket) → öğeler →
  alt öğeler; etiketler KESİLMEZ (sarılır); YALNIZ etkin ekran vurgu renginde (`sidebar-active` + 3px aksiyon
  göstergesi), etkin öğenin grubu kendiliğinden açık. Favori yıldızı öğenin sağında (düğmenin kardeşi).

  Sunumlar (ADR-0015 Karar 2.1/2.2 — `SecureLayout` karar verir):
   - kalıcı (`temporary=false`): masaüstünde tam ↔ ray AYNI çekmecede (`rail`), B4: geçiş koreografili — içerik
     önce opaklıkla solar, sonra genişlik yavaşlayarak daralır (açılışta ters); ikonlar yerinden oynamaz. Tablette
     varsayılan ray. Alttaki düğme "Daralt" (Ctrl+B) ↔ "Menüyü genişlet" (aynı yer — ray/tam arasında zıplamaz).
   - geçici (`temporary=true`): tablet üst katmanı / mobil çekmece; seçimden sonra kapanır.

  Spec çapaları (Ek A / Karar 5.1 — ekran spec'leri bu sınıflarla menüden gezinir, bu yüzden KORUNUR):
  tam `.v-navigation-drawer.soft-nav` / ray `.soft-rail` (aynı anda yalnız biri), öğe `.soft-item`, grup
  `.v-list-group` > `.v-list-group__header`, alt öğe `.sub-item-soft`, `.collapse-btn` (tam) / `.rail-logo-btn` (ray).
-->
<template>
  <v-navigation-drawer
    v-model="drawerVisible"
    :permanent="!temporary"
    :temporary="temporary"
    :rail="isRail"
    :rail-width="64"
    :width="248"
    id="tour-homepage-menu"
    class="ek-shell-nav"
    :class="isRail ? 'soft-rail is-rail' : 'soft-nav'"
    :aria-label="isRail ? 'Daraltılmış gezinme menüsü' : 'Ana gezinme menüsü'"
    @scroll.capture="pinHorizontal"
  >
    <div class="ek-shell-nav__wrap">
      <div class="ek-shell-nav__scroll">
        <EkSidebarNav
          :sections="model.sections"
          :active-key="activeKey"
          label="Ekranlar"
          :collapsed="isRail"
          :hook-classes="HOOK_CLASSES"
          @select="onSelect"
          @expand-request="$emit('expand-request')"
          @reorder="onReorder"
          @dismiss-empty="dismissFavoritesHint"
        >
          <template #item-trailing="{ item, section }">
            <EkTooltip
              v-if="isFavoritable(item.key)"
              :text="isFavorite(item.key) ? t('shell.favorites.remove') : t('shell.favorites.add')"
              location="end"
              :open-delay="400"
            >
              <button
                type="button"
                class="ek-shell-nav__fav"
                :class="{ 'is-on': isFavorite(item.key), 'is-pinned-row': section?.id === FAVORITES_SECTION_ID }"
                :aria-pressed="isFavorite(item.key)"
                :aria-label="isFavorite(item.key) ? `${t('shell.favorites.remove')}: ${item.label}` : `${t('shell.favorites.add')}: ${item.label}`"
                @click.stop="toggleFavorite(item.key, item.label)"
              >
                <v-icon :icon="isFavorite(item.key) ? 'mdi-star' : 'mdi-star-outline'" :size="isFavorite(item.key) ? 14 : 16" aria-hidden="true" />
              </button>
            </EkTooltip>
          </template>
        </EkSidebarNav>
        <p class="ek-sr-only" aria-live="polite">{{ announce }}</p>
      </div>

      <div v-if="!temporary" class="ek-shell-nav__footer">
        <v-tooltip :eager="false" transition="fade-transition" location="end" :open-delay="300" :disabled="!isRail">
          <template #activator="{ props: tip }">
            <button
              v-bind="tip"
              type="button"
              class="ek-shell-nav__toggle"
              :class="isRail ? 'rail-logo-btn' : 'collapse-btn'"
              :aria-label="isRail ? withShortcut('Gezinme menüsünü genişlet', 'sidebarToggle') : withShortcut('Kenar menüyü daralt', 'sidebarToggle')"
              :aria-expanded="!isRail"
              @click="isRail ? $emit('expand-request') : $emit('collapse-request')"
            >
              <v-icon class="ek-shell-nav__toggle-icon" icon="mdi-chevron-double-left" aria-hidden="true" />
              <span class="ek-shell-nav__toggle-label ek-shell-nav__fade">Daralt</span>
              <EkKbd class="ek-shell-nav__fade" :keys="shortcutKeys('sidebarToggle')" />
            </button>
          </template>
          <span class="ek-shell-nav__tip">Menüyü genişlet <EkKbd :keys="shortcutKeys('sidebarToggle')" tone="inverse" /></span>
        </v-tooltip>
      </div>
    </div>
  </v-navigation-drawer>
</template>
<script lang="ts" setup>
import { computed, ref } from 'vue'
import useUser from '@/composables/user'
import { useI18n } from 'vue-i18n'
import { EkSidebarNav, EkKbd, EkTooltip } from '@entegrasyonik/ui/components'
import { shortcutKeys, withShortcut } from '@entegrasyonik/ui/shortcuts'
import { dismissFavoritesHint, FAVORITES_SECTION_ID, useShellMenu } from './useShellMenu'

const HOOK_CLASSES = { item: 'soft-item', group: 'v-list-group', groupHeader: 'v-list-group__header', subItem: 'sub-item-soft' }

const props = withDefaults(defineProps<{ temporary: boolean; modelValue?: boolean; rail?: boolean }>(), { modelValue: true, rail: false })
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'collapse-request': []; 'expand-request': [] }>()

/** Ray yalnız kalıcı sunumda (geçici çekmece her zaman tam). */
const isRail = computed(() => !props.temporary && props.rail)

const userApi = useUser()
const { t } = useI18n({ useScope: 'global' })
const { model, activeKey, linkFor, openKey, menuStore } = useShellMenu()

// Kalıcı modda drawer her zaman görünür; `v-model` yalnızca `temporary` modda anlamlı.
const drawerVisible = computed({
  get: () => (props.temporary ? props.modelValue : true),
  set: (value: boolean) => {
    if (props.temporary) emit('update:modelValue', value)
  },
})

function onSelect(key: string) {
  const link = linkFor(key)
  if (!link) return
  // Eski davranış AYNEN: yalnızca ÜST DÜZEY "Çıkış" öğesi oturumu kapatır; bir grubun ALT öğesi
  // olan ExitView ekran olarak açılır (karakterizasyon: user-account-forms.spec.ts).
  if (link.code === 'ExitView' && !link.parent) {
    userApi.logout()
    return
  }
  openKey(key)
  // Yalnızca GEÇİCİ sunumda seçimden sonra kapanır (kalıcı masaüstü menü açık kalır — Karar 2.1).
  if (props.temporary) emit('update:modelValue', false)
}

const isFavoritable = (key: string) => {
  const link = linkFor(key)
  return !!link && !link.isConstant && link.code !== 'ExitView'
}
const isFavorite = (key: string) => !!linkFor(key)?.isFavorite

/** FR3 madde 1 (fe-r3a) — ray hatası: öğe odak/hover ile görünür alana kaydırılınca (Tab, ipucu) çekmece içeriği yatayda
 *  ~160px kayıyor, tüm ikonlar ekrandan çıkıyordu (içerik 248px, ray 64px). Menü YALNIZ dikey kayar: yatay kayma kaydırma
 *  olayında sıfırlanır (olay boyamadan önce işlenir → titreme yok). `overflow: clip` denendi: kaydırmayı engelliyor ama
 *  rayda düğmenin görünmeyen kısmı tıklama hedefini kesiyordu. */
function pinHorizontal(event: Event) {
  const el = event.target as HTMLElement | null
  if (el && el.scrollLeft) el.scrollLeft = 0
}
/** FR3 madde 2: ekle/çıkar iyimser (menü deposu) — Favoriler bölümü anında güncellenir; ekran okuyucuya kısa duyuru. */
const announce = ref('')
function toggleFavorite(key: string, label: string) {
  const link = linkFor(key)
  if (!link) return
  if (link.isFavorite) {
    menuStore.deleteFavorite(link.code)
    announce.value = `${label} ${t('shell.favorites.removed')}`
  } else {
    menuStore.addFavorite(link.code)
    announce.value = `${label} ${t('shell.favorites.added')}`
  }
}
function onReorder(sectionId: string, keys: string[]) {
  if (sectionId !== FAVORITES_SECTION_ID) return
  const codes = keys.map((k) => linkFor(k)?.code).filter(Boolean)
  menuStore.sortFavorites(codes)
}
</script>

<style scoped>
/* Çekmece genişliği Vuetify'dan (rail ↔ width); süre/eğri/gecikme B4 koreografisinden (app.css --ek-app-nav-*):
   ray'a giderken içerik solduktan sonra (`lag`) daralır, açılırken hemen genişler. */
.ek-shell-nav {
  background: var(--ek-color-sidebar-bg) !important;
  border-right: 1px solid var(--ek-color-sidebar-border) !important;
  transition-duration: var(--ek-app-nav-move) !important;
  transition-timing-function: var(--ek-motion-layout-easing) !important;
  transition-delay: 0ms;
}

.ek-shell-nav.is-rail {
  transition-delay: var(--ek-app-nav-lag);
}

/* İçerik HER İKİ durumda tam genişlikte (etiket yeniden sarılmaz, ikonlar kıpırdamaz); çekmece kırpar. */
.ek-shell-nav__wrap {
  display: flex;
  flex-direction: column;
  width: var(--ek-app-sidebar-width);
  height: 100%;
}

.ek-shell-nav__scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--ek-color-border-strong) transparent;
}

.is-rail .ek-shell-nav__scroll {
  scrollbar-color: transparent transparent;
}

.ek-shell-nav__scroll :deep(.ek-side) {
  padding-top: var(--ek-space-4);
}

.ek-shell-nav__fav {
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
  opacity: 0;
  cursor: pointer;
  transition: var(--ek-transition-colors), opacity var(--ek-motion-feedback);
}

/* Favori: vurgu rengi DEĞİL (tek vurgu = etkin sayfa) — nötr dolu yıldız; işaretli öğede her zaman görünür (nerede
   favori olduğu bir bakışta), Favoriler bölümündeki satırda yalnız hover/odakta (orada zaten favori olduğu belli). */
.ek-shell-nav__fav.is-on {
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.ek-shell-nav__fav.is-on:hover {
  color: var(--ek-color-content-strong);
}

.ek-shell-nav__fav.is-on.is-pinned-row {
  opacity: 0;
}

:deep(.ek-side__entry:hover > .ek-side__trailing) .ek-shell-nav__fav,
:deep(.ek-side__subentry:hover) .ek-shell-nav__fav,
.ek-shell-nav__fav:focus-visible,
.ek-shell-nav__fav.is-on.is-pinned-row:focus-visible {
  opacity: 1;
}

:deep(.ek-side__entry:hover > .ek-side__trailing) .ek-shell-nav__fav.is-pinned-row {
  opacity: 1;
}

:deep(.ek-tooltip__anchor) {
  display: inline-flex;
}

.ek-shell-nav__fav:hover {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
}

.ek-shell-nav__fav:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-shell-nav__footer {
  flex: none;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-sidebar-border);
}

/* Daralt ↔ genişlet: AYNI düğme, aynı yer; ok 180° döner, metin/kısayol solar, zemin ikon sütununa daralır. */
.ek-shell-nav__toggle {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3) 0 calc((var(--ek-control-h-lg) - var(--ek-icon-md)) / 2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  cursor: pointer;
  transition: color var(--ek-motion-feedback);
}

.ek-shell-nav__toggle::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: transparent;
  transition:
    background-color var(--ek-motion-feedback),
    box-shadow var(--ek-motion-feedback),
    right var(--ek-app-nav-move) var(--ek-motion-layout-easing) 0ms;
}

.is-rail .ek-shell-nav__toggle::after {
  right: calc(100% - var(--ek-control-h-lg));
  transition:
    background-color var(--ek-motion-feedback),
    box-shadow var(--ek-motion-feedback),
    right var(--ek-app-nav-move) var(--ek-motion-layout-easing) var(--ek-app-nav-lag);
}

.ek-shell-nav__toggle:hover {
  color: var(--ek-color-content-strong);
}

.ek-shell-nav__toggle:hover::after {
  background: var(--ek-color-sidebar-hover);
}

.ek-shell-nav__toggle:focus-visible {
  outline: none;
}

.ek-shell-nav__toggle:focus-visible::after {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-shell-nav__toggle-icon {
  flex: none;
  font-size: var(--ek-icon-md);
  transition: transform var(--ek-app-nav-move) var(--ek-motion-layout-easing) 0ms;
}

/* Ok, genişlikle birlikte (aynı gecikme) döner — solma sırasında yarı dönük kalmaz. */
.is-rail .ek-shell-nav__toggle-icon {
  transform: rotate(180deg);
  transition: transform var(--ek-app-nav-move) var(--ek-motion-layout-easing) var(--ek-app-nav-lag);
}

.ek-shell-nav__toggle-label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
}

.ek-shell-nav__fade {
  transition: opacity var(--ek-motion-overlay) var(--ek-app-nav-reveal);
}

.is-rail .ek-shell-nav__fade {
  opacity: 0;
  transition: opacity var(--ek-app-nav-fade) var(--ek-motion-dismiss-easing) 0ms;
}

.ek-shell-nav__tip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

/* Dokunmatik: favori yıldızı hover'a bağlı değildir. */
@media (hover: none) {
  .ek-shell-nav__fav {
    opacity: 1;
  }
}

/* MOB-00: dokunmatikte görünüm aynı, dokunma alanı 44×44 (görünmez genişletme; --ek-control-h-touch). */
@media (pointer: coarse) {
  .ek-shell-nav__fav {
    position: relative;
  }
  .ek-shell-nav__fav::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: max(100%, var(--ek-control-h-touch));
    height: max(100%, var(--ek-control-h-touch));
    transform: translate(-50%, -50%);
  }
}
</style>
