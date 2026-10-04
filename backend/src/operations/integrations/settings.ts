import { randomBytes } from 'crypto';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { clearIntegrationAttention } from '@database/repositories/app/integrationAttention';
import { SENSITIVE_MASK, isSecretField, maskClientIntegrationsDoc, encryptSecrets, maskIntegrationItem, resolveSecretsForWrite } from '@platform/core/security/integrationSecrets';
import { ApplicationError } from '@platform/core/security/Security';
import { stripTenantUrlFields, isTenantUrlLikeKey, hasInvalidStoreName } from '@platform/core/security/tenantSettingsGuard';
import { AuditLogger } from '@services/audit/AuditLogger';
import type { ClientIntegrationKind, ClientIntegrationRepository } from '@database/repositories/tenant/ClientIntegrationRepository';
import type { IntegrationCatalogRepository } from '@database/repositories/app/IntegrationCatalogRepository';
import { isWebhookChannel } from '@integration/contracts/webhookChannels';

/**
 * ADR-0024 D6 (P3-INT): tenant kanal ayarları (okuma maskeli, yazma sır-koruyucu/şifreli) ve platform kataloğu listesi.
 * `auditRequest`: denetim kaydı için ham RPC isteği (`AuditLogger.fromRequest`; değer değil yalnız anahtar adları yazılır).
 */
export interface SettingsDeps { repo: ClientIntegrationRepository; clientId: any; auditRequest: any }

/** [K8] OAuth yetkilendirme adresi kuran FE bileşenlerinin (IdeasoftComponent.vue/BizimhesapComponent.vue) okuduğu tek `urls` alt kümesi. */
const FE_VISIBLE_PLATFORM_URLS: Record<string, string[]> = {
    ideasoft: ['baseUrl', 'authorizationUrl', 'redirectUrl'],
    bizimhesap: ['baseUrl', 'authorizationUrl', 'redirectUrl'],
};

/**
 * Platform entegrasyon listesi.
 * [K8 2026-09-28] Üye kademesine platform dış adresleri (üst düzey `urls`) ve iç ticari alanlar (`profitRate`/`commissin`) DÖNMEZ.
 * FE kullanımı (kanıtlı, frontend/src): `urls` YALNIZCA Ideasoft/Bizimhesap bileşenlerinde OAuth yetkilendirme adresini kurmak için
 * (`urls.baseUrl/authorizationUrl/redirectUrl`); `profitRate`/`commissin` HİÇBİR FE/BE kodunda okunmuyor. Bu yüzden `urls` yalnızca
 * o iki entegrasyon için ve yalnızca o üç anahtarla döner; diğerlerinde tamamen çıkarılır.
 */
export async function listPlatformIntegrations(catalog: IntegrationCatalogRepository): Promise<any[]> {
    const projection = { 'settings.urls': 0, 'token': 0, 'profitRate': 0, 'commissin': 0 } as const;
    const list: any[] = await catalog.listIntegrations(projection);
    return (Array.isArray(list) ? list : []).map((item: any) => {
        if (!item || typeof item !== 'object' || !('urls' in item)) return item;
        const keep = FE_VISIBLE_PLATFORM_URLS[String(item.code)];
        if (!keep) { const { urls: _drop, ...rest } = item; return rest; }
        return { ...item, urls: Object.fromEntries(keep.filter(k => item.urls && item.urls[k] !== undefined).map(k => [k, item.urls[k]])) };
    });
}

/** ADR-0003 D.15/D.16: sır alanları yanıtta 'sensitive' / '' (yazılabilir-yalnız). */
export async function getClientIntegrations(repo: ClientIntegrationRepository): Promise<any> {
    return maskClientIntegrationsDoc(await repo.findDocSorted());
}

/** Tek kanal öğesinin ayarları (ADR-0003 D.16: auth token'ları dahil TÜM sır alanları maskeli); yoksa `null`. */
export async function retrieveItemSettings(repo: ClientIntegrationRepository, kind: ClientIntegrationKind, integrationCode: any): Promise<any> {
    const doc: any = await repo.findItem(kind, integrationCode);
    return maskIntegrationItem(doc?.[kind]?.[0]) || null;
}

