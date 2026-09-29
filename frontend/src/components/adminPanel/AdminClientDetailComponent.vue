<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    title="Mağaza Detay Analizi" :subtitle="clientName ? `${clientName} Performance & Traffic` : 'Mağaza Analizi'"
    icon="mdi-store-search-outline" color="primary" maxWidth="1000px" :showFooter="false" @close="$emit('close')"
    attach="adminClientListView">

    <div class="pa-0">
      <!-- Karar 1.2 istisnası: sekme etiketleri (spec çapası, e2e/specs/admin-clients.spec.ts:75
           `getByRole('tab', { name: /OPERASYONEL İZLEME/ })` — `i` bayraksız regex) büyük harf
           AYNEN korunur. `EkPageTabs` ikon SUNMAZ (Karar 6.1) — tab ikonları kaldırıldı. -->
      <EkPageTabs v-model="activeTab" class="px-4" :tabs="[
        { value: 'overview', label: 'GENEL BAKIŞ' },
        { value: 'operations', label: 'OPERASYONEL İZLEME' },
        { value: 'settings', label: 'MAĞAZA AYARLARI' },
      ]" />

      <v-window v-model="activeTab" class="pa-4">
        <!-- Overview Tab -->
        <v-window-item value="overview">
          <EkSkeleton v-if="loadingOverview" type="cards" :rows="4" />

          <template v-else>
            <div class="premium-stats-row mb-6">
              <ClientStatsCard title="Toplam Ürün" :value="metrics.productCount" icon="mdi-package-variant-closed"
                colorClass="highlight-card" />
              <ClientStatsCard title="Varyant Sayısı" :value="metrics.variantCount" icon="mdi-layers-outline" />
              <ClientStatsCard title="Siparişler" :value="metrics.orderCount" icon="mdi-cart-outline"
                colorClass="teal-card" :subValue="metrics.totalRevenue" subUnit="TRY" />
              <ClientStatsCard title="İadeler" :value="metrics.claimCount" icon="mdi-package-variant-remove"
                colorClass="rose-card" :subValue="metrics.totalReturnAmount" subUnit="TRY" />
            </div>

            <v-row>
              <v-col cols="12" md="8">
                <v-card flat border class="pa-5 h-100 bg-slate-50 border-subtle">
                  <EkSection title="Aktif Entegrasyonlar">
                    <v-row v-if="integrations.length > 0">
                      <v-col v-for="int in integrations" :key="int._id" cols="12" sm="6">
                        <v-card flat border class="pa-4 d-flex align-center hover-card bg-white">
                          <v-avatar color="info-subtle" size="44" class="mr-4 border">
                            <v-icon color="info" size="20">mdi-cloud-sync-outline</v-icon>
                          </v-avatar>
                          <div class="flex-grow-1">
                            <div class="d-flex align-center justify-space-between">
                              <span class="integration-code">{{ int.integrationCode }}</span>
                              <EkStatusChip tone="success" label="Aktif" />
                            </div>
                            <div class="integration-title line-clamp-1">
                              {{ int.title || 'Platform Entegrasyonu' }}
                            </div>
                          </div>
                        </v-card>
                      </v-col>
                    </v-row>
                    <EkEmptyState v-else variant="not-connected" title="Aktif entegrasyon yok"
                      message="Bu mağaza için henüz aktif bir pazaryeri/e-ticaret entegrasyonu yok." />
                  </EkSection>
                </v-card>
              </v-col>

              <v-col cols="12" md="4">
                <v-card flat border class="pa-5 h-100 bg-slate-50 border-subtle">
                  <EkSection title="Kullanıcı Özeti">
                    <div class="user-count-box">
                      <div class="user-count-value ek-num">{{ metrics.userCount }}</div>
                      <div class="user-count-label">Kayıtlı kullanıcı</div>
                    </div>

                    <v-divider class="mb-6"></v-divider>

                    <div class="d-flex flex-column ga-3">
                      <div class="d-flex align-center justify-space-between">
                        <span class="stat-label">VIP Durumu</span>
                        <EkStatusChip :tone="metrics.totalRevenue > 100000 ? 'warning' : 'neutral'"
                          :label="metrics.totalRevenue > 100000 ? 'Platinum' : 'Standart'" />
                      </div>
                      <div class="d-flex align-center justify-space-between">
                        <span class="stat-label">İade Oranı</span>
                        <EkStatusChip :tone="returnRate > 10 ? 'danger' : 'success'" :label="formatPercent(returnRate / 100)" />
                      </div>
                    </div>
                  </EkSection>
                </v-card>
              </v-col>
            </v-row>
          </template>
        </v-window-item>

        <!-- Operations Tab -->
        <v-window-item value="operations">
          <EkSkeleton v-if="loadingOps" type="cards" :rows="2" />

          <template v-else>
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="section-overline">Canlı trafik izleme</span>
              <v-btn icon variant="text" size="small" color="primary" aria-label="Operasyon verilerini yenile"
                @click="loadOperations"><v-icon>mdi-refresh</v-icon></v-btn>
            </div>

            <v-row class="mb-6">
              <v-col cols="12" md="6">
                <v-card flat border class="pa-5 bg-slate-50 border-subtle h-100">
                  <EkSection title="Export durumu">
                    <div class="d-flex flex-wrap ga-2">
                      <div v-for="exp in exportStats" :key="exp._id" class="metric-pill pa-2 px-3 border flex-grow-1 bg-white">
                        <EkStatusChip :tone="jobStatusTone(exp._id)" :label="exp._id" />
                        <span class="metric-pill-count ek-num">{{ formatNumber(exp.count) }}</span>
                      </div>
                    </div>
                  </EkSection>
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <v-card flat border class="pa-5 bg-slate-50 border-subtle h-100">
                  <EkSection title="Import durumu">
                    <div class="d-flex flex-wrap ga-2">
                      <div v-for="imp in importStats" :key="imp._id" class="metric-pill pa-2 px-3 border flex-grow-1 bg-white">
                        <EkStatusChip :tone="jobStatusTone(imp._id)" :label="imp._id" />
                        <span class="metric-pill-count ek-num">{{ formatNumber(imp.count) }}</span>
                      </div>
                    </div>
                  </EkSection>
                </v-card>
              </v-col>
            </v-row>

            <!-- Durum lejantı: EkStatusChip tonlarıyla AYNI (Karar 3.3 "canlı iş-durumu paleti"). -->
            <v-card flat border class="pa-4 bg-white border-subtle">
              <div class="d-flex flex-wrap ga-6 justify-center">
                <EkStatusChip tone="neutral" label="Bekleyen işlemler" dot />
                <EkStatusChip tone="success" label="Tamamlananlar" dot />
                <EkStatusChip tone="danger" label="Hatalı işlemler" dot />
              </div>
            </v-card>
          </template>
        </v-window-item>

        <!-- Settings Tab -->
        <v-window-item value="settings">
          <div class="settings-container">
            <v-row>
              <!-- Basic Info -->
              <v-col cols="12">
                <v-card flat border class="pa-5 border-subtle mb-4">
                  <div class="section-overline mb-4">Temel bilgiler</div>
                  <v-row>
                    <v-col cols="12" md="6">
                      <v-text-field v-model="form.name" label="Mağaza Adı" hide-details></v-text-field>
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field v-model="form.title" label="Başlık" hide-details></v-text-field>
                    </v-col>
                     <v-col cols="12" md="6">
                      <v-select v-model="form.status" :items="['ACTIVE', 'PASSIVE']" label="Durum" hide-details></v-select>
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field :model-value="formatDate(form.lastSuccessfulOrderSync)" label="Son Başarılı Sipariş Senkronizasyonu" 
                        hide-details readonly prepend-inner-icon="mdi-history">
                      </v-text-field>
                    </v-col>
                  </v-row>
                </v-card>
              </v-col>

              <!-- Creation Mode Only: User Info (REMOVED - Use AdminClientCreateComponent) -->

              <!-- Archive Settings -->
              <v-col cols="12" md="6">
                <v-card flat border class="pa-5 border-subtle h-100">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <div class="section-overline">Arşiv depolama (R2)</div>
                    <v-switch v-model="form.archive.isActive" inset>
                      <template v-slot:label>
                        <span class="switch-label">Durum</span>
                      </template>
                    </v-switch>
                  </div>
                  <div class="d-flex flex-column ga-3">
                    <v-text-field v-model="form.archive.accessKeyId" label="Access Key ID" hide-details></v-text-field>
                    <v-text-field v-model="form.archive.secretAccessKey" label="Secret Access Key" hide-details type="password"></v-text-field>
                    <v-text-field v-model="form.archive.bucketName" label="Bucket Name" hide-details></v-text-field>
                    <v-text-field v-model="form.archive.endpoint" label="Endpoint" hide-details></v-text-field>
                    <v-text-field v-model="form.archive.publicUrl" label="Public URL" hide-details></v-text-field>
                  </div>
                </v-card>
              </v-col>

              <!-- Image Settings -->
              <v-col cols="12" md="6">
                <v-card flat border class="pa-5 border-subtle h-100">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <div class="section-overline">Resim depolama (R2)</div>
                    <v-switch v-model="form.image.isActive" inset>
                      <template v-slot:label>
                        <span class="switch-label">Durum</span>
                      </template>
                    </v-switch>
                  </div>
                  <div class="d-flex flex-column ga-3">
                    <v-text-field v-model="form.image.accessKeyId" label="Access Key ID" hide-details></v-text-field>
                    <v-text-field v-model="form.image.secretAccessKey" label="Secret Access Key" hide-details type="password"></v-text-field>
                    <v-text-field v-model="form.image.bucketName" label="Bucket Name" hide-details></v-text-field>
                    <v-text-field v-model="form.image.endpoint" label="Endpoint" hide-details></v-text-field>
                    <v-text-field v-model="form.image.publicUrl" label="Public URL" hide-details></v-text-field>
                  </div>
                </v-card>
              </v-col>

              <!-- Integration Management -->
              <v-col cols="12">
                <v-card flat border class="pa-5 border-subtle">
                  <div class="section-overline mb-6">Entegrasyon yönetimi</div>

                  <div v-if="form.integrations && form.integrations.length > 0">
                    <v-row>
                      <v-col v-for="item in form.integrations" :key="item.integrationCode" cols="12" md="4" sm="6">
                        <v-card flat border class="pa-3 d-flex align-center bg-slate-50">
                          <v-avatar size="32" class="mr-3" color="white" border>
                            <v-img v-if="getIntegrationLogo(item.integrationCode)" :src="getIntegrationLogo(item.integrationCode)"
                              :alt="`${item.integrationCode} logosu`" />
                            <v-icon v-else size="18" color="content-muted">mdi-api</v-icon>
                          </v-avatar>
                          <div class="flex-grow-1">
                            <div class="integration-item-code">{{ item.integrationCode }}</div>
                            <div class="integration-item-type">{{ item.type }}</div>
                          </div>
                          <v-switch v-model="item.status" inset
                            :aria-label="`${item.integrationCode} entegrasyonu etkin`"></v-switch>
                        </v-card>
                      </v-col>
                    </v-row>
                  </div>
                  <EkEmptyState v-else variant="no-data" title="Entegrasyon tanımı yok"
                    message="Bu mağaza için tanımlı bir entegrasyon bulunamadı." />
                </v-card>
              </v-col>
            </v-row>

            <div class="d-flex justify-end mt-6 ga-3">
              <v-btn variant="outlined" @click="$emit('close')">
                Vazgeç
              </v-btn>
              <v-btn color="primary" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">
                Güncelle
              </v-btn>
            </div>
          </div>
        </v-window-item>
      </v-window>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import ClientStatsCard from '@/components/adminPanel/ClientStatsCard.vue';
