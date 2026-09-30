<!--
  FR2-SCREENS 35 (fe-r2d) — fatura detayı sipariş/iade detayıyla aynı dilde: özet başlık (kanal · tür · alıcı · tutar) →
  durum kartı (hatalıysa pazaryeri/entegratör mesajı olduğu gibi) → Fatura bilgileri · Alıcı kartları. Alanlar yalnız
  backend IInvoice'dan; olmayan alan satırı çizilmez. KVKK: TCKN/VKN varsayılan maskeli (son 3 hane).
-->
<template>
  <EkDetailSheet :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :identity="invoice ? (invoice.invoiceNumber || 'Numarasız fatura') : 'Fatura detayı'">
    <template #status>
      <EkStatusChip v-if="invoice" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <template #actions>
      <EkButton v-if="fileUrl" tone="primary" icon="mdi-file-pdf-box" @click="openLink(fileUrl)">Faturayı aç</EkButton>
    </template>

    <div v-if="invoice" class="ek-id">
      <EkRecordSummary
        :channel="invoice.integrationCode"
        :kind="typeLabel"
        :title="customerName"
        :facts="facts"
        :amount="formatMoney(invoice.totalAmount, currencyCode)"
        amount-label="Fatura tutarı"
        :amount-hint="docLabel"
        label="Fatura özeti"
      />

      <EkNextStep :tone="step.tone" :icon="step.icon" eyebrow="Durum" :title="step.title" :text="step.text" />

      <div class="ek-id-cards">
        <EkInfoCard title="Fatura bilgileri" icon="mdi-receipt-text-outline" :rows="infoRows" />
        <EkInfoCard title="Alıcı" icon="mdi-account-outline" :rows="buyerRows" empty-text="Faturada alıcı bilgisi yok.">
          <template v-if="rawTax" #aside>
            <CustomerRevealToggle v-model="revealTax" compact />
          </template>
        </EkInfoCard>
      </div>

      <p v-if="!fileUrl" class="ek-id-note">
        <v-icon icon="mdi-file-hidden" size="16" aria-hidden="true" /> Bu fatura için henüz PDF bağlantısı yok. Fatura kesildiğinde burada açılır.
      </p>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { EkDetailSheet, EkStatusChip, EkSkeleton, EkButton, EkRecordSummary, type EkSummaryFact, EkInfoCard, EkNextStep, type EkTone } from '@entegrasyonik/ui/components';
import { formatMoney, formatDateTime } from '@entegrasyonik/ui/format';
import { INVOICE_STATUS_TONE } from '@/design/status-map';
import { maskTaxNumber } from '@/components/customer/customerCard';
import CustomerRevealToggle from '@/components/customer/card/CustomerRevealToggle.vue';
import { InvoiceStatusEnum, InvoiceTypeEnum, INVOICE_TYPE_LABELS, InvoiceMethodEnum } from '@/types/InvoiceTypes';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  invoice: { type: Object, default: () => null },
});

defineEmits(['update:modelValue']);

const revealTax = ref(false);
watch(() => props.invoice?._id, () => { revealTax.value = false; });

const statusEntry = computed(() => INVOICE_STATUS_TONE[props.invoice?.status as InvoiceStatusEnum] ?? { tone: 'neutral' as const, labelKey: 'status.invoice.draft' });

const METHOD: Record<string, string> = {
  [InvoiceMethodEnum.MARKETPLACE]: 'Pazaryeri kesti',
  [InvoiceMethodEnum.INTEGRATOR]: 'E-fatura entegratörü',
  [InvoiceMethodEnum.MANUAL]: 'Elle yüklendi',
};

