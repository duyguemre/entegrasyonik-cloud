<template>
  <div class="subscriptionView">
    <div class="subscription-inner">
      <EkPageHeader section="Hesap" title="Abonelik ve Planlar"
        description="İşletmenize uygun planı seçin, mevcut aboneliğinizin durumunu buradan izleyin." />

      <!-- Durum bandı (ADR-0008 §3 durum makinesi -- boş/hata/yükleniyor AYRI durumlardır) -->
      <section aria-live="polite" class="status-section">
        <div v-if="subLoading" class="status-banner status-banner--loading">
          <EkSkeleton type="form" />
        </div>
        <div v-else-if="subError" class="status-banner status-banner--error">
          <v-icon icon="mdi-alert-circle-outline" color="error" />
          <div class="status-banner-body">
            <div class="status-banner-title">Abonelik durumu yüklenemedi</div>
            <div class="status-banner-text">Bağlantı sorunu olabilir -- lütfen tekrar deneyin.</div>
          </div>
          <v-btn variant="text" color="error" class="text-none" @click="fetchSubscription" aria-label="Abonelik durumunu yeniden yükle">
            <v-icon start size="18">mdi-refresh</v-icon>Tekrar Dene
          </v-btn>
        </div>
        <div v-else role="status" class="status-banner" :class="`status-banner--${statusMeta.tone}`">
          <v-icon :icon="statusMeta.icon" :color="statusMeta.tone" />
          <div class="status-banner-body">
            <div class="status-banner-title">
              {{ statusMeta.label }}
              <EkStatusChip v-if="subscriptionData?.billingExempt" tone="info" label="Kurumsal Anlaşma" class="ml-2" />
            </div>
            <div class="status-banner-text">{{ statusMessage }}</div>
          </div>
        </div>
      </section>

      <!-- Planlar -->
      <section class="plans-section">
        <div class="section-title-row">
          <h3 class="section-title">Planlar</h3>
          <EkHelpHint hint="subscription.plan" />
        </div>

        <!-- ADR-0014 S4b: kayıt sırasında (tanıtım sitesinden) seçilen plan önerisi. Yalnızca izinli plan kodu + listede var olan plan. -->
        <div v-if="suggestedPlan" class="suggested-plan-note" role="status" data-testid="suggested-plan-note">
          <v-icon size="18" color="info" aria-hidden="true">mdi-tag-outline</v-icon>
          <span>Kayıt sırasında <strong>{{ suggestedPlan.name }}</strong> planını seçtiniz. Devam etmek için aşağıdaki kartta «{{ planActionLabel(suggestedPlan) }}» düğmesini kullanın.</span>
        </div>

        <div v-if="plansLoading" class="plans-grid" aria-hidden="true">
          <EkSkeleton v-for="n in 3" :key="n" type="cards" :rows="1" class="plan-card-skeleton" />
        </div>

        <EkEmptyState v-else-if="plansError" variant="error" title="Planlar yüklenemedi"
          message="Plan bilgileri şu anda getirilemedi. Bağlantınızı kontrol edip tekrar deneyin."
          show-action action-text="Tekrar Dene" action-icon="mdi-refresh"
          @action="fetchPlans" />

        <EkEmptyState v-else-if="!plans.length" variant="no-data" title="Plan tanımları henüz yayınlanmadı"
          message="Şu anda satışa açık bir plan bulunmuyor. Lütfen daha sonra tekrar kontrol edin veya destek ekibimizle iletişime geçin." />

        <div v-else class="plans-grid" role="list" aria-label="Abonelik planları">
          <article v-for="plan in plans" :key="plan.code" class="plan-card" role="listitem"
            :class="{ 'plan-card--current': isCurrentPlan(plan), 'plan-card--suggested': !isCurrentPlan(plan) && suggestedPlan?.code === plan.code }">
            <div v-if="isCurrentPlan(plan)" class="plan-card-ribbon">Mevcut Planınız</div>
            <div v-else-if="suggestedPlan?.code === plan.code" class="plan-card-ribbon">Seçtiğiniz Plan</div>

            <h4 class="plan-card-name">{{ plan.name }}</h4>

            <div class="plan-card-price">
              <span class="price-amount">{{ formatPrice(plan) }}</span>
              <span v-if="plan.priceMinor > 0" class="price-note">{{ plan.vatIncluded ? 'KDV Dahil' : 'KDV Hariç' }}</span>
            </div>

            <ul class="plan-card-limits">
              <li><v-icon size="16" color="content-muted">mdi-storefront-outline</v-icon> {{ formatLimit(plan.limits?.channels, 'channels') }} Kanal (Pazaryeri + E-ticaret)</li>
              <li><v-icon size="16" color="content-muted">mdi-package-variant-closed</v-icon> {{ formatLimit(plan.limits?.skus, 'skus') }} Varyant (SKU)</li>
              <li><v-icon size="16" color="content-muted">mdi-account-group-outline</v-icon> {{ formatLimit(plan.limits?.users, 'users') }} Kullanıcı</li>
              <li><v-icon size="16" color="content-muted">mdi-robot-outline</v-icon> {{ formatLimit(plan.limits?.mcpCallsPerDay, 'mcpCallsPerDay') }} MCP Çağrısı / gün</li>
            </ul>

            <div v-if="plan.features?.length" class="plan-card-features">
              <EkStatusChip v-for="f in plan.features" :key="f" tone="neutral" :label="featureLabel(f)" />
            </div>

            <v-btn block class="plan-card-action text-none mt-auto"
              :disabled="isCurrentPlan(plan) && isActiveLike"
              :loading="checkingOutCode === plan.code"
              :color="isCurrentPlan(plan) ? 'default' : 'primary'"
              :variant="isCurrentPlan(plan) ? 'outlined' : 'flat'"
              :aria-label="`${plan.name} planı için: ${planActionLabel(plan)}`"
              @click="openConfirm(plan)">
              {{ planActionLabel(plan) }}
            </v-btn>
          </article>
        </div>

        <!--
          ADR-0008 §2 "Plan limitleri — yalnızca öneri (fiyat ve limitler insan kararıdır)": yukarıdaki
          kartlardaki fiyat/limit değerleri `Plans` koleksiyonundan (insan tarafından seed edilir, bkz.
          BACKLOG.md) OLDUĞU GİBİ okunur -- bu ekran hiçbir fiyat/limit değeri ÜRETMEZ/SABİTLEMEZ.
        -->
      </section>

      <!-- Checkout sonucu (ADR-0008 §1: MockPaymentProvider -- gerçek hosted checkout sayfası YOK, bilgilendirme amaçlı) -->
      <EkAlert v-if="checkoutInfo" tone="info" class="checkout-alert" live dismissible title="Ödeme adımına yönlendiriliyorsunuz (test ortamı)" @dismiss="checkoutInfo = null">
        <div class="text-body-2 mt-1">
          <strong>{{ checkoutInfo.planName }}</strong> planı için işlem başlatıldı. Bu bir MOCK (test) bağlantısıdır,
          gerçek bir ödeme sağlayıcısına yönlendirmez; abonelik durumunuz ödeme sağlayıcısından onay geldiğinde otomatik güncellenir.
        </div>
        <div v-if="checkoutInfo.checkoutUrl" class="checkout-url text-body-2 mt-1">{{ checkoutInfo.checkoutUrl }}</div>
      </EkAlert>
    </div>

    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title" attach=".subscriptionView"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" icon="mdi-credit-card-check-outline"
      color="primary" confirm-text="Devam Et" confirm-icon="mdi-arrow-right-circle-outline"
      :loading="checkingOutCode === confirmDialog.planCode"
      @confirm="confirmCheckout" @cancel="confirmDialog.show = false" maxWidth="420px" />
  </div>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import { EkAlert, EkEmptyState, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
// ADR-0008 (ödeme sağlayıcısı/abonelik modeli) + ADR-0011 Karar 2 "P1-yeni": bu ekran
// `SubscriptionView.vue`'nun ürünle ilgisiz yer tutucu içeriğinin (bkz. git geçmişi) YERİNE
// sıfırdan, token'larla yazıldı -- characterization testi YAZILMADI (sabitlenecek gerçek bir iş
// kuralı yoktu, bkz. görev talimatı + ADR-0011 Karar 2 tablosu).
import { ref, computed, onMounted } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
;
import EkPageHeader from '@/components/page/EkPageHeader.vue';
;
;
import { formatNumber } from '@entegrasyonik/ui/format';
import { subscriptionStatusMeta, subscriptionStatusMessage, type SubscriptionSummary } from '@/composables/subscriptionStatus';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import { text, emphasis, type MessagePart } from '@/components/layout/messageParts';
import { isRegisterPlanCode } from '@/navigation/registerIntent';

interface PlanLimits { channels?: number; skus?: number; users?: number; mcpCallsPerDay?: number }
interface Plan {
  code: string; name: string; priceMinor: number; currency?: string; interval?: 'month' | 'year';
  vatIncluded?: boolean; limits?: PlanLimits; features?: string[];
}

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const plans = ref<Plan[]>([]);
const plansLoading = ref(true);
const plansError = ref(false);

const subscriptionStatus = ref<string>('no_subscription');
const subscriptionData = ref<SubscriptionSummary | null>(null);
const accessReason = ref<string | undefined>(undefined);
const subLoading = ref(true);
const subError = ref(false);

const checkingOutCode = ref<string | null>(null);
const checkoutInfo = ref<{ planName: string; checkoutUrl?: string } | null>(null);
const confirmDialog = ref<{ show: boolean; planCode: string; title: string; subtitle: string; message: string | MessagePart[] }>({
  show: false, planCode: '', title: '', subtitle: '', message: '',
});

const FEATURE_LABELS: Record<string, string> = {
  // fe-r3d (APP_IDENTITY §8): cümle düzeni; MCP kullanıcı dilinde "Yapay zekâ bağlantısı" (P-MCP-1 ekran adı).
  einvoice: 'E-Fatura', erp: 'ERP entegrasyonu', shipping: 'Kargo entegrasyonu',
  mcp: 'Yapay zekâ bağlantısı', desktopApp: 'Masaüstü uygulaması',
};

const statusMeta = computed(() => subscriptionStatusMeta(subscriptionStatus.value));
const isActiveLike = computed(() => subscriptionStatus.value === 'trialing' || subscriptionStatus.value === 'active');

// Durum → metin eşlemesi `composables/subscriptionStatus.ts`'te (kabuk bandıyla ORTAK kaynak, C2.2).
const statusMessage = computed(() => subscriptionStatusMessage(subscriptionStatus.value, subscriptionData.value, accessReason.value));

function isCurrentPlan(plan: Plan): boolean {
  return !!subscriptionData.value?.planCode && subscriptionData.value.planCode === plan.code;
}

function planActionLabel(plan: Plan): string {
  if (!subscriptionData.value) return 'Planı Seç';
  if (isCurrentPlan(plan)) return isActiveLike.value ? 'Mevcut Planınız' : 'Yeniden Etkinleştir';
  return 'Bu Plana Geç';
}

// P08 (K49): plan kaydındaki tavan değerler "sınırsız" anlamındadır (Kurumsal: 999 kanal/kullanıcı, 999.999 varyant/çağrı).
// Plan verisi değişmez; yalnız gösterim. Açık `unlimited` bayrağı backend isteği (PROPOSALS_PENDING backend istekleri).
const UNLIMITED_AT: Record<string, number> = { channels: 999, users: 999, skus: 999_999, mcpCallsPerDay: 999_999 };

function formatLimit(n?: number, key?: keyof typeof UNLIMITED_AT): string {
  if (n === undefined || n === null) return '—';
  if (!Number.isFinite(n) || (key && n >= UNLIMITED_AT[key])) return 'Sınırsız';
  return formatNumber(n);
}

function featureLabel(f: string): string {
  return FEATURE_LABELS[f] || f;
}

function formatPrice(plan: Plan): string {
  if (!plan.priceMinor) return 'Özel Teklif';
  const amount = formatNumber(Math.round(plan.priceMinor / 100));
  return `₺${amount} / ${plan.interval === 'year' ? 'yıl' : 'ay'}`;
}

const fetchPlans = async () => {
  plansLoading.value = true;
  plansError.value = false;
  // restApi.post AĞ HATASINDA REDDETMEZ (bkz. restapi.ts postService) -- başarı `result:true` ile
  // ayırt edilir; bu, mevcut ekranların "hata ile boş veri aynı görünür" gizli davranışından
  // BİLİNÇLİ OLARAK ayrılır (bu ekran sıfırdan yazıldığı için doğru ayrım GÜN 1'den kuruldu).
  const res: any = await restApi.post('BillingService/getPlans', {});
  if (res && res.result === true) {
    plans.value = res.plans || [];
  } else {
    plansError.value = true;
  }
  plansLoading.value = false;
};

const fetchSubscription = async () => {
  subLoading.value = true;
  subError.value = false;
  const res: any = await restApi.post('BillingService/getMySubscription', {});
  if (res && res.result === true) {
    subscriptionStatus.value = res.status || 'no_subscription';
    subscriptionData.value = res.subscription;
    accessReason.value = res.reason;
  } else {
    subError.value = true;
  }
  subLoading.value = false;
};

function openConfirm(plan: Plan) {
  if (isCurrentPlan(plan) && isActiveLike.value) return; // buton zaten devre dışı; savunmacı ikinci kontrol
  confirmDialog.value = {
    show: true,
    planCode: plan.code,
    title: isCurrentPlan(plan) ? 'Aboneliği Yeniden Etkinleştir' : 'Plan Seçimini Onayla',
    subtitle: `${plan.name} -- ${formatPrice(plan)}`,
    message: [
      emphasis(plan.name),
      text(` planına ${isCurrentPlan(plan) ? 'yeniden geçeceksiniz' : 'geçeceksiniz'}. Bu, test (mock) ödeme sağlayıcısı akışını başlatır -- gerçek bir tahsilat yapılmaz.`),
    ],
  };
}

async function confirmCheckout() {
  const plan = plans.value.find(p => p.code === confirmDialog.value.planCode);
  if (!plan) { confirmDialog.value.show = false; return; }

  checkingOutCode.value = plan.code;
  try {
    const res: any = await restApi.post('BillingService/startCheckout', { planCode: plan.code, billingInterval: plan.interval });
    if (res && res.result === true) {
      confirmDialog.value.show = false;
      checkoutInfo.value = { planName: plan.name, checkoutUrl: res.checkoutUrl };
      snackbarStore.addSnackbar({ text: 'İşlem başlatıldı.', color: 'success' });
      await fetchSubscription();
    } else if (res?.response?.status === 403) {
      snackbarStore.addSnackbar({ text: 'Bu işlemi yalnızca hesap sahibi veya yöneticisi gerçekleştirebilir.', color: 'error' });
    } else {
      snackbarStore.addSnackbar({ text: res?.message || 'Plan işlemi başlatılamadı -- lütfen tekrar deneyin.', color: 'error' });
    }
  } finally {
    checkingOutCode.value = null;
  }
}

// ADR-0014 S4b: `/subscription?plan=<kod>` (kayıt sonrası). Parametre yalnızca izinli plan kodu kümesindense
// (registerIntent.ts) VE API'nin döndüğü planlar arasında varsa kabul edilir; mevcut aktif plan önerilmez.
const suggestedPlanCode = ref<string | null>(null);
const suggestedPlan = computed<Plan | null>(() => {
  const plan = plans.value.find(p => p.code === suggestedPlanCode.value);
  if (!plan || (isCurrentPlan(plan) && isActiveLike.value)) return null;
  return plan;
});
const applyParameters = (parameters: any) => {
  const code = parameters?.plan;
  if (isRegisterPlanCode(code)) suggestedPlanCode.value = code;
};
const initialize = (parameters?: any) => applyParameters(parameters);
const activate = (parameters?: any) => applyParameters(parameters);
defineExpose({ initialize, activate });

onMounted(() => {
  fetchPlans();
  fetchSubscription();
});
</script>

<style scoped lang="scss">
.subscriptionView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
  background: var(--ek-color-background);
}

