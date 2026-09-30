<!--
  frontend/src/components/customer/CustomerDetailComponent.vue

  A13 — müşteri kartı (yan sayfa). Hiyerarşi: PROFİL KARTI (kimlik: avatar · ad · tür · kanal kökeni · müşteri olma; KVKK
  göster/gizle) + aynı kartın alt bandında özet metrikler → sekmeler (Genel bakış · Siparişler · İadeler) → Genel bakışta
  İletişim (ikonlu, maskeli, kopyalanabilir; platform kimlikleri) ve Adresler (fatura / teslimat ayrımı) kartları.
  Eylemler başlıkta: ikincil "Düzenle" (form yalnız düzenlemede açılır) + `⋯` → anonimleştir (tehlikeli, en sonda, onay; yönetici).
  Durumlar: `loading` → iskelet, `error` → EkProblemState + Tekrar dene (hata boş kayıt gibi çizilmez), metrik yok → boş durum.
  Uydurma veri yok: metrikler yalnız backend alanları (customerCard.ts).
-->
<template>
    <EkDetailSheet v-model="isOpen" identity="Müşteri kartı">
        <template v-if="customer" #status>
            <EkStatusChip :tone="entry.tone" :label="$t(entry.labelKey)" />
        </template>
        <template v-if="customer" #actions>
            <span v-if="!anonymized" class="ek-cust-editbtn">
                <EkButton tone="secondary" :icon="icons.edit" aria-label="Profili düzenle" :aria-pressed="editing ? 'true' : 'false'" @click="toggleEdit">Düzenle</EkButton>
            </span>
            <!-- C1.6: yıkıcı eylem ⋯ menüsünde, en sonda (admin; asıl sınır backend `customers.anonymize` minTier admin). -->
            <EkContextMenu v-if="canAnonymize && !anonymized" :groups="actionMenu" label="Müşteri işlemleri" @select="onMenuSelect">
                <template #activator="{ props: menuProps }">
                    <EkButton v-bind="menuProps" tone="ghost" :icon="icons.more" icon-only aria-label="Müşteri işlemleri" />
                </template>
            </EkContextMenu>
        </template>

        <EkProblemState v-if="error && !loading" size="inline" title="Müşteri kartı açılamadı"
            cause="Müşteri kaydı şu anda getirilemedi; bağlantı ya da sunucu kaynaklı geçici bir sorun olabilir."
            action="Birkaç saniye sonra yeniden deneyin. Sorun sürerse listeyi yenileyin." retryable autofocus @retry="emit('retry')" />

        <EkSkeleton v-else-if="loading || !customer" type="detail" />

        <div v-else class="ek-cust-detail">
            <section class="ek-cust-profile" aria-label="Müşteri profili">
                <div class="ek-cust-profile__head">
                    <CustomerIdentity size="lg" as="h2" :first-name="customer.firstName" :last-name="customer.lastName"
                        :company-name="customer.companyName" :is-corporate="customer.isCorporate" :channel="originChannel"
                        :created-at="customer.createdAt">
                        <template #tags>
                            <EkBadge v-if="isVip" tone="warning">VIP</EkBadge>
                        </template>
                    </CustomerIdentity>
                    <CustomerRevealToggle v-if="hasPersonal" v-model="revealed" class="ek-cust-profile__reveal" />
                </div>
                <CustomerMetrics v-if="metrics" :summary="metrics" class="ek-cust-profile__metrics" />
            </section>

            <EkPageTabs v-model="tab" label="Müşteri ayrıntıları" :tabs="[
                { value: 'general', label: 'Genel bakış', icon: 'mdi-account-details-outline' },
                { value: 'orders', label: 'Siparişler', icon: 'mdi-cart-outline', count: customer.recentOrders?.length || 0 },
                { value: 'claims', label: 'İadeler', icon: 'mdi-undo-variant', count: customer.recentClaims?.length || 0 },
            ]" />

            <v-window v-model="tab">
                <v-window-item value="general">
                    <div class="ek-cust-detail__general">
                        <form v-if="editing" class="ek-cust-edit" aria-label="Müşteri profilini düzenle" @submit.prevent="saveCustomer">
                            <EkFormSection title="Profili düzenle" icon="mdi-account-edit-outline"
                                description="Kaydedilen bilgiler yalnız Entegrasyonik'te güncellenir; pazaryerindeki kayıt değişmez.">
                                <v-text-field v-model="editData.firstName" label="Ad" autocomplete="off" />
                                <v-text-field v-model="editData.lastName" label="Soyad" autocomplete="off" />
                                <v-text-field v-model="editData.phone" label="Telefon" autocomplete="off" inputmode="tel" />
                                <v-text-field v-model="editData.email" label="E-posta" autocomplete="off" type="email" />
                            </EkFormSection>
                            <div class="ek-cust-edit__bar">
                                <EkButton tone="secondary" @click="cancelEdit">Vazgeç</EkButton>
                                <EkButton tone="primary" type="submit" :icon="icons.save">Kaydet</EkButton>
                            </div>
                        </form>
                        <div class="ek-cust-detail__cards">
                            <EkInfoCard title="İletişim" icon="mdi-card-account-phone-outline">
                                <CustomerContactList :phone="customer.phone" :email="customer.email" :tax-number="customer.taxNumber"
                                    :tax-office="customer.taxOffice" :show-tax="!!customer.isCorporate" :is-phone-masked="customer.isPhoneMasked"
                                    :is-email-masked="customer.isEmailMasked" :identities="customer.externalIdentities" :revealed="revealed" />
                            </EkInfoCard>
                            <EkInfoCard title="Adresler" icon="mdi-map-marker-outline">
                                <CustomerAddresses v-if="addresses.billing || addresses.shipping" :billing="addresses.billing"
                                    :shipping="addresses.shipping" :revealed="revealed" />
                                <p v-else class="ek-cust-detail__muted">Kayıtlı adres yok. Adresler siparişlerle birlikte pazaryerinden gelir.</p>
                            </EkInfoCard>
                        </div>
                    </div>
                </v-window-item>

                <v-window-item value="orders">
                    <EkDataTable v-if="customer.recentOrders?.length" :items="customer.recentOrders" row-key="_id" :columns="orderColumns">
                        <template #cell-platform="{ item }"><EkChannelDot :code="item.integrationCode" variant="plain" /></template>
                        <template #cell-date="{ item }"><span class="ek-num">{{ formatDate(item.dates?.orderDate || item.createdAt) }}</span></template>
                        <template #cell-total="{ item }"><span class="ek-num">{{ formatMoney(item.totalPrice || item.financials?.grandTotal) }}</span></template>
                        <template #cell-status="{ item }"><EkStatusChip :tone="orderStatusEntry(item.internalStatus).tone" :label="$t(orderStatusEntry(item.internalStatus).labelKey)" /></template>
                    </EkDataTable>
                    <EkEmptyState v-else variant="no-data" title="Sipariş kaydı yok" message="Bu müşteriye ait henüz bir sipariş bulunmuyor." />
                </v-window-item>

                <v-window-item value="claims">
                    <EkDataTable v-if="customer.recentClaims?.length" :items="customer.recentClaims" row-key="_id" :columns="claimColumns">
                        <template #cell-platform="{ item }"><EkChannelDot :code="item.integrationCode" variant="plain" /></template>
                        <template #cell-date="{ item }"><span class="ek-num">{{ formatDate(item.externalCreatedAt || item.createdAt) }}</span></template>
                        <template #cell-reason="{ item }">{{ item.items?.[0]?.reason || 'Belirtilmedi' }}</template>
                        <template #cell-amount="{ item }"><span class="ek-num">−{{ formatMoney(item.totalRefundAmount) }}</span></template>
                        <template #cell-status="{ item }"><EkStatusChip :tone="claimStatusEntry(item.internalStatus).tone" :label="$t(claimStatusEntry(item.internalStatus).labelKey)" /></template>
                    </EkDataTable>
                    <EkEmptyState v-else variant="no-data" title="İade kaydı yok" message="Bu müşteriye ait henüz bir iade talebi bulunmuyor." />
                </v-window-item>
            </v-window>
        </div>
    </EkDetailSheet>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { EkPageTabs, EkDetailSheet, EkStatusChip, EkEmptyState, EkSkeleton, EkProblemState, EkInfoCard, EkFormSection, EkBadge, EkChannelDot, EkDataTable, type EkTableColumn, EkContextMenu, EkButton } from '@entegrasyonik/ui/components'
