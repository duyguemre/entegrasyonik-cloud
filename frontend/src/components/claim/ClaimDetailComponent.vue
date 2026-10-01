<!--
  frontend/src/components/claim/ClaimDetailComponent.vue

  Aşama 6b (Standart 6) — iade talebi detayı (sipariş detayıyla aynı dil): özet başlık (kanal rengi, durum, iade tutarı,
  talep tarihi, kaynak sipariş) → süreç adımları (talep → inceleme → karar → sonuç; tarihler `history`'den) → iade
  nedeni kartı → iade edilen ürünler → lojistik / değişim / müşteri kartları → iade geçmişi. Ana eylemler başlıkta:
  Onayla (birincil) · Reddet (tehlikeli ton). Uydurma veri yok — müşteri metrikleri gelmiyorsa satır gösterilmez.
-->
<template>
  <EkRecordSheet v-model="isOpen" size="lg" kind="İade talebi" :identity="claim?.externalClaimId ?? 'Talep detayı'">
    <template #status>
      <EkStatusChip v-if="claim" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <!-- FR3-12: karar eylemleri sabit alt çubukta — Reddet solda (yıkıcı), Onayla en sağda (birincil). Yalnız izinliyse. -->
    <template v-if="claim && isClaimActionAllowed(claim, 'REJECT')" #footer-start>
      <EkActionButton action="reject" show-label size="md" label="Reddet" class="ek-cd-reject" @click="emit('reject', claim)" />
    </template>
    <template v-if="claim && isClaimActionAllowed(claim, 'APPROVE')" #actions>
      <EkButton tone="primary" icon="mdi-package-variant-closed-check" @click="emit('approve', claim)">Onayla</EkButton>
    </template>

    <template v-if="claim" #summary>
      <EkRecordSummary
        :channel="claim.integrationCode"
        :kind="claimKind"
        :title="summaryTitle"
        :facts="summaryFacts"
        :amount="formatMoney(claim.totalRefundAmount ?? calculateTotalRefund(), claim.currencyCode || undefined)"
        amount-label="İade tutarı"
        :amount-hint="itemCountText"
        label="İade talebi özeti"
      />
    </template>

    <div v-if="claim" class="ek-cd">

      <!-- FR2-ORDERS 33: sipariş detayıyla aynı "sıradaki adım" dili; karar eylemleri kartın içinde de. -->
      <EkNextStep v-if="nextStep" :tone="nextStep.tone" :icon="nextStep.icon" :eyebrow="nextStep.eyebrow" :title="nextStep.title" :text="nextStep.text">
        <template v-if="nextStep.link" #actions>
          <EkButton tone="secondary" :icon="icons.openExternal" @click="openLink(nextStep.link)">Kargoyu takip et</EkButton>
        </template>
      </EkNextStep>

      <EkDetailPanel title="Süreç" icon="mdi-timeline-check-outline">
        <EkStatusTimeline :steps="processSteps" label="İade süreci" />
      </EkDetailPanel>

      <div class="ek-cd-grid">
        <div class="ek-cd-main">
          <EkDetailPanel title="İade edilen ürünler" icon="mdi-package-variant-closed" :description="reasonSummary" flush>
            <RecordLineList :lines="claimLines" label="İade edilen ürünler" :currency="claim.currencyCode || undefined" plain />
            <dl class="ek-cd-total">
              <dt>Toplam iade</dt>
              <dd class="ek-num">{{ formatMoney(claim.totalRefundAmount ?? calculateTotalRefund(), claim.currencyCode || undefined) }}</dd>
            </dl>
          </EkDetailPanel>

          <EkDetailPanel title="Geçmiş" icon="mdi-history" description="Pazaryerinden gelen durum değişiklikleri, yeniden eskiye">
            <ol class="ek-cd-history">
              <li v-for="(log, index) in historyEntries" :key="index" class="ek-cd-history__item" :class="{ 'is-latest': index === 0 }">
                <span class="ek-cd-history__dot" aria-hidden="true" />
                <div class="ek-cd-history__body">
                  <span class="ek-cd-history__title">{{ translateStatus(log.status) }}</span>
                  <span v-if="log.description" class="ek-cd-muted">{{ log.description }}</span>
                </div>
                <time class="ek-cd-history__time ek-num" :datetime="String(log.changedAt ?? '')">{{ formatDateTime(log.changedAt) }}</time>
              </li>
            </ol>
          </EkDetailPanel>
        </div>

        <aside class="ek-cd-side" aria-label="Müşteri ve kargo">
          <!-- A13: ortak müşteri kartı. İade listesi projeksiyonu adres/metrik/kimlikleri çıkarır → bu bloklar yalnız veri varsa çizilir. -->
          <CustomerBuyerCard class="ek-cd-buyer" title="Müşteri" :person="claimCustomer" :channel="claim.integrationCode"
            :billing="customerAddresses.billing" :shipping="customerAddresses.shipping" :metrics="customerMetrics"
            empty-text="Bu talep için müşteri kaydı bulunamadı." />
          <EkInfoCard title="İade kargosu (size gelen)" icon="mdi-truck-delivery-outline" :tone="claim.fulfillment?.trackingCode ? 'info' : 'neutral'"
            :rows="claim.fulfillment?.trackingCode ? [{ label: 'Kargo firması', value: claim.fulfillment?.carrierName || 'Belirtilmedi' }, { label: 'Takip kodu', value: claim.fulfillment?.trackingCode, numeric: true }] : []"
            empty-text="Müşteri iade kargosunu henüz göndermedi.">
            <template v-if="claim.fulfillment?.trackingUrl" #actions>
              <EkButton tone="secondary" size="sm" :icon="icons.openExternal" @click="openLink(claim.fulfillment?.trackingUrl)">Takip sayfası</EkButton>
            </template>
          </EkInfoCard>
          <EkInfoCard v-if="claim.meta?.replacementInfo?.trackingCode" title="Değişim paketi (müşteriye giden)" icon="mdi-swap-horizontal" tone="info"
            :rows="[{ label: 'Kargo firması', value: claim.meta.replacementInfo.carrierName }, { label: 'Takip kodu', value: claim.meta.replacementInfo.trackingCode, numeric: true }]" />
          <EkInfoCard v-if="claim.meta?.rejectedInfo?.trackingCode" title="Reddedilen paket (geri gönderilen)" icon="mdi-package-variant-remove" tone="error"
            :rows="[{ label: 'Kargo firması', value: claim.meta.rejectedInfo.carrierName }, { label: 'Takip kodu', value: claim.meta.rejectedInfo.trackingCode, numeric: true }]" />
        </aside>
      </div>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkRecordSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { EkRecordSheet, EkDetailPanel, EkStatusChip, EkSkeleton, EkButton, EkActionButton, EkRecordSummary, type EkSummaryFact, EkStatusTimeline, type EkTimelineStep, EkInfoCard, EkNextStep, type EkTone } from '@entegrasyonik/ui/components';
import RecordLineList, { type RecordLine } from '@/components/common/RecordLineList.vue';
import { claimTypeLabel } from '@/design/status-map';
import { icons } from '@entegrasyonik/ui/icons';
import { formatMoney, formatDateTime } from '@entegrasyonik/ui/format';
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

// Backend ClaimTypeEnum: REFUND · REPLACEMENT · CANCEL (eski RETURN/EXCHANGE adları da karşılanır).
const claimKind = computed(() => {
    const t = props.claim?.type;
    return t === 'REPLACEMENT' || t === 'EXCHANGE' ? 'Değişim talebi' : t === 'CANCEL' ? 'İptal talebi' : 'İade talebi';
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
        { label: 'Talep türü', value: claimTypeLabel(c.type) },
    ];
});

