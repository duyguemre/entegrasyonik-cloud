<!--
  frontend/src/components/order/OrderDetailComponent.vue

  Aşama 6b (Standart 6) — sipariş detayı: özet başlık (kanal rengi, durum, tutar, tarih) → uyarılar (EkAlert) →
  durum zaman çizgisi (tarihler veriden) → kalemler + tutar dökümü → Alıcı · Teslimat · Kargo · Fatura kartları →
  stok tahsisi. Ana eylemler başlıkta: sıradaki iş BİRİNCİL, diğerleri ikincil, iptal tehlikeli tonda (onay ekranda).
  Uydurma veri yok: alan yoksa "—" ya da açıklayıcı boş metin. Sekme içi yan sayfa — FR3-12 ortak kayıt detayı deseni (EkRecordSheet + EkDetailPanel: özet üstte, başlıklı
  bölüm kartları tuvalde, iş akışı eylemleri sabit alt çubukta).
-->
<template>
  <EkRecordSheet v-model="isOpen" size="lg" kind="Sipariş" :identity="order?.orderNumber ?? 'Sipariş detayı'">
    <template #status>
      <EkStatusChip v-if="order" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <!-- FR3-12: iş akışı eylemleri sabit alt çubukta — yıkıcı (iptal) solda, sıradaki iş (birincil) en sağda. -->
    <template v-if="order && isOrderActionAllowed(order, 'CANCEL')" #footer-start>
      <EkActionButton action="cancel" show-label size="md" label="İptal et" :disabled="isLocked" @click="emit('cancel', order)" />
    </template>
    <template v-if="order && (forwardActions.length || nextStepOwnAction)" #actions>
      <EkButton v-if="nextStepOwnAction && nextStep?.action" :tone="forwardActions.length ? 'secondary' : 'primary'" :icon="nextStep.action.icon"
        :disabled="isLocked" @click="runNextStep(nextStep.action.key)">{{ nextStep.action.label }}</EkButton>
      <EkButton
        v-for="a in orderedForwardActions"
        :key="a.key"
        :tone="a.key === primaryKey ? 'primary' : 'secondary'"
        :icon="a.icon"
        :disabled="isLocked"
        @click="emitAction(a.key)"
      >{{ a.label }}</EkButton>
    </template>

    <template v-if="order" #summary>
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
    </template>

    <div v-if="order" class="ek-od">

      <EkAlert v-if="order.platformDiscrepancy?.hasDiscrepancy" tone="error" title="Pazaryeri tutarı faturadan farklı" :text="order.platformDiscrepancy?.message">
        <template #actions>
          <EkButton tone="secondary" size="sm" @click="emit('resolveDiscrepancy', order)">Farkı eşitle ve faturayı yenile</EkButton>
        </template>
      </EkAlert>
      <EkAlert v-if="isLocked" tone="warning" icon="mdi-clock-check-outline" title="İşlem devam ediyor" :text="`${lockMessage} Pazar yerinin işlemi tamamlaması için yaklaşık 2 dakika kilit uygulanır.`" />
      <EkAlert
        v-if="(order.internalStatus === OrderInternalStatusEnum.CANCELLED || order.internalStatus === OrderInternalStatusEnum.RETURNED) && order.flags?.isInvoiceGenerated"
        tone="warning" icon="mdi-file-cancel-outline" title="Bu siparişin faturası kesilmiş"
        text="Faturayı iptal etmeyi veya iade faturası düzenlemeyi unutmayın."
      />

      <!-- FR2-ORDERS 30: "şimdi ne olacak / ne yapmalıyım" tek kartta; birincil eylem kartın içinde de var. -->
      <EkNextStep v-if="nextStep" :tone="nextStep.tone" :icon="nextStep.icon" :eyebrow="nextStep.eyebrow" :title="nextStep.title" :text="nextStep.text">
        <dl v-if="order.internalStatus === OrderInternalStatusEnum.CANCELLED" class="ek-od-cancel">
          <div><dt>İptal eden</dt><dd>{{ cancelSourceText }}</dd></div>
          <div><dt>Gerekçe</dt><dd>{{ order.cancelReason || 'Pazaryeri gerekçe iletmedi' }}</dd></div>
          <div v-if="order.dates?.cancelledDate"><dt>Tarih</dt><dd class="ek-num">{{ formatDateTime(order.dates.cancelledDate) }}</dd></div>
        </dl>
        <!-- FR3-12: eylemler tek yerde (alt çubuk); kart "ne / neden" anlatır, yalnız dış bağlantı (kargo takibi) taşır. -->
        <template v-if="nextStep.link" #actions>
          <EkButton v-if="nextStep.link" tone="secondary" :icon="icons.openExternal" @click="openLink(nextStep.link.url)">{{ nextStep.link.label }}</EkButton>
        </template>
      </EkNextStep>

      <EkDetailPanel title="Süreç" icon="mdi-timeline-check-outline" :description="processText">
        <EkStatusTimeline :steps="timelineSteps" label="Sipariş süreci" />
      </EkDetailPanel>

      <div class="ek-od-grid">
        <div class="ek-od-main">
          <EkDetailPanel title="Ürünler" icon="mdi-package-variant-closed" :description="itemCountText" flush>
            <RecordLineList :lines="orderLines" label="Sipariş kalemleri" plain />
            <dl class="ek-od-totals">
              <div><dt>Ara toplam</dt><dd class="ek-num">{{ formatMoney(order.financials?.subTotal) }}</dd></div>
              <div v-if="order.financials?.totalDiscount > 0"><dt>İndirim</dt><dd class="ek-num ek-od-totals__discount">−{{ formatMoney(order.financials?.totalDiscount) }}</dd></div>
              <div><dt>KDV</dt><dd class="ek-num">{{ formatMoney(order.financials?.totalTax) }}</dd></div>
              <div><dt>Kargo ücreti</dt><dd class="ek-num">{{ order.financials?.shippingFee ? formatMoney(order.financials.shippingFee) : 'Ücretsiz' }}</dd></div>
              <div class="ek-od-totals__grand"><dt>Ödenecek toplam</dt><dd class="ek-num">{{ formatMoney(order.financials?.grandTotal) }}</dd></div>
            </dl>
          </EkDetailPanel>

          <!-- C1.1: kalem stok tahsisi — yalnızca en az bir kalemde tahsis durumu varsa. -->
          <EkDetailPanel v-if="hasAllocation" title="Stok tahsisi" icon="mdi-warehouse" description="Kalemlerin stoktan ayrılma durumu">
            <OrderAllocationTimeline :items="order.items" embedded />
          </EkDetailPanel>
        </div>

        <aside class="ek-od-side" aria-label="Alıcı, kargo ve fatura">
          <!-- A13: Alıcı = ortak müşteri kartı (kimlik · maskeli iletişim + kopya · fatura/teslimat adresi ayrımı). -->
          <CustomerBuyerCard class="ek-od-buyer" title="Alıcı" :person="buyer" :channel="order.integrationCode"
            :billing="billingAddress" :shipping="shippingAddress" />
          <EkInfoCard title="Kargo" icon="mdi-truck-outline" :tone="order.fulfillment?.length ? 'info' : 'neutral'"
            :rows="shipmentRows" empty-text="Henüz kargo kaydı yok. Kargoya verdiğinizde takip bilgisi burada görünür.">
            <template v-if="firstShipment?.trackingCode" #actions>
              <EkButton tone="secondary" size="sm" icon="mdi-barcode-scan" @click="emit('print', order)">Barkod yazdır</EkButton>
              <EkButton tone="ghost" size="sm" :icon="icons.openExternal" :disabled="!firstShipment?.trackingUrl" @click="openLink(firstShipment?.trackingUrl)">Takip</EkButton>
            </template>
          </EkInfoCard>
          <EkInfoCard title="Fatura" icon="mdi-receipt-text-outline" :tone="invoiceTone"
            :rows="invoiceRows" empty-text="Fatura henüz oluşturulmadı.">
            <template v-if="order.invoice?.invoiceNumber" #actions>
              <EkButton tone="secondary" size="sm" icon="mdi-file-pdf-box" :disabled="!order.invoice?.invoiceLink" @click="openLink(order.invoice?.invoiceLink)">PDF görüntüle</EkButton>
            </template>
          </EkInfoCard>
        </aside>
      </div>
    </div>

    <EkSkeleton v-else type="detail" />
  </EkRecordSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { EkRecordSheet, EkDetailPanel, EkStatusChip, EkSkeleton, EkAlert, EkButton, EkActionButton, EkRecordSummary, type EkSummaryFact, EkStatusTimeline, type EkTimelineStep, EkInfoCard, EkNextStep, type EkTone } from '@entegrasyonik/ui/components';
