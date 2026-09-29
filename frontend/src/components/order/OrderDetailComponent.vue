<template>
  <EkDetailSheet v-model="isOpen" :identity="order?.orderNumber ?? 'Sipariş detayı'">
    <template #status>
      <EkStatusChip v-if="order" :tone="statusEntry.tone" :label="$t(statusEntry.labelKey)" />
    </template>
    <template #actions>
      <v-btn v-if="order && isOrderActionAllowed(order, 'CANCEL')" variant="outlined" :disabled="isLocked" prepend-icon="mdi-delete-sweep-outline" @click="emit('cancel', order)">
        İptal et
      </v-btn>
      <v-btn v-if="order && isOrderActionAllowed(order, 'APPROVE')" color="primary" :disabled="isLocked" prepend-icon="mdi-check-circle-outline" @click="emitAction('APPROVE')">
        Onayla
      </v-btn>
      <v-btn v-if="order && isOrderActionAllowed(order, 'INVOICE')" color="primary" :disabled="isLocked" prepend-icon="mdi-receipt-text-plus-outline" @click="emitAction('INVOICE')">
        Fatura oluştur
      </v-btn>
      <v-btn v-if="order && isOrderActionAllowed(order, 'SHIP')" color="primary" :disabled="isLocked" prepend-icon="mdi-truck-outline" @click="emitAction('SHIP')">
        Kargoya ver
      </v-btn>
    </template>

    <div v-if="order" class="d-flex flex-column ek-gap-8">
      <v-alert v-if="order.platformDiscrepancy?.hasDiscrepancy" type="error" variant="tonal" icon="mdi-alert-circle">
        <div class="text-body-2 font-weight-semibold">Finansal uyumsuzluk tespit edildi</div>
        <div class="text-caption">{{ order.platformDiscrepancy?.message }}</div>
        <v-btn color="error" variant="outlined" size="small" class="mt-2" @click="emit('resolveDiscrepancy', order)">
          Farkı eşitle ve faturayı yenile
        </v-btn>
      </v-alert>

      <v-alert v-if="isLocked" type="warning" variant="tonal" icon="mdi-clock-check-outline">
        <div class="text-body-2 font-weight-semibold">İşlem devam ediyor</div>
        <div class="text-caption">{{ lockMessage }} Pazar yerinin işlemi tamamlaması için yaklaşık 2 dakika kilit uygulanır.</div>
      </v-alert>

      <EkSection>
        <EkDescriptionList :items="identityItems" />
        <div v-if="metaBadges.length" class="d-flex ek-gap-1 mt-2 flex-wrap">
          <EkStatusChip v-for="b in metaBadges" :key="b.label" :tone="b.tone" :label="b.label" />
        </div>
      </EkSection>

      <EkSection v-if="order.internalStatus !== OrderInternalStatusEnum.CANCELLED && order.internalStatus !== OrderInternalStatusEnum.DELIVERED" title="Süreç durumu">
        <div class="ek-order-stepper">
          <div v-for="(step, i) in steps" :key="i" class="ek-order-step" :class="{ 'ek-order-step--done': stepperStep >= i, 'ek-order-step--active': stepperStep === i }">
            <span class="ek-order-step__dot" />
            <span class="ek-order-step__label">{{ step }}</span>
          </div>
        </div>
        <v-alert v-if="statusInformation" :type="alertType" variant="tonal" :icon="statusInformation.icon" class="mt-4">
          <div class="text-body-2 font-weight-medium">{{ statusInformation.title }}</div>
          <div class="text-caption mt-1">{{ statusInformation.desc }}</div>
        </v-alert>

        <v-alert v-if="order.internalStatus === OrderInternalStatusEnum.RETURNED" type="error" variant="tonal" icon="mdi-alert-decagram" class="mt-3">
          <div class="text-caption font-weight-semibold">Dikkat: İade talebi / süreci</div>
          <div class="text-caption">Bu sipariş için pazaryeri üzerinde bir iade süreci başlatılmıştır. Detaylı bilgi için İade Yönetimi sayfasını kontrol ediniz.</div>
        </v-alert>

        <v-alert v-if="(order.internalStatus === OrderInternalStatusEnum.CANCELLED || order.internalStatus === OrderInternalStatusEnum.RETURNED) && order.flags?.isInvoiceGenerated" type="warning" variant="tonal" icon="mdi-file-cancel" class="mt-3">
          <div class="text-caption font-weight-semibold">Dikkat: Faturalandırılmış iptal/iade</div>
          <div class="text-caption">Bu siparişin faturası sistem tarafından kesilmiştir. Faturayı iptal etmeyi veya iade faturası düzenlemeyi unutmayın.</div>
        </v-alert>

        <div v-if="order.internalStatus !== OrderInternalStatusEnum.CANCELLED && order.dates?.estimatedDeliveryDate && order.internalStatus !== OrderInternalStatusEnum.DELIVERED" class="mt-3">
          <EkDescriptionList :items="[{ label: 'Tahmini teslimat', value: formatDateTime(order.dates.estimatedDeliveryDate) }]" />
        </div>

        <div v-if="order.internalStatus === OrderInternalStatusEnum.CANCELLED" class="mt-3">
          <EkDescriptionList :items="[
            { label: 'İptal kaynağı', value: order.cancelSource === 'SELLER' ? 'Satıcı kaynaklı' : 'Müşteri / platform' },
            { label: 'İptal gerekçesi', value: order.cancelReason || 'Pazar yeri tarafından bir gerekçe iletilmedi.' },
            { label: 'İptal tarihi', value: formatDateTime(order.dates?.cancelledDate) },
          ]" />
        </div>
      </EkSection>

      <v-row v-if="order.internalStatus !== OrderInternalStatusEnum.CANCELLED" dense>
        <v-col cols="12" sm="6">
          <EkSection title="Fatura">
            <EkDescriptionList :items="[{ label: order.invoice?.invoiceNumber ? `E-Fatura (${order.invoice?.invoiceMethod || 'Elektronik'})` : 'E-Fatura', value: order.invoice?.invoiceNumber || 'Fatura bilgisi yok' }]" />
            <v-btn v-if="order.invoice?.invoiceNumber" variant="outlined" size="small" class="mt-2" :disabled="!order.invoice?.invoiceLink" prepend-icon="mdi-file-pdf-box" @click="openLink(order.invoice?.invoiceLink)">
              PDF görüntüle
            </v-btn>
          </EkSection>
        </v-col>
        <v-col cols="12" sm="6">
          <EkSection title="Sevkiyat">
            <div v-if="order.fulfillment?.length" class="d-flex flex-column ek-gap-3">
              <div v-for="(pkg, pIdx) in order.fulfillment" :key="pIdx">
                <EkDescriptionList :items="[{ label: pkg.trackingCode ? `${pkg.carrierName} takip kodu` : 'Takip kodu', value: pkg.trackingCode || 'Takip bilgisi yok' }]" />
                <div v-if="pkg.trackingCode" class="d-flex ek-gap-2 mt-1">
                  <v-btn variant="outlined" size="small" prepend-icon="mdi-barcode-scan" @click="emit('print', order)">Barkod yazdır</v-btn>
                  <v-btn variant="outlined" size="small" :disabled="!pkg?.trackingUrl" prepend-icon="mdi-map-marker-outline" @click="openLink(pkg?.trackingUrl)">Takip sayfası</v-btn>
                </div>
              </div>
            </div>
            <EkEmptyState v-else variant="no-data" title="Sevkiyat bilgisi yok" message="Bu sipariş için henüz kargo kaydı oluşturulmadı." />
          </EkSection>
        </v-col>
      </v-row>

      <EkSection title="Ödeme detayları">
        <EkDescriptionList :items="[
          { label: 'Ara toplam', value: formatMoney(order.financials?.subTotal) },
          { label: 'KDV', value: formatMoney(order.financials?.totalTax) },
          { label: 'Kargo ücreti', value: formatMoney(order.financials?.shippingFee) },
          { label: 'İndirim', value: order.financials?.totalDiscount > 0 ? `-${formatMoney(order.financials?.totalDiscount)}` : formatMoney(0) },
        ]" />
        <div class="ek-order-total mt-4 pa-4 d-flex align-center justify-space-between">
          <span class="text-caption font-weight-medium text-uppercase">Ödenecek toplam</span>
          <span class="text-h5 font-weight-bold ek-num">{{ formatMoney(order.financials?.grandTotal) }}</span>
        </div>
      </EkSection>

      <EkSection title="Ürünler">
        <EkDataTable :items="order.items || []" :columns="itemColumns" row-key="sku">
          <template #cell-productName="{ item }">
            <div class="d-flex flex-column">
              <div class="d-flex align-center ek-gap-1">
                <span class="font-weight-medium text-body-2" :class="{ 'ek-strike': item.itemStatus !== 'ACTIVE' }">{{ item.productName }}</span>
                <EkStatusChip v-if="item.itemStatus !== 'ACTIVE'" tone="danger" :label="item.itemStatus === 'CANCELLED' ? 'İptal' : 'İade'" />
              </div>
              <span class="text-caption ek-muted">SKU: {{ item.sku }}<template v-if="item.barcode"> · Barkod: {{ item.barcode }}</template></span>
            </div>
          </template>
          <template #cell-unitPrice="{ item }">{{ formatMoney(item.totalPrice) }}</template>
        </EkDataTable>
      </EkSection>

      <EkSection title="Müşteri">
        <div class="d-flex align-center ek-gap-3 mb-4">
          <v-avatar color="surface-muted" size="44">
            <span class="text-body-2 font-weight-bold">{{ order.billingAddress?.firstName?.[0] }}{{ order.billingAddress?.lastName?.[0] }}</span>
          </v-avatar>
          <div class="d-flex flex-column">
            <span class="font-weight-medium text-body-2">{{ order.billingAddress?.firstName }} {{ order.billingAddress?.lastName }}</span>
            <span class="text-caption ek-muted">{{ formatPhoneNumber(order.billingAddress?.phone) }} · {{ order.billingAddress?.email || '—' }}</span>
          </div>
        </div>
        <EkDescriptionList :items="[
          { label: 'Adres', value: `${order.shippingAddress?.addressLine1 || ''}` },
          { label: 'Şehir / İlçe', value: `${order.shippingAddress?.city || ''} / ${order.shippingAddress?.state || ''}` },
          { label: 'Fatura tipi', value: order.billingAddress?.isCorporate ? 'Kurumsal' : 'Bireysel' },
          { label: 'Firma', value: order.billingAddress?.companyName || 'Bireysel' },
        ]" />
      </EkSection>

      <EkSection title="Sipariş yolculuğu">
        <ol class="ek-order-timeline">
          <li v-for="event in timelineEvents" :key="event.id" class="ek-order-timeline__item">
            <span class="ek-order-timeline__dot" :class="{ 'ek-order-timeline__dot--success': event.isSuccess }" />
            <div class="d-flex flex-column">
              <span class="text-body-2 font-weight-medium">{{ event.label }}</span>
              <span class="text-caption ek-muted ek-num">{{ formatDateTime(event.date) }}</span>
            </div>
          </li>
        </ol>
      </EkSection>

      <EkSection title="Operasyon rehberi" description="Siparişin yaşam döngüsü ve zorunlu aksiyon adımları">
        <v-row dense>
          <v-col cols="12" sm="6">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-shield-check-outline</v-icon>
              <div class="text-caption font-weight-semibold mb-1">1. Sipariş onayı</div>
              <div class="text-caption ek-muted">Pazar yeri onayı bekleniyor. Bu aşamada fatura kesilemez ve kargo işlemi yapılamaz.</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-receipt-text-outline</v-icon>
              <div class="text-caption font-weight-semibold mb-1">2. Fatura ve hazırlık</div>
              <div class="text-caption ek-muted">Sipariş onaylandı. Fatura kesebilir, kargo etiketi yazdırabilir ve kargo işlemini başlatabilirsiniz.</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-package-variant-closed</v-icon>
              <div class="text-caption font-weight-semibold mb-1">3. Teslimat bekleniyor</div>
              <div class="text-caption ek-muted">Paket kargo firmasında. Yeni kargo işlemi yapılamaz, yalnızca takip edilebilir.</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6">
            <div class="ek-guide-card pa-3 border-subtle rounded-lg h-100">
              <v-icon size="18" color="content-muted" class="mb-2">mdi-truck-fast-outline</v-icon>
              <div class="text-caption font-weight-semibold mb-1">4. Teslimat</div>
              <div class="text-caption ek-muted">Süreç tamamlandı; operasyonel işlemler kilitlenir, yalnızca kayıtlar incelenebilir.</div>
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
import { formatMoney, formatDateTime } from '@/composables/format';
import { ORDER_STATUS_TONE, type StatusTone } from '@/design/status-map';
import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { useLifecycle } from '@/composables/useLifecycle';

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    order: { type: Object, default: () => null }
});

