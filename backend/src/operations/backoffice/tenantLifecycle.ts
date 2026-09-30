// Backoffice B2 (plan §2.2): tenant yaşam döngüsü görünümü. SAF/salt okunur; tenant iş verisi (ürün/sipariş/kullanıcı) DÖNMEZ.
// Kaynaklar: Clients (durum, silme talebi, provisioning), Subscriptions (deneme), AuditLogs (son etkinlik: yalnız olay adı/zaman/sonuç; meta yok).
import { ApplicationError } from '@platform/core/errors';

export const QUERY_MAX_TIME_MS = 5000;
export const RECENT_EVENTS_LIMIT = 10;
/** TenantProvisioningService.provision() adım sırası (TenantProvisioningService.ts `step = ...`). */
export const PROVISIONING_STEPS = ['client', 'order-limit', 'central-user', 'tenant-seed', 'tenant-user', 'subscription', 'activate'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LifecycleDeps { clientModel: any; subscriptionModel: any; auditModel: any; now?: () => Date }

export function provisioningSteps(client: any): Array<{ step: string; state: 'done' | 'failed' | 'pending' | 'running' }> {
    const status = client?.status;
    const failedStep: string | undefined = client?.provisioning?.failedStep;
    if (status !== 'PROVISIONING' && status !== 'PROVISIONING_FAILED') return PROVISIONING_STEPS.map(step => ({ step, state: 'done' as const }));
    const idx = failedStep ? PROVISIONING_STEPS.indexOf(failedStep as any) : -1;
    return PROVISIONING_STEPS.map((step, i) => {
        if (status === 'PROVISIONING_FAILED' && idx >= 0) return { step, state: i < idx ? 'done' as const : i === idx ? 'failed' as const : 'pending' as const };
        // Adım bilgisi yok (çalışıyor ya da adım yazılamadı): tamamlanan adım bilinmez -> hepsi 'pending', durumu üst alan söyler.
        return { step, state: 'pending' as const };
    });
}

export async function getTenantLifecycle(d: LifecycleDeps, tid: number): Promise<any> {
    if (!Number.isInteger(tid) || tid <= 0) throw new ApplicationError('tid: pozitif tam sayı olmalı', 400, 'VALIDATION');
    const now = (d.now ?? (() => new Date()))();
    const client: any = await d.clientModel.findOne({ order: tid }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    if (!client) throw new ApplicationError('Mağaza bulunamadı.', 404, 'NOT_FOUND');
    const [sub, events]: [any, any[]] = await Promise.all([
        d.subscriptionModel.findOne({ clientId: client.clientId ?? tid }).maxTimeMS(QUERY_MAX_TIME_MS).lean(),
        d.auditModel.find({ tid }).sort({ at: -1 }).limit(RECENT_EVENTS_LIMIT).maxTimeMS(QUERY_MAX_TIME_MS).lean(),
    ]);

    const scheduled: Date | undefined = client.deletionScheduledAt ? new Date(client.deletionScheduledAt) : undefined;
    const trialEndsAt: Date | undefined = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : undefined;
    return {
        tid,
        status: client.status,
        name: client.title ?? null,
        lastSuccessfulOrderSync: client.lastSuccessfulOrderSync ?? null,
        trial: sub ? {
            subscriptionStatus: sub.status,
            planCode: sub.planCode,
            trialEndsAt: trialEndsAt ?? null,
            daysLeft: sub.status === 'trialing' && trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS)) : null,
            billingExempt: sub.billingExempt === true,
        } : null,
        deletion: client.status === 'DELETION_PENDING' || client.status === 'PURGING' || client.status === 'PURGE_FAILED' || client.status === 'PURGED' || scheduled ? {
            requestedAt: client.deletionRequestedAt ?? null,
            requestedBy: client.deletionRequestedBy ?? null,
            scheduledAt: scheduled ?? null,
            daysUntilPurge: client.status === 'DELETION_PENDING' && scheduled ? Math.max(0, Math.ceil((scheduled.getTime() - now.getTime()) / DAY_MS)) : null,
            canCancel: client.status === 'DELETION_PENDING',
            purgedAt: client.purgedAt ?? null,
            purgeFailedStep: client.purgeFailedStep ?? null,
        } : null,
        provisioning: {
            steps: provisioningSteps(client),
            startedAt: client.provisioning?.startedAt ?? null,
            failedAt: client.provisioning?.failedAt ?? null,
            failedStep: client.provisioning?.failedStep ?? null,
        },
        recentEvents: events.map(e => ({ at: e.at, event: e.event, result: e.result, actorType: e.actorType ?? null, surface: e.surface ?? null, imp: e.imp === true })),
    };
}