import CustomerBuyerCard, { type BuyerPerson } from '@/components/customer/card/CustomerBuyerCard.vue';
import { addressView } from '@/components/customer/customerCard';
import { icons } from '@entegrasyonik/ui/icons';
import { formatMoney, formatDateTime } from '@entegrasyonik/ui/format';
import { ORDER_STATUS_TONE, type StatusTone } from '@/design/status-map';
import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { useLifecycle } from '@/composables/useLifecycle';
import OrderAllocationTimeline from '@/components/order/OrderAllocationTimeline.vue';
import RecordLineList, { type RecordLine } from '@/components/common/RecordLineList.vue';
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

// A13 — alıcı kartı verisi (siparişin fatura adresi kimliği; müşteri kaydı siparişte gömülü gelmez → müşteri olma tarihi yok).
const buyer = computed<BuyerPerson | null>(() => {
    const o = props.order;
    if (!o) return null;
    const b = o.billingAddress ?? {};
    const sh = o.shippingAddress ?? {};
    return {
        id: o._id,
        firstName: b.firstName || o.customerFirstName || sh.firstName,
        lastName: b.lastName || o.customerLastName || sh.lastName,
        companyName: b.companyName,
        isCorporate: !!b.isCorporate,
        taxNumber: b.taxNumber,
        taxOffice: b.taxOffice,
        phone: b.phone || sh.phone,
        email: b.email || sh.email,
    };
});
const billingAddress = computed(() => addressView(props.order?.billingAddress));
const shippingAddress = computed(() => addressView(props.order?.shippingAddress));

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
    // FR2-ORDERS 30: adım adı durumuna göre çekimlenir — tamamlanan geçmiş zaman, sıradaki "…bekleniyor", gelecek isim.
    const base = [
        { key: 'created', label: 'Sipariş alındı', date: fmt(d.orderDate) },
        { key: 'approved', label: 'Onaylandı', now: 'Onay bekleniyor', later: 'Onay', date: fmt(d.approvedDate) },
        { key: 'invoiced', label: 'Faturalandı', now: 'Fatura bekleniyor', later: 'Fatura', date: fmt(o.invoice?.invoicedAt || d.invoiceDate) },
        { key: 'shipped', label: 'Kargoya verildi', now: 'Kargoya verilecek', later: 'Kargo', date: fmt(d.shippedDate) },
        { key: 'delivered', label: 'Teslim edildi', now: 'Teslimat bekleniyor', later: 'Teslimat', date: fmt(d.deliveredDate) },
    ];
    // Adım konumu: 0 alındı · 1 onay · 2 fatura/hazırlık · 3 kargo · 4 teslim.
    const pos = s === OrderInternalStatusEnum.UNAPPROVED ? 0 : s === OrderInternalStatusEnum.AWAITING_APPROVAL ? 1
        : s === OrderInternalStatusEnum.APPROVED ? (o.flags?.isInvoiceGenerated || o.invoice?.invoiceNumber ? 3 : 2)
        : s === OrderInternalStatusEnum.SHIPPED ? 4 : s === OrderInternalStatusEnum.DELIVERED ? 5 : -1;
    if (s === OrderInternalStatusEnum.CANCELLED || s === OrderInternalStatusEnum.RETURNED) {
        const done = base.filter((b) => b.date).map((b) => ({ key: b.key, label: b.label, date: b.date, state: 'done' as const }));
        const last = s === OrderInternalStatusEnum.CANCELLED
            ? { key: 'cancelled', label: 'İptal edildi', date: fmt(d.cancelledDate), state: 'failed' as const, description: o.cancelReason || undefined }
            : { key: 'returned', label: 'İade edildi', date: fmt(d.externalUpdatedAt), state: 'failed' as const };
        return [...(done.length ? done : [{ key: base[0].key, label: base[0].label, date: base[0].date, state: 'done' as const }]), last];
    }
    return base.map((b, i) => {
        const state = i < pos ? 'done' : i === pos ? 'current' : 'upcoming';
        const label = state === 'current' ? (b.now ?? b.label) : state === 'upcoming' ? (b.later ?? b.label) : b.label;
        return { key: b.key, label, date: state === 'done' ? b.date : undefined, state };
    });
});

