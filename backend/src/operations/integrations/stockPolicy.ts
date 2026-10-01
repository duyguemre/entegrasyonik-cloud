import { ClientIntegrationRepository } from '@database/repositories/tenant/ClientIntegrationRepository';
import { ApplicationError } from '@platform/core/security/Security';
import { AuditLogger } from '@services/audit/AuditLogger';
import {
    AUTO_CANCEL_SUPPORTED_CHANNELS, STOCK_POLICY_DEFAULTS, STOCK_POLICY_LIMITS, StockPolicyValidationError,
    pickChannelStockPolicy, pickLowStockThreshold, validateChannelStockPolicyPatch, validateIntegrationCode, validateLowStockThreshold,
} from '@operations/stock/stockPolicyValidation';
import { IntegrationSettingsDeps, dropFactoryCache } from './settings';

// ------------------------------------------------------------------------------------------------------------
// [N5 / ADR-0004 Karar 1/5/6/7] STOK POLİTİKASI UÇLARI (docs/API_TENANT_SURFACE.md §1). Kademe: admin (OPERATION_POLICY).
// `settings`'in diğer alanlarını EZMEZ: yalnızca `marketplace.$.settings.stockPolicy.<alan>` noktalı yollarına atomik
// `$set/$unset` yapılır (oku-değiştir-yaz YOK; sır alanlarına/`SELLERID` vb. dokunulmaz). Tenant kapsamı: clientDB zaten tenant DB'sidir.
// ADR-0024 P3-INT: eski `IntegrationService` gövdesi; davranış BİREBİR.
// ------------------------------------------------------------------------------------------------------------

function stockPolicyError(e: any): never {
    if (e instanceof StockPolicyValidationError) throw new ApplicationError(e.message, 400);
    throw e;
}

function buildUpdate($set: any, $unset: any): any {
    const update: any = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    return update;
}

