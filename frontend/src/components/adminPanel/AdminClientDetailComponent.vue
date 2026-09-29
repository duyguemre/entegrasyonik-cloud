<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    title="Mağaza Detay Analizi" :subtitle="clientName ? `${clientName} Performance & Traffic` : 'Mağaza Analizi'"
    icon="mdi-store-search-outline" color="primary" maxWidth="1000px" :showFooter="false" @close="$emit('close')"
    attach="adminClientListView">

    <div class="pa-0">
      <v-tabs v-model="activeTab" color="primary" class="admin-tabs px-4 border-b">
        <v-tab value="overview" class="font-weight-black">
          <v-icon start size="18">mdi-view-dashboard-outline</v-icon> GENEL BAKIŞ
        </v-tab>
        <v-tab value="operations" class="font-weight-black">
          <v-icon start size="18">mdi-buffer</v-icon> OPERASYONEL İZLEME
        </v-tab>
        <v-tab value="settings" class="font-weight-black">
          <v-icon start size="18">mdi-cog-outline</v-icon> MAĞAZA AYARLARI
        </v-tab>
      </v-tabs>

      <v-window v-model="activeTab" class="pa-4">
        <!-- Overview Tab -->
        <v-window-item value="overview">
          <div v-if="loadingOverview" role="status" aria-label="Genel bakış yükleniyor" class="py-4">
            <EkSkeleton type="cards" :rows="2" />
          </div>

          <template v-else>
            <EkKpiRow class="mb-6">
              <ClientStatsCard title="Toplam Ürün" :value="metrics.productCount" />
              <ClientStatsCard title="Varyant Sayısı" :value="metrics.variantCount" />
              <ClientStatsCard title="Siparişler" :value="metrics.orderCount" :subValue="metrics.totalRevenue" subUnit="TRY" />
              <ClientStatsCard title="İadeler" :value="metrics.claimCount" :subValue="metrics.totalReturnAmount" subUnit="TRY" />
            </EkKpiRow>

            <v-row>
              <v-col cols="12" md="8">
                <v-card flat border class="rounded-xl pa-5 h-100 bg-slate-50 border-subtle">
                  <div class="d-flex align-center mb-6">
                    <v-icon color="primary" class="mr-2">mdi-connection</v-icon>
                    <span class="text-subtitle-1 font-weight-black color-slate-800">Aktif Entegrasyonlar</span>
                  </div>

                  <v-row v-if="integrations.length > 0">
                    <v-col v-for="int in integrations" :key="int._id" cols="12" sm="6">
                      <v-card flat border class="pa-4 rounded-lg d-flex align-center hover-card bg-surface">
                        <v-avatar color="surface-sunken" size="44" class="mr-4 border">
                          <v-icon color="primary" size="20">mdi-cloud-sync-outline</v-icon>
                        </v-avatar>
                        <div class="flex-grow-1">
                          <div class="d-flex align-center justify-space-between">
                            <span class="text-subtitle-2 font-weight-black color-slate-900">{{ int.integrationCode
                              }}</span>
                            <EkStatusChip tone="success" label="AKTİF" />
                          </div>
                          <div class="text-micro font-weight-bold color-slate-500 mt-1 line-clamp-1">
                            {{ int.title || 'Platform Entegrasyonu' }}
                          </div>
                        </div>
                      </v-card>
                    </v-col>
                  </v-row>
                  <div v-else class="text-center py-10 opacity-50">
                    <v-icon size="48">mdi-link-variant-off</v-icon>
                    <p class="mt-2 text-caption font-weight-bold">Aktif entegrasyon yok</p>
                  </div>
                </v-card>
              </v-col>

              <v-col cols="12" md="4">
                <v-card flat border class="rounded-xl pa-5 h-100 bg-slate-50 border-subtle">
                  <div class="d-flex align-center mb-6">
                    <v-icon color="primary" class="mr-2">mdi-account-circle-outline</v-icon>
                    <span class="text-subtitle-1 font-weight-black color-slate-800">Kullanıcı Özeti</span>
                  </div>

                  <div class="text-center py-4 bg-surface rounded-xl mb-6 border">
                    <div class="text-h3 font-weight-black color-primary">{{ metrics.userCount }}</div>
                    <div class="text-micro font-weight-black color-slate-500 uppercase">Kayıtlı Kullanıcı</div>
                  </div>

                  <v-divider class="mb-6"></v-divider>

                  <div class="d-flex flex-column gap-3">
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-caption font-weight-bold color-slate-600">VIP Durumu</span>
                      <EkStatusChip :tone="metrics.totalRevenue > 100000 ? 'info' : 'neutral'"
                        :label="metrics.totalRevenue > 100000 ? 'PLATINUM' : 'STANDART'" />
                    </div>
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-caption font-weight-bold color-slate-600">İade Oranı</span>
                      <span class="text-caption font-weight-black"
                        :class="returnRate > 10 ? 'text-error' : 'text-success'">
                        {{ formatPercent(returnRate / 100) }}
                      </span>
                    </div>
                  </div>
                </v-card>
              </v-col>
            </v-row>
          </template>
        </v-window-item>

        <!-- Operations Tab -->
        <v-window-item value="operations">
          <div v-if="loadingOps" role="status" aria-label="Operasyon verileri yükleniyor" class="py-4">
            <EkSkeleton type="cards" :rows="2" />
          </div>

          <template v-else>
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="text-caption font-weight-bold color-slate-500 uppercase tracking-widest">Canlı Trafik
                İzleme</span>
              <v-btn icon="mdi-refresh" variant="text" size="small" color="primary" aria-label="Operasyon verilerini yenile"
                @click="loadOperations"></v-btn>
            </div>

            <v-row class="mb-6">
              <v-col cols="12" md="6">
                <v-card flat border class="rounded-xl pa-5 bg-slate-50 border-subtle h-100">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <span class="text-subtitle-2 font-weight-black color-slate-800">EXPORT DURUMU</span>
                    <v-icon color="primary" size="20">mdi-upload-network-outline</v-icon>
                  </div>
                  <div class="d-flex flex-wrap gap-2">
                    <div v-for="exp in exportStats" :key="exp._id"
                      class="metric-pill pa-2 px-3 rounded-lg border flex-grow-1 bg-surface">
                      <div class="d-flex align-center justify-space-between">
                        <span class="text-micro font-weight-black color-slate-500 uppercase">{{ exp._id }}</span>
                        <span class="text-subtitle-2 font-weight-black" :class="getStatusColorClass(exp._id)">{{
                          exp.count }}</span>
                      </div>
                    </div>
                  </div>
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <v-card flat border class="rounded-xl pa-5 bg-slate-50 border-subtle h-100">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <span class="text-subtitle-2 font-weight-black color-slate-800">IMPORT DURUMU</span>
                    <v-icon color="content-muted" size="20">mdi-download-network-outline</v-icon>
                  </div>
                  <div class="d-flex flex-wrap gap-2">
                    <div v-for="imp in importStats" :key="imp._id"
                      class="metric-pill pa-2 px-3 rounded-lg border flex-grow-1 bg-surface">
                      <div class="d-flex align-center justify-space-between">
                        <span class="text-micro font-weight-black color-slate-500 uppercase">{{ imp._id }}</span>
                        <span class="text-subtitle-2 font-weight-black" :class="getStatusColorClass(imp._id)">{{
                          imp.count }}</span>
                      </div>
                    </div>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Status Legend -->
            <v-card flat border class="rounded-xl pa-4 bg-surface border-subtle">
              <div class="d-flex flex-wrap gap-6 justify-center">
                <div class="d-flex align-center gap-2">
                  <div class="status-dot bg-warning"></div>
                  <span class="text-micro font-weight-bold color-slate-600">BEKLEYEN İŞLEMLER</span>
                </div>
                <div class="d-flex align-center gap-2">
                  <div class="status-dot bg-success"></div>
                  <span class="text-micro font-weight-bold color-slate-600">TAMAMLANANLAR</span>
                </div>
                <div class="d-flex align-center gap-2">
                  <div class="status-dot bg-error"></div>
                  <span class="text-micro font-weight-bold color-slate-600">HATALI İŞLEMLER</span>
                </div>
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
                <v-card flat border class="rounded-xl pa-5 border-subtle mb-4">
                  <div class="text-subtitle-2 font-weight-black color-slate-800 mb-4 uppercase">TEMEL BİLGİLER</div>
                  <v-row>
                    <v-col cols="12" md="6">
                      <v-text-field v-model="form.name" label="Mağaza Adı" variant="outlined" density="compact"
                        class="customTextField" hide-details></v-text-field>
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field v-model="form.title" label="Başlık" variant="outlined" density="compact"
                        class="customTextField" hide-details></v-text-field>
                    </v-col>
                     <v-col cols="12" md="6">
                      <v-select v-model="form.status" :items="['ACTIVE', 'PASSIVE']" label="Durum" variant="outlined"
                        density="compact" class="customTextField" hide-details></v-select>
                    </v-col>
                    <v-col cols="12" md="6">
                      <v-text-field :model-value="formatSyncDate(form.lastSuccessfulOrderSync)" label="Son Başarılı Sipariş Senkronizasyonu" 
                        variant="outlined" density="compact" class="customTextField" hide-details readonly prepend-inner-icon="mdi-history">
                      </v-text-field>
                    </v-col>
                  </v-row>
                </v-card>
              </v-col>

              <!-- Creation Mode Only: User Info (REMOVED - Use AdminClientCreateComponent) -->

              <!-- Archive Settings -->
              <v-col cols="12" md="6">
                <v-card flat border class="rounded-xl pa-5 border-subtle h-100">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <div class="text-subtitle-2 font-weight-black color-slate-800 uppercase">ARŞİV DEPOLAMA (R2)</div>
                    <v-switch v-model="form.archive.isActive" hide-details color="success" inset density="compact"
                      class="premium-switch">
                      <template v-slot:label>
                        <span class="text-caption font-weight-black color-slate-500 mr-2">DURUM</span>
                      </template>
                    </v-switch>
                  </div>
                  <div class="d-flex flex-column gap-3">
                    <v-text-field v-model="form.archive.accessKeyId" label="Access Key ID" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                    <v-text-field v-model="form.archive.secretAccessKey" label="Secret Access Key" variant="outlined"
                      density="compact" class="customTextField" hide-details type="password"></v-text-field>
                    <v-text-field v-model="form.archive.bucketName" label="Bucket Name" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                    <v-text-field v-model="form.archive.endpoint" label="Endpoint" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                    <v-text-field v-model="form.archive.publicUrl" label="Public URL" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                  </div>
                </v-card>
              </v-col>

              <!-- Image Settings -->
              <v-col cols="12" md="6">
                <v-card flat border class="rounded-xl pa-5 border-subtle h-100">
                  <div class="d-flex align-center justify-space-between mb-4">
                    <div class="text-subtitle-2 font-weight-black color-slate-800 uppercase">RESİM DEPOLAMA (R2)</div>
                    <v-switch v-model="form.image.isActive" hide-details color="success" inset density="compact"
                      class="premium-switch">
                      <template v-slot:label>
                        <span class="text-caption font-weight-black color-slate-500 mr-2">DURUM</span>
                      </template>
                    </v-switch>
                  </div>
                  <div class="d-flex flex-column gap-3">
                    <v-text-field v-model="form.image.accessKeyId" label="Access Key ID" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                    <v-text-field v-model="form.image.secretAccessKey" label="Secret Access Key" variant="outlined"
                      density="compact" class="customTextField" hide-details type="password"></v-text-field>
                    <v-text-field v-model="form.image.bucketName" label="Bucket Name" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                    <v-text-field v-model="form.image.endpoint" label="Endpoint" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                    <v-text-field v-model="form.image.publicUrl" label="Public URL" variant="outlined"
                      density="compact" class="customTextField" hide-details></v-text-field>
                  </div>
                </v-card>
              </v-col>

              <!-- Integration Management -->
              <v-col cols="12">
                <v-card flat border class="rounded-xl pa-5 border-subtle">
                  <div class="text-subtitle-2 font-weight-black color-slate-800 mb-6 uppercase">ENTEGRASYON YÖNETİMİ</div>
                  
                  <div v-if="form.integrations && form.integrations.length > 0">
                    <v-row>
                      <v-col v-for="item in form.integrations" :key="item.integrationCode" cols="12" md="4" sm="6">
                        <v-card flat border class="pa-3 rounded-lg d-flex align-center bg-slate-50">
                          <v-avatar size="32" class="mr-3" color="surface" border>
                            <v-img v-if="getIntegrationLogo(item.integrationCode)" :src="getIntegrationLogo(item.integrationCode)"
                              :alt="`${item.integrationCode} logosu`" />
                            <v-icon v-else size="18" color="content-muted">mdi-api</v-icon>
                          </v-avatar>
                          <div class="flex-grow-1">
                            <div class="text-micro font-weight-black color-slate-700 uppercase">{{ item.integrationCode }}</div>
                            <div class="text-micro font-weight-bold color-slate-400 uppercase">{{ item.type }}</div>
                          </div>
                          <v-switch v-model="item.status" hide-details color="success" inset density="compact" class="premium-switch"
                            :aria-label="`${item.integrationCode} entegrasyonu etkin`"></v-switch>
                        </v-card>
                      </v-col>
                    </v-row>
                  </div>
                  <div v-else class="text-center py-6 opacity-50">
                    <v-icon size="32" color="content-muted">mdi-link-variant-off</v-icon>
                    <p class="text-caption mt-2">Entegrasyon tanımı bulunamadı.</p>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <div class="d-flex justify-end mt-6 ga-3">
              <v-btn variant="outlined" class="px-6 font-weight-black" @click="$emit('close')">
                İPTAL
              </v-btn>
              <v-btn color="primary" class="px-8 font-weight-black" elevation="0" :loading="saving"
                @click="save">
                <v-icon start size="18">mdi-content-save-outline</v-icon>
                GÜNCELLE
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
import useMarketplaceStore from '@/stores/marketplace';
import EkKpiRow from '@/components/ds/EkKpiRow.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import { formatDateTime, formatPercent } from '@/composables/format';

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

