import { DatabaseManagerInstance } from "@database/index";
import { RedisService } from "@services/redis/RedisService";
import { EntitlementService } from "@services/billing/EntitlementService";
import { NotificationService } from "@services/notification/NotificationService";
import { PLATFORM_PROCESS } from "@interfaces/index";

/**
 * ADR-0008 §3 durum makinesi: `trialing` (14 gün, kartsız) -> deneme bitti + ödeme yok -> `suspended`
 * ("suspended | grace doldu / deneme bitti ödeme yok"). Bu iş yalnızca `trialing` -> `suspended` geçişini yapar:
 *  - `expired` ADR'de "iptal/askı + 30 gün" sonrasıdır ve silme kararına (KVKK, insan onayı) bağlıdır; deneme bitişinde
 *    doğrudan `expired`'e geçmek geri dönüşü zorlaştırır (en muhafazakâr yorum = `suspended`). `suspended` durumunda
 *    başarılı ödeme webhook'u anında `active` yapar (ADR §3 "Kurtarma"), yani deneme sonu dönüşüm yolu açık kalır.
 *  - `billingExempt` (legacy) tenant'lara ASLA dokunulmaz (hem aday sorgusunda hem atomik guard'da filtrelenir).
 *
 * Çok replika/yeniden çalışma güvenliği: geçiş tenant başına tek bir atomik `findOneAndUpdate`'tir; filtre "hâlâ
 * trialing + billingExempt değil + trialEndsAt <= şimdi" koşulunu taşır -> iki pod/iki tur aynı tenant'ı ikinci kez
 * geçiremez (ikinci çağrı `null` döner, sessizce sayılır). Yarış/yeniden deneme durumunda süre uzatma veya
 * durum ezme OLMAZ (kaydın `trialEndsAt`'i değiştirilmişse guard eşleşmez).
 *
 * Denetim kaydı: `BillingEvents` (ADR §2: "Fatura dışa aktarma kaynağı da budur"; `provider+providerEventId` unique ->
 * idempotency). Anahtar `trial-expired:<clientId>:<trialEndsAt ms>` -> aynı deneme için en fazla bir kayıt.
 * [BİLİNEN SINIRLAMA] Geçiş ile denetim kaydı iki ayrı yazımdır (çoklu-belge işlem yok, ADR-0008 "1 günlük cron"
 * ölçeği); iki yazma arasında süreç çökerse geçiş kalıcıdır ama denetim kaydı/bildirim o tenant için yazılmaz.
 * Geçiş kaydı zaten `Subscriptions.updatedAt` ile izlenebilir; bu pencere bilinçli kabul edildi.
 *
 * ADR §3 risk notu: "askıya almadan 3 gün önce ve askı anında e-posta + uygulama içi bildirim". Uygulama içi bildirim
 * mevcut `NotificationService.sendClientNotification` deseniyle (OversellCompensationJob ile aynı) gönderilir;
 * e-posta (MailService) bu görevin kapsamı DIŞINDA (ayrı iş). 3 gün önceki uyarı da `BillingEvents` idempotency
 * anahtarıyla (`trial-ending-warning:<clientId>:<trialEndsAt ms>`) TEK SEFERLİK yapılır.
 *
 * Redis kapalıyken tur ATLANIR (AllocationSweepJob / ADR-0005 Karar 2 ile AYNI kapı): iş DB-only olsa da arka plan
 * zamanlayıcılarının tek bir aç/kapa sözleşmesi vardır.
 */

export interface TrialExpiryRunResult {
    skipped: boolean;
    /** Süresi dolmuş `trialing` aday sayısı. */
    scanned: number;
    /** Bu turda gerçekten `suspended`'a geçirilen tenant sayısı. */
    suspended: number;
    /** Guard eşleşmedi (başka pod/tur önce geçirdi, ödeme geldi, süre değişti) — hata değil. */
    alreadyHandled: number;
    /** 3 gün önceki uyarısı bu turda gönderilen tenant sayısı. */
    warned: number;
    failed: number;
}

