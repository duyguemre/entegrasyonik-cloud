<template>
    <EkDetailSheet v-model="isOpen" :identity="dialogTitle">
        <template #status>
            <EkStatusChip :tone="entry.tone" :label="$t(entry.labelKey)" />
        </template>
        <template v-if="customer && canAnonymize" #actions>
            <!-- C1.6: yıkıcı eylem ⋯ menüsünde, en sonda (admin; asıl sınır backend `customers.anonymize` minTier admin). -->
            <EkContextMenu :groups="actionMenu" label="Müşteri işlemleri" @select="onMenuSelect">
                <template #activator="{ props: menuProps }">
                    <EkButton v-bind="menuProps" tone="ghost" icon="mdi-dots-horizontal" icon-only aria-label="Müşteri işlemleri" />
                </template>
            </EkContextMenu>
        </template>

        <div v-if="customer" class="d-flex flex-column ek-gap-8">
            <div class="d-flex align-center flex-wrap ek-gap-4">
                <v-avatar color="surface-muted" size="72" class="avatar-ring flex-shrink-0">
                    <span class="text-h5 font-weight-bold ek-avatar-initials">
                        {{ customer.firstName?.[0] }}{{ customer.lastName?.[0] }}
                    </span>
                </v-avatar>

                <div class="d-flex flex-column justify-center flex-grow-1">
                    <div class="d-flex align-center ek-gap-2">
                        <span class="text-h6 font-weight-semibold">
                            {{ customer.firstName }} {{ customer.lastName }}
                        </span>
                        <EkStatusChip v-if="customer.isCorporate" tone="info" label="Kurumsal" />
                        <EkStatusChip v-if="customer.insights?.isVip" tone="warning" label="VIP" dot />
                    </div>
                    <span class="text-caption ek-muted mt-1">Kayıt: {{ formatDate(customer.createdAt) }}</span>
                </div>

                <div class="score-widget pa-3 rounded-lg border-subtle d-flex flex-column align-center justify-center">
                    <span class="text-caption font-weight-medium ek-muted">SADAKAT SKORU</span>
                    <span class="text-h5 font-weight-bold ek-num" :class="scoreToneClass">{{ customer.insights?.customerScore || 0 }}</span>
                </div>
            </div>

            <EkSection title="Finansal analiz ve risk durumu">
                <v-row dense>
                    <v-col cols="12" sm="3">
                        <div class="insight-card pa-4 h-100 border-subtle">
                            <v-icon color="content-muted" size="22" class="mb-1">mdi-basket-check</v-icon>
                            <div class="text-h6 font-weight-bold ek-num leading-none">{{ formatMoney(customer.metrics?.totalSpent || 0) }}</div>
                            <div class="text-caption ek-muted mt-1">Brüt ciro</div>
                        </div>
                    </v-col>

                    <v-col cols="12" sm="3">
                        <div class="insight-card pa-4 h-100 border-subtle">
                            <v-icon color="success" size="22" class="mb-1">mdi-safe-square-outline</v-icon>
                            <div class="text-h6 font-weight-bold ek-num leading-none ek-text-success">{{ formatMoney(customer.insights?.netRevenue || 0) }}</div>
                            <div class="text-caption ek-text-success mt-1">Net kazanç</div>
                        </div>
                    </v-col>

                    <v-col cols="12" sm="3">
                        <div class="insight-card pa-4 h-100 border-subtle">
                            <v-icon :color="isHighRisk ? 'error' : 'content-muted'" size="22" class="mb-1">mdi-trending-down</v-icon>
                            <div class="text-h6 font-weight-bold ek-num leading-none" :class="{ 'ek-text-danger': isHighRisk }">
                                {{ formatPercent((customer.insights?.returnRate || 0) / 100) }}
                            </div>
                            <div class="text-caption mt-1" :class="isHighRisk ? 'ek-text-danger' : 'ek-muted'">İade oranı</div>
                        </div>
                    </v-col>

                    <v-col cols="12" sm="3">
                        <div class="insight-card pa-4 h-100 border-subtle">
                            <v-icon color="content-muted" size="22" class="mb-1">mdi-calendar-clock</v-icon>
                            <div class="text-body-1 font-weight-semibold leading-tight">
                                {{ customer.metrics?.lastOrderDate ? formatDate(customer.metrics.lastOrderDate) : 'Sipariş yok' }}
                            </div>
                            <div class="text-caption ek-muted mt-1">Son alışveriş</div>
                        </div>
                    </v-col>
                </v-row>
            </EkSection>

            <v-tabs v-model="tab" class="border-bottom-subtle">
                <v-tab value="general" class="text-none">Genel bilgiler</v-tab>
                <v-tab value="orders" class="text-none">Sipariş geçmişi ({{ customer.recentOrders?.length || 0 }})</v-tab>
                <v-tab value="claims" class="text-none">İade talepleri ({{ customer.recentClaims?.length || 0 }})</v-tab>
            </v-tabs>

            <v-window v-model="tab">
                <v-window-item value="general">
                    <v-row dense>
                        <v-col cols="12" md="7">
                            <EkSection title="İletişim ve kimlik">
                                <v-row dense>
                                    <v-col cols="12" sm="6"><v-text-field v-model="editData.firstName" label="Ad" /></v-col>
                                    <v-col cols="12" sm="6"><v-text-field v-model="editData.lastName" label="Soyad" /></v-col>
                                    <v-col cols="12" sm="6"><v-text-field v-model="editData.phone" label="Telefon" /></v-col>
                                    <v-col cols="12" sm="6"><v-text-field v-model="editData.email" label="E-posta" /></v-col>
                                </v-row>
                                <div class="d-flex justify-end mt-2">
                                    <v-btn color="primary" prepend-icon="mdi-content-save-outline" @click="saveCustomer">Profili güncelle</v-btn>
                                </div>
                            </EkSection>
                        </v-col>
                        <v-col cols="12" md="5">
                            <EkSection title="Platform kimlikleri">
                                <div v-for="identity in customer.externalIdentities" :key="identity.externalCustomerId"
                                    class="d-flex align-center justify-space-between mb-2 pa-2 border-subtle rounded">
                                    <PlatformImageComponent :integrationCode="identity.integrationCode" :height="32" :width="32" />
                                    <span class="text-caption ek-muted">{{ identity.externalCustomerId }}</span>
                                </div>
                                <EkEmptyState v-if="!customer.externalIdentities?.length" variant="not-connected"
                                    title="Bağlı platform yok" message="Bu müşteri henüz hiçbir pazaryeri hesabıyla eşleşmedi." />
                            </EkSection>
                        </v-col>
                    </v-row>
                </v-window-item>

                <v-window-item value="orders">
                    <EkDataTable v-if="customer.recentOrders?.length" :items="customer.recentOrders" row-key="_id" :columns="orderColumns">
                        <template #cell-platform="{ item }"><PlatformImageComponent :integrationCode="item.integrationCode" :height="28" :width="28" /></template>
                        <template #cell-date="{ item }">{{ formatDate(item.dates?.orderDate || item.createdAt) }}</template>
                        <template #cell-total="{ item }">{{ formatMoney(item.totalPrice || item.financials?.grandTotal) }}</template>
                        <template #cell-status="{ item }"><EkStatusChip :tone="orderStatusEntry(item.internalStatus).tone" :label="$t(orderStatusEntry(item.internalStatus).labelKey)" /></template>
                    </EkDataTable>
                    <EkEmptyState v-else variant="no-data" title="Sipariş kaydı yok" message="Bu müşteriye ait henüz bir sipariş bulunmuyor." />
                </v-window-item>

                <v-window-item value="claims">
                    <EkDataTable v-if="customer.recentClaims?.length" :items="customer.recentClaims" row-key="_id" :columns="claimColumns">
                        <template #cell-platform="{ item }"><PlatformImageComponent :integrationCode="item.integrationCode" :height="28" :width="28" /></template>
                        <template #cell-date="{ item }">{{ formatDate(item.externalCreatedAt || item.createdAt) }}</template>
                        <template #cell-reason="{ item }">{{ item.items?.[0]?.reason || 'Belirtilmedi' }}</template>
                        <template #cell-amount="{ item }"><span class="ek-text-danger">-{{ formatMoney(item.totalRefundAmount) }}</span></template>
                        <template #cell-status="{ item }"><EkStatusChip :tone="claimStatusEntry(item.internalStatus).tone" :label="$t(claimStatusEntry(item.internalStatus).labelKey)" /></template>
                    </EkDataTable>
                    <EkEmptyState v-else variant="no-data" title="İade kaydı yok" message="Bu müşteriye ait henüz bir iade talebi bulunmuyor." />
                </v-window-item>
            </v-window>
        </div>

        <EkSkeleton v-else type="detail" />
    </EkDetailSheet>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import { formatMoney, formatDate, formatPercent } from '@/composables/format';