/** Tenant birincil kanalı + kanal başına politika (yalnızca bilinen alanlar) + ADR varsayılanları/sınırları. */
export async function getStockPolicy(deps: Pick<IntegrationSettingsDeps, 'clientDB'>): Promise<any> {
    const doc: any = await new ClientIntegrationRepository(deps.clientDB).findDoc();
    const marketplaces: any[] = (Array.isArray(doc?.marketplace) ? doc.marketplace : []).filter((m: any) => m && typeof m.code === 'string');
    const configured: string | null = typeof doc?.stockPolicy?.primaryChannel === 'string' && doc.stockPolicy.primaryChannel ? doc.stockPolicy.primaryChannel : null;
    // StockPublishTrigger.resolvePrimaryChannel ile AYNI kural: yapılandırılmış varsa o; yoksa en küçük `order`
    const sorted = [...marketplaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const effective = configured ?? sorted[0]?.code ?? null;
    return {
        primaryChannel: configured,
        lowStockThreshold: pickLowStockThreshold(doc?.stockPolicy?.lowStockThreshold),
        effectivePrimaryChannel: effective,
        primaryChannelIsConnected: configured === null ? true : marketplaces.some(m => m.code === configured),
        channels: sorted.map(m => ({
            integrationCode: m.code,
            order: m.order ?? null,
            enabled: m.status !== false,
            isPrimary: m.code === effective,
            autoCancelSupported: AUTO_CANCEL_SUPPORTED_CHANNELS.includes(String(m.code).toLowerCase()),
            stockPolicy: pickChannelStockPolicy(m.settings?.stockPolicy),
        })),
        defaults: STOCK_POLICY_DEFAULTS,
        limits: STOCK_POLICY_LIMITS,
    };
}

/**
 * Tenant düzeyi stok politikası: `primaryChannel` (`null|''` = temizle; varsayılan: ilk bağlanan pazaryeri) ve/veya
 * `lowStockThreshold` (tamsayı; `null` = temizle/kapat, varsayılan YOK = düşük stok bildirimi kapalı). En az biri zorunludur.
 */
export async function saveTenantStockPolicy(deps: IntegrationSettingsDeps, raw: unknown, rawLow: unknown): Promise<any> {
    if (raw === undefined && rawLow === undefined) throw new ApplicationError('primaryChannel zorunludur (temizlemek için null).', 400);
    const clear = raw === null || raw === '';
    let code: string | undefined;
    if (raw !== undefined && !clear) {
        try { code = validateIntegrationCode(raw); } catch (e) { stockPolicyError(e); }
    }
    let low: number | null | undefined;
    if (rawLow !== undefined) {
        try { low = validateLowStockThreshold(rawLow); } catch (e) { stockPolicyError(e); }
    }

    // Var olmayan/bağlı olmayan pazaryeri koda atanamaz: filtre aynı zamanda varlık korumasıdır (atomik)
    const filter: any = raw !== undefined && !clear ? { 'marketplace.code': code } : {};
    const $set: any = {};
    const $unset: any = {};
    if (raw !== undefined) { if (clear) $unset['stockPolicy.primaryChannel'] = ''; else $set['stockPolicy.primaryChannel'] = code; }
    if (low !== undefined) { if (low === null) $unset['stockPolicy.lowStockThreshold'] = ''; else $set['stockPolicy.lowStockThreshold'] = low; }
    const updated: any = await new ClientIntegrationRepository(deps.clientDB).updateOne(filter, buildUpdate($set, $unset));
    if (!updated) throw new ApplicationError(raw !== undefined && !clear ? 'Belirtilen pazaryeri bağlı değil.' : 'Entegrasyon ayarları bulunamadı.', raw !== undefined && !clear ? 400 : 404);

    if (raw !== undefined) void AuditLogger.fromRequest(deps.request, 'stock.policy.primary', 'ok', { primaryChannel: clear ? '(cleared)' : code });
    if (low !== undefined) void AuditLogger.fromRequest(deps.request, 'stock.policy.lowStock', 'ok', { lowStockThreshold: low === null ? '(cleared)' : low });
    const now = updated.stockPolicy?.primaryChannel;
    return {
        primaryChannel: typeof now === 'string' && now ? now : null,
        ...(rawLow !== undefined ? { lowStockThreshold: pickLowStockThreshold(updated.stockPolicy?.lowStockThreshold) } : {}),
    };
}

/**
 * Kanal başına stok politikası (kısmi/patch): yalnızca gelen alanlar yazılır, `null` alanı varsayılana döndürür.
 * Doğrulama: stockPolicyValidation (aralık/tip/bilinmeyen anahtar => 400). Yalnızca `marketplace` tipi kanallar.
 */
export async function saveChannelStockPolicy(deps: IntegrationSettingsDeps, rawCode: unknown, rawPolicy: unknown): Promise<any> {
    let code: string = '';
    let patch: ReturnType<typeof validateChannelStockPolicyPatch> = { set: {}, unset: [] };
    try {
        code = validateIntegrationCode(rawCode);
        patch = validateChannelStockPolicyPatch(rawPolicy);
    } catch (e) { stockPolicyError(e); }

    const $set: any = {};
    const $unset: any = {};
    for (const [k, v] of Object.entries(patch.set)) $set[`marketplace.$.settings.stockPolicy.${k}`] = v;
    for (const k of patch.unset) $unset[`marketplace.$.settings.stockPolicy.${k}`] = '';

    const updated: any = await new ClientIntegrationRepository(deps.clientDB).updateOne({ 'marketplace.code': code }, buildUpdate($set, $unset));
    if (!updated) throw new ApplicationError('Belirtilen pazaryeri bağlı değil.', 404);
    dropFactoryCache(deps.clientId, code);
    const item = (updated.marketplace || []).find((m: any) => m.code === code);

    void AuditLogger.fromRequest(deps.request, 'stock.policy.channel', 'ok', {
        integrationCode: code, ...patch.set, reset: patch.unset.join(','),
    });
    return { integrationCode: code, stockPolicy: pickChannelStockPolicy(item?.settings?.stockPolicy) };
}
