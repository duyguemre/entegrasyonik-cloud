<!-- Vitrin §10 — kabuk: üst bar + akıllı arama + workspace sekmeleri + sidebar (aynı dil). -->
<template>
  <DsSpecimen title="Kabuk kompozisyonu" note="Üst bar kimliği taşır; sidebar zeminden bir kademe açık; etkin sekme içerikle birleşir. Arama açılırı gruplu, klavyeyle gezilir." flush>
    <div class="ds-shell">
      <EkAppHeader
        user-name="Deniz Aydın"
        store-name="Örnek Moda · Yönetici"
        :notification-count="4"
        :compact="compact"
      >
        <template #search>
          <EkSmartSearch v-model="query" :groups="searchGroups" force-open :initial-active-index="1" />
        </template>
      </EkAppHeader>
      <div class="ds-shell__body">
        <aside class="ds-shell__side">
          <EkSidebarNav :sections="sidebarSections" active-key="orders-waiting" :default-open="['orders']" label="Ana menü (örnek)" force-hover-key="claims" />
        </aside>
        <div class="ds-shell__main">
          <EkWorkspaceTabs v-model="tab" :tabs="tabs" label="Açık ekranlar (örnek)" force-hover-id="products" @close="closeTab" />
          <div class="ds-shell__content">
            <div class="ds-shell__page-head">
              <EkIconTile icon="mdi-cart-outline" />
              <div>
                <p class="ds-shell__crumb">Satış › Sipariş Yönetimi</p>
                <p class="ds-shell__title">Kargolanmayı Bekleyen Siparişler</p>
              </div>
              <EkButton tone="primary" icon="mdi-printer-outline" class="ds-shell__cta">Etiketleri yazdır</EkButton>
            </div>
            <div class="ds-shell__placeholder" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DsSpecimen>

  <DsSpecimen title="Workspace sekmeleri" note="Etkin / pasif / hover; uzun başlık kesilir (tam başlık tooltip'te); kaydedilmemiş değişiklik noktası; kapatma hover'da belirginleşir. ←/→ gezin · Delete kapat.">
      <EkWorkspaceTabs v-model="tab2" :tabs="tabs" label="Açık ekranlar (sekme örneği)" force-hover-id="orders">
        <template #leading>
          <EkButton tone="ghost" size="sm" icon="mdi-apps" icon-only aria-label="Ekran başlatıcı" />
        </template>
      </EkWorkspaceTabs>
      <div class="ds-tab-panel">Etkin sekme içeriği — sekme ile aynı zemin (tab-active = app-bg).</div>
  </DsSpecimen>
  <div class="ds-shell-grid">
    <DsSpecimen title="Sidebar durumları" note="Uzun alt menü metni 2 satıra sarılır, kesilmez. Ray (daraltılmış) modunda ad tooltip'te." canvas>
      <div class="ds-side-pair">
        <div class="ds-side-pair__full">
          <EkSidebarNav :sections="sidebarSections.slice(1, 3)" active-key="variants" :default-open="['orders', 'catalog']" label="Ana menü (açık örnek)" />
        </div>
        <div class="ds-side-pair__rail">
          <EkSidebarNav :sections="sidebarSections.slice(0, 3)" active-key="variants" collapsed label="Ana menü (ray örneği)" />
        </div>
      </div>
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import DsSpecimen from './DsSpecimen.vue'
import EkAppHeader from '@/components/ds/EkAppHeader.vue'
import EkSmartSearch from '@/components/ds/EkSmartSearch.vue'
import EkSidebarNav from '@/components/ds/EkSidebarNav.vue'
import EkWorkspaceTabs from '@/components/ds/EkWorkspaceTabs.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { breakpoint } from '@/design/tokens'
import { searchGroups, sidebarSections, workspaceTabs } from './demoData'

const { width } = useDisplay()
const compact = computed(() => width.value < breakpoint.desktop)
const query = ref('TY-1023')
const tabs = ref([...workspaceTabs])
const tab = ref('order-detail')
const tab2 = ref('order-detail')

function closeTab(id: string) {
  tabs.value = tabs.value.filter((t) => t.id !== id)
}
</script>

<style scoped>
.ds-shell {
  display: flex;
  flex-direction: column;
  height: 640px;
  overflow: hidden;
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-app-bg);
}

.ds-shell__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.ds-shell__side {
  flex: none;
  width: 264px;
  overflow-y: auto;
  border-right: 1px solid var(--ek-color-sidebar-border);
  background: var(--ek-color-sidebar-bg);
}

.ds-shell__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.ds-shell__content {
  flex: 1;
  padding: var(--ek-space-5) var(--ek-space-6);
  background: var(--ek-color-tab-active);
}

.ds-shell__page-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-shell__crumb {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-shell__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: var(--ek-type-title-tracking);
}

.ds-shell__cta {
  margin-left: auto;
}

.ds-shell__placeholder {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-4);
  margin-top: var(--ek-space-5);
}

.ds-shell__placeholder span {
  height: 120px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ds-shell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--ek-space-4);
}

.ds-tab-panel {
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-top: 0;
  border-radius: 0 0 var(--ek-radius-control) var(--ek-radius-control);
  background: var(--ek-color-tab-active);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-side-pair {
  display: flex;
  gap: var(--ek-space-4);
}

.ds-side-pair__full,
.ds-side-pair__rail {
  overflow: hidden;
  border: 1px solid var(--ek-color-sidebar-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-sidebar-bg);
}

.ds-side-pair__full {
  width: 264px;
}

/* B4: ray içeriği tam genişlikte kalır (etiketler yalnız solar, yeniden sarılmaz); kap ray genişliğinde kırpar. */
.ds-side-pair__rail {
  flex: none;
  width: var(--ek-app-sidebar-rail-width);
}

.ds-side-pair__rail > :deep(.ek-side) {
  width: var(--ek-app-sidebar-width);
}

@media (max-width: 1023px) {
  .ds-shell__side {
    display: none;
  }

  .ds-shell__placeholder {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .ds-shell__cta {
    display: none;
  }

  .ds-shell-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
