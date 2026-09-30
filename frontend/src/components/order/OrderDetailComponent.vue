<!--
  frontend/src/components/order/OrderDetailComponent.vue

  Aşama 6b (Standart 6) — sipariş detayı: özet başlık (kanal rengi, durum, tutar, tarih) → uyarılar (EkAlert) →
  durum zaman çizgisi (tarihler veriden) → kalemler + tutar dökümü → Alıcı · Teslimat · Kargo · Fatura kartları →
  stok tahsisi. Ana eylemler başlıkta: sıradaki iş BİRİNCİL, diğerleri ikincil, iptal tehlikeli tonda (onay ekranda).
  Uydurma veri yok: alan yoksa "—" ya da açıklayıcı boş metin. Sekme içi yan sayfa (EkDetailSheet, Standart 7).
-->
<template>
  <EkDetailSheet v-model="isOpen" :identity="order?.orderNumber ?? 'Sipariş detayı'">
    <template #status>
      <EkStatusChip v-if="order" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <template #actions>
      <template v-if="order">
        <EkActionButton v-if="isOrderActionAllowed(order, 'CANCEL')" action="cancel" show-label size="md" label="İptal et" :disabled="isLocked" @click="emit('cancel', order)" />
        <EkButton
          v-for="a in forwardActions"
          :key="a.key"
          :tone="a.key === primaryKey ? 'primary' : 'secondary'"
          :icon="a.icon"
          :disabled="isLocked"
          @click="emitAction(a.key)"
        >{{ a.label }}</EkButton>
      </template>
    </template>

    <div v-if="order" class="ek-od">
      <EkRecordSummary
        :channel="order.integrationCode"
        kind="Sipariş"
        :title="customerName"
        :facts="summaryFacts"
        :amount="formatMoney(order.financials?.grandTotal)"
        amount-label="Ödenecek toplam"
        :amount-hint="itemCountText"
        label="Sipariş özeti"
      >
        <template #status>
          <EkStatusChip v-for="b in metaBadges" :key="b.label" :tone="b.tone" :label="b.label" />
        </template>
      </EkRecordSummary>

      <EkAlert v-if="order.platformDiscrepancy?.hasDiscrepancy" tone="error" title="Finansal uyumsuzluk tespit edildi" :text="order.platformDiscrepancy?.message">
        <template #actions>
          <EkButton tone="secondary" size="sm" @click="emit('resolveDiscrepancy', order)">Farkı eşitle ve faturayı yenile</EkButton>
        </template>
      </EkAlert>
      <EkAlert v-if="isLocked" tone="warning" icon="mdi-clock-check-outline" title="İşlem devam ediyor" :text="`${lockMessage} Pazar yerinin işlemi tamamlaması için yaklaşık 2 dakika kilit uygulanır.`" />
      <EkAlert v-if="order.internalStatus === OrderInternalStatusEnum.RETURNED" tone="error" title="İade talebi / süreci" text="Bu sipariş için pazaryeri üzerinde bir iade süreci başlatılmıştır. Ayrıntılar İade Yönetimi ekranında." />
      <EkAlert
        v-if="(order.internalStatus === OrderInternalStatusEnum.CANCELLED || order.internalStatus === OrderInternalStatusEnum.RETURNED) && order.flags?.isInvoiceGenerated"
        tone="warning" icon="mdi-file-cancel-outline" title="Faturalandırılmış iptal/iade"
        text="Bu siparişin faturası sistem tarafından kesilmiştir. Faturayı iptal etmeyi veya iade faturası düzenlemeyi unutmayın."
      />

      <EkSection title="Süreç durumu">
        <EkStatusTimeline :steps="timelineSteps" label="Sipariş süreci" />
        <EkAlert v-if="statusInformation" class="mt-4" :tone="alertTone" :icon="statusInformation.icon" :title="statusInformation.title" :text="statusInformation.desc" dense />
        <EkDescriptionList
          v-if="order.internalStatus === OrderInternalStatusEnum.CANCELLED"
          class="mt-3"
          :items="[
            { label: 'İptal kaynağı', value: order.cancelSource === 'SELLER' ? 'Satıcı kaynaklı' : 'Müşteri / platform' },
            { label: 'İptal gerekçesi', value: order.cancelReason || 'Pazar yeri tarafından bir gerekçe iletilmedi.' },
            { label: 'İptal tarihi', value: formatDateTime(order.dates?.cancelledDate) },
          ]"
        />
      </EkSection>

      <EkSection title="Ürünler" :description="itemCountText">
        <EkDataTable :items="order.items || []" :columns="itemColumns" row-key="sku">
          <template #cell-productName="{ item }">
            <div class="ek-od-item">
              <span class="ek-od-item__name" :class="{ 'ek-strike': item.itemStatus && item.itemStatus !== 'ACTIVE' }">{{ item.productName }}</span>
              <span class="ek-od-item__meta ek-num">{{ item.sku ? `SKU ${item.sku}` : '' }}<template v-if="item.barcode"> · {{ item.barcode }}</template></span>
              <EkStatusChip v-if="item.itemStatus && item.itemStatus !== 'ACTIVE'" tone="danger" :label="item.itemStatus === 'CANCELLED' ? 'İptal' : 'İade'" />
            </div>
          </template>
          <template #cell-unitPrice="{ item }"><span class="ek-num">{{ item.unitPrice !== undefined ? formatMoney(item.unitPrice) : '—' }}</span></template>
          <template #cell-totalPrice="{ item }"><span class="ek-num ek-od-strong">{{ formatMoney(item.totalPrice) }}</span></template>
        </EkDataTable>
        <dl class="ek-od-totals">
          <div><dt>Ara toplam</dt><dd class="ek-num">{{ formatMoney(order.financials?.subTotal) }}</dd></div>
          <div v-if="order.financials?.totalDiscount > 0"><dt>İndirim</dt><dd class="ek-num">-{{ formatMoney(order.financials?.totalDiscount) }}</dd></div>
          <div><dt>KDV</dt><dd class="ek-num">{{ formatMoney(order.financials?.totalTax) }}</dd></div>
          <div><dt>Kargo ücreti</dt><dd class="ek-num">{{ formatMoney(order.financials?.shippingFee) }}</dd></div>
          <div class="ek-od-totals__grand"><dt>Ödenecek toplam</dt><dd class="ek-num">{{ formatMoney(order.financials?.grandTotal) }}</dd></div>
        </dl>
      </EkSection>

      <div class="ek-od-cards">
        <EkInfoCard title="Alıcı" icon="mdi-account-outline" :rows="[
          { label: 'Ad soyad', value: customerName },
          { label: 'Telefon', value: order.billingAddress?.phone ? formatPhone(order.billingAddress.phone) : '' },
          { label: 'E-posta', value: order.billingAddress?.email },
          { label: 'Fatura tipi', value: order.billingAddress?.isCorporate ? 'Kurumsal' : 'Bireysel' },
          ...(order.billingAddress?.isCorporate ? [{ label: 'Firma', value: order.billingAddress?.companyName }, { label: 'Vergi no', value: order.billingAddress?.taxNumber }] : []),
        ]" />
        <EkInfoCard title="Teslimat adresi" icon="mdi-map-marker-outline" :rows="[
          { label: 'Alıcı', value: [order.shippingAddress?.firstName, order.shippingAddress?.lastName].filter(Boolean).join(' ') },
          { label: 'Adres', value: order.shippingAddress?.addressLine1 },
          { label: 'İlçe / il', value: [order.shippingAddress?.state, order.shippingAddress?.city].filter(Boolean).join(' / ') },
          { label: 'Tahmini teslim', value: order.dates?.estimatedDeliveryDate ? formatDateTime(order.dates.estimatedDeliveryDate) : '' },
        ]" />
        <EkInfoCard title="Kargo" icon="mdi-truck-outline" :tone="order.fulfillment?.length ? 'info' : 'neutral'"
          :rows="shipmentRows" empty-text="Bu sipariş için henüz kargo kaydı oluşturulmadı.">
          <template v-if="firstShipment?.trackingCode" #actions>
            <EkButton tone="secondary" size="sm" icon="mdi-barcode-scan" @click="emit('print', order)">Barkod yazdır</EkButton>
            <EkButton tone="ghost" size="sm" :icon="icons.openExternal" :disabled="!firstShipment?.trackingUrl" @click="openLink(firstShipment?.trackingUrl)">Takip sayfası</EkButton>
          </template>
        </EkInfoCard>
        <EkInfoCard title="Fatura" icon="mdi-receipt-text-outline" :tone="order.invoice?.invoiceNumber ? 'success' : 'neutral'"
          :rows="invoiceRows" empty-text="Fatura henüz oluşturulmadı.">
          <template v-if="order.invoice?.invoiceNumber" #actions>
            <EkButton tone="secondary" size="sm" icon="mdi-file-pdf-box" :disabled="!order.invoice?.invoiceLink" @click="openLink(order.invoice?.invoiceLink)">PDF görüntüle</EkButton>
          </template>
        </EkInfoCard>
      </div>

      <!-- C1.1: kalem stok tahsisi — yalnızca en az bir kalemde tahsis durumu varsa. -->
      <OrderAllocationTimeline v-if="hasAllocation" :items="order.items" />
    </div>

    <EkSkeleton v-else type="detail" />
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkDescriptionList from '@/components/ds/EkDescriptionList.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import EkAlert, { type EkAlertTone } from '@/components/ds/EkAlert.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkActionButton from '@/components/ds/EkActionButton.vue';
import EkRecordSummary, { type EkSummaryFact } from '@/components/ds/EkRecordSummary.vue';
import EkStatusTimeline, { type EkTimelineStep } from '@/components/ds/EkStatusTimeline.vue';
import EkInfoCard from '@/components/ds/EkInfoCard.vue';
import { icons } from '@/design/icons';
import { formatMoney, formatDateTime, formatPhone } from '@/composables/format';
import { ORDER_STATUS_TONE, type StatusTone } from '@/design/status-map';
import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { useLifecycle } from '@/composables/useLifecycle';
import OrderAllocationTimeline from '@/components/order/OrderAllocationTimeline.vue';
import { isAllocationState } from '@/composables/useStockHealthApi';

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    order: { type: Object, default: () => null }
});

