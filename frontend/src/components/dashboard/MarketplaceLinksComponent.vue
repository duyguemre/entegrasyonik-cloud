<!--
  frontend/src/components/dashboard/MarketplaceLinksComponent.vue ("ENTEGRASYON DURUMU" paneli)

  ADR-0015 Aşama A5 — Bulgu #10 (sabit "%15 daha fazla sipariş" notu, veriye
  dayanmayan iddia) KALDIRILDI. Bulgu #7 (platform logosu `'#eee'`ye düşüp
  neredeyse görünmez oluyordu; ayrıca bu karttaki `--brand-col1or`/`--brand-color`
  YAZIM HATASI değişkeni asla eşleşmediği için marka aksanı zaten hiç
  render OLMUYORDU) `EkPlatformMark` (Karar 3.11) ile DÜZELTİLDİ.

  "bağlı/bağlı-değil/hata" bağlantı durumu (`EkStatusChip` + `INTEGRATION_CONNECTION_TONE`)
  BİLEREK EKLENMEDİ: `integrationStore`'da böyle bir alan YOK (yalnızca
  "müşteri bu entegrasyonu seçti mi" listesi var, canlı bağlantı sağlığı
  değil) — uydurma veri göstermemek için (skill: dürüstlük ilkesi)
  N7 "Entegrasyon sağlığı" (gap analizi, B4) backend'i BEKLENİYOR
  (status-map.ts `INTEGRATION_CONNECTION_TONE` dosya başı notu ile aynı
  kapsam sınırı).

  Aktarım durumu (Hazırlanan/Bekleyen/Hatalı/Satışta) artık ad-hoc pastel
  hex yerine `status-map.ts`in JOB_STATUS_TONE ailesiyle TUTARLI token
  tonları kullanır (neutral/info/danger/success).
-->
<template>
  <div class="statistics-card-wrapper">
    <LoadingComponent ref="loadingComponentRef" attach=".marketplacelinks" />


    <v-card v-if="integrationStore" class="statistics-container premium-card-base" variant="flat">

      <div class="card-header d-flex align-center px-4 py-4  ma-1">
        <v-icon color="passiveColor" class="mr-2" size="20">mdi-layers-triple-outline</v-icon>
        <span class="header-title">ENTEGRASYON DURUMU</span>
        <v-spacer></v-spacer>
        <v-btn icon size="small" variant="text" @click="refresh" class="refresh-btn" color="passiveColor"
          aria-label="Entegrasyon durumunu yenile">
          <v-icon size="18">mdi-refresh</v-icon>
        </v-btn>
      </div>
      <div class="scroll-body">

        <EkEmptyState
          v-if="allIntegrations.length === 0"
          variant="not-connected"
          title="Henüz bağlı bir entegrasyon yok"
          message="Pazaryeri, e-ticaret ya da ERP hesabınızı bağlayarak sipariş ve stok senkronizasyonuna başlayın."
          show-action
          action-text="Entegrasyon ekle"
          @action="openIntegrationsScreen"
        />

        <template v-else>
          <div class="content-scroll px-4 pb-4 pt-3 custom-scrollbar">
            <Sortable :list="allIntegrations" item-key="code" tag="div" class="platform-premium-grid" @end="onEnd">
              <template #item="{ element }">
                <div class="platform-node mb-2" :data-id="element.code">

                  <div class="premium-platform-card-container" @click="toggleExpand(element.code)"
                    :class="{ 'card-is-expanded': expandedPlatforms.includes(element.code) }">
                    <div class="d-flex align-center w-100 relative-pos">
                      <EkPlatformMark :name="element.title" :code="element.code" size="lg" />

                      <v-spacer></v-spacer>

                      <div class="right-top-meta d-flex align-center">
                        <div class="platform-type-tag mr-2">{{ getPlatformTypeLabel(element.type?.code) }}</div>
                        <v-icon size="18" class="expand-icon"
                          :class="{ 'rotated': expandedPlatforms.includes(element.code) }">
                          mdi-chevron-down
                        </v-icon>
                      </div>
                    </div>

                    <div class="expand-wrapper" :class="{ 'is-open': expandedPlatforms.includes(element.code) }">
                      <div class="expand-content-inner">
                        <div class="expanded-panel-container">
                          <v-card class="stats-detail-card pa-2" variant="flat">
                            <div class="status-grid d-flex justify-space-around">
                              <div class="status-box status-box--neutral"
                                @click.stop="openProductList({ status: 'PENDING', integrationCode: element.code })">
                                <span class="val">{{ computedStatistics?.[element.code]?.PENDING ?? 0 }}</span>
                              </div>
                              <div class="status-box status-box--info"
                                @click.stop="openProductList({ status: 'WAITING', integrationCode: element.code })">
                                <span class="val">{{ (computedStatistics?.[element.code]?.WAITING || 0) +
                                  (computedStatistics?.[element.code]?.SENT || 0) }}</span>
                              </div>
                              <div class="status-box status-box--danger"
                                @click.stop="openProductList({ status: 'FAILED', integrationCode: element.code })">
                                <span class="val">{{ computedStatistics?.[element.code]?.FAILED ?? 0 }}</span>
                              </div>
                              <div class="status-box status-box--success"
                                @click.stop="openProductList({ status: 'COMPLETED', integrationCode: element.code })">
                                <div class="val-combined">
                                  <span class="val-main">{{ computedStatistics?.[element.code]?.COMPLETED ?? 0 }}</span>
                                  <span class="val-sep">/</span>
                                  <span class="val-sub">{{ computedStatistics?.[element.code]?.ONSALECOUNT ?? 0 }}</span>
                                </div>
                              </div>
                            </div>
                          </v-card>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              </template>
            </Sortable>
          </div>

          <div class="legend-footer px-4 py-3 d-flex justify-space-around">
            <div class="legend-item" @click="openProductListAll('PENDING')">
              <div class="dot dot--neutral"></div> <span class="lbl">Hazırlanan</span>
            </div>
            <div class="legend-item" @click="openProductListAll('WAITING')">
              <div class="dot dot--info"></div> <span class="lbl">Bekleyen</span>
            </div>
            <div class="legend-item" @click="openProductListAll('FAILED')">
              <div class="dot dot--danger"></div> <span class="lbl">Hatalı</span>
            </div>
            <div class="legend-item" @click="openProductListAll('COMPLETED')">
              <div class="dot dot--success"></div> <span class="lbl">Satışta</span>
            </div>
          </div>
        </template>
      </div>
    </v-card>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, inject } from 'vue';
