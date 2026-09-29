<template>
  <EkDetailSheet v-model="isOpen" :identity="claim?.externalClaimId ?? 'Talep detayı'">
    <template #status>
      <EkStatusChip v-if="claim" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <template #actions>
      <v-btn v-if="claim" variant="outlined" :disabled="!isClaimActionAllowed(claim, 'REJECT')" prepend-icon="mdi-package-variant-remove" @click="emit('reject', claim)">
        Reddet
      </v-btn>
      <v-btn v-if="claim" color="primary" :disabled="!isClaimActionAllowed(claim, 'APPROVE')" prepend-icon="mdi-package-variant-closed-check" @click="emit('approve', claim)">
        Onayla
      </v-btn>
    </template>

    <div v-if="claim" class="d-flex flex-column ek-gap-8">
      <EkSection>
        <EkDescriptionList :items="identityItems" />
      </EkSection>

      <EkSection v-if="claim.internalStatus !== ClaimInternalStatusEnum.CANCELLED" title="Süreç durumu">
        <div class="ek-claim-stepper">
          <div v-for="(step, i) in steps" :key="i" class="ek-claim-step" :class="{ 'ek-claim-step--done': stepperStep >= i, 'ek-claim-step--active': stepperStep === i }">
            <span class="ek-claim-step__dot" />
            <span class="ek-claim-step__label">{{ $t(statusToneOf(step).labelKey) }}</span>
          </div>
        </div>
        <v-alert :type="alertType" variant="tonal" :icon="statusInformation?.icon" class="mt-4">
          <div class="text-body-2 font-weight-medium">{{ statusInformation?.title }}</div>
          <div class="text-caption mt-1">{{ statusInformation?.desc }}</div>
        </v-alert>
      </EkSection>

      <v-alert v-if="claim.internalStatus === ClaimInternalStatusEnum.REJECTED" type="error" variant="tonal" icon="mdi-alert-circle-outline">
        <div class="text-caption font-weight-semibold">Red gerekçesi (sizin tarafınızdan)</div>
        <div class="text-body-2">{{ claim.meta?.rejectReason || 'Gerekçe belirtilmedi' }}</div>
      </v-alert>

      <EkSection title="İade edilen ürünler">
        <EkDataTable :items="claim.items || []" :columns="itemColumns" row-key="sku">
          <template #cell-productName="{ item }">
            <div class="d-flex flex-column">
              <span class="font-weight-medium text-body-2">{{ item.productName }}</span>
              <span class="text-caption ek-muted">SKU: {{ item.sku }} · Barkod: {{ item.barcode }}</span>
              <span v-if="item.reason" class="text-caption ek-muted mt-1">Sebep: {{ item.reason }}</span>
            </div>
          </template>
          <template #cell-unitPrice="{ item }">{{ formatMoney(item.unitPrice, claim.currencyCode) }}</template>
        </EkDataTable>
        <div class="d-flex justify-end align-center mt-3 ek-gap-2">
          <span class="text-caption ek-muted text-uppercase">Toplam iade</span>
          <span class="text-h6 font-weight-bold ek-num ek-text-danger">{{ formatMoney(calculateTotalRefund(), claim.currencyCode) }}</span>
        </div>
      </EkSection>

      <EkSection title="Müşteri analizi">
        <div v-if="claim.customer" class="d-flex flex-column ek-gap-4">
          <div class="d-flex align-center justify-space-between">
            <div class="d-flex align-center ek-gap-3">
              <v-avatar color="surface-muted" size="44">
                <span class="text-body-2 font-weight-bold">{{ claim.customer?.firstName?.[0] }}{{ claim.customer?.lastName?.[0] }}</span>
              </v-avatar>
              <div class="d-flex flex-column">
                <span class="font-weight-medium text-body-2">{{ claim.customer?.firstName }} {{ claim.customer?.lastName }}</span>
                <span class="text-caption ek-muted">{{ formatPhoneNumber(claim.customer?.phone) }}</span>
              </div>
            </div>
            <EkStatusChip :tone="scoreTone" :label="`Skor: ${customerScore}`" />
          </div>
          <EkDescriptionList :items="customerItems" />
        </div>
        <EkEmptyState v-else variant="no-data" title="Müşteri bilgisi yok" message="Bu talep için müşteri kaydı bulunamadı." />
      </EkSection>

      <EkSection v-if="claim.fulfillment?.trackingCode" title="İade lojistik bilgileri (gelen)">
        <EkDescriptionList :items="[
          { label: 'Kargo firması', value: claim.fulfillment?.carrierName || 'Belirtilmedi' },
          { label: 'Takip kodu', value: claim.fulfillment?.trackingCode },
        ]" />
        <v-btn v-if="claim.fulfillment?.trackingUrl" variant="outlined" size="small" class="mt-2" prepend-icon="mdi-map-marker-outline" @click="openLink(claim.fulfillment?.trackingUrl)">
          Takip sayfasını aç
        </v-btn>
      </EkSection>

      <EkSection v-if="claim.meta?.replacementInfo?.trackingCode" title="Değişim paketi bilgileri (giden)">
        <EkDescriptionList :items="[
          { label: 'Kargo firması', value: claim.meta.replacementInfo.carrierName },
          { label: 'Takip kodu', value: claim.meta.replacementInfo.trackingCode },
        ]" />
      </EkSection>

      <EkSection v-if="claim.meta?.rejectedInfo?.trackingCode" title="Reddedilen paket bilgileri (geri gönderilen)">
        <EkDescriptionList :items="[
          { label: 'Kargo firması', value: claim.meta.rejectedInfo.carrierName },
          { label: 'Takip kodu', value: claim.meta.rejectedInfo.trackingCode },
        ]" />
      </EkSection>

      <EkSection title="İade yolculuğu">
        <ol class="ek-claim-timeline">
          <li v-for="(log, index) in (claim.history?.slice().reverse() || [])" :key="index" class="ek-claim-timeline__item">
            <span class="ek-claim-timeline__dot" />
            <div class="d-flex flex-column">
              <span class="text-body-2 font-weight-medium">{{ translateStatus(log.status) }}</span>
              <span v-if="log.description" class="text-caption ek-muted">{{ log.description }}</span>
              <span class="text-caption ek-muted ek-num">{{ formatDateTime(log.changedAt) }}</span>
            </div>
          </li>
          <li v-if="!claim.history?.length" class="ek-claim-timeline__item">
            <span class="ek-claim-timeline__dot" />
            <div class="d-flex flex-column">
              <span class="text-body-2 font-weight-medium">İade talebi oluşturuldu</span>
              <span class="text-caption ek-muted ek-num">{{ formatDateTime(claim.claimedAt) }}</span>
            </div>
          </li>
        </ol>
      </EkSection>

      <EkSection title="İade operasyon rehberi" description="İade kabul/red süreçleri ve dikkat edilmesi gereken kritik kurallar">
        <v-row dense>
          <v-col cols="12" sm="4">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-magnify-scan</v-icon>
              <div class="text-caption font-weight-semibold mb-1">1. Fiziksel kontrol</div>
              <div class="text-caption ek-muted">Ürün ulaştığında ambalajı, güvenlik şeridini ve kullanım durumunu kontrol edin.</div>
            </div>
          </v-col>
          <v-col cols="12" sm="4">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-camera-outline</v-icon>
              <div class="text-caption font-weight-semibold mb-1">2. Red ve kanıt</div>
              <div class="text-caption ek-muted">Kullanılmış/hasarlı ürünleri reddederken itiraz süreci için fotoğraf çekin.</div>
            </div>
          </v-col>
          <v-col cols="12" sm="4">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-clock-alert-outline</v-icon>
              <div class="text-caption font-weight-semibold mb-1">3. Zaman sınırı</div>
              <div class="text-caption ek-muted">Ürün depoya ulaştıktan sonra genellikle 2 iş günü içinde karar verilmelidir.</div>
            </div>
          </v-col>
        </v-row>
      </EkSection>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import { formatMoney, formatDateTime, formatPercent } from '@/composables/format';