const claimLines = computed<RecordLine[]>(() => (props.claim?.items ?? []).map((i: any, idx: number) => ({
    key: i.externalLineItemId || i.sku || String(idx),
    name: i.productName, quantity: i.quantity, sku: i.sku, barcode: i.barcode,
    unit: i.unitPrice, total: i.unitPrice !== undefined ? (i.unitPrice || 0) * (i.quantity || 0) : undefined,
    reason: i.reason || undefined, note: i.description || undefined,
})));
/** Bölüm alt satırı: kalem sayısı + (varsa) nedenlerin tekil listesi. */
const reasonSummary = computed(() => {
    const rs = [...new Set((props.claim?.items ?? []).map((i: any) => i?.reason).filter(Boolean))];
    return rs.length ? `${itemCountText.value} · Neden: ${rs.join(', ')}` : `${itemCountText.value} · Pazaryeri neden iletmedi`;
});

const historyEntries = computed(() => {
    const list = (props.claim?.history ?? []).slice().reverse();
    return list.length ? list : [{ status: 'WAITING', description: 'İade talebi oluşturuldu', changedAt: props.claim?.claimedAt }];
});

type ClaimNextStep = { tone: EkTone; icon: string; title: string; text: string; eyebrow?: string; decide?: boolean; link?: string };

