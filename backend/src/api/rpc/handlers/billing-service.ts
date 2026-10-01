import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { getPaymentProvider } from '@services/billing/PaymentProviderFactory'
import { EntitlementService } from '@services/billing/EntitlementService'
import type { BillingInterval } from '@services/billing/PaymentProvider'

// ADR-0008 "Etki Alanı": "Frontend: gerçek abonelik/plan ekranı (SubscriptionView.vue yer
// tutucusunun yerine)". Aşama A (bkz. BACKLOG.md C16) yalnızca İÇ katmanları (PaymentProvider
// portu/MockPaymentProvider/EntitlementService/webhook rotası) kurdu; jenerik RPC katmanında bu
// katmanları TÜKETEN bir servis YOKTU. Bu dosya o boşluğu MEKANİK biçimde kapatır -- mevcut 25+
// servisle AYNI ApiWrapper/RunOperation deseni (BaseApi.clientId/request, `this.applicationDB`;
// Plans/Subscriptions ApplicationDB'de tutulur, ADR §2 -- `this.clientDB` KULLANILMAZ).
//
// Kapsam (Faz 3, ADR-0008 frontend SONUÇ notu): yalnızca OKUMA (getPlans/getMySubscription) +
// checkout BAŞLATMA (startCheckout). cancel/changePlan/webhook yönetimi admin paneli/ayrı
// görevdir (ADR "Etki Alanı": "admin paneli abonelik yönetimi (Faz 3)" -- BU görev DEĞİL).
//
// Erişim kararı ASLA burada yeniden İCAT EDİLMEZ: `getMySubscription` durum->erişim eşlemesini
// (read/write/engine) `EntitlementService.checkAccess` ile hesaplar -- ADR §3 "Uygulama noktası
// TEK yerdir" ilkesi (a) API guard'ı, (b) IntegrationEngine, (c) MCP ile AYNI karar motorunu
// kullanır; bu servis KENDİ boole mantığını yazmaz.
export default class BillingService extends BaseApi implements IService {

    /**
     * `IService.get?()` -- diğer TÜM kayıtlı servislerde (ör. `NotificationService.get`) olduğu gibi
     * yalnızca TypeScript'in yapısal "zayıf tip" denetimini karşılamak için tanımlı (aksi halde
     * `IBaseMicroservice`'e atama derleme hatası verir, çünkü `IService`'in TEK üyesi budur).
     * Jenerik RPC ile KAYITLI DEĞİL (`operationPolicy.ts`) -- `getPlans`/`getMySubscription`/
     * `startCheckout` dışında hiçbir çağrı yolu YOK.
     */
    async get(): Promise<any> {
        return this.getPlans();
    }

