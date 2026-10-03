<!--
  frontend/src/components/layout/NavigationRail.vue

  ADR-0015 Karar 2.1/2.2 — kalıcı kenar menünün DARALTILMIŞ ("ray", 64px)
  sunumu. Masaüstünde kullanıcı `«` ile buna geçer (tercih kalıcı,
  `stores/sidebar.ts`); tablette VARSAYILAN budur (ADR Karar 2.2 tablosu).

  Tasarım kararı (mühendislik notu): Vuetify'ın gömülü `rail` prop'u yerine
  AYRI, basit bir bileşen kullanıldı. Gerekçe: `NavigationMenu.vue`'nun
  `v-list-group` (alt menü) yapısı Ek A'daki kilitli spec kancasıdır
  (`.v-list-group__header`, `.sub-item-soft` konumsal seçim) — Vuetify'ın
  yerel `rail` modu alt öğelerin başlıklarını/ikonlarını gizleyip iç
  yapıyı DOM açısından öngörülemez kılıyor (bkz. Vuetify iç CSS'i). Bu
  bileşen yalnızca ÜST DÜZEY öğeleri ikon olarak gösterir; bir üst düzey
  öğenin alt menüsü varsa (ör. Ürünler/Entegrasyonlar/Abonelik/Yönetim)
  tıklama, TAM menüyü (`NavigationMenu.vue`, değişmemiş yapısıyla) açar —
  `SecureLayout.vue` bu geçişi yönetir (`expand-request` event'i).

  Erişilebilirlik: her ikon düğmesi `aria-label` + `title` (native tooltip,
  ADR Karar 2.1 "rayda ipuçları gösterilir") taşır; klavye ile `Tab`/`Enter`
  ile kullanılabilir (düğme elemanları doğal olarak odaklanabilir).
-->
<template>
  <v-navigation-drawer
    :model-value="true"
    permanent
    :width="64"
    class="soft-rail"
    role="navigation"
    aria-label="Daraltılmış gezinme menüsü"
  >
    <div class="rail-wrapper d-flex flex-column align-center h-100 py-3">
      <button type="button" class="rail-logo-btn mb-3" aria-label="Gezinme menüsünü genişlet" title="Menüyü genişlet"
        @click="$emit('expand-request')">
        <v-icon size="20">mdi-chevron-double-right</v-icon>
      </button>

      <div class="rail-scroll flex-grow-1 d-flex flex-column align-center">
        <template v-for="group in (menuStore?.getMenu?.() || [])" :key="group.group">
          <template v-if="group && group.group !== 'favorites'">
            <template v-for="link in (group.links || [])" :key="link?.code">
              <button
                v-if="link && link.status !== false && link.inMenu !== false"
                type="button"
                class="rail-item mb-1"
                :aria-label="$t(link.fullPath)"
                :title="$t(link.fullPath)"
                @click="onItemClick(link)"
              >
                <v-icon size="20">{{ link.icon }}</v-icon>
              </button>
            </template>
          </template>
        </template>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { inject } from 'vue'
import { useMenuStore } from '@/stores/site/menu'

const menuStore: any = useMenuStore()
const eventBus: any = inject('eventBus')

const emit = defineEmits<{ 'expand-request': []; 'leaf-open': [] }>()

// Rayda tıklanan öğe alt-menüsüz (yaprak) ise doğrudan sekme açılır (menüyü
// genişletmeye GEREK YOK — ADR Karar 2.1'in "ipuçları" davranışının doğal
// uzantısı: tek tıkla gidilebilen bir ekranı iki tıklamaya zorlamak gereksiz).
// Alt-menülü (grup) bir öğeyse tam menü açılır ki kullanıcı alt öğeyi seçebilsin.
function onItemClick(link: any) {
  if (link.children && link.children.length > 0) {
    emit('expand-request')
    return
  }
  eventBus?.emit('openTab', link)
  emit('leaf-open')
}
</script>

<style scoped>
.soft-rail {
  background-color: var(--ek-color-surface-muted) !important;
  border-right: 1px solid var(--ek-color-border-default) !important;
}

.rail-scroll {
  overflow-y: auto;
  width: 100%;
}

.rail-logo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--ek-radius-md);
  padding: 6px;
}

.rail-logo-btn:hover {
  background-color: var(--ek-color-surface-sunken);
}

.rail-logo-btn:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.rail-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-muted);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard), color var(--ek-duration-fast) var(--ek-easing-standard);
}

.rail-item:hover {
  background-color: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.rail-item:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: -2px;
}
</style>
