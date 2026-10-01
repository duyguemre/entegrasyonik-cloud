import { randomBytes } from 'crypto';
import { IApplicationDB, IClientDB } from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ClientIntegrationRepository, IntegrationSlot } from '@database/repositories/tenant/ClientIntegrationRepository';
import { PlatformIntegrationRepository } from '@database/repositories/app/PlatformIntegrationRepository';
import { SENSITIVE_MASK, isSecretField, encryptSecrets, maskIntegrationItem, maskClientIntegrationsDoc, resolveSecretsForWrite } from '@platform/core/security/integrationSecrets';
import { ApplicationError } from '@platform/core/security/Security';
import { stripTenantUrlFields, isTenantUrlLikeKey, hasInvalidStoreName } from '@platform/core/security/tenantSettingsGuard';
import { AuditLogger } from '@services/audit/AuditLogger';

/**
 * ADR-0024 P3-INT: tenant entegrasyon ayarlarının okunması/yazılması (eski `IntegrationService` gövdesi; davranış BİREBİR).
 * `request`: denetim kaydı için ham RPC isteği (`AuditLogger.fromRequest`).
 */
export interface IntegrationSettingsDeps { clientDB: IClientDB; clientId: unknown; request: any }

/**
 * [K7 / ADR-0020, 2026-09-28] Tenant ayarındaki URL/host/endpoint benzeri ÜST DÜZEY alanlar YOK SAYILIR (bkz. tenantSettingsGuard.ts:
 * dış hedefler yalnızca platform `Integrations.urls`'tir) ve denetim kaydına yalnızca anahtar ADLARI yazılır (değer asla).
 */
function ignoreTenantUrlFields(request: any, type: string, code: string, incoming: any): any {
    const { settings, removedKeys } = stripTenantUrlFields(incoming);
    if (removedKeys.length > 0) {
        void AuditLogger.fromRequest(request, 'integration.settings.url_field_ignored', 'fail', { type, integrationCode: code, ignoredKeys: removedKeys.slice(0, 20).join(',') });
    }
    return settings;
}

/**
 * ADR-0003 D.16: gelen settings ile mevcut settings birleştirilir (sır alanları için 'sensitive' sentinel'i).
 * ADR-0003 C.10 (adım 6): sonuçtaki düz metin sır değerleri DB'ye yazılmadan önce AES-256-GCM ile şifrelenir (`enc:v1:`);
 * korunan mevcut şifreli değerlere dokunulmaz. Anahtar yapılandırması yoksa hata fırlar (sır düz yazılmaz).
 */
