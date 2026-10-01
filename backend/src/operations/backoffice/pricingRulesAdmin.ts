// PRC-R2 (K19, K2): backoffice fiyat kuralları görünümü — platform kill-switch durumu + kural/öneri İSTATİSTİKLERİ (yalnız TOPLAM).
// Tenant verisi GÖSTERİLMEZ: tenant adı/numarası, SKU, fiyat, kural değeri dönmez; yalnız sayaçlar. Sayaçlar hiçbir fiyat kararına
// girmez (K2/K5: tenant'lar arası veri motora taşınmaz; bu fonksiyon motor tarafından çağrılmaz). Kill-switch (`features.pricingRules`)
// MEVCUT `_platform` taslak → yayın akışıyla değişir (ADR-0031; gerekçe/geçmiş/geri alma oradan) — burada yeni yazma yolu YOK.
import { getSettingDef } from '@integration/config/catalog';
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { DatabaseManagerInstance } from '@database/DatabaseManager';

export interface PricingRulesAdminDeps {
    /** Aktif tenant'ların ClientDB tutamakları (tenant kimliği DÖNÜŞE GİRMEZ). */
    tenantDbs(): AsyncIterable<any>;
    flagEnabled(): boolean;
    now?: () => Date;
}

/** Tek çağrıda taranan en çok tenant (sistem yükü); aşılırsa `truncated:true`. */
export const OVERVIEW_TENANT_LIMIT = 1000;
const DAY = 86_400_000;
const FLAG_KEY = 'features.pricingRules';

export async function getPricingRulesOverview(d: PricingRulesAdminDeps) {
    const now = (d.now ?? (() => new Date()))();
    const since7d = new Date(now.getTime() - 7 * DAY);
    const t = {
        scannedTenants: 0, tenantsEnabled: 0, tenantsWithRules: 0,
        rules: { total: 0, enabled: 0, pausedExternal: 0, pausedOscillation: 0 },
        suggestions: { open: 0, blocked: 0, applied7d: 0, dismissed7d: 0 },
        failedTenants: 0, truncated: false,
    };
    for await (const db of d.tenantDbs()) {
        if (t.scannedTenants >= OVERVIEW_TENANT_LIMIT) { t.truncated = true; break; }
        t.scannedTenants++;
        try {
            const [settings, rules, sugg] = await Promise.all([
                db.getPricingSettingsModel().findOne({ _id: 'pricing' }, { enabled: 1 }).lean(),
                db.getPriceRuleModel().aggregate([{ $group: { _id: { e: '$enabled', p: '$pausedReason' }, n: { $sum: 1 } } }]).option({ maxTimeMS: 5000 }),
                db.getPriceSuggestionModel().aggregate([
                    { $match: { $or: [{ current: true }, { updatedAt: { $gte: since7d }, status: { $in: ['applied', 'dismissed'] } }] } },
                    { $group: { _id: '$status', n: { $sum: 1 } } },
                ]).option({ maxTimeMS: 5000 }),
            ]);
            if (settings?.enabled) t.tenantsEnabled++;
            let any = false;
            for (const r of rules as any[]) {
                any = true;
                t.rules.total += r.n;
                if (r._id.e) t.rules.enabled += r.n;
                if (r._id.p === 'external_change') t.rules.pausedExternal += r.n;
                if (r._id.p === 'oscillation') t.rules.pausedOscillation += r.n;
            }
            if (any) t.tenantsWithRules++;
            for (const s of sugg as any[]) {
                if (s._id === 'open') t.suggestions.open += s.n;
                else if (s._id === 'blocked') t.suggestions.blocked += s.n;
                else if (s._id === 'applied') t.suggestions.applied7d += s.n;
                else if (s._id === 'dismissed') t.suggestions.dismissed7d += s.n;
            }
        } catch {
            t.failedTenants++;
        }
    }
    const def = getSettingDef(FLAG_KEY);
    return {
        killSwitch: { key: FLAG_KEY, enabled: d.flagEnabled(), label: def?.label ?? null, help: def?.help ?? null },
        /** Otomatik (insan onaysız) uygulama yolu bu sürümde YOKTUR (PRC-R3 avukat yanıtını bekliyor). */
        autoApply: { available: false, reason: 'PRC-R3' },
        at: now.toISOString(),
        ...t,
    };
}

/** Üretim bağımlılıkları: aktif tenant'ların ClientDB'leri sırayla açılır (kimlik dönüşe girmez). */
export function pricingRulesOverviewDeps(applicationDB: any): PricingRulesAdminDeps {
    return {
        flagEnabled: () => isFeatureEnabled('pricingRules'),
        async *tenantDbs() {
            const rows: any[] = await applicationDB.getClientModel().find({ status: 'ACTIVE' }, { order: 1 }).limit(OVERVIEW_TENANT_LIMIT + 1).maxTimeMS(5000).lean();
            for (const r of rows) {
                const n = Number(r.order);
                if (!Number.isInteger(n) || n <= 0) continue;
                const db = await DatabaseManagerInstance.getClientDB(n).catch(() => undefined);
                if (db) yield db;
            }
        },
    };
}
