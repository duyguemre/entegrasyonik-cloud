import type { IApplicationDB } from '@interfaces/index';
import plansSeed from '../../database/application/seed/plans.seed.json';

/**
 * ADR-0008 §3 (durum makinesi: `trialing` = kayıt, 14 gün, KARTSIZ, plan limiti = Başlangıç) + ADR-0014 S4a.
 * Yeni bir tenant için `trialing` abonelik kaydı açar. `TenantProvisioningService.provision()` içinden ("subscription" adımı,
 * ACTIVE'den ÖNCE) çağrılır → hem `SecurityService.register` hem `AdminService.createClient` aynı noktadan geçer.
 *
 * Deneme planı/süresi tek doğruluk kaynağı seed dosyasındaki `trial` bloğudur (`plans.seed.json`; fiyat/limit gibi bu değerler
 * de ÖNERİDİR, insan kararı bekler). Plan belgesi `Plans` koleksiyonunda henüz yoksa (seed çalıştırılmamış) sürüm seed dosyasından
 * alınır ve uyarı loglanır — kayıt akışı seed'e bağımlı DEĞİLDİR; limitler `EntitlementService` tarafından plan belgesi gelince uygulanır.
 *
 * İDEMPOTENT: yalnızca `$setOnInsert` — yeniden deneme (PROVISIONING_FAILED devamı) veya eşzamanlı `startCheckout` upsert'i
 * mevcut aboneliği/deneme bitişini EZMEZ ve deneme süresini uzatmaz. Kart verisi/sağlayıcı referansı YOK (kartsız deneme).
 */

export interface TrialConfig { planCode: string; days: number; planVersion: number }

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTrialConfig(): TrialConfig {
    const trial = (plansSeed as any).trial;
    const plan = ((plansSeed as any).plans as any[]).find(p => p.code === trial.planCode);
    if (!plan) throw new Error(`plans.seed.json: trial.planCode "${trial.planCode}" plans içinde yok.`);
    return { planCode: trial.planCode, days: trial.days, planVersion: plan.version };
}

/** Kayıt anında sağlayıcı henüz kullanılmaz (kartsız deneme); yalnızca `Subscriptions.provider` (zorunlu alan) için yapılandırılmış ad. */
function configuredProviderName(): string {
    return (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase() || 'mock';
}

export async function ensureTrialSubscription(
    applicationDB: IApplicationDB,
    clientId: number,
    now: Date = new Date(),
): Promise<{ created: boolean; planCode: string; trialEndsAt: Date }> {
    const cfg = getTrialConfig();
    const trialEndsAt = new Date(now.getTime() + cfg.days * DAY_MS);

    let planVersion = cfg.planVersion;
    const planDoc: any = await applicationDB.getPlanModel().findOne({ code: cfg.planCode }).lean();
    if (planDoc && Number.isInteger(planDoc.version)) {
        planVersion = planDoc.version;
    } else {
        console.warn(`[TenantProvisioning] "${cfg.planCode}" plan belgesi Plans koleksiyonunda yok (npm run seed:plans çalıştırılmamış olabilir); deneme aboneliği seed sürümüyle açılıyor.`);
    }

    const res: any = await applicationDB.getSubscriptionModel().updateOne(
        { clientId },
        {
            $setOnInsert: {
                clientId,
                planCode: cfg.planCode,
                planVersion,
                status: 'trialing',
                trialEndsAt,
                currentPeriodStart: now,
                currentPeriodEnd: trialEndsAt,
                cancelAtPeriodEnd: false,
                billingExempt: false,
                provider: configuredProviderName(),
            },
        },
        { upsert: true },
    );
    const created = !!res && (res.upsertedCount > 0 || !!res.upsertedId);
    return { created, planCode: cfg.planCode, trialEndsAt };
}