import EkPageTabs from '@/components/ds/EkPageTabs.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import { formatNumber, formatPercent, formatDateTime } from '@/composables/format';
import { JOB_STATUS_TONE, type JobStatus, type StatusTone } from '@/design/status-map';
import useMarketplaceStore from '@/stores/marketplace';

const marketplaceStore = useMarketplaceStore();

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  client: { type: Object, default: null }
});

const emit = defineEmits(['update:modelValue', 'close', 'refresh']);

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const activeTab = ref('overview');
const loadingOverview = ref(false);
const loadingOps = ref(false);
const saving = ref(false);

const form = reactive({
  name: '',
  title: '',
  status: 'ACTIVE',
  lastSuccessfulOrderSync: null,
  integrations: [] as any[],
  archive: {
    code: 'R2_ARCHIVE_STORAGE',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    endpoint: '',
    publicUrl: '',
    region: 'auto',
    isActive: true
  },
  image: {
    code: 'R2_IMAGE_STORAGE',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    endpoint: '',
    publicUrl: '',
    region: 'auto',
    isActive: true
  }
});

const metrics = ref({
  productCount: 0,
  variantCount: 0,
  orderCount: 0,
  claimCount: 0,
  userCount: 0,
  totalRevenue: 0,
  totalReturnAmount: 0
});