import type { EkMenuGroup, EkMenuItem } from '@entegrasyonik/ui/components';
;
;
;
;
;
;
;
;
;
;
;
;
;
import CustomerIdentity from './card/CustomerIdentity.vue';
import CustomerMetrics from './card/CustomerMetrics.vue';
import CustomerContactList from './card/CustomerContactList.vue';
import CustomerAddresses from './card/CustomerAddresses.vue';
import CustomerRevealToggle from './card/CustomerRevealToggle.vue';
import { isAnonymized, metricSummary, splitCustomerAddresses } from './customerCard';
import { formatMoney, formatDate } from '@entegrasyonik/ui/format';
import { ORDER_STATUS_TONE, CLAIM_STATUS_TONE, storeStatusTone } from '@/design/status-map';
import { icons } from '@entegrasyonik/ui/icons';
import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { ClaimInternalStatusEnum } from '@/types/ClaimTypes';

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    customer: { type: Object, default: () => null },
    /** Yönetici kademesi: "Kişisel verileri anonimleştir" menü öğesi görünür. */
    canAnonymize: { type: Boolean, default: false },
    /** Kart verisi yükleniyor (yan sayfa hemen açılır, iskelet görünür). */
    loading: { type: Boolean, default: false },
    /** Kart verisi alınamadı → EkProblemState + Tekrar dene. */
    error: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'save', 'anonymize', 'retry']);

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
const editing = ref(false);
// KVKK: kişisel veriler varsayılan maskeli; kayıt değişince/kart kapanınca yeniden maskelenir.
const revealed = ref(false);
const editData = ref({ firstName: '', lastName: '', phone: '', email: '' });

