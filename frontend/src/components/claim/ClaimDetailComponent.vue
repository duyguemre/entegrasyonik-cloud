<!--
  frontend/src/components/claim/ClaimDetailComponent.vue

  Aşama 6b (Standart 6) — iade talebi detayı (sipariş detayıyla aynı dil): özet başlık (kanal rengi, durum, iade tutarı,
  talep tarihi, kaynak sipariş) → süreç adımları (talep → inceleme → karar → sonuç; tarihler `history`'den) → iade
  nedeni kartı → iade edilen ürünler → lojistik / değişim / müşteri kartları → iade geçmişi. Ana eylemler başlıkta:
  Onayla (birincil) · Reddet (tehlikeli ton). Uydurma veri yok — müşteri metrikleri gelmiyorsa satır gösterilmez.
-->
<template>
  <EkDetailSheet v-model="isOpen" :identity="claim?.externalClaimId ?? 'Talep detayı'">
    <template #status>
      <EkStatusChip v-if="claim" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <template #actions>
      <template v-if="claim">
        <EkActionButton action="reject" show-label size="md" label="Reddet" class="ek-cd-reject" :disabled="!isClaimActionAllowed(claim, 'REJECT')" @click="emit('reject', claim)" />
        <EkButton tone="primary" icon="mdi-package-variant-closed-check" :disabled="!isClaimActionAllowed(claim, 'APPROVE')" @click="emit('approve', claim)">Onayla</EkButton>
      </template>
    </template>

    <div v-if="claim" class="ek-cd">
      <EkRecordSummary
        :channel="claim.integrationCode"
        :kind="claimKind"
        :title="summaryTitle"
        :facts="summaryFacts"
        :amount="formatMoney(claim.totalRefundAmount ?? calculateTotalRefund())"
        amount-label="İade tutarı"
        :amount-hint="itemCountText"
        label="İade talebi özeti"
      />

      <EkAlert v-if="claim.internalStatus === ClaimInternalStatusEnum.REJECTED" tone="error" title="Red gerekçesi (sizin tarafınızdan)" :text="claim.meta?.rejectReason || 'Gerekçe belirtilmedi'" />

      <EkSection title="Süreç adımları">
        <EkStatusTimeline :steps="processSteps" label="İade süreci" />
        <EkAlert v-if="statusInformation" class="mt-4" :tone="alertTone" :icon="statusInformation.icon" :title="statusInformation.title" :text="statusInformation.desc" dense />
      </EkSection>

      <EkInfoCard title="İade nedeni" icon="mdi-comment-question-outline" tone="warning" empty-text="Pazaryeri iade nedeni iletmedi.">
        <ul v-if="reasons.length" class="ek-cd-reasons">
          <li v-for="(r, idx) in reasons" :key="idx">
            <span class="ek-cd-reasons__reason">{{ r.reason }}</span>
            <span class="ek-cd-reasons__item">{{ r.product }}<template v-if="r.quantity"> · {{ r.quantity }} adet</template></span>
            <q v-if="r.description" class="ek-cd-reasons__note">{{ r.description }}</q>
          </li>
        </ul>
        <p v-else class="ek-cd-muted">Pazaryeri iade nedeni iletmedi.</p>
      </EkInfoCard>

      <EkSection title="İade edilen ürünler" :description="itemCountText">
        <EkDataTable :items="claim.items || []" :columns="itemColumns" row-key="sku">
          <template #cell-productName="{ item }">
            <div class="ek-cd-item">
              <span class="ek-cd-item__name">{{ item.productName }}</span>
              <span class="ek-cd-item__meta ek-num">{{ item.sku ? `SKU ${item.sku}` : '' }}<template v-if="item.barcode"> · {{ item.barcode }}</template></span>
            </div>
          </template>
          <template #cell-unitPrice="{ item }"><span class="ek-num">{{ item.unitPrice !== undefined ? formatMoney(item.unitPrice) : '—' }}</span></template>
          <template #cell-lineTotal="{ item }"><span class="ek-num ek-cd-strong">{{ item.unitPrice !== undefined ? formatMoney((item.unitPrice || 0) * (item.quantity || 0)) : '—' }}</span></template>
        </EkDataTable>
        <dl class="ek-cd-total">
          <dt>Toplam iade</dt>
          <dd class="ek-num">{{ formatMoney(claim.totalRefundAmount ?? calculateTotalRefund()) }}</dd>
        </dl>
      </EkSection>

      <div class="ek-cd-cards">
        <EkInfoCard title="İade kargosu (gelen)" icon="mdi-truck-delivery-outline" :tone="claim.fulfillment?.trackingCode ? 'info' : 'neutral'"
          :rows="claim.fulfillment?.trackingCode ? [{ label: 'Kargo firması', value: claim.fulfillment?.carrierName || 'Belirtilmedi' }, { label: 'Takip kodu', value: claim.fulfillment?.trackingCode, numeric: true }] : []"
          empty-text="İade kargosu için takip bilgisi henüz yok.">
          <template v-if="claim.fulfillment?.trackingUrl" #actions>
            <EkButton tone="secondary" size="sm" :icon="icons.openExternal" @click="openLink(claim.fulfillment?.trackingUrl)">Takip sayfasını aç</EkButton>
          </template>
        </EkInfoCard>
        <EkInfoCard v-if="claim.meta?.replacementInfo?.trackingCode" title="Değişim paketi (giden)" icon="mdi-swap-horizontal" tone="info"
          :rows="[{ label: 'Kargo firması', value: claim.meta.replacementInfo.carrierName }, { label: 'Takip kodu', value: claim.meta.replacementInfo.trackingCode, numeric: true }]" />
        <EkInfoCard v-if="claim.meta?.rejectedInfo?.trackingCode" title="Reddedilen paket (geri gönderilen)" icon="mdi-package-variant-remove" tone="error"
          :rows="[{ label: 'Kargo firması', value: claim.meta.rejectedInfo.carrierName }, { label: 'Takip kodu', value: claim.meta.rejectedInfo.trackingCode, numeric: true }]" />
        <!-- A13: ortak müşteri kartı. İade listesi projeksiyonu adres/metrik/kimlikleri çıkarır → bu bloklar yalnız veri varsa çizilir. -->
        <CustomerBuyerCard class="ek-cd-buyer" title="Müşteri" :person="claimCustomer" :channel="claim.integrationCode"
          :billing="customerAddresses.billing" :shipping="customerAddresses.shipping" :metrics="customerMetrics"
          empty-text="Bu talep için müşteri kaydı bulunamadı." />
      </div>

      <EkSection title="İade geçmişi">
        <ol class="ek-cd-history">
          <li v-for="(log, index) in historyEntries" :key="index" class="ek-cd-history__item">
            <span class="ek-cd-history__dot" aria-hidden="true" />
            <div class="ek-cd-history__body">
              <span class="ek-cd-history__title">{{ translateStatus(log.status) }}</span>
              <span v-if="log.description" class="ek-cd-muted">{{ log.description }}</span>
              <span class="ek-cd-muted ek-num">{{ formatDateTime(log.changedAt) }}</span>
            </div>
          </li>
        </ol>
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
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkAlert, { type EkAlertTone } from '@/components/ds/EkAlert.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkActionButton from '@/components/ds/EkActionButton.vue';
import EkRecordSummary, { type EkSummaryFact } from '@/components/ds/EkRecordSummary.vue';
import EkStatusTimeline, { type EkTimelineStep } from '@/components/ds/EkStatusTimeline.vue';
import EkInfoCard from '@/components/ds/EkInfoCard.vue';
import { icons } from '@/design/icons';
import { formatMoney, formatDateTime } from '@/composables/format';
import CustomerBuyerCard, { type BuyerPerson } from '@/components/customer/card/CustomerBuyerCard.vue';
import { metricSummary, splitCustomerAddresses } from '@/components/customer/customerCard';
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


function statusToneOf(status: ClaimInternalStatusEnum) {
    return CLAIM_STATUS_TONE[status] ?? { tone: 'neutral' as StatusTone, labelKey: 'status.claim.waiting' };
}

const statusEntry = computed(() => statusToneOf(props.claim?.internalStatus as ClaimInternalStatusEnum));
const alertTone = computed<EkAlertTone>(() => {
    const tone = statusEntry.value.tone;
    return tone === 'danger' ? 'error' : tone === 'neutral' ? 'info' : (tone as EkAlertTone);
});


const historyAt = (...statuses: string[]) => {
    const hit = (props.claim?.history ?? []).filter((h: any) => statuses.includes(h?.status)).pop();
    return hit?.changedAt ? formatDateTime(hit.changedAt) : undefined;
};

/** Süreç: talep → inceleme → karar → sonuç (tarihler yalnız `history`/`claimedAt`/`resolvedAt` verisinden). */
const processSteps = computed<EkTimelineStep[]>(() => {
    const c = props.claim;
    if (!c) return [];
    const S = ClaimInternalStatusEnum;
    const s = c.internalStatus;
    const decided = [S.APPROVED, S.REJECTED, S.COMPLETED].includes(s);
    const pos = s === S.WAITING ? 1 : [S.UNDER_REVIEW].includes(s) ? 2 : s === S.DISPUTED ? 2 : decided ? (s === S.COMPLETED ? 4 : 3) : 1;
    const decisionLabel = s === S.REJECTED ? 'Reddedildi' : s === S.APPROVED || s === S.COMPLETED ? 'Onaylandı' : 'Karar';
    const steps: EkTimelineStep[] = [
        { key: 'claimed', label: 'Talep alındı', date: c.claimedAt ? formatDateTime(c.claimedAt) : historyAt(S.WAITING), state: 'done' },
        { key: 'review', label: 'İnceleme', date: historyAt(S.UNDER_REVIEW), state: pos > 2 ? 'done' : pos === 2 ? 'current' : 'current', description: s === S.DISPUTED ? 'İtiraz inceleniyor' : undefined },
        { key: 'decision', label: decisionLabel, date: historyAt(S.APPROVED, S.REJECTED), state: s === S.REJECTED ? 'failed' : pos > 3 || (pos === 3 && s !== S.REJECTED) ? 'done' : 'upcoming' },
        { key: 'resolved', label: 'Sonuçlandı', date: c.resolvedAt ? formatDateTime(c.resolvedAt) : historyAt(S.COMPLETED), state: s === S.COMPLETED ? 'done' : 'upcoming' },
    ];
    if (pos === 1) steps[1].state = 'upcoming';
    if (s === S.WAITING) steps[0].state = 'current';
    if (s === S.CANCELLED) return [steps[0], { key: 'cancelled', label: 'İptal edildi', state: 'failed', date: historyAt(S.CANCELLED) }];
    return steps;
});

const claimKind = computed(() => {
    const t = props.claim?.type;
    return t === 'RETURN' ? 'İade talebi' : t === 'EXCHANGE' ? 'Değişim talebi' : t === 'CANCEL' ? 'İptal talebi' : 'İade talebi';
});

const summaryTitle = computed(() => {
    const c = props.claim?.customer;
    const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ');
    return name || props.claim?.items?.[0]?.productName || props.claim?.externalClaimId || 'İade talebi';
});

const itemCountText = computed(() => {
    const items = props.claim?.items ?? [];
    const qty = items.reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0);
    return qty ? `${items.length} kalem · ${qty} adet` : `${items.length} kalem`;
});