.subscription-inner {
  max-width: 1100px;
  margin: 0; /* Aşama 4: sayfa ızgarasına sola hizalı */
  padding: var(--ek-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0 0 var(--ek-space-4) 0;
}

.section-title-row .section-title {
  margin: 0;
}

.section-title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0 0 var(--ek-space-4) 0;
}

.status-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border-radius: var(--ek-radius-lg);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.status-banner--success { background: var(--ek-color-success-subtle); border-color: var(--ek-color-success); }
.status-banner--info { background: var(--ek-color-info-subtle); border-color: var(--ek-color-info); }
.status-banner--warning { background: var(--ek-color-warning-subtle); border-color: var(--ek-color-warning); }
.status-banner--error { background: var(--ek-color-error-subtle); border-color: var(--ek-color-error); }
.status-banner--grey { background: var(--ek-color-surface-sunken); border-color: var(--ek-color-border-default); }
.status-banner--loading { align-items: center; }

.status-banner-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  flex-grow: 1;
}

.status-banner-title {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-md);
}

.status-banner-text {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  line-height: var(--ek-line-height-normal);
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--ek-space-6);
}

.plan-card-skeleton {
  border-radius: var(--ek-radius-lg);
  min-height: 320px;
}

.plan-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  transition: border-color var(--ek-motion-reveal), box-shadow var(--ek-motion-reveal);
}