const currencyCode = computed(() => {
  const c = props.invoice?.currency;
  return c && /^[A-Z]{3}$/.test(c) ? c : undefined;
});
const typeLabel = computed(() => INVOICE_TYPE_LABELS[props.invoice?.type as InvoiceTypeEnum] ?? 'Fatura');
const docLabel = computed(() => (props.invoice?.documentType === 'E_FATURA' ? 'e-Fatura' : props.invoice?.documentType === 'E_ARSIV' ? 'e-Arşiv' : ''));
const customerName = computed(() => {
  const c = props.invoice?.customer;
  return [c?.firstName, c?.lastName].filter(Boolean).join(' ') || c?.companyName || 'Alıcı bilgisi yok';
});
const fileUrl = computed<string | undefined>(() => props.invoice?.pdfUrl || props.invoice?.invoiceLink || undefined);

const facts = computed<EkSummaryFact[]>(() => {
  const i = props.invoice;
  if (!i) return [];
  return [
    { label: 'Fatura no', value: i.invoiceNumber, numeric: true },
    { label: 'Sipariş no', value: i.externalOrderId || i.order?.orderNumber, numeric: true },
    { label: 'Düzenleme tarihi', value: formatDateTime(i.issueDate || i.createdAt), numeric: true },
  ];
});

/** Durum kartı: hatalı faturada kaynaktan gelen mesaj değiştirilmeden gösterilir (metin uydurulmaz). */
const step = computed<{ tone: EkTone; icon: string; title: string; text: string }>(() => {
  const i = props.invoice ?? {};
  const msg = i.statusMessage as string | undefined;
  switch (i.status as InvoiceStatusEnum) {
    case InvoiceStatusEnum.APPROVED:
      return { tone: 'success', icon: 'mdi-check-decagram-outline', title: 'Fatura kesildi', text: msg || 'Fatura resmileşti ve müşteriye iletildi.' };
    case InvoiceStatusEnum.PROCESSING:
    case InvoiceStatusEnum.QUEUED:
      return { tone: 'info', icon: 'mdi-timer-sand', title: 'Fatura hazırlanıyor', text: msg || 'Entegratör faturayı işliyor; tamamlandığında durum kendiliğinden güncellenir.' };
    case InvoiceStatusEnum.FAILED:
      return { tone: 'error', icon: 'mdi-alert-circle-outline', title: 'Fatura kesilemedi', text: msg || 'Entegratör hata döndürdü. Fatura bilgilerini kontrol edip yeniden deneyin.' };
    case InvoiceStatusEnum.CANCELLED:
      return { tone: 'neutral', icon: 'mdi-cancel', title: 'Fatura iptal edildi', text: msg || 'Bu fatura geçersiz; gerekiyorsa yeni fatura düzenleyin.' };
    default:
      return { tone: 'neutral', icon: 'mdi-file-document-outline', title: 'Taslak', text: msg || 'Fatura henüz gönderilmedi.' };
  }
});

const infoRows = computed(() => {
  const i = props.invoice ?? {};
  return [
    { label: 'Belge türü', value: docLabel.value || '—' },
    { label: 'Fatura türü', value: typeLabel.value },
    { label: 'Kesen', value: METHOD[i.invoiceMethod] ?? i.invoiceMethod ?? '—' },
    ...(i.ettn ? [{ label: 'ETTN', value: i.ettn, numeric: true }] : []),
    ...(i.errorCode ? [{ label: 'Hata kodu', value: i.errorCode, numeric: true }] : []),
  ];
});

const rawTax = computed<string | undefined>(() => props.invoice?.customer?.identities?.[0]?.tcknOrVkn || undefined);
const buyerRows = computed(() => {
  const c = props.invoice?.customer;
  if (!c) return [];
  const tax = rawTax.value;
  return [
    { label: 'Ad / unvan', value: customerName.value },
    ...(tax ? [{ label: tax.length === 11 ? 'TCKN' : 'VKN', value: revealTax.value ? tax : maskTaxNumber(tax), numeric: true }] : []),
  ];
});

const openLink = (url?: string) => { if (url) window.open(url, '_blank', 'noopener'); };
</script>

<style scoped>
.ek-id {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.ek-id-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: var(--ek-space-4);
  align-items: start;
}

.ek-id-note {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}
</style>
