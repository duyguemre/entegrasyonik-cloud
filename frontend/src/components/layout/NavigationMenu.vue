<!--
  frontend/src/components/layout/NavigationMenu.vue

  DS-v2 Aşama 2 — tam sol menü (248px). İçerik `EkSidebarNav`: bölüm başlığı
  (lacivert mikro etiket) → öğeler → alt öğeler; etiketler KESİLMEZ (sarılır),
  etkin ekran `sidebar-active` + 3px aksiyon göstergesi, etkin öğenin grubu
  kendiliğinden açık. Favori yıldızı öğenin sağında (düğmenin kardeşi).

  İki sunum (ADR-0015 Karar 2.1/2.2 — `SecureLayout` karar verir):
   - `temporary=false`: masaüstü kalıcı menü; altta "Daralt" (Ctrl+B) → ray.
   - `temporary=true`: tablet üst katmanı / mobil çekmece; seçimden sonra kapanır.

  Spec çapaları (Ek A / Karar 5.1 — ekran spec'leri bu sınıflarla menüden gezinir,
  bu yüzden KORUNUR): `.v-navigation-drawer.soft-nav`, öğe `.soft-item`, grup
  `.v-list-group` > `.v-list-group__header`, alt öğe `.sub-item-soft`, `.collapse-btn`.
-->
<template>
  <v-navigation-drawer
    v-model="drawerVisible"
    :permanent="!temporary"
    :temporary="temporary"
    :width="248"
    id="tour-homepage-menu"
    class="soft-nav ek-shell-nav"
    aria-label="Ana gezinme menüsü"
  >
    <div class="ek-shell-nav__wrap">
      <div class="ek-shell-nav__scroll">
        <EkSidebarNav
          :sections="model.sections"
          :active-key="activeKey"
          label="Ekranlar"
          :hook-classes="HOOK_CLASSES"
          @select="onSelect"
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
        <button type="button" class="collapse-btn" :aria-label="withShortcut('Kenar menüyü daralt', 'sidebarToggle')" @click="$emit('collapse-request')">
          <v-icon icon="mdi-chevron-double-left" aria-hidden="true" />
          <span class="collapse-btn__label">Daralt</span>
          <EkKbd :keys="shortcutKeys('sidebarToggle')" />
        </button>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import useUser from '@/composables/user'
import EkSidebarNav from '@/components/ds/EkSidebarNav.vue'
import EkKbd from '@/components/ds/EkKbd.vue'
import { shortcutKeys, withShortcut } from '@/navigation/shortcuts'
import { useShellMenu } from './useShellMenu'

const HOOK_CLASSES = { item: 'soft-item', group: 'v-list-group', groupHeader: 'v-list-group__header', subItem: 'sub-item-soft' }

const props = defineProps<{ temporary: boolean; modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'collapse-request': [] }>()

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
.ek-shell-nav {
  background: var(--ek-color-sidebar-bg) !important;
  border-right: 1px solid var(--ek-color-sidebar-border) !important;
}

.ek-shell-nav__wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ek-shell-nav__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ek-color-border-strong) transparent;
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

.ek-shell-nav__fav.is-on {
  color: var(--ek-color-warning);
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

.ek-shell-nav__fav.is-on:hover {
  color: var(--ek-color-warning-emphasis);
}

.ek-shell-nav__footer {
  flex: none;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-sidebar-border);
}

.collapse-btn {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.collapse-btn :deep(.v-icon) {
  font-size: var(--ek-icon-md);
}

.collapse-btn__label {
  flex: 1;
  text-align: left;
}

.collapse-btn:hover {
  background: var(--ek-color-sidebar-hover);
  color: var(--ek-color-content-strong);
}

.collapse-btn:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

/* Dokunmatik: favori yıldızı hover'a bağlı değildir. */
@media (hover: none) {
  .ek-shell-nav__fav {
    opacity: 1;
  }
}
</style>
