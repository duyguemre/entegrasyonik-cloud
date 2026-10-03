<template>
  <v-navigation-drawer v-model="drawerVisible" :permanent="!temporary" :temporary="temporary" :width="248"
    style="z-index:5000 !important; border-right: 1px solid var(--ek-color-border-default) !important" class="soft-nav"
    role="navigation" aria-label="Ana gezinme menüsü">
    <div v-if="menuStore" class="nav-wrapper d-flex flex-column h-100">

      <div class="pa-4 pb-2">
        <div class="d-flex align-center store-name-row">
          <v-icon color="var(--ek-color-content-muted)" size="16" class="mr-1">mdi-storefront-outline</v-icon>
          <span class="text-caption font-weight-medium store-name-text">
            {{ userApi.getStoreName() || 'Mağaza paneli' }}
          </span>
        </div>
      </div>

      <div class="navigation-scroll-container px-3 flex-grow-1" id="nav-scroll">
        <v-list density="compact" nav class="pa-0 bg-transparent no-jump-list" role="menu" aria-label="Ekranlar">
          <div v-for="group in (menuStore?.getMenu?.() || [])" :key="group.group">

            <template v-if="group && group.group !== 'favorites'">

              <v-list-subheader
                v-if="group.group !== 'userManagement' && group.group !== 'dashboard' && group.edit !== false"
                class="soft-subheader px-4">
                {{ $t('menu.' + group.group) }}
              </v-list-subheader>

              <template v-for="link in (group.links || [])" :key="link?.code">
                <template v-if="link && link.status !== false && link.inMenu !== false">

                  <v-list-item v-if="!link.children || link.children.length === 0" :value="link.code"
                    class="soft-item mb-1 px-4" rounded="lg" role="menuitem"
                    @click.stop="link.code === 'ExitView' ? userApi.logout() : openTab('', link)"
                    @keydown.enter.stop="link.code === 'ExitView' ? userApi.logout() : openTab('', link)">
                    <template #prepend>
                      <v-icon size="19" class="mr-2 colored-icon">{{ link.icon }}</v-icon>
                    </template>

                    <v-list-item-title class="item-text-soft">
                      {{ $t(link.fullPath) }}
                    </v-list-item-title>

                    <template #append v-if="!link.isConstant">
                      <v-icon size="14" :color="link.isFavorite ? 'amber-darken-1' : 'grey-lighten-3'"
                        class="fav-star-soft" tabindex="0" role="button"
                        :aria-label="link.isFavorite ? `Favorilerden çıkar: ${$t(link.fullPath)}` : `Favorilere ekle: ${$t(link.fullPath)}`"
                        @click.stop="link.isFavorite ? menuStore.deleteFavorite(link.code) : menuStore.addFavorite(link.code)"
                        @keydown.enter.stop="link.isFavorite ? menuStore.deleteFavorite(link.code) : menuStore.addFavorite(link.code)">
                        {{ link.isFavorite ? 'mdi-star' : 'mdi-star-outline' }}
                      </v-icon>
                    </template>
                  </v-list-item>

                  <v-list-group v-else :value="link.code" class="soft-group">
                    <template v-slot:activator="{ props }">
                      <v-list-item v-bind="props" class="soft-item mb-1 px-4" rounded="lg" role="menuitem"
                        :aria-label="$t(link.fullPath)">
                        <template #prepend>
                          <v-icon size="19" class="mr-2 colored-icon">{{ link.icon }}</v-icon>
                        </template>
                        <v-list-item-title class="item-text-soft font-weight-medium">
                          {{ $t(link.fullPath) }}
                        </v-list-item-title>
                      </v-list-item>
                    </template>

                    <div class="sub-container-soft">
                      <template v-for="subLink in (link.children || [])" :key="subLink?.code">
                        <v-list-item v-if="subLink && subLink.status !== false && subLink.inMenu !== false"
                          :value="subLink.code" class="soft-item sub-item-soft px-4" rounded="md" role="menuitem"
                          @click.stop="openTab(link.title + '.', subLink)"
                          @keydown.enter.stop="openTab(link.title + '.', subLink)">
                          <v-list-item-title class="text-caption item-text-soft">
                            {{ $t(subLink.fullPath) }}
                          </v-list-item-title>
                        </v-list-item>
                      </template>
                    </div>
                  </v-list-group>

                </template>
              </template>

              <div v-if="group.group === 'userManagement' || group.group === 'dashboard'" class="pa-4 py-2">
                <div class="soft-divider"></div>
              </div>

            </template>
          </div>
        </v-list>
      </div>

      <!-- ADR-0015 Karar 2.1 — masaüstünde kalıcı menü "«" ile ray moduna daralır (tercih kalıcı,
           `stores/sidebar.ts`). Tablet/mobilde (temporary) bu düğme YOK — o modda menü zaten
           ekrana geçici bir katman olarak açılıyor, ayrıca daraltma anlamsız. -->
      <div v-if="!temporary" class="pa-3 collapse-row">
        <button type="button" class="collapse-btn" aria-label="Kenar menüyü daralt" title="Menüyü daralt"
          @click="$emit('collapse-request')">
          <v-icon size="18" class="mr-1">mdi-chevron-double-left</v-icon>
          <span class="text-caption">Daralt</span>
        </button>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed, inject } from 'vue'