/** FR2-ORDERS 33 — "şimdi ne olacak": yalnız durum koduna ve iletilen alanlara bağlı. */
const nextStep = computed<ClaimNextStep | null>(() => {
    const c = props.claim;
    if (!c) return null;
    const S = ClaimInternalStatusEnum;
    const url = c.fulfillment?.trackingUrl || undefined;
    switch (c.internalStatus as ClaimInternalStatusEnum) {
        case S.WAITING:
            return { tone: 'info', icon: 'mdi-truck-delivery-outline', title: 'Ürünün size ulaşması bekleniyor', text: 'Müşteri iade talebini açtı. Ürün deponuza ulaştığında inceleyip onaylayabilir ya da gerekçeyle reddedebilirsiniz.', link: url };
        case S.UNDER_REVIEW:
            return { tone: 'warning', icon: 'mdi-magnify-scan', title: 'İadeyi inceleyip karar verin', text: 'Ürün size ulaştı. Durumunu kontrol edin: uygunsa onaylayın, iade şartlarına uymuyorsa gerekçesiyle reddedin.', decide: isClaimActionAllowed(c, 'APPROVE') || isClaimActionAllowed(c, 'REJECT') };
        case S.DISPUTED:
            return { tone: 'warning', icon: 'mdi-scale-balance', title: 'İtiraz inceleniyor', text: 'Red kararınıza itiraz edildi. Pazaryeri inceleyip karar verecek; sonuç burada görünür.' };
        case S.APPROVED:
            return { tone: 'success', icon: 'mdi-check-circle-outline', eyebrow: 'Durum', title: 'İade onaylandı', text: 'Müşteriye ödeme iadesini pazaryeri yapar. Dosya kapandığında durum "Tamamlandı" olur.' };
        case S.REJECTED:
            return { tone: 'error', icon: 'mdi-close-circle-outline', eyebrow: 'Durum', title: 'İade reddedildi', text: c.meta?.rejectReason ? `Red gerekçeniz: ${c.meta.rejectReason}` : 'Red gerekçesi kaydedilmedi.' };
        case S.COMPLETED:
            return { tone: 'success', icon: 'mdi-check-all', eyebrow: 'Durum', title: 'İade dosyası kapandı', text: 'Süreç tamamlandı; başka bir işlem gerekmiyor.' };
        case S.CANCELLED:
            return { tone: 'neutral', icon: 'mdi-cancel', eyebrow: 'Durum', title: 'Talep geri çekildi', text: 'Müşteri iade talebini iptal etti.' };
        default:
            return null;
    }
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



const calculateTotalRefund = () => {
    return props.claim?.items?.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0) || 0;
};

const translateStatus = (s: any) => CLAIM_INTERNAL_STATUS_LABELS[s as ClaimInternalStatusEnum] || s;
</script>

<style scoped>
.ek-cd {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  container-type: inline-size;
}

.ek-cd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-4);
  align-items: start;
}

@container (min-width: 820px) {
  .ek-cd-grid {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
  }
}

.ek-cd-main,
.ek-cd-side {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

.ek-cd-muted {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

/* Toplam: kalem listesinin altında hafif tonlu bant (sipariş detayındaki tutar dökümüyle aynı dil). */
.ek-cd-total {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: var(--ek-space-6);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
}

.ek-cd-total dd {
  margin: 0;
  font-size: var(--ek-type-heading-size);
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

.ek-cd-history__time {
  margin-left: auto;
  flex: none;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ek-cd-history__item:not(.is-latest) .ek-cd-history__dot {
  background: var(--ek-color-border-strong);
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