import { ORDER_STATUS_TONE, CLAIM_STATUS_TONE, storeStatusTone } from '@/design/status-map';
import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { ClaimInternalStatusEnum } from '@/types/ClaimTypes';
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue';
import EkContextMenu from '@/components/ds/EkContextMenu.vue';
import EkButton from '@/components/ds/EkButton.vue';
import type { EkMenuGroup, EkMenuItem } from '@/components/ds/EkMenuPanel.vue';

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    customer: { type: Object, default: () => null },
    /** Yönetici kademesi: "Kişisel verileri anonimleştir" menü öğesi görünür. */
    canAnonymize: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'save', 'anonymize']);

const actionMenu: EkMenuGroup[] = [
    { label: 'Kişisel veriler', items: [{ key: 'anonymize', label: 'Kişisel verileri anonimleştir', icon: 'mdi-account-cancel-outline', description: 'Geri alınamaz', danger: true }] },
];

function onMenuSelect(item: EkMenuItem) {
    if (item.key === 'anonymize') emit('anonymize', props.customer);
}

const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
});

const tab = ref('general');
const editData = ref({ firstName: '', lastName: '', phone: '', email: '' });

const orderColumns: EkTableColumn[] = [
    { key: 'platform', label: 'Platform' },
    { key: 'orderNumber', label: 'Sipariş No', type: 'id' },
    { key: 'date', label: 'Tarih' },
    { key: 'total', label: 'Tutar', align: 'end' },
    { key: 'status', label: 'Statü' },
];