const emit = defineEmits(['statusAction', 'cancel', 'print', 'resolveDiscrepancy', 'update:modelValue']);

const { isOrderActionAllowed } = useLifecycle();

const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
});

const statusEntry = computed(() => ORDER_STATUS_TONE[props.order?.internalStatus as OrderInternalStatusEnum] ?? { tone: 'neutral' as StatusTone, labelKey: 'status.order.unapproved' });
const alertTone = computed<EkAlertTone>(() => {
    const tone = statusEntry.value.tone;
    return tone === 'danger' ? 'error' : tone === 'neutral' ? 'info' : (tone as EkAlertTone);
});


const metaBadges = computed(() => {
    if (!props.order) return [];
    const badges: { label: string; tone: StatusTone }[] = [];
    if (props.order.meta?.commercial) badges.push({ label: 'Kurumsal (B2B)', tone: 'info' });
    if (props.order.meta?.micro) badges.push({ label: 'Mikro ihracat', tone: 'neutral' });
    if (props.order.meta?.etgbNo) badges.push({ label: `ETGB: ${props.order.meta.etgbNo}`, tone: 'neutral' });
    return badges;
});

const customerName = computed(() => {
    const b = props.order?.billingAddress;
    const name = [b?.firstName, b?.lastName].filter(Boolean).join(' ');
    return name || props.order?.customerFirstName || 'Müşteri bilgisi yok';
});