const integrations = ref<any[]>([]);
const exportStats = ref<any[]>([]);
const importStats = ref<any[]>([]);

const returnRate = computed(() => metrics.value.orderCount > 0 ? (metrics.value.claimCount / metrics.value.orderCount) * 100 : 0);

function formatDate(date: any) {
  if (!date) return 'Hiç yapılmadı';
  return formatDateTime(date);
}
const clientId = computed(() => props.client?.order);
const clientName = computed(() => props.client?.name);

async function loadOverview() {
  if (!clientId.value) return;
  loadingOverview.value = true;
  try {
    const [statsRes, intRes] = await Promise.all([
      restApi.post('AdminService/getClientStats', { targetClientId: clientId.value }),
      restApi.post('AdminService/getClientIntegrations', { targetClientId: clientId.value })
    ]);

    if (statsRes?.success) metrics.value = statsRes.metrics;
    // We still fetch integrations from client DB for overview tab (active ones)
    if (intRes?.success) integrations.value = intRes.integrations;
  } finally {
    loadingOverview.value = false;
  }
}

async function loadOperations() {
  if (!clientId.value) return;
  loadingOps.value = true;
  try {
    const res = await restApi.post('AdminService/getGlobalMetrics', { targetClientId: clientId.value });
    if (res?.success) {
      exportStats.value = res.exports;
      importStats.value = res.imports;
    }
  } finally {
    loadingOps.value = false;
  }
}