const claimColumns: EkTableColumn[] = [
    { key: 'platform', label: 'Platform' },
    { key: 'externalClaimId', label: 'Talep No', type: 'id' },
    { key: 'date', label: 'Tarih' },
    { key: 'reason', label: 'Sebep' },
    { key: 'amount', label: 'İade tutarı', align: 'end' },
    { key: 'status', label: 'Statü' },
];

// Prop değişimini izleyerek edit formunu doldur
watch(() => props.customer, (newVal) => {
    if (newVal) {
        editData.value.firstName = newVal.firstName || '';
        editData.value.lastName = newVal.lastName || '';
        editData.value.phone = newVal.phone || '';
        editData.value.email = newVal.email || '';
    }
}, { immediate: true });

const saveCustomer = () => {
    emit('save', {
        customerId: props.customer._id,
        updateData: { ...editData.value }
    });
};

/* --- TON/DURUM MANTIĞI (ADR-0015 Karar 3.3, status-map.ts) --- */
const scoreToneClass = computed(() => {
    const score = props.customer?.insights?.customerScore || 0;
    if (score > 15) return 'ek-text-success';
    if (score > 5) return 'ek-text-warning';
    return 'ek-text-danger';
});

const isHighRisk = computed(() => (props.customer?.insights?.returnRate || 0) > 20);

const entry = computed(() => storeStatusTone(props.customer?.status === 'ACTIVE'));

const orderStatusEntry = (status: OrderInternalStatusEnum) => ORDER_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.order.unapproved' };
const claimStatusEntry = (status: ClaimInternalStatusEnum) => CLAIM_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.claim.waiting' };

/* --- DIALOG BAŞLIĞI --- */
const dialogTitle = computed(() => `Müşteri Kartı — ${props.customer?.firstName || ''} ${props.customer?.lastName || ''}`);
</script>

<style scoped>
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-4 { gap: var(--ek-space-4); }
.ek-gap-8 { gap: var(--ek-space-8); }

.border-subtle {
    border: 1px solid var(--ek-color-border-default);
}

.avatar-ring {
    border: 1px solid var(--ek-color-border-default);
}

.ek-avatar-initials {
    color: var(--ek-color-content-strong);
}

.ek-muted {
    color: var(--ek-color-content-muted);
}

.ek-text-success { color: var(--ek-color-success); }
.ek-text-warning { color: var(--ek-color-warning); }
.ek-text-danger { color: var(--ek-color-error); }

.score-widget {
    min-width: 96px;
    height: 76px;
}

.insight-card {
    border-radius: var(--ek-radius-lg);
}

.border-bottom-subtle {
    border-bottom: 1px solid var(--ek-color-border-default);
}
</style>