export class TrialExpiryJob {
    /** ADR-0008 §3 risk notu: "askıya almadan 3 gün önce". */
    public static readonly WARNING_LEAD_DAYS = 3;
    /** Bir turda işlenecek en fazla tenant (kalanı sonraki turda; `trialEndsAt` artan sırada). */
    public static readonly BATCH_LIMIT = 500;
    /** BillingEvents'te sistem kaynaklı denetim kayıtlarının sağlayıcı adı (gerçek bir ödeme sağlayıcısı değil). */
    public static readonly EVENT_PROVIDER = 'system';

    private static readonly DAY_MS = 24 * 60 * 60 * 1000;

    constructor(private readonly nowFn: () => Date = () => new Date()) {}

    public async run(): Promise<TrialExpiryRunResult> {
        const result: TrialExpiryRunResult = { skipped: false, scanned: 0, suspended: 0, alreadyHandled: 0, warned: 0, failed: 0 };

        if (!RedisService.isReady()) {
            console.warn('[TrialExpiryJob] Redis bağlı değil (isReady()=false); bu tur ATLANIYOR (ADR-0005 Karar 2 ile aynı desen).');
            return { ...result, skipped: true };
        }

        try {
            const now = this.nowFn();
            const applicationDB = await DatabaseManagerInstance.getApplicationDB();
            const subscriptionModel = applicationDB.getSubscriptionModel();
            const billingEventModel = applicationDB.getBillingEventModel();

            // 1) Süresi dolmuş denemeler -> suspended
            const due: any[] = await subscriptionModel
                .find({ status: 'trialing', billingExempt: { $ne: true }, trialEndsAt: { $lte: now } })
                .sort({ trialEndsAt: 1 })
                .limit(TrialExpiryJob.BATCH_LIMIT)
                .select('clientId trialEndsAt planCode')
                .lean();
            result.scanned = (due || []).length;

            for (const candidate of due || []) {
                try {
                    const transitioned = await this.suspendOne(subscriptionModel, billingEventModel, candidate.clientId, now);
                    if (transitioned) result.suspended++; else result.alreadyHandled++;
                } catch (error) {
                    result.failed++;
                    console.error(`[TrialExpiryJob] Tenant deneme sonu geçişi hatası (client=${candidate?.clientId}):`, error);
                }
            }

            // 2) Bitişine <= 3 gün kalan denemeler -> tek seferlik uyarı
            const warnUntil = new Date(now.getTime() + TrialExpiryJob.WARNING_LEAD_DAYS * TrialExpiryJob.DAY_MS);
            const ending: any[] = await subscriptionModel
                .find({ status: 'trialing', billingExempt: { $ne: true }, trialEndsAt: { $gt: now, $lte: warnUntil } })
                .sort({ trialEndsAt: 1 })
                .limit(TrialExpiryJob.BATCH_LIMIT)
                .select('clientId trialEndsAt planCode')
                .lean();

            for (const candidate of ending || []) {
                try {
                    if (await this.warnOne(billingEventModel, candidate, now)) result.warned++;
                } catch (error) {
                    result.failed++;
                    console.error(`[TrialExpiryJob] Tenant deneme sonu uyarısı hatası (client=${candidate?.clientId}):`, error);
                }
            }
        } catch (error) {
            console.error('[TrialExpiryJob] Tur genel hata:', error);
        }

        return result;
    }

    /** Atomik, guard'lı geçiş. `true` = bu çağrı geçirdi; `false` = guard eşleşmedi (zaten işlenmiş/uygun değil). */
    private async suspendOne(subscriptionModel: any, billingEventModel: any, clientId: number, now: Date): Promise<boolean> {
        const updated: any = await subscriptionModel.findOneAndUpdate(
            { clientId, status: 'trialing', billingExempt: { $ne: true }, trialEndsAt: { $lte: now } },
            { $set: { status: 'suspended' } },
            { new: true },
        ).lean();
        if (!updated) return false;

        // ADR §3 son paragraf: durum değişince ilgili tenant anahtarı silinir (60 sn TTL beklenmez).
        EntitlementService.invalidate(clientId);

        const trialEndsAt = new Date(updated.trialEndsAt);
        await this.writeAudit(billingEventModel, {
            providerEventId: `trial-expired:${clientId}:${trialEndsAt.getTime()}`,
            type: 'subscription.trial_expired',
            clientId,
            now,
            payloadRedacted: { from: 'trialing', to: 'suspended', reason: 'trial_expired', planCode: updated.planCode, trialEndsAt: trialEndsAt.toISOString() },
        });

        await this.notify(clientId, {
            severity: 'error',
            title: 'Deneme Süreniz Sona Erdi',
            message: 'Ücretsiz deneme süreniz sona erdiği için aboneliğiniz askıya alındı. Verilerinizi görüntüleyebilir ve dışa aktarabilirsiniz; '
                + 'ancak düzenleme yapılamaz ve pazaryerlerine stok/fiyat senkronizasyonu durur. Kesintisiz devam etmek için bir plan seçin.',
            metaData: { code: 'TRIAL_EXPIRED', planCode: updated.planCode, trialEndsAt: trialEndsAt.toISOString() },
        });
        return true;
    }