const firstShipment = computed(() => props.order?.fulfillment?.[0]);
const SHIPMENT_METHOD: Record<string, string> = { MARKETPLACE: 'Pazaryeri lojistiği', API: 'Kargo entegrasyonu', MANUAL: 'Elle girildi' };
const INVOICE_METHOD: Record<string, string> = { MARKETPLACE: 'Pazaryeri kesti', INTEGRATOR: 'E-fatura entegratörü', MANUAL: 'Elle yüklendi', E_ARCHIVE: 'E-arşiv', E_INVOICE: 'E-fatura' };
const INVOICE_STATUS: Record<string, string> = { PENDING: 'Hazırlanıyor', SUCCESS: 'Kesildi', FAILED: 'Kesilemedi', MANUAL_COMPLETED: 'Elle tamamlandı' };
const shipmentRows = computed(() => {
    const f = firstShipment.value;
    if (!f) return [];
    return [
        { label: 'Kargo firması', value: f.carrierName },
        { label: 'Takip kodu', value: f.trackingCode || 'Takip bilgisi yok', numeric: true },
        ...(f.shipmentMethod ? [{ label: 'Gönderim', value: SHIPMENT_METHOD[f.shipmentMethod] ?? f.shipmentMethod }] : []),
        ...(f.desi ? [{ label: 'Desi', value: String(f.desi), numeric: true }] : []),
        ...((props.order?.fulfillment?.length ?? 0) > 1 ? [{ label: 'Paket', value: `${props.order.fulfillment.length} paket` }] : []),
    ];
});
const invoiceRows = computed(() => {
    const inv = props.order?.invoice;
    if (!inv?.invoiceNumber && !inv?.status) return [];
    return [
        ...(inv.invoiceNumber ? [{ label: 'Fatura no', value: inv.invoiceNumber, numeric: true }] : []),
        ...(inv.status ? [{ label: 'Durum', value: INVOICE_STATUS[inv.status] ?? inv.status }] : []),
        ...(inv.invoiceMethod ? [{ label: 'Kesen', value: INVOICE_METHOD[inv.invoiceMethod] ?? inv.invoiceMethod }] : []),
        ...(inv.invoicedAt ? [{ label: 'Tarih', value: formatDateTime(inv.invoicedAt), numeric: true }] : []),
    ];
});
const invoiceTone = computed<EkTone>(() => {
    const st = props.order?.invoice?.status;
    if (st === 'FAILED') return 'error';
    if (props.order?.invoice?.invoiceNumber) return 'success';
    return st === 'PENDING' ? 'warning' : 'neutral';
});
const orderLines = computed<RecordLine[]>(() => (props.order?.items ?? []).map((item: any, i: number) => {
    const inactive = !!item?.itemStatus && item.itemStatus !== 'ACTIVE';
    return {
        key: item.externalLineItemId || item.sku || String(i),
        name: item.productName, quantity: item.quantity, sku: item.sku, barcode: item.barcode,
        unit: item.unitPrice, total: item.totalPrice,
        inactiveLabel: inactive ? (item.itemStatus === 'CANCELLED' ? 'İptal edildi' : 'İade edildi') : undefined,
        inactiveTone: item.itemStatus === 'RETURNED' ? 'warning' : 'neutral',
    };
}));
const cancelSourceText = computed(() => {
    const src = props.order?.cancelSource;
    return src === 'SELLER' ? 'Siz (satıcı)' : src === 'CUSTOMER' ? 'Müşteri' : src === 'PLATFORM' ? 'Pazaryeri' : 'Belirtilmedi';
});