async function resolveSettingsForWrite(deps: IntegrationSettingsDeps, type: 'erp' | 'marketplace' | 'shipment', code: string, incoming: any): Promise<any> {
    const existingDoc: any = await new ClientIntegrationRepository(deps.clientDB).findSlotItem(type, code);
    const existing = stripTenantUrlFields(existingDoc?.[type]?.[0]?.settings).settings; // [K7] DB'deki URL kalıntısı korunmaz (yazımla temizlenir)
    const resolved = resolveSecretsForWrite(ignoreTenantUrlFields(deps.request, type, code, incoming), existing, code);
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
export function dropFactoryCache(clientId: unknown, code: unknown): void {
    try { IntegrationFactory.invalidate(Number(clientId), String(code ?? '')); } catch { /* best-effort */ }
}

/** ADR-0003 D.16/D.15: tenant entegrasyon belgesi; sır alanları yanıtta 'sensitive' / '' (yazılabilir-yalnız). */
export async function getClientIntegrations(clientDB: IClientDB): Promise<any> {
    return maskClientIntegrationsDoc(await new ClientIntegrationRepository(clientDB).findFirstSorted());
}

/** Tek kanal ayarı (sır alanları maskeli; auth.access_token/refresh_token dahil). */
export async function retrieveSlotSettings(clientDB: IClientDB, slot: IntegrationSlot, integrationCode: unknown): Promise<any> {
    const doc = await new ClientIntegrationRepository(clientDB).findSlotItem(slot, integrationCode);
    return maskIntegrationItem(doc?.[slot]?.[0]) || null;
}

/** ERP/pazaryeri/kargo ayarı yazımı. ADR-0003 D.16: 'sensitive' -> mevcut sır korunur; '' -> temizlenir; başka değer -> yeni sır. */
export async function saveSlotSettings(deps: IntegrationSettingsDeps, slot: 'erp' | 'marketplace' | 'shipment', item: { code: string; settings: any }): Promise<any> {
    const settings = await resolveSettingsForWrite(deps, slot, item.code, item.settings);
    const edited = await new ClientIntegrationRepository(deps.clientDB).updateOne({ [slot + '.code']: item.code }, { $set: { [slot + '.$.settings']: settings } });
    dropFactoryCache(deps.clientId, item.code);
    return maskIntegrationItem(edited[slot].find((x: any) => x.code === item.code)) || null;
}

/** E-ticaret ayarı yazımı (alan bazlı $set; `auth` istemciden yazılmaz; URL benzeri kalıntılar $unset). */
export async function saveECommerceSettings(deps: IntegrationSettingsDeps, item: { code: string; settings: any }): Promise<any> {
    const repo = new ClientIntegrationRepository(deps.clientDB);
    const filterQuery = { 'ecommerce.code': item.code };
    const rawECommerceSettings = item.settings;
    delete rawECommerceSettings.auth;
    // [K7] Ideasoft alt alan etiketi host'a gömülür: yalnızca tek DNS etiketi
    if (hasInvalidStoreName(rawECommerceSettings)) throw new ApplicationError('storeName geçersiz: yalnızca harf, rakam ve tire içeren tek bir alt alan adı girilmelidir.', 400);
    // [K7] URL/host/endpoint benzeri alanlar yok sayılır (yalnızca $set edilmez); DB'deki kalıntıları aşağıda $unset edilir
    const clientECommerceSettings = ignoreTenantUrlFields(deps.request, 'ecommerce', item.code, rawECommerceSettings);
    const code = item.code;
    // ADR-0003 C.10: yeni (düz metin) sır değerleri yazılmadan önce şifrelenir; 'sensitive' olanlar (D.16, mevcut korunur) yazılmaz
    const encryptedSettings = encryptSecrets(clientECommerceSettings, code);
    const setObject = Object.fromEntries(
        Object.entries(encryptedSettings)
            .filter(([key, value]) => !(isSecretField(key, code) && value === SENSITIVE_MASK))
            .map(([key, value]) => [`ecommerce.$.settings.${key}`, value]),
    );
    const existingECommerce: any = await repo.findSlotItem('ecommerce', code);
    const unsetObject = Object.fromEntries(
        Object.keys(existingECommerce?.ecommerce?.[0]?.settings || {}).filter(isTenantUrlLikeKey).map(k => [`ecommerce.$.settings.${k}`, '']),
    );
    const update: any = { $set: setObject };
    if (Object.keys(unsetObject).length > 0) update.$unset = unsetObject;
    const editIntegration = await repo.updateOneLean(filterQuery, update);
    dropFactoryCache(deps.clientId, item.code);
    return maskIntegrationItem(editIntegration.ecommerce.find((ecommerce: any) => ecommerce.code === item.code)) || null;
}

/** [K8] OAuth yetkilendirme adresi kuran FE bileşenlerinin (IdeasoftComponent.vue/BizimhesapComponent.vue) okuduğu tek `urls` alt kümesi. */
const FE_VISIBLE_PLATFORM_URLS: Record<string, string[]> = {
    ideasoft: ['baseUrl', 'authorizationUrl', 'redirectUrl'],
    bizimhesap: ['baseUrl', 'authorizationUrl', 'redirectUrl'],
};

/**
 * Platform entegrasyon tanımları (üye kademesi). [K8 2026-09-28] Platform dış adresleri (üst düzey `urls`) ve iç ticari alanlar
 * (`profitRate`/`commissin`) DÖNMEZ. FE kullanımı (kanıtlı, frontend/src): `urls` YALNIZCA Ideasoft/Bizimhesap bileşenlerinde OAuth
 * yetkilendirme adresini kurmak için (`urls.baseUrl/authorizationUrl/redirectUrl`); `profitRate`/`commissin` HİÇBİR FE/BE kodunda
 * okunmuyor. Bu yüzden `urls` yalnızca o iki entegrasyon için ve yalnızca o üç anahtarla döner; diğerlerinde tamamen çıkarılır.
 */
export async function listPlatformIntegrations(applicationDB: IApplicationDB): Promise<any[]> {
    const projection = { 'settings.urls': 0, 'token': 0, 'profitRate': 0, 'commissin': 0 } as const;
    const list: any[] = await new PlatformIntegrationRepository(applicationDB).listDefinitions(projection);
    return (Array.isArray(list) ? list : []).map((item: any) => {
        if (!item || typeof item !== 'object' || !('urls' in item)) return item;
        const keep = FE_VISIBLE_PLATFORM_URLS[String(item.code)];
        if (!keep) { const { urls: _drop, ...rest } = item; return rest; }
        return { ...item, urls: Object.fromEntries(keep.filter(k => item.urls && item.urls[k] !== undefined).map(k => [k, item.urls[k]])) };
    });
}

/**
 * [ADR-0005 Karar 8] Tenant×entegrasyon başına webhook token'ı üretir/DÖNDÜRÜR (rotate). `Client.integrations` (ApplicationDB) üzerine
 * yazılır; `ClientIntegration.marketplace[].settings` (tenant DB, sır alanları) İLE KARIŞTIRILMAZ. Token ≥32 bayt kriptografik
 * rastgelelik (hex, 64 karakter); DB'de DÜZ METİN tutulur -- sır DEĞİL, tahmin edilemez bir URL bileşenidir (Karar 8 madde 2).
 * Her çağrı YENİ token üretip eskisinin üzerine yazar ve `webhookHealthy`'yi false'a döndürür. Kademe: admin (OPERATION_POLICY).
 */
export async function generateWebhookToken(applicationDB: IApplicationDB, clientId: unknown, integrationCode: unknown): Promise<any> {
    if (!integrationCode) throw new Error('integrationCode zorunlu');
    const webhookToken = randomBytes(32).toString('hex');
    const updated: any = await new PlatformIntegrationRepository(applicationDB).rotateWebhookToken(clientId, integrationCode, webhookToken);
    if (!updated) throw new Error('Entegrasyon bulunamadı');
    return { integrationCode, webhookToken };
}