// Karar 3.3 "canlı iş-durumu paleti" — export/import iş durumları JOB_STATUS_TONE'a eşlenir
// (status-map.ts TEK KAYNAK); ham backend kodları (PENDING/QUEUED/…) yerel bir anahtar haritasıyla
// 5 kanonik iş durumuna indirgenir.
const JOB_RAW_TO_KEY: Record<string, JobStatus> = {
  PENDING: 'queued', QUEUED: 'queued',
  PROCESSING: 'processing', FETCHING: 'processing',
  COMPLETED: 'completed', SENT: 'completed', SUCCESS: 'completed',
  FAILED: 'failed', CANCELLED: 'failed', ERROR: 'failed',
};
function jobStatusTone(status: string): StatusTone {
  const key = JOB_RAW_TO_KEY[status];
  return key ? JOB_STATUS_TONE[key].tone : 'neutral';
}

function getIntegrationLogo(code: string) {
  const marketplaces = marketplaceStore.getMarketplaces();
  const marketplace = marketplaces.find(m => m.code === code);
  if (marketplace) return marketplace.logo;
  return undefined;
}

watch(() => props.modelValue, (val) => {
  if (val && props.client) {
    activeTab.value = 'overview';
    // Sync form with client data
Object.assign(form, {
      name: props.client.name || '',
      title: props.client.title || '',
      status: props.client.status || 'ACTIVE',
      lastSuccessfulOrderSync: props.client.lastSuccessfulOrderSync,
      integrations: JSON.parse(JSON.stringify(props.client.integrations || [])),
      archive: props.client.archive || { ...form.archive },
      image: props.client.image || { ...form.image }
    });
    loadOverview();
  }
});

async function save() {
  if (!props.client) return;
  saving.value = true;
  try {
    // Update
    const res = await restApi.post('AdminService/updateClient', {
      targetClientId: clientId.value,
      clientData: form
    });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Mağaza bilgileri güncellendi.', color: 'success' });
      emit('refresh');
      emit('close');
    }
  } catch (e: any) {
    snackbarStore.addSnackbar({ text: e.message || 'Güncelleme başarısız!', color: 'error' });
  } finally {
    saving.value = false;
  }
}

watch(activeTab, (val) => {
  if (val === 'operations' && exportStats.value.length === 0) {
    loadOperations();
  }
});
</script>

<style scoped lang="scss">
.premium-stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-4);
}

// Hover: yalnızca renk/kenarlık geri bildirimi (token süre, 200ms). Eski `translateY(-2px)` "zıplama"
// efekti kaldırıldı (premium-ui-standards: yalnızca işlevsel geri bildirim). Eski bespoke indigo
// hover zemini `primary` tabanlı `color-mix()`'e bağlandı (B3, literal renk kodu kalmadı).
.hover-card {
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard),
    background-color var(--ek-duration-base) var(--ek-easing-standard);
  cursor: pointer;

  &:hover {
    border-color: color-mix(in srgb, var(--ek-color-primary) 30%, transparent) !important;
    background-color: color-mix(in srgb, var(--ek-color-primary) 4%, var(--ek-color-surface)) !important;
  }
}

.metric-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  min-width: 150px;
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard);

  &:hover {
    border-color: var(--ek-color-border-strong);
  }
}

.metric-pill-count {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.bg-slate-50 {
  background-color: var(--ek-color-surface-muted) !important;
}

// Karar 1.2 — bölüm başlığı "üst etiket" (overline) stilindedir.
.section-overline {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.switch-label {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  margin-right: var(--ek-space-2);
}

.integration-code {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.integration-title {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  margin-top: var(--ek-space-1);
}

.integration-item-code {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.integration-item-type {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.user-count-box {
  text-align: center;
  padding: var(--ek-space-4) 0;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  margin-bottom: var(--ek-space-6);
}

.user-count-value {
  font-size: var(--ek-font-size-3xl);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-primary);
}

.user-count-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}

.stat-label {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default) !important;
}
</style>
