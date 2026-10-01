import IntegrationFactory from '@integration/modules/IntegrationFactory';

/**
 * ADR-0024 P3-INT: platform vekil (proxy) okumaları — kategori/marka/nitelik/komisyon/platform bilgisi doğrudan adaptörden.
 * Eski `IntegrationService` gövdesi; davranış BİREBİR (her çağrı tenant'ın `IntegrationFactory` örneğini kullanır).
 */
async function instanceFor(clientId: unknown, integrationCode: unknown): Promise<any> {
    const factory = new IntegrationFactory(Number(clientId));
    return factory.getInstance(integrationCode as any);
}

export async function retrievePlatformInfos(clientId: unknown, integrationCode: unknown): Promise<any> {
    return (await instanceFor(clientId, integrationCode)).retrievePlatformInfos();
}

export async function retrieveCategoryCommission(clientId: unknown, integrationCode: unknown, integrationCategoryId: unknown): Promise<any> {
    return (await instanceFor(clientId, integrationCode)).retrieveCategoryCommision(integrationCategoryId);
}

export async function retrieveCategories(clientId: unknown, integrationCode: unknown): Promise<any> {
    return (await instanceFor(clientId, integrationCode)).retrieveCategories?.();
}

export async function retrieveBrands(clientId: unknown, integrationCode: unknown, searchText: unknown): Promise<any> {
    return (await instanceFor(clientId, integrationCode)).retrieveBrands(searchText);
}

export async function retrieveCategoryAttributes(clientId: unknown, integrationCode: unknown, integrationCategoryId: unknown): Promise<any> {
    return (await instanceFor(clientId, integrationCode)).retrieveCategoryAttributes?.(integrationCategoryId);
}

/** Adaptör `retrieveCategoryAttributeValues` desteklemiyorsa boş liste. */
export async function retrieveCategoryAttributeValues(clientId: unknown, integrationCode: unknown, integrationCategoryId: unknown, integrationCategoryAttributeId: unknown): Promise<any> {
    const integration = await instanceFor(clientId, integrationCode);
    if (typeof integration.retrieveCategoryAttributeValues === 'function') {
        return integration.retrieveCategoryAttributeValues(integrationCategoryId, integrationCategoryAttributeId);
    }
    return [];
}

/**
 * [ADR-0018 Aşama A / kategori belgesi §4] Tüm entegrasyon yetenek manifestoları (salt-okuma). Frontend kapsam rozetleri ve
 * "yakında" (roadmap) durumları BURADAN beslenir (E3 dürüstlük ilkesi — tek kaynak). Yalnız statik kod verisidir: DB/ağ erişimi
 * YOK, sır/kimlik bilgisi İÇERMEZ. `platformAdmin` özel bulgu/uyum özeti Aşama B `IntegrationComplianceService`'in işidir.
 */
export function listIntegrationCatalog(): any[] {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const { listIntegrationDescriptors } = (require('../../integration/catalog/IntegrationDescriptorRegistry') as typeof import('../../integration/catalog/IntegrationDescriptorRegistry'));
    return listIntegrationDescriptors().map((d) => ({
        code: d.code,
        displayName: d.displayName,
        category: d.category,
        status: d.status,
        adapterVersion: d.adapterVersion,
        capabilities: Object.fromEntries(
            Object.entries(d.capabilities).map(([key, cap]) => [key, { level: cap!.level, note: cap!.note }]),
        ),
        limitations: d.limitations,
        verification: d.verification,
    }));
}