const emit = defineEmits(['statusAction', 'cancel', 'print', 'resolveDiscrepancy', 'update:modelValue']);

const { isOrderActionAllowed } = useLifecycle();
const steps = ['Sipariş oluşturuldu', 'Satıcı onayı', 'Hazırlanıyor', 'Kargoya verildi', 'Teslim edildi'];

const isOpen = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
});

const statusEntry = computed(() => ORDER_STATUS_TONE[props.order?.internalStatus as OrderInternalStatusEnum] ?? { tone: 'neutral' as StatusTone, labelKey: 'status.order.unapproved' });
const alertType = computed(() => {
    const tone = statusEntry.value.tone;
    return tone === 'danger' ? 'error' : tone === 'neutral' ? 'info' : tone;
});

const stepperStep = computed(() => {
    if (!props.order) return 0;
    const s = props.order.internalStatus;
    if (s === OrderInternalStatusEnum.UNAPPROVED) return 0;
    if (s === OrderInternalStatusEnum.AWAITING_APPROVAL) return 1;
    if (s === OrderInternalStatusEnum.APPROVED) return 2;
    if (s === OrderInternalStatusEnum.SHIPPED) return 3;
    if (s === OrderInternalStatusEnum.DELIVERED) return 4;
    return -1;
});

const metaBadges = computed(() => {
    if (!props.order) return [];
    const badges: { label: string; tone: StatusTone }[] = [];
    if (props.order.meta?.commercial) badges.push({ label: 'Kurumsal (B2B)', tone: 'info' });
    if (props.order.meta?.micro) badges.push({ label: 'Mikro ihracat', tone: 'neutral' });
    if (props.order.meta?.etgbNo) badges.push({ label: `ETGB: ${props.order.meta.etgbNo}`, tone: 'neutral' });
    return badges;
});