const itemCountText = computed(() => {
    const items = props.order?.items ?? [];
    const qty = items.reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0);
    return `${items.length} kalem · ${qty} adet`;
});

// Özet: kimlik + tarih + kanal durumu (spec çapası: "Sipariş No" etiketi görünür).
const summaryFacts = computed<EkSummaryFact[]>(() => {
    const o = props.order;
    if (!o) return [];
    const facts: EkSummaryFact[] = [
        { label: 'Sipariş No', value: o.orderNumber, numeric: true },
        { label: 'Sipariş tarihi', value: formatDateTime(o.dates?.orderDate), numeric: true },
    ];
    if (o.internalStatus === OrderInternalStatusEnum.DELIVERED) facts.push({ label: 'Teslim tarihi', value: formatDateTime(o.dates?.deliveredDate), numeric: true });
    else if (o.dates?.estimatedDeliveryDate && o.internalStatus !== OrderInternalStatusEnum.CANCELLED) facts.push({ label: 'Tahmini teslim', value: formatDateTime(o.dates.estimatedDeliveryDate), numeric: true });
    return facts;
});

/** Durum zaman çizgisi: yaşam döngüsü adımları + VERİDEKİ tarihler (tarih yoksa gösterilmez). */
const timelineSteps = computed<EkTimelineStep[]>(() => {
    const o = props.order;
    if (!o) return [];
    const d = o.dates ?? {};
    const s = o.internalStatus;
    const fmt = (v: any) => (v ? formatDateTime(v) : undefined);
    const base = [
        { key: 'created', label: 'Sipariş alındı', date: fmt(d.orderDate) },
        { key: 'approved', label: 'Onaylandı', date: fmt(d.approvedDate) },
        { key: 'invoiced', label: 'Faturalandı', date: fmt(o.invoice?.invoicedAt || d.invoiceDate) },
        { key: 'shipped', label: 'Kargoya verildi', date: fmt(d.shippedDate) },
        { key: 'delivered', label: 'Teslim edildi', date: fmt(d.deliveredDate) },
    ];
    // Adım konumu: 0 alındı · 1 onay · 2 fatura/hazırlık · 3 kargo · 4 teslim.
    const pos = s === OrderInternalStatusEnum.UNAPPROVED ? 0 : s === OrderInternalStatusEnum.AWAITING_APPROVAL ? 1
        : s === OrderInternalStatusEnum.APPROVED ? (o.flags?.isInvoiceGenerated || o.invoice?.invoiceNumber ? 3 : 2)
        : s === OrderInternalStatusEnum.SHIPPED ? 4 : s === OrderInternalStatusEnum.DELIVERED ? 5 : -1;
    if (s === OrderInternalStatusEnum.CANCELLED || s === OrderInternalStatusEnum.RETURNED) {
        const done = base.filter((b) => b.date).map((b) => ({ ...b, state: 'done' as const }));
        const last = s === OrderInternalStatusEnum.CANCELLED
            ? { key: 'cancelled', label: 'İptal edildi', date: fmt(d.cancelledDate), state: 'failed' as const, description: o.cancelReason || undefined }
            : { key: 'returned', label: 'İade edildi', date: fmt(d.externalUpdatedAt), state: 'failed' as const };
        return [...(done.length ? done : [{ ...base[0], state: 'done' as const }]), last];
    }
    return base.map((b, i) => ({ ...b, state: i < pos ? 'done' : i === pos ? 'current' : 'upcoming' }));
});