import { useMenuStore } from '@/stores/site/menu'
import useUser from '@/composables/user'

// ADR-0015 Karar 2.1/2.2 — bu bileşen artık İKİ sunumda kullanılıyor:
//  - `temporary=false` (masaüstü "tam" 248px kalıcı VEYA tablet ray-YOK durumu yok — tablette
//    tam menü HER ZAMAN `temporary=true`'dır, bkz. `SecureLayout.vue`)
//  - `temporary=true` (tablet "üst katman" + mobil çekmece — seçimden sonra KAPANIR)
// Menü ÖĞE yapısı (grup/alt-grup/`.soft-item`/`.sub-item-soft`) DEĞİŞMEDİ (Ek A kancaları).
const props = defineProps<{ temporary: boolean; modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'collapse-request': [] }>()

const menuStore: any = useMenuStore()
const eventBus: any = inject('eventBus')
const userApi = useUser()

// Kalıcı (permanent) modda drawer her zaman görünür (Vuetify `permanent` prop'u zaten
// gizlenmeyi engeller); `v-model` yalnızca `temporary` modda anlamlıdır.
const drawerVisible = computed({
  get: () => (props.temporary ? props.modelValue : true),
  set: (value: boolean) => {
    if (props.temporary) emit('update:modelValue', value)
  },
})

const openTab = (parent: string, link: any) => {
  if (!link) return
  eventBus?.emit('openTab', link)
  // Yalnızca GEÇİCİ (temporary) sunumda seçimden sonra kapanır (tablet üst katman/mobil
  // çekmece) — kalıcı (permanent) masaüstü/ray modunda menü AÇIK KALIR (ADR Karar 2.1).
  if (props.temporary) emit('update:modelValue', false)
}
</script>

<style scoped>
.soft-nav {
  background-color: var(--ek-color-surface) !important;
}

.store-name-row {
  min-width: 0;
}

.store-name-text {
  color: var(--ek-color-content-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Scrollbar tamamen gizlendi */
.navigation-scroll-container {
  overflow-y: auto;
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* IE/Edge */
}

.navigation-scroll-container::-webkit-scrollbar {
  display: none !important;
  /* Chrome, Safari, Opera */
}

.soft-subheader {
  font-size: 10px !important;
  font-weight: var(--ek-font-weight-semibold) !important;
  /* ADR-0011 a11y göçü: eski slate-gri metin rengi AA kontrast eşiğinin altındaydı —
     `content-muted` (semantic.ts, arka planda >=4.5:1) bilinçli bir kontrast düzeltmesidir
     (görsel fark var, kasıtlı). */
  color: var(--ek-color-content-muted) !important;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  height: 38px !important;
}

.soft-item {
  min-height: 40px !important;
  color: var(--ek-color-content-default) !important;
  transition: all var(--ek-duration-base) var(--ek-easing-standard) !important;
}

.colored-icon {
  color: var(--ek-color-content-muted) !important;
  opacity: 0.9;
}

.item-text-soft {
  font-size: 0.85rem !important;
  letter-spacing: -0.1px;
}

.soft-item:hover,
.soft-item:focus-visible {
  background-color: var(--ek-color-surface-muted) !important;
  color: var(--ek-color-content-strong) !important;
}

.soft-item:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: -2px;
}

.soft-item:hover .colored-icon {
  opacity: 1;
}

/* ADR-0015 Karar 2.1 — etkin öğe: `surface` zemin + sol 2px `primary` çizgi + `content-strong` metin
   (klasör/pembe-turuncu dilinin yerini alan tek, sakin gösterge). */
:deep(.v-list-item--active) {
  background-color: var(--ek-color-surface) !important;
  color: var(--ek-color-primary) !important;
  font-weight: var(--ek-font-weight-semibold) !important;
  border-left: 2px solid var(--ek-color-primary);
}

:deep(.v-list-item--active) .colored-icon {
  color: var(--ek-color-primary) !important;
  opacity: 1 !important;
}

.sub-container-soft {
  position: relative;
  margin-left: 21px;
  padding-left: 12px;
  border-left: 1px solid var(--ek-color-border-default);
}

.sub-item-soft {
  min-height: 34px !important;
  opacity: 0.75;
}

/* ADR-0012 Karar 5 — tablet/mobil: kapatma/favori kontrolleri hover'a bağlı olmadan, min. 44px dokunma hedefiyle. */
@media (max-width: 1023px) {

  .soft-item,
  .sub-item-soft {
    min-height: 44px !important;
  }

  .fav-star-soft {
    opacity: 0.5;
  }

  .sub-item-soft {
    opacity: 1;
  }
}

.sub-item-soft:hover {
  opacity: 1;
}

.fav-star-soft {
  opacity: 0;
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard);
}

.soft-item:hover .fav-star-soft {
  opacity: 0.4;
}

.soft-divider {
  height: 1px;
  background: var(--ek-color-border-default);
}

.collapse-row {
  border-top: 1px solid var(--ek-color-border-default);
}

.collapse-btn {
  display: inline-flex;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-muted);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard), color var(--ek-duration-fast) var(--ek-easing-standard);
}

.collapse-btn:hover {
  background-color: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.collapse-btn:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: -2px;
}
</style>