/** İleri eylemler: sıradaki iş birincil (onay → fatura → kargo). */
const FORWARD = [
    { key: 'APPROVE', label: 'Onayla', icon: 'mdi-check-circle-outline' },
    { key: 'INVOICE', label: 'Fatura oluştur', icon: 'mdi-receipt-text-plus-outline' },
    { key: 'SHIP', label: 'Kargoya ver', icon: 'mdi-truck-outline' },
] as const;
const forwardActions = computed(() => (props.order ? FORWARD.filter((a) => isOrderActionAllowed(props.order, a.key as any)) : []));
const primaryKey = computed(() => forwardActions.value[0]?.key);
// Alt çubukta birincil en sağda: ikinciller önce, sıradaki iş sonda.
const orderedForwardActions = computed(() => [...forwardActions.value.slice(1), ...forwardActions.value.slice(0, 1)]);
const processText = computed(() => {
    const steps = timelineSteps.value;
    const current = steps.find((s) => s.state === 'current');
    if (current) return `Şu an: ${current.label}`;
    const last = steps[steps.length - 1];
    return last ? `Son durum: ${last.label}` : undefined;
});



const hasAllocation = computed(() => (props.order?.items ?? []).some((item: any) => isAllocationState(item?.allocationState)));



const openLink = (url: string) => { if (url) window.open(url, '_blank'); };