/**
 * [K7 / ADR-0020, 2026-09-28] Tenant ayarındaki URL/host/endpoint benzeri ÜST DÜZEY alanlar YOK SAYILIR (bkz. tenantSettingsGuard.ts:
 * dış hedefler yalnızca platform `Integrations.urls`'tir) ve denetim kaydına yalnızca anahtar ADLARI yazılır (değer asla).
 */
function ignoreTenantUrlFields(auditRequest: any, type: string, code: string, incoming: any): any {
    const { settings, removedKeys } = stripTenantUrlFields(incoming);
    if (removedKeys.length > 0) {
        void AuditLogger.fromRequest(auditRequest, 'integration.settings.url_field_ignored', 'fail', { type, integrationCode: code, ignoredKeys: removedKeys.slice(0, 20).join(',') });
    }
    return settings;
}

/**
 * ADR-0003 D.16: gelen settings ile mevcut settings birleştirilir (sır alanları için 'sensitive' sentinel'i).
 * ADR-0003 C.10 (adım 6): sonuçtaki düz metin sır değerleri DB'ye yazılmadan önce AES-256-GCM ile şifrelenir (`enc:v1:`);
 * korunan mevcut şifreli değerlere dokunulmaz. Anahtar yapılandırması yoksa hata fırlar (sır düz yazılmaz).
 */
async function resolveSettingsForWrite({ repo, auditRequest }: SettingsDeps, type: 'erp' | 'marketplace' | 'shipment', code: string, incoming: any): Promise<any> {
    const existingDoc: any = await repo.findItem(type, code);
    const existing = stripTenantUrlFields(existingDoc?.[type]?.[0]?.settings).settings; // [K7] DB'deki URL kalıntısı korunmaz (yazımla temizlenir)
    const resolved = resolveSecretsForWrite(ignoreTenantUrlFields(auditRequest, type, code, incoming), existing, code);
    // [N5 / ADR-0004] `settings.stockPolicy` (kanal başına tampon/grace/oto-iptal) bu GENEL yazma ucunun DEĞİL, doğrulamalı özel
    // ucun (saveChannelStockPolicy) sahipliğindedir: gövdedeki değer YOK SAYILIR, mevcut değer KORUNUR. Aksi halde settings
    // nesnesi tamamen değiştiği için FE stockPolicy'yi taşımadığında politika sessizce silinirdi (ve doğrulanmamış değer yazılabilirdi).
    if (type === 'marketplace' && resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
        delete resolved.stockPolicy;
        if (existing && typeof existing === 'object' && existing.stockPolicy !== undefined) resolved.stockPolicy = existing.stockPolicy;
    }
    return encryptSecrets(resolved, code);
}

/**
 * [INT-09] Ayar kaydedilince `IntegrationFactory` örnek/ayar önbelleği (5 dk) o tenant+entegrasyon için düşürülür; aksi halde eski
 * kimlik/ayarlı örnek süre dolana dek kullanılırdı. En iyi çaba: önbellek hatası kaydı ASLA bozmaz (TTL zaten sınırlar).
 */
export function dropFactoryCache(clientId: any, code: unknown): void {
    try { IntegrationFactory.invalidate(Number(clientId), String(code ?? '')); } catch { /* best-effort */ }
    // [eslesme-fiyat WP7a, F-04] Kimlik/ayar güncellendi → art arda AUTH duraklatması kalkar (üretici sonraki turda yeniden dener).
    void clearIntegrationAttention(clientId, code);
}

/**
 * ERP/pazaryeri/kargo kanal ayarlarını yazar. ADR-0003 D.16: 'sensitive' -> mevcut sır korunur; '' -> temizlenir;
 * başka değer -> yeni sır. Yanıt: güncel öğe (maskeli) veya `null`.
 */
export async function saveItemSettings(deps: SettingsDeps, kind: 'erp' | 'marketplace' | 'shipment', item: any): Promise<any> {
    const settings = await resolveSettingsForWrite(deps, kind, item.code, item.settings);
    const editIntegration: any = await deps.repo.setItemSettings(kind, item.code, settings);
    dropFactoryCache(deps.clientId, item.code);
    return maskIntegrationItem(editIntegration[kind].find((entry: any) => entry.code === item.code)) || null;
}

