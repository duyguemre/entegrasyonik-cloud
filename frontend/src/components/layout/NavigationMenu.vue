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
        >
          <template #item-trailing="{ item }">
            <button
              v-if="isFavoritable(item.key)"
              type="button"
              class="ek-shell-nav__fav"
              :class="{ 'is-on': isFavorite(item.key) }"
              :aria-pressed="isFavorite(item.key)"
              :aria-label="isFavorite(item.key) ? `Favorilerden çıkar: ${item.label}` : `Favorilere ekle: ${item.label}`"
              @click.stop="toggleFavorite(item.key)"
            >
              <v-icon :icon="isFavorite(item.key) ? 'mdi-star' : 'mdi-star-outline'" aria-hidden="true" />
            </button>
          </template>
        </EkSidebarNav>
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
import { computed } from 'vue'
import useUser from '@/composables/user'
import { EkSidebarNav, EkKbd } from '@entegrasyonik/ui/components'
import { shortcutKeys, withShortcut } from '@entegrasyonik/ui/shortcuts'
import { useShellMenu } from './useShellMenu'

const HOOK_CLASSES = { item: 'soft-item', group: 'v-list-group', groupHeader: 'v-list-group__header', subItem: 'sub-item-soft' }

const props = withDefaults(defineProps<{ temporary: boolean; modelValue?: boolean; rail?: boolean }>(), { modelValue: true, rail: false })
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'collapse-request': []; 'expand-request': [] }>()

/** Ray yalnız kalıcı sunumda (geçici çekmece her zaman tam). */
const isRail = computed(() => !props.temporary && props.rail)

const userApi = useUser()
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
function toggleFavorite(key: string) {
  const link = linkFor(key)
  if (!link) return
  if (link.isFavorite) menuStore.deleteFavorite(link.code)
  else menuStore.addFavorite(link.code)
}
</script>

<style scoped>
/* Çekmece genişliği Vuetify'dan (rail ↔ width); süre/eğri/gecikme B4 koreografisinden (app.css --ek-app-nav-*):
   ray'a giderken içerik solduktan sonra (`lag`) daralır, açılırken hemen genişler. */
.ek-shell-nav {
  background: var(--ek-color-sidebar-bg) !important;
  border-right: 1px solid var(--ek-color-sidebar-border) !important;
  transition-duration: var(--ek-app-nav-move) !important;
  transition-timing-function: var(--ek-easing-enter) !important;
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
  transition: var(--ek-transition-colors), opacity var(--ek-duration-fast) var(--ek-easing-standard);
}

/* Favori: vurgu rengi DEĞİL (tek vurgu = etkin sayfa) — nötr koyu dolu yıldız. */
.ek-shell-nav__fav.is-on {
  color: var(--ek-color-content-default);
  opacity: 1;
}

:deep(.ek-side__entry:hover) .ek-shell-nav__fav,
.ek-shell-nav__fav:focus-visible {
  opacity: 1;
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
  transition: color var(--ek-duration-fast) var(--ek-easing-enter);
}

.ek-shell-nav__toggle::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: transparent;
  transition:
    background-color var(--ek-duration-fast) var(--ek-easing-enter),
    box-shadow var(--ek-duration-fast) var(--ek-easing-enter),
    right var(--ek-app-nav-move) var(--ek-easing-enter) 0ms;
}

.is-rail .ek-shell-nav__toggle::after {
  right: calc(100% - var(--ek-control-h-lg));
  transition:
    background-color var(--ek-duration-fast) var(--ek-easing-enter),
    box-shadow var(--ek-duration-fast) var(--ek-easing-enter),
    right var(--ek-app-nav-move) var(--ek-easing-enter) var(--ek-app-nav-lag);
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
  transition: transform var(--ek-app-nav-move) var(--ek-easing-enter) 0ms;
}

/* Ok, genişlikle birlikte (aynı gecikme) döner — solma sırasında yarı dönük kalmaz. */
.is-rail .ek-shell-nav__toggle-icon {
  transform: rotate(180deg);
  transition: transform var(--ek-app-nav-move) var(--ek-easing-enter) var(--ek-app-nav-lag);
}

.ek-shell-nav__toggle-label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
}

.ek-shell-nav__fade {
  transition: opacity var(--ek-duration-base) var(--ek-easing-enter) var(--ek-app-nav-reveal);
}

.is-rail .ek-shell-nav__fade {
  opacity: 0;
  transition: opacity var(--ek-app-nav-fade) var(--ek-easing-standard) 0ms;
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
</style>