import { Sortable } from "sortablejs-vue3";
import { useIntegrationStore } from '@/stores/integrationStore';
import useUser from '@/composables/user';
import LoadingComponent from '../LoadingComponent.vue';
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';

const userApi = useUser();
const integrationStore = useIntegrationStore();
const eventBus: any = inject('eventBus');
const menuStore: any = inject('useMenuStore');
const loadingComponentRef = ref<any>(null);

const expandedPlatforms = ref<string[]>([]);

const allIntegrations = computed(() => {
  if (!integrationStore) return [];
  const marketplaces = (typeof integrationStore.getClientMarketplaces === 'function') ? integrationStore.getClientMarketplaces() : [];
  const ecommerces = (typeof integrationStore.getClientECommerces === 'function') ? integrationStore.getClientECommerces() : [];
  const erps = (typeof integrationStore.getClientErps === 'function') ? integrationStore.getClientErps() : [];

  return [
    ...(Array.isArray(marketplaces) ? marketplaces : []),
    ...(Array.isArray(ecommerces) ? ecommerces : []),
    ...(Array.isArray(erps) ? erps : [])
  ];
});

const toggleExpand = (code: string) => {
  const index = expandedPlatforms.value.indexOf(code);
  if (index > -1) expandedPlatforms.value.splice(index, 1);
  else expandedPlatforms.value.push(code);
};

const getPlatformTypeLabel = (code: string) => {
  if (code === 'marketplace') return 'Pazaryeri';
  if (code === 'ecommerce') return 'E-Ticaret';
  return 'ERP';
};

const computedStatistics = computed(() => userApi.getProductStatistics()?.variantPlatformTransferStatistics?.counts);

const openProductListAll = (status: string) => {
  const transferStatuses = allIntegrations.value.map((client: any) => ({
    status: status, integrationCode: client.code
  }));
  openProductList(transferStatuses);
};

const refresh = async () => {
  let guid = loadingComponentRef.value?.info("");
  try { await userApi.retrieveProductStatistics(); } finally { loadingComponentRef.value?.remove(guid); }
};

const openProductList = (transferStatuses?: any) => {
  let link: any = menuStore.getMenuLinkWithTitle('productList');
  if (transferStatuses) {
    link.parameters = { transferStatuses: Array.isArray(transferStatuses) ? transferStatuses : [transferStatuses] };
  }
  eventBus.emit('openTab', link);
};

const openIntegrationsScreen = () => {
  const link = menuStore.getMenuLinkWithCode('marketplace');
  if (link) eventBus.emit('openTab', link);
};

const onEnd = (event: any) => {
  const candidateArray = Array.from(event.to.querySelectorAll('div[data-id]')).map((item: any) => item.dataset.id);
  if (typeof integrationStore.sortClientMarketplaces === 'function') {
    integrationStore.sortClientMarketplaces(candidateArray);
  }
};
</script>