import { CLAIM_STATUS_TONE, type StatusTone } from '@/design/status-map';
import { ClaimInternalStatusEnum, CLAIM_INTERNAL_STATUS_LABELS } from '@/types/ClaimTypes';
import { useLifecycle } from '@/composables/useLifecycle';

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    claim: { type: Object, default: () => null }
});

const emit = defineEmits(['update:modelValue', 'approve', 'reject']);

const { isClaimActionAllowed } = useLifecycle();

const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
});

const openLink = (url: string) => { if (url) window.open(url, '_blank'); };

/** Türkiye telefon formatlayıcı: +90 (5XX) XXX XX XX */
const formatPhoneNumber = (phone: string | number): string => {
    if (!phone) return '—';
    let cleaned = ('' + phone).replace(/\D/g, '');
    if (cleaned.startsWith('90')) cleaned = cleaned.substring(2);
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.length !== 10) return String(phone);
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{2})(\d{2})$/);
    return match ? `+90 (${match[1]}) ${match[2]} ${match[3]} ${match[4]}` : String(phone);
};

function statusToneOf(status: ClaimInternalStatusEnum) {
    return CLAIM_STATUS_TONE[status] ?? { tone: 'neutral' as StatusTone, labelKey: 'status.claim.waiting' };
}

const statusEntry = computed(() => statusToneOf(props.claim?.internalStatus as ClaimInternalStatusEnum));
const alertType = computed(() => {
    const tone = statusEntry.value.tone;
    return tone === 'danger' ? 'error' : tone === 'neutral' ? 'info' : tone;
});

const steps = computed(() => [
    ClaimInternalStatusEnum.WAITING,
    ClaimInternalStatusEnum.UNDER_REVIEW,
    ClaimInternalStatusEnum.COMPLETED
]);

const stepperStep = computed(() => {
    if (!props.claim) return 0;
    const s = props.claim.internalStatus;
    if ([ClaimInternalStatusEnum.WAITING].includes(s)) return 0;
    if ([ClaimInternalStatusEnum.UNDER_REVIEW, ClaimInternalStatusEnum.DISPUTED].includes(s)) return 1;
    if ([ClaimInternalStatusEnum.APPROVED, ClaimInternalStatusEnum.REJECTED, ClaimInternalStatusEnum.COMPLETED].includes(s)) return 2;
    return 0;
});