const orderColumns: EkTableColumn[] = [
    { key: 'platform', label: 'Kanal' },
    { key: 'orderNumber', label: 'Sipariş No', type: 'id' },
    { key: 'date', label: 'Tarih' },
    { key: 'total', label: 'Tutar', align: 'end' },
    { key: 'status', label: 'Durum' },
];

const claimColumns: EkTableColumn[] = [
    { key: 'platform', label: 'Kanal' },
    { key: 'externalClaimId', label: 'Talep No', type: 'id' },
    { key: 'date', label: 'Tarih' },
    { key: 'reason', label: 'Neden' },
    { key: 'amount', label: 'İade tutarı', align: 'end' },
    { key: 'status', label: 'Durum' },
];

function fillForm(c: any) {
    editData.value = { firstName: c?.firstName || '', lastName: c?.lastName || '', phone: c?.phone || '', email: c?.email || '' };
}

watch(() => props.customer?._id, () => {
    fillForm(props.customer);
    revealed.value = false;
    editing.value = false;
    tab.value = 'general';
}, { immediate: true });
watch(isOpen, (open) => { if (!open) { revealed.value = false; editing.value = false; } });

function toggleEdit() {
    editing.value = !editing.value;
    if (editing.value) { fillForm(props.customer); tab.value = 'general'; }
}
function cancelEdit() { editing.value = false; fillForm(props.customer); }

const saveCustomer = () => {
    emit('save', {
        customerId: props.customer._id,
        updateData: { ...editData.value }
    });
};

const anonymized = computed(() => isAnonymized(props.customer?.firstName));
const isVip = computed(() => !!props.customer?.insights?.isVip || (props.customer?.tags ?? []).includes('VIP'));
// Kanal kökeni: ilk eşleşen platform kimliği; yoksa "Sistem" (manuel kayıt).
const originChannel = computed(() => props.customer?.externalIdentities?.[0]?.integrationCode ?? null);
const metrics = computed(() => metricSummary(props.customer?.metrics, props.customer?.insights?.returnRate));
const addresses = computed(() => splitCustomerAddresses(props.customer?.addresses));
const hasPersonal = computed(() => {
    const c = props.customer;
    if (!c || anonymized.value) return false;
    const values = [c.phone, c.email, c.taxNumber, addresses.value.billing?.line, addresses.value.shipping?.line];
    return values.some((v) => typeof v === 'string' && v.trim() !== '' && !isAnonymized(v));
});

const entry = computed(() => storeStatusTone(props.customer?.status === 'ACTIVE'));

const orderStatusEntry = (status: OrderInternalStatusEnum) => ORDER_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.order.unapproved' };
const claimStatusEntry = (status: ClaimInternalStatusEnum) => CLAIM_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.claim.waiting' };
</script>

<style scoped>
.ek-cust-detail {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-5);
}

/* Profil kartı: tek çerçeve (ince kenarlık + yumuşak gölge), alt bantta metrikler — kart içinde kart yok. */
.ek-cust-profile {
    border: 1px solid var(--ek-color-border-default);
    border-radius: var(--ek-radius-card);
    background: var(--ek-color-surface);
    box-shadow: var(--ek-shadow-card);
    overflow: hidden;
}

.ek-cust-profile__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ek-space-3);
    padding: var(--ek-space-5);
}

.ek-cust-profile__reveal {
    flex: none;
}

.ek-cust-profile__metrics {
    border-top: 1px solid var(--ek-color-border-subtle);
    background: var(--ek-color-surface-muted);
}

.ek-cust-detail__general {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-4);
    padding-top: var(--ek-space-1);
}

.ek-cust-detail__cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-3);
    align-items: start;
}

.ek-cust-detail__muted {
    margin: 0;
    font-size: var(--ek-type-body-size);
    line-height: var(--ek-type-body-line);
    color: var(--ek-color-content-muted);
}

.ek-cust-edit {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-3);
    padding: var(--ek-space-4);
    border: 1px solid var(--ek-color-action-border);
    border-radius: var(--ek-radius-card);
    background: var(--ek-color-surface);
}

.ek-cust-edit__bar {
    display: flex;
    justify-content: flex-end;
    gap: var(--ek-space-2);
}

@media (max-width: 599px) {
    .ek-cust-profile__head {
        flex-wrap: wrap;
        padding: var(--ek-space-4);
    }

    /* Dar ekranda başlık tek satırda kalsın: Düzenle yalnız ikon (aria-label + ipucu korunur). */
    .ek-cust-editbtn :deep(.ek-btn__label) {
        display: none;
    }

    .ek-cust-editbtn :deep(.ek-btn) {
        width: 36px;
        padding: 0;
        justify-content: center;
    }
}
</style>