<style scoped>
.premium-card-base {
  background: var(--ek-color-surface) !important;
  border-radius: var(--ek-radius-xl) !important;
  border: 1.5px solid color-mix(in srgb, var(--ek-color-content-subtle) 40%, transparent) !important;
  box-shadow: var(--ek-shadow-md) !important;
  height: 555px;
  overflow: hidden;
}

.card-header {
  position: absolute;
  z-index: 10;
  height: 50px;
  left: 0;
  right: 0;
  top: 0;
  background: var(--ek-color-surface);
}

.scroll-body {
  margin-top: 55px;
  overflow: auto;
  height: 495px;
}

.header-title {
  font-size: var(--ek-font-size-xs);
  font-weight: 800;
  color: var(--ek-color-content-muted) !important;
  letter-spacing: 1px;
}

.platform-premium-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.platform-node {
  flex: 1 1 calc(50% - 12px);
  min-width: 250px;
}

.premium-platform-card-container {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  padding: var(--ek-space-2) var(--ek-space-2);
  cursor: pointer;
  transition: border-color var(--ek-duration-fast) var(--ek-easing-standard);
  position: relative;
  z-index: 2;
}

.premium-platform-card-container:hover {
  border-color: var(--ek-color-border-strong);
}

/* --- REVEAL ENGINE --- */
.expand-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--ek-duration-slow) var(--ek-easing-standard);
  overflow: hidden;
  margin-top: -1px;
}

.expand-wrapper.is-open {
  grid-template-rows: 1fr;
}

/* VISIBILITY VE OPACITY KONTROLÜ */
.expand-content-inner {
  min-height: 0;
  transition:
    opacity var(--ek-duration-slow) var(--ek-easing-standard),
    transform var(--ek-duration-slow) var(--ek-easing-standard),
    visibility var(--ek-duration-slow);
  opacity: 0;
  visibility: hidden;
  margin-top: 10px;
  transform: translateY(-15px) scaleY(1);
  transform-origin: top;
}

.expand-wrapper.is-open .expand-content-inner {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scaleY(1);
}

.right-top-meta {
  position: absolute;
  top: 8px;
  right: 12px;
}

.platform-type-tag {
  font-size: 9px;
  font-weight: 700;
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.expand-icon {
  color: var(--ek-color-border-strong);
  transition: transform var(--ek-duration-slow) var(--ek-easing-standard);
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.expanded-panel-container {
  position: relative;
  z-index: 1;
}

.stats-detail-card {
  box-shadow: var(--ek-shadow-sm) !important;
}

.status-box {
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ek-radius-lg);
  cursor: pointer;
  margin: 0 3px;
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard), box-shadow var(--ek-duration-base) var(--ek-easing-standard);
}

.status-box .val {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--ek-color-content-default);
}

.val-main {
  font-size: 1rem;
  font-weight: 800;
  color: var(--ek-color-success);
}

.val-sep {
  font-size: 0.8rem;
  margin: 0 2px;
  opacity: 0.3;
}

.val-sub {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ek-color-content-muted);
}

/* ADR-0015 Karar 3.3 — durum tonları JOB_STATUS_TONE ile TUTARLI
   (neutral=hazırlanan, info=bekleyen, danger=hatalı, success=satışta). */
.status-box--neutral {
  background: var(--ek-color-neutral-subtle);
}

.status-box--neutral:hover {
  box-shadow: inset 0 0 0 1px var(--ek-color-neutral);
}

.status-box--info {
  background: var(--ek-color-info-subtle);
}

.status-box--info:hover {
  box-shadow: inset 0 0 0 1px var(--ek-color-info);
}

.status-box--danger {
  background: var(--ek-color-error-subtle);
}

.status-box--danger:hover {
  box-shadow: inset 0 0 0 1px var(--ek-color-error);
}

.status-box--success {
  background: var(--ek-color-success-subtle);
}

.status-box--success:hover {
  box-shadow: inset 0 0 0 1px var(--ek-color-success);
}

.content-scroll {
  overflow-y: auto;
}

.legend-footer {
  background: var(--ek-color-surface);
  border-top: 1px solid var(--ek-color-surface-sunken);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  cursor: pointer;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.dot--neutral {
  background: var(--ek-color-neutral);
}

.dot--info {
  background: var(--ek-color-info);
}

.dot--danger {
  background: var(--ek-color-error);
}

.dot--success {
  background: var(--ek-color-success);
}

.lbl {
  font-size: 10px;
  font-weight: 700;
  color: var(--ek-color-content-muted);
}
</style>