function formatSyncDate(date: any) {
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

function getStatusColorClass(status: string) {
  if (['FAILED', 'CANCELLED', 'ERROR'].includes(status)) return 'text-error';
  if (['COMPLETED', 'SENT', 'SUCCESS'].includes(status)) return 'text-success';
  if (['PENDING', 'QUEUED', 'PROCESSING', 'FETCHING'].includes(status)) return 'text-warning';
  return 'ek-muted';
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
.admin-tabs {
  background: var(--ek-color-surface);

  :deep(.v-tab) {
    font-size: var(--ek-font-size-xs);
    letter-spacing: 0.5px;
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

// Hover: yalnızca renk/kenarlık geri bildirimi (token süre, 200ms). Eski `translateY(-2px)` "zıplama"
// efekti kaldırıldı (premium-ui-standards: yalnızca işlevsel geri bildirim).
.hover-card {
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard),
    background-color var(--ek-duration-base) var(--ek-easing-standard);
  cursor: pointer;

  &:hover {
    border-color: color-mix(in srgb, var(--ek-color-primary) 30%, transparent) !important;
    background-color: var(--ek-color-surface-muted) !important;
  }
}

.metric-pill {
  min-width: 130px;
  box-shadow: var(--ek-shadow-sm);
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard);

  &:hover {
    border-color: var(--ek-color-border-strong);
  }
}

.status-dot {
  width: var(--ek-space-2);
  height: var(--ek-space-2);
  border-radius: var(--ek-radius-full);
}

.bg-slate-50 {
  background-color: var(--ek-color-surface-muted) !important;
}

.color-slate-900 {
  color: var(--ek-color-content-strong);
}

.color-slate-800 {
  color: var(--ek-color-content-strong);
}

.color-slate-600 {
  color: var(--ek-color-content-default);
}

.color-slate-500 {
  color: var(--ek-color-content-muted);
}

.text-micro {
  font-size: var(--ek-font-size-xs);
}

.gap-2 {
  gap: var(--ek-space-2);
}

.gap-3 {
  gap: var(--ek-space-3);
}

.gap-4 {
  gap: var(--ek-space-4);
}

.gap-6 {
  gap: var(--ek-space-6);
}

.uppercase {
  text-transform: uppercase;
}

.tracking-widest {
  letter-spacing: 0.1em;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default) !important;
}

.border-b {
  border-bottom: 1px solid var(--ek-color-border-default) !important;
}
</style>