const firstShipment = computed(() => props.order?.fulfillment?.[0]);
const shipmentRows = computed(() => {
    const f = firstShipment.value;
    if (!f) return [];
    return [
        { label: 'Kargo firması', value: f.carrierName },
        { label: 'Takip kodu', value: f.trackingCode || 'Takip bilgisi yok', numeric: true },
        ...(f.desi ? [{ label: 'Desi', value: String(f.desi), numeric: true }] : []),
        ...((props.order?.fulfillment?.length ?? 0) > 1 ? [{ label: 'Paket', value: `${props.order.fulfillment.length} paket` }] : []),
    ];
});
const invoiceRows = computed(() => {
    const inv = props.order?.invoice;
    if (!inv?.invoiceNumber) return [];
    return [
        { label: 'Fatura no', value: inv.invoiceNumber, numeric: true },
        { label: 'Tür', value: inv.invoiceMethod === 'E_ARCHIVE' ? 'E-arşiv' : inv.invoiceMethod === 'E_INVOICE' ? 'E-fatura' : inv.invoiceMethod },
        { label: 'Tarih', value: inv.invoicedAt ? formatDateTime(inv.invoicedAt) : '', numeric: true },
    ];
});

/** İleri eylemler: sıradaki iş birincil (onay → fatura → kargo). */
const FORWARD = [
    { key: 'APPROVE', label: 'Onayla', icon: 'mdi-check-circle-outline' },
    { key: 'INVOICE', label: 'Fatura oluştur', icon: 'mdi-receipt-text-plus-outline' },
    { key: 'SHIP', label: 'Kargoya ver', icon: 'mdi-truck-outline' },
] as const;
const forwardActions = computed(() => (props.order ? FORWARD.filter((a) => isOrderActionAllowed(props.order, a.key as any)) : []));
const primaryKey = computed(() => forwardActions.value[0]?.key);

const itemColumns: EkTableColumn[] = [
    { key: 'productName', label: 'Ürün' },
    { key: 'quantity', label: 'Adet', type: 'number' },
    { key: 'unitPrice', label: 'Birim fiyat', align: 'end' },
    { key: 'totalPrice', label: 'Tutar', align: 'end' },
];

const hasAllocation = computed(() => (props.order?.items ?? []).some((item: any) => isAllocationState(item?.allocationState)));



const openLink = (url: string) => { if (url) window.open(url, '_blank'); };