const isLocked = computed(() => {
    if (!props.order?.platformOperation?.lockedUntil) return false;
    const lockedUntil = new Date(props.order.platformOperation.lockedUntil);
    return lockedUntil > new Date();
});

const lockMessage = computed(() => props.order?.platformOperation?.message || 'İşlem yapılıyor, lütfen bekleyiniz...');

const nextStepOwnAction = computed(() => {
    const a = nextStep.value?.action;
    return !!a && !forwardActions.value.some((f) => f.key === a.key);
});

const runNextStep = (key: string) => {
    if (key === 'PRINT') emit('print', props.order);
    else emitAction(key);
};

const emitAction = (action: string) => {
    if (!props.order) return;
    emit('statusAction', { orderId: props.order._id, action });
};

type NextStep = { tone: EkTone; icon: string; title: string; text: string; eyebrow?: string; action?: { key: string; label: string; icon: string }; link?: { label: string; url: string } };

/** FR2-ORDERS 30 — "şimdi ne olacak": yalnız durum + bayraklardan (uydurma tahmin yok); eylem izin kuralı başlıkla aynı. */
const nextStep = computed<NextStep | null>(() => {
    const o = props.order;
    if (!o) return null;
    const S = OrderInternalStatusEnum;
    const act = (key: string) => forwardActions.value.find((a) => a.key === key);
    switch (o.internalStatus) {
        case S.UNAPPROVED:
            return { tone: 'warning', icon: 'mdi-timer-sand', title: 'Pazaryerinin onayı bekleniyor', text: 'Müşteri siparişi verdi. Pazaryeri onayladığında fatura ve kargo adımları açılır; şu an sizin bir şey yapmanız gerekmiyor.' };
        case S.AWAITING_APPROVAL:
            return { tone: 'warning', icon: 'mdi-shield-check-outline', title: 'Siparişi onaylayın', text: 'Pazaryeri siparişi onayladı, sıra sizde. Onayladığınızda fatura ve kargo adımlarına geçebilirsiniz.', action: act('APPROVE') };
        case S.APPROVED: {
            const automated = o.fulfillment?.some((f: any) => f.shipmentMethod === 'MARKETPLACE' && f.trackingCode);
            if (automated) return { tone: 'info', icon: 'mdi-truck-check-outline', title: 'Kargo firmasının teslim alması bekleniyor', text: 'Bu sipariş pazaryeri lojistiğiyle gönderiliyor. Kargo firması paketi okuttuğunda durum kendiliğinden güncellenir.' };
            if (firstShipment.value?.trackingCode) return { tone: 'action', icon: 'mdi-barcode-scan', title: 'Paketi kargo firmasına teslim edin', text: `Kargo barkodu hazır (${firstShipment.value.carrierName || 'kargo'} · ${firstShipment.value.trackingCode}). Barkodu yazdırıp paketin üzerine yapıştırın; kargo firması okuttuğunda durum kendiliğinden güncellenir.`, action: { key: 'PRINT', label: 'Barkod yazdır', icon: 'mdi-printer-outline' } };
            const invoiced = o.flags?.isInvoiceGenerated || o.invoice?.invoiceNumber;
            if (invoiced) return { tone: 'action', icon: 'mdi-package-variant-closed', title: 'Kargoya verin', text: 'Fatura hazır. Kargo barkodunu alıp paketi teslime hazırlayın.', action: act('SHIP') };
            return { tone: 'action', icon: 'mdi-receipt-text-plus-outline', title: 'Faturayı oluşturun', text: 'Sipariş onaylandı. E-faturayı oluşturun ya da doğrudan kargo barkodu alın.', action: act('INVOICE') ?? act('SHIP') };
        }
        case S.SHIPPED: {
            const url = firstShipment.value?.trackingUrl;
            return { tone: 'info', icon: 'mdi-truck-fast-outline', title: 'Paket yolda', text: 'Sipariş kargoda. Müşteriye teslim edildiğinde süreç kendiliğinden tamamlanır.', link: url ? { label: 'Kargoyu takip et', url } : undefined };
        }
        case S.DELIVERED:
            return { tone: 'success', icon: 'mdi-check-circle-outline', eyebrow: 'Durum', title: 'Sipariş tamamlandı', text: 'Paket müşteriye ulaştı; başka bir işlem gerekmiyor.' };
        case S.CANCELLED:
            return { tone: 'neutral', icon: 'mdi-close-circle-outline', eyebrow: 'Durum', title: 'Sipariş iptal edildi', text: 'Bu sipariş üzerinde artık işlem yapılamaz.' };
        case S.RETURNED:
            return { tone: 'warning', icon: 'mdi-keyboard-return', eyebrow: 'Durum', title: 'Sipariş iade edildi', text: 'Müşteri siparişi iade etti. İade sürecini İadeler ekranından takip edebilirsiniz.' };
        default:
            return null;
    }
});
</script>

<style scoped>
.ek-od {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  container-type: inline-size;
}

/* İki kolon: kalemler + tutar solda, alıcı/kargo/fatura sağda (yan sayfa ≥ 820px iç genişlik). */
.ek-od-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-4);
  align-items: start;
}

@container (min-width: 820px) {
  .ek-od-grid {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
  }
}

.ek-od-main,
.ek-od-side {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

/* Tutar dökümü: kalem listesinin altında hafif tonlu bant (öne çıkan kutu), satırlar sağa yaslı. */
.ek-od-totals {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.ek-od-totals > div {
  width: min(100%, 320px);
  margin-inline-start: auto;
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

.ek-od-totals dd.ek-od-totals__discount {
  color: var(--ek-color-success-emphasis);
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

.ek-od-cancel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--ek-space-2) var(--ek-space-4);
  margin: var(--ek-space-3) 0 0;
}

.ek-od-cancel dt {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ek-od-cancel dd {
  margin: 0;
  color: var(--ek-color-content-strong);
}
</style>