.plan-card:hover {
  border-color: var(--ek-color-primary);
  box-shadow: var(--ek-shadow-md);
}

.plan-card--current,
.plan-card--suggested {
  border-color: var(--ek-color-primary);
  border-width: 2px;
}

.suggested-plan-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-info-subtle);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  line-height: var(--ek-line-height-normal);
}

.plan-card-ribbon {
  position: absolute;
  top: var(--ek-space-3);
  right: var(--ek-space-3);
  /* FR2-DARK: aksiyon zemini + eşleşik kontrast metni (iki temada AA). */
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  padding: 2px var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
}

.plan-card-name {
  font-size: var(--ek-font-size-xl);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
  margin: 0;
}

.plan-card-price {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
}

.price-amount {
  font-size: var(--ek-font-size-2xl);
  font-weight: var(--ek-font-weight-bold);
  color: var(--ek-color-content-strong);
}

.price-note {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.plan-card-limits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.plan-card-limits li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}

.plan-card-features {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.plan-card-action {
  /* Vuetify `.v-btn--block` `flex: 1 0 auto` taşır; dikey flex kartta düğmeyi boş alan kadar UZATIYORDU
     (kısa içerikli kartta ~80px düğme). Düğme kendi yüksekliğinde, kartın dibine yaslı. */
  flex: 0 0 auto;
  height: var(--ek-control-h-lg);
}

.checkout-url {
  word-break: break-all;
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
}

@media (max-width: 767px) {
  .subscription-inner {
    padding: var(--ek-space-4);
    gap: var(--ek-space-4);
  }

  .plans-grid {
    grid-template-columns: 1fr;
  }
}
</style>