// Spec çapası: "İade Talep No" etiketi ve kaynak sipariş numarası görünür.
const summaryFacts = computed<EkSummaryFact[]>(() => {
    const c = props.claim;
    if (!c) return [];
    return [
        { label: 'İade Talep No', value: c.externalClaimId, numeric: true },
        { label: 'Kaynak sipariş', value: c.externalOrderId, numeric: true },
        { label: 'Talep tarihi', value: formatDateTime(c.claimedAt), numeric: true },
    ];
});

const reasons = computed(() =>
    (props.claim?.items ?? [])
        .filter((i: any) => i?.reason || i?.description)
        .map((i: any) => ({ reason: i.reason || 'Neden belirtilmedi', description: i.description, product: i.productName, quantity: i.quantity })),
);

const historyEntries = computed(() => {
    const list = (props.claim?.history ?? []).slice().reverse();
    return list.length ? list : [{ status: 'WAITING', description: 'İade talebi oluşturuldu', changedAt: props.claim?.claimedAt }];
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

// A13 — müşteri kartı verisi (yalnız backend alanları; tek skor/formül kaldırıldı — iki farklı sayı üretiyordu).
const claimCustomer = computed<BuyerPerson | null>(() => {
    const c = props.claim?.customer;
    if (!c) return null;
    return { id: c._id, firstName: c.firstName, lastName: c.lastName, companyName: c.companyName, isCorporate: c.isCorporate, taxNumber: c.taxNumber, taxOffice: c.taxOffice,
        phone: c.phone, email: c.email, isPhoneMasked: c.isPhoneMasked, isEmailMasked: c.isEmailMasked, createdAt: c.createdAt };
});
const customerAddresses = computed(() => splitCustomerAddresses(props.claim?.customer?.addresses));
const customerMetrics = computed(() => metricSummary(props.claim?.customer?.metrics));

const itemColumns: EkTableColumn[] = [
    { key: 'productName', label: 'Ürün' },
    { key: 'quantity', label: 'Adet', type: 'number' },
    { key: 'unitPrice', label: 'Birim fiyat', align: 'end' },
    { key: 'lineTotal', label: 'Tutar', align: 'end' },
];

const calculateTotalRefund = () => {
    return props.claim?.items?.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0) || 0;
};

const translateStatus = (s: any) => CLAIM_INTERNAL_STATUS_LABELS[s as ClaimInternalStatusEnum] || s;
</script>

<style scoped>
.ek-cd {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.ek-cd-muted {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-cd-strong {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-cd-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-cd-item__name {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.ek-cd-item__meta {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ek-cd-total {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-4);
  width: min(100%, 320px);
  margin: var(--ek-space-3) 0 0 auto;
  padding-top: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-default);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
}

.ek-cd-total dd {
  margin: 0;
  font-size: var(--ek-type-heading-size);
}

.ek-cd-reasons {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-cd-reasons li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ek-cd-reasons__reason {
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-cd-reasons__item {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ek-cd-reasons__note {
  margin-top: var(--ek-space-1);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-left: 3px solid var(--ek-color-warning-border);
  border-radius: 0 var(--ek-radius-control) var(--ek-radius-control) 0;
  background: var(--ek-color-surface-sunken);
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-default);
  quotes: '“' '”';
}

.ek-cd-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: var(--ek-space-3);
}

.ek-cd-history {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-cd-history__item {
  position: relative;
  display: flex;
  gap: var(--ek-space-3);
}

.ek-cd-history__item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 16px;
  bottom: calc(-1 * var(--ek-space-3));
  width: 2px;
  background: var(--ek-color-border-default);
}

.ek-cd-history__dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action);
}

.ek-cd-history__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ek-cd-history__title {
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}
</style>