const statusInformation = computed(() => {
    if (!props.claim) return null;
    const s = props.claim.internalStatus as ClaimInternalStatusEnum;
    const descriptions: Record<string, { desc: string; icon: string }> = {
        [ClaimInternalStatusEnum.WAITING]: { desc: 'Müşteri iade talebini oluşturdu. Lojistik süreci bekleniyor.', icon: 'mdi-clock-outline' },
        [ClaimInternalStatusEnum.UNDER_REVIEW]: { desc: 'Ürün şu an kalite kontrol veya iade şartlarına uygunluk açısından incelenmektedir.', icon: 'mdi-magnify-scan' },
        [ClaimInternalStatusEnum.APPROVED]: { desc: 'İade talebi onaylandı. Ödeme iadesi süreçleri tamamlanmak üzere.', icon: 'mdi-check-circle' },
        [ClaimInternalStatusEnum.REJECTED]: { desc: 'İade şartlara uymadığı için reddedildi.', icon: 'mdi-close-circle' },
        [ClaimInternalStatusEnum.DISPUTED]: { desc: 'Red kararına itiraz edildi. Pazar yeri yetkilileri inceleme yapacak.', icon: 'mdi-alert-decagram' },
        [ClaimInternalStatusEnum.CANCELLED]: { desc: 'İade talebi iptal edildi.', icon: 'mdi-cancel' },
        [ClaimInternalStatusEnum.COMPLETED]: { desc: 'İade dosyası başarıyla sonuçlandırıldı ve kapatıldı.', icon: 'mdi-check-all' },
    };
    const info = descriptions[s] ?? { desc: 'Durum işleniyor…', icon: 'mdi-information-outline' };
    return { title: CLAIM_INTERNAL_STATUS_LABELS[s] ?? 'Bilgi alınıyor', ...info };
});

const customerScore = computed(() => {
    const c = props.claim?.customer;
    return (c?.metrics?.totalOrderCount || 0) - ((c?.metrics?.totalClaimCount || 0) * 2);
});

const scoreTone = computed<StatusTone>(() => {
    const score = props.claim?.customer?.insights?.customerScore || 0;
    if (score > 15) return 'success';
    if (score > 5) return 'warning';
    return 'danger';
});

const identityItems = computed<EkDescriptionListItem[]>(() => {
    if (!props.claim) return [];
    const items: EkDescriptionListItem[] = [
        { label: 'İade Talep No', value: props.claim.externalClaimId },
        { label: 'Kaynak sipariş', value: props.claim.externalOrderId },
        { label: 'Talep tarihi', value: formatDateTime(props.claim.claimedAt) },
    ];
    if (props.claim.fulfillment?.trackingCode) {
        items.push({ label: `${props.claim.fulfillment.carrierName || 'Kargo'} takip kodu`, value: props.claim.fulfillment.trackingCode });
    }
    return items;
});

const customerItems = computed<EkDescriptionListItem[]>(() => {
    const c = props.claim?.customer;
    if (!c) return [];
    const returnRate = (c.metrics?.totalOrderCount > 0)
        ? ((c.metrics.totalClaimCount / c.metrics.totalOrderCount) * 100)
        : 0;
    return [
        { label: 'E-posta', value: c.email || '—' },
        { label: 'Lokasyon', value: `${c.addresses?.[0]?.city || ''} ${c.addresses?.[0]?.state || ''}`.trim() || '—' },
        { label: 'Net kazanç (LTV)', value: formatMoney((c.metrics?.totalSpent || 0) - (c.metrics?.totalReturnAmount || 0)) },
        { label: 'İade oranı', value: formatPercent(returnRate / 100) },
    ];
});

const itemColumns: EkTableColumn[] = [
    { key: 'productName', label: 'İade edilen ürün' },
    { key: 'quantity', label: 'Adet', align: 'end' },
    { key: 'unitPrice', label: 'Tutar', align: 'end' },
];

const calculateTotalRefund = () => {
    return props.claim?.items?.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0) || 0;
};

const translateStatus = (s: any) => CLAIM_INTERNAL_STATUS_LABELS[s as ClaimInternalStatusEnum] || s;
</script>

<style scoped>
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-3 { gap: var(--ek-space-3); }
.ek-gap-4 { gap: var(--ek-space-4); }
.ek-gap-8 { gap: var(--ek-space-8); }

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-text-danger {
  color: var(--ek-color-error);
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}

.ek-claim-stepper {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.ek-claim-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  text-align: center;
}

.ek-claim-step__dot {
  width: 10px;
  height: 10px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-strong);
}

.ek-claim-step--done .ek-claim-step__dot,
.ek-claim-step--active .ek-claim-step__dot {
  background: var(--ek-color-primary);
}

.ek-claim-step__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-claim-step--active .ek-claim-step__label {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-claim-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-claim-timeline__item {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

.ek-claim-timeline__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-primary);
  flex: none;
}

.ek-guide-card {
  background: var(--ek-color-surface);
}
</style>