const identityItems = computed<EkDescriptionListItem[]>(() => {
    if (!props.order) return [];
    const items: EkDescriptionListItem[] = [
        { label: 'Sipariş No', value: props.order.orderNumber },
        { label: 'Sipariş tarihi', value: formatDateTime(props.order.dates?.orderDate) },
    ];
    if (props.order.internalStatus === OrderInternalStatusEnum.DELIVERED) {
        items.push({ label: 'Teslim tarihi', value: formatDateTime(props.order.dates?.deliveredDate) });
    }
    return items;
});

const itemColumns: EkTableColumn[] = [
    { key: 'productName', label: 'Ürün detayı' },
    { key: 'quantity', label: 'Adet', align: 'end' },
    { key: 'unitPrice', label: 'Toplam', align: 'end' },
];

const timelineEvents = computed(() => {
    if (!props.order) return [];
    const events: any[] = [];
    const o = props.order;

    events.push({ id: 'created', label: 'Sipariş oluşturuldu', date: o.dates?.orderDate });

    if (o.internalStatus !== OrderInternalStatusEnum.UNAPPROVED) {
        events.push({
            id: 'awaiting_approval',
            label: o.internalStatus === OrderInternalStatusEnum.AWAITING_APPROVAL ? 'Satıcı onayı bekleniyor' : 'Satıcı onayı alındı',
            date: o.dates?.approvedDate || (o.internalStatus === OrderInternalStatusEnum.AWAITING_APPROVAL ? undefined : o.updatedAt),
        });
    }
    if (o.invoice?.invoicedAt || o.dates?.invoiceDate) {
        events.push({ id: 'invoiced', label: 'Fatura oluşturuldu', date: o.invoice?.invoicedAt || o.dates?.invoiceDate });
    }
    if (o.dates?.shippedDate || [OrderInternalStatusEnum.SHIPPED, OrderInternalStatusEnum.DELIVERED].includes(o.internalStatus)) {
        events.push({ id: 'shipped', label: 'Kargoya verildi', date: o.dates?.shippedDate });
    }
    if (o.dates?.deliveredDate || o.internalStatus === OrderInternalStatusEnum.DELIVERED) {
        events.push({ id: 'delivered', label: 'Teslim edildi', date: o.dates?.deliveredDate, isSuccess: true });
    }
    if (o.internalStatus === OrderInternalStatusEnum.CANCELLED) {
        events.push({ id: 'cancelled', label: 'Sipariş iptal edildi', date: o.dates?.cancelledDate });
    }
    if (o.internalStatus === OrderInternalStatusEnum.RETURNED) {
        events.push({ id: 'returned', label: 'Sipariş iade edildi', date: o.dates?.externalUpdatedAt || new Date() });
    }

    return events.filter(e => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

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
            return { title: 'Sipariş tamamlandı', desc: 'Sipariş müşteriye ulaştı. Tüm operasyonel süreçler tamamlandı.', icon: 'mdi-check-circle' };
        case OrderInternalStatusEnum.CANCELLED:
            return { title: 'Sipariş iptal edildi', desc: 'Bu sipariş iptal edildi, üzerinde işlem yapılamaz.', icon: 'mdi-close-circle' };
        case OrderInternalStatusEnum.RETURNED:
            return { title: 'Sipariş iade edildi', desc: 'Müşteri bu siparişi iade etti. Detayları İadeler bölümünden takip edebilirsiniz.', icon: 'mdi-keyboard-return' };
        default:
            return { title: 'Durum bilgisi alınıyor', desc: 'Sipariş durum verisi işleniyor…', icon: 'mdi-information-outline' };
    }
});
</script>

<style scoped>
.ek-gap-1 { gap: var(--ek-space-1); }
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-3 { gap: var(--ek-space-3); }
.ek-gap-8 { gap: var(--ek-space-8); }

.ek-muted {
  color: var(--ek-color-content-muted);
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}

.ek-strike {
  text-decoration: line-through;
  color: var(--ek-color-error);
}

.ek-order-total {
  background: var(--ek-color-primary);
  color: var(--ek-color-background);
  border-radius: var(--ek-radius-lg);
}

.ek-order-stepper {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.ek-order-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  text-align: center;
}

.ek-order-step__dot {
  width: 10px;
  height: 10px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-strong);
}

.ek-order-step--done .ek-order-step__dot,
.ek-order-step--active .ek-order-step__dot {
  background: var(--ek-color-primary);
}

.ek-order-step__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-order-step--active .ek-order-step__label {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-order-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-order-timeline__item {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

.ek-order-timeline__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-content-subtle);
  flex: none;
}

.ek-order-timeline__dot--success {
  background: var(--ek-color-success);
}

.ek-guide-card {
  background: var(--ek-color-surface);
}
</style>