    /**
     * Satışa açık VE tanıtım/uygulama yüzeyinde görünür planlar (ADR §2: `active && public`).
     * Fiyat/limit DEĞERLERİ ADR-0008 §2 tablosundaki İNSAN KARARI BEKLEYEN ÖNERİDİR -- bu metot
     * hiçbir sabit değer üretmez, yalnızca `Plans` koleksiyonunu okur (seed AYRI bir görevdir,
     * BACKLOG.md). Koleksiyon boşsa (henüz seed edilmemiş) boş dizi döner -- bu bir HATA değil,
     * FE'nin "plan tanımları henüz yayınlanmadı" boş-durumuyla karşılanır.
     */
    async getPlans(): Promise<any> {
        try {
            const plans = await this.applicationDB.getPlanModel()
                .find({ active: true, public: true })
                .sort({ priceMinor: 1 })
                .lean();
            return { result: true, plans };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Mevcut tenant'ın abonelik durumu + plan detayı + hesaplanmış erişim (ADR §3 durum
     * makinesi). Abonelik kaydı hiç yoksa (migration/register akışı Aşama A kapsamında DEĞİL,
     * bkz. BACKLOG.md C16 "kapsam dışı") `subscription: null` + `status: 'no_subscription'`
     * döner -- FE bunu "aboneliğiniz yok, bir plan seçin" durumuyla karşılar (HATA değil).
     */
    async getMySubscription(): Promise<any> {
        try {
            const sub: any = await this.applicationDB.getSubscriptionModel()
                .findOne({ clientId: this.clientId })
                .lean();

            if (!sub) {
                return {
                    result: true,
                    subscription: null,
                    plan: null,
                    status: 'no_subscription',
                    access: { read: true, write: false, engine: false },
                };
            }

            const plan: any = sub.planCode
                ? await this.applicationDB.getPlanModel().findOne({ code: sub.planCode }).lean()
                : null;

            const [readDecision, writeDecision, engineDecision] = await Promise.all([
                EntitlementService.checkAccess(this.clientId, 'read'),
                EntitlementService.checkAccess(this.clientId, 'write'),
                EntitlementService.checkAccess(this.clientId, 'engine'),
            ]);

            return {
                result: true,
                subscription: {
                    planCode: sub.planCode,
                    planVersion: sub.planVersion,
                    status: sub.status,
                    trialEndsAt: sub.trialEndsAt,
                    currentPeriodStart: sub.currentPeriodStart,
                    currentPeriodEnd: sub.currentPeriodEnd,
                    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                    graceUntil: sub.graceUntil,
                    billingExempt: sub.billingExempt,
                    cardLast4: sub.cardLast4,
                    cardBrand: sub.cardBrand,
                },
                plan: plan ? {
                    code: plan.code, name: plan.name, priceMinor: plan.priceMinor, currency: plan.currency,
                    interval: plan.interval, vatIncluded: plan.vatIncluded, limits: plan.limits, features: plan.features,
                } : null,
                status: sub.status,
                access: { read: readDecision.allowed, write: writeDecision.allowed, engine: engineDecision.allowed },
                // Banner için TEK bir insan-okunabilir gerekçe: en kısıtlı (en "gerçek") boyuttan.
                reason: (!readDecision.allowed && readDecision.reason) || (!writeDecision.allowed && writeDecision.reason) || (!engineDecision.allowed && engineDecision.reason) || undefined,
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * ADR-0008 §1 `createCheckout` -- yalnızca `mock` sağlayıcı (Aşama A kapsamı,
     * `PaymentProviderFactory` `iyzico` için fail-fast). Gerçek bir hosted checkout SAYFASI YOK
     * (görev talimatı: "gerçek ödeme formu GEREKMİYOR"); dönen `checkoutUrl` FE'de bilgilendirme
     * amaçlı gösterilir.
     *
     * Sağlayıcı referansını (`providerSubscriptionRef`) `Subscriptions`'a YAZAR (upsert) ki
     * webhook (`BillingWebhookApiManager`, `{provider, providerSubscriptionRef}` ile arar)
     * DAHA SONRA bu kaydı bulabilsin -- register/createClient'ın 'trialing' abonelik açması
     * Aşama A kapsamı DIŞINDA kaldığından (BACKLOG.md C16), bu uç aynı zamanda o eksik kaydı
     * (varsa yalnızca EKSİK alanları doldurarak) tamamlar. Mevcut durum/dönem alanları EZİLMEZ
     * (`$setOnInsert`) -- doğruluk kaynağı webhook'un `getSubscription` ile çektiği kanonik
     * değerdir (ADR §4).
     */
    async startCheckout(): Promise<any> {
        try {
            const { planCode, billingInterval } = this.request as { planCode?: string; billingInterval?: BillingInterval };
            if (!planCode || typeof planCode !== 'string') {
                return { result: false, message: 'Lütfen bir plan seçin.' };
            }

            const plan: any = await this.applicationDB.getPlanModel().findOne({ code: planCode, active: true }).lean();
            if (!plan) {
                return { result: false, message: 'Seçilen plan artık satışa açık değil -- lütfen sayfayı yenileyip tekrar deneyin.' };
            }

            // ADR-0014 S4a: `priceMinor === 0` = "Özel teklif" (Kurumsal; seed'de limitler limitOverrides ile belirlenir) --
            // self-servis checkout başlatılamaz (0 TL'ye abonelik oluşmasın); satış görüşmesi/iletişim akışına yönlendirilir.
            if (!(typeof plan.priceMinor === 'number' && plan.priceMinor > 0)) {
                return { result: false, message: 'Bu plan için özel teklif gerekiyor -- lütfen bizimle iletişime geçin.' };
            }

            const interval: BillingInterval = billingInterval === 'year' ? 'year' : 'month';
            const provider = getPaymentProvider();
            const checkout = await provider.createCheckout(this.clientId, planCode, interval);

            await this.applicationDB.getSubscriptionModel().updateOne(
                { clientId: this.clientId },
                {
                    $set: {
                        planCode,
                        planVersion: plan.version,
                        provider: provider.name,
                        providerSubscriptionRef: checkout.providerRef,
                    },
                    $setOnInsert: { status: 'trialing' },
                },
                { upsert: true },
            );
            EntitlementService.invalidate(this.clientId);

            return { result: true, checkoutUrl: checkout.checkoutUrl, formToken: checkout.formToken, providerRef: checkout.providerRef };
        } catch (error) {
            throw error;
        }
    }
}