/** E-ticaret kanal ayarları: alan alan `$set` (maskeli sır yazılmaz), DB'deki URL kalıntıları `$unset`. */
export async function saveECommerceSettings(deps: SettingsDeps, item: any): Promise<any> {
    const code = item.code;
    const rawECommerceSettings = item.settings;
    delete rawECommerceSettings.auth;
    // [K7] Ideasoft alt alan etiketi host'a gömülür: yalnızca tek DNS etiketi
    if (hasInvalidStoreName(rawECommerceSettings)) throw new ApplicationError('storeName geçersiz: yalnızca harf, rakam ve tire içeren tek bir alt alan adı girilmelidir.', 400);
    // [K7] URL/host/endpoint benzeri alanlar yok sayılır (yalnızca $set edilmez); DB'deki kalıntıları aşağıda $unset edilir
    const clientECommerceSettings = ignoreTenantUrlFields(deps.auditRequest, 'ecommerce', code, rawECommerceSettings);
    // ADR-0003 C.10: yeni (düz metin) sır değerleri yazılmadan önce şifrelenir; D.16: 'sensitive' olan sır alanı yazılmaz
    const encryptedSettings = encryptSecrets(clientECommerceSettings, code);
    const setObject = Object.fromEntries(
        Object.entries(encryptedSettings)
            .filter(([key, value]) => !(isSecretField(key, code) && value === SENSITIVE_MASK))
            .map(([key, value]) => [`ecommerce.$.settings.${key}`, value])
    );
    const existingECommerce: any = await deps.repo.findItem('ecommerce', code);
    const unsetObject = Object.fromEntries(
        Object.keys(existingECommerce?.ecommerce?.[0]?.settings || {}).filter(isTenantUrlLikeKey).map(k => [`ecommerce.$.settings.${k}`, ''])
    );
    const update: any = { $set: setObject };
    if (Object.keys(unsetObject).length > 0) update.$unset = unsetObject;
    const editIntegration: any = await deps.repo.updateECommerceItem(code, update);
    dropFactoryCache(deps.clientId, code);
    return maskIntegrationItem(editIntegration.ecommerce.find((ecommerce: any) => ecommerce.code === code)) || null;
}

/** Pazaryeri sıralaması: `sortedCodes` sırasıyla `order` 1..n. */
export function sortMarketplaces(repo: ClientIntegrationRepository, sortedCodes: any): Promise<any> {
    let order = 1;
    const updates = [];
    for (const code of sortedCodes) {
        updates.push({
            updateOne: {
                filter: { code: code },
                update: { $set: { 'order': order++ } }
            }
        });
    }
    return repo.bulkWrite(updates);
}

/**
 * [ADR-0005 Karar 8] Tenant×entegrasyon başına webhook token'ı üretir/DÖNDÜRÜR (rotate). `Client.integrations`
 * (ApplicationDB, `Client.ts` -- OrderQueueProducer/OrderWorker'ın imleç alanlarıyla AYNI şemasız belge) üzerine
 * yazılır; `ClientIntegration.marketplace[].settings` (tenant DB, kimlik bilgisi/sır alanları) İLE KARIŞTIRILMAZ.
 * Token ≥32 bayt kriptografik rastgelelik (hex kodlanmış, 64 karakter); DB'de DÜZ METİN tutulur -- bu bir sır
 * DEĞİL, tahmin edilemez bir URL bileşenidir (ADR-0005 Karar 8 madde 2). Her çağrı YENİ bir token üretip
 * ESKİSİNİN üzerine yazar (rotasyon = yeniden üretimle AYNI operasyon) ve `webhookHealthy`'yi false'a döndürür
 * (yeni token için sağlık durumu ilk webhook'a kadar belirsizdir). Kademe: admin (OPERATION_POLICY).
 */
export async function rotateWebhookToken(catalog: IntegrationCatalogRepository, clientId: any, integrationCode: any): Promise<any> {
    if (!integrationCode) throw new Error('integrationCode zorunlu');
    // [WP7b, F-11] Yalnız alıcısı olan kanallar (trendyol | hepsiburada | ideasoft); aksi halde belirteç üretilmez (ölü URL verilmez).
    if (!isWebhookChannel(integrationCode)) throw new ApplicationError('Bu kanal için webhook alıcısı yok.', 400, 'NOT_SUPPORTED');
    const webhookToken = randomBytes(32).toString('hex');
    const updated: any = await catalog.rotateWebhookToken(clientId, integrationCode, webhookToken);
    if (!updated) throw new Error('Entegrasyon bulunamadı');
    return { integrationCode, webhookToken };
}