const isLocked = computed(() => {
    if (!props.order?.platformOperation?.lockedUntil) return false;
    const lockedUntil = new Date(props.order.platformOperation.lockedUntil);
    return lockedUntil > new Date();
});

const lockMessage = computed(() => props.order?.platformOperation?.message || 'İşlem yapılıyor, lütfen bekleyiniz...');

const emitAction = (action: string) => {
    if (!props.order) return;
    emit('statusAction', { orderId: props.order._id, action });
};

const statusInformation = computed(() => {
    if (!props.order) return null;
    const s = props.order.internalStatus;

    switch (s) {
        case OrderInternalStatusEnum.UNAPPROVED:
            return { title: 'Platform onayı bekleniyor', desc: 'Müşteri siparişi oluşturdu. Faturalandırma ve kargo aşamalarına geçilebilmesi için platformun siparişi onaylaması beklenmektedir.', icon: 'mdi-timer-outline' };
        case OrderInternalStatusEnum.AWAITING_APPROVAL:
            return { title: 'Satıcı onayı bekleniyor', desc: 'Sipariş platform tarafından onaylandı ancak manuel onayınız gerekiyor. Onayladıktan sonra fatura ve kargo işlemlerine başlayabilirsiniz.', icon: 'mdi-shield-check-outline' };
        case OrderInternalStatusEnum.APPROVED: {
            const isAutomated = props.order.fulfillment?.some((f: any) => f.shipmentMethod === 'MARKETPLACE' && f.trackingCode);
            if (isAutomated) {
                return { title: 'Otomatik sevkiyat bekleniyor', desc: 'Bu sipariş pazaryeri lojistiği ile yönetiliyor; kargo firması barkodu okuttuğunda statü otomatik güncellenecektir.', icon: 'mdi-auto-fix' };
            }
            return {
                title: props.order?.flags?.isInvoiceGenerated ? 'Fatura kesildi / hazırlanıyor' : 'Sipariş hazırlanıyor',
                desc: props.order?.flags?.isInvoiceGenerated ? 'Fatura oluşturuldu; kargo barkodu alarak paketi teslime hazır hale getirebilirsiniz.' : 'Sipariş onaylandı; e-fatura oluşturabilir veya doğrudan kargo barkodu alabilirsiniz.',
                icon: props.order?.flags?.isInvoiceGenerated ? 'mdi-receipt-text-check-outline' : 'mdi-package-variant-closed',
            };
        }
        case OrderInternalStatusEnum.SHIPPED:
            return { title: 'Teslimat yolunda', desc: 'Sipariş kargoya verildi. Bu aşamada yalnızca teslimat takibi yapılabilir.', icon: 'mdi-truck-fast-outline' };
        case OrderInternalStatusEnum.DELIVERED:
            return { title: 'Sipariş tamamlandı', desc: 'Sipariş müşteriye ulaştı. Tüm operasyonel süreçler tamamlandı.', icon: 'mdi-check-circle-outline' };
        case OrderInternalStatusEnum.CANCELLED:
            return { title: 'Sipariş iptal edildi', desc: 'Bu sipariş iptal edildi, üzerinde işlem yapılamaz.', icon: 'mdi-close-circle-outline' };
        case OrderInternalStatusEnum.RETURNED:
            return { title: 'Sipariş iade edildi', desc: 'Müşteri bu siparişi iade etti. Detayları İadeler bölümünden takip edebilirsiniz.', icon: 'mdi-keyboard-return' };
        default:
            return { title: 'Durum bilgisi alınıyor', desc: 'Sipariş durum verisi işleniyor…', icon: 'mdi-information-outline' };
    }
});
</script>

<style scoped>
.ek-od {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.ek-od-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.ek-od-item__name {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.ek-od-item__meta {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ek-od-strong {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-strike {
  text-decoration: line-through;
  color: var(--ek-color-error);
}

.ek-od-totals {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  width: min(100%, 320px);
  margin: var(--ek-space-3) 0 0 auto;
}

.ek-od-totals > div {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-4);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-od-totals dt {
  color: var(--ek-color-content-muted);
}

.ek-od-totals dd {
  margin: 0;
  color: var(--ek-color-content-strong);
}

.ek-od-totals__grand {
  margin-top: var(--ek-space-1);
  padding-top: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-od-totals__grand dt,
.ek-od-totals__grand dd {
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
}

.ek-od-totals__grand dd {
  font-size: var(--ek-type-heading-size);
}

.ek-od-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: var(--ek-space-3);
}
</style>