    /** Bitiş uyarısı; yalnızca BillingEvents idempotency anahtarı İLK KEZ yazılırsa bildirim gönderilir. */
    private async warnOne(billingEventModel: any, candidate: any, now: Date): Promise<boolean> {
        const clientId = candidate.clientId;
        const trialEndsAt = new Date(candidate.trialEndsAt);
        const outcome = await this.writeAudit(billingEventModel, {
            providerEventId: `trial-ending-warning:${clientId}:${trialEndsAt.getTime()}`,
            type: 'subscription.trial_ending_soon',
            clientId,
            now,
            payloadRedacted: { reason: 'trial_ending_soon', leadDays: TrialExpiryJob.WARNING_LEAD_DAYS, planCode: candidate.planCode, trialEndsAt: trialEndsAt.toISOString() },
        });
        // 'duplicate' = uyarı daha önce gönderilmiş; 'error' = denetim yazılamadı -> tekrar-gönderim (her 15 dk'da spam) riskine
        // girmemek için bu turda GÖNDERİLMEZ, DB düzelince sonraki turda denenir.
        if (outcome !== 'created') return false;

        await this.notify(clientId, {
            severity: 'warning',
            title: 'Deneme Süreniz Yakında Sona Erecek',
            message: `Ücretsiz deneme süreniz ${trialEndsAt.toISOString().slice(0, 10)} tarihinde sona erecek. Bir plan seçmezseniz aboneliğiniz askıya alınır ve `
                + 'pazaryerlerine stok/fiyat senkronizasyonu durur. Kesintisiz devam etmek için bir plan seçin.',
            metaData: { code: 'TRIAL_ENDING_SOON', planCode: candidate.planCode, trialEndsAt: trialEndsAt.toISOString() },
        });
        return true;
    }

    /** `created` = kayıt yeni yazıldı; `duplicate` = aynı idempotency anahtarı zaten var (unique indeks, E11000); `error` = başka hata (yutulur, loglanır; denetim best-effort). */
    private async writeAudit(billingEventModel: any, e: { providerEventId: string; type: string; clientId: number; now: Date; payloadRedacted: Record<string, any> }): Promise<'created' | 'duplicate' | 'error'> {
        try {
            await billingEventModel.create({
                provider: TrialExpiryJob.EVENT_PROVIDER,
                providerEventId: e.providerEventId,
                type: e.type,
                clientId: e.clientId,
                receivedAt: e.now,
                processedAt: e.now,
                status: 'processed',
                payloadRedacted: e.payloadRedacted,
            });
            return 'created';
        } catch (error: any) {
            if (error && error.code === 11000) return 'duplicate'; // idempotency: zaten yazılmış
            console.error(`[TrialExpiryJob] BillingEvent yazılamadı (client=${e.clientId}, type=${e.type}):`, error?.message);
            return 'error';
        }
    }

    private async notify(clientId: number, payload: { severity: 'warning' | 'error'; title: string; message: string; metaData: Record<string, any> }): Promise<void> {
        try {
            await NotificationService.sendClientNotification({
                clientId: String(clientId),
                notificationData: {
                    type: 'SYSTEM',
                    // Notification şeması `mode`u ZORUNLU tutar (PLATFORM_PROCESS enum'u); faturalama için BILLING eklendi.
                    mode: PLATFORM_PROCESS.BILLING,
                    severity: payload.severity,
                    title: payload.title,
                    message: payload.message,
                    actionUrl: '/subscription',
                    metaData: payload.metaData,
                },
            } as any);
        } catch (error) {
            console.error(`[TrialExpiryJob] Bildirim gönderilemedi (client=${clientId}):`, error);
        }
    }
}
