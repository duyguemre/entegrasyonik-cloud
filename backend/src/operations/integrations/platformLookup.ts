import IntegrationFactory from '@integration/modules/IntegrationFactory';

/**
 * ADR-0024 D6 (P3-INT): pazaryeri/platform tarafına salt-okuma vekil çağrıları (kategori, marka, nitelik, komisyon, platform
 * bilgisi). Tenant = doğrulanmış `clientId`; adaptör örneği `IntegrationFactory` önbelleğinden.
 */
async function integrationOf(clientId: any, integrationCode: any): Promise<any> {
    const factory = new IntegrationFactory(Number(clientId));
    return factory.getInstance(integrationCode);
}

export async function retrievePlatformInfos(clientId: any, integrationCode: any): Promise<any> {
    const integration = await integrationOf(clientId, integrationCode);
    return await integration.retrievePlatformInfos();
}

export async function retrieveCategoryCommission(clientId: any, integrationCode: any, integrationCategoryId: any): Promise<any> {
    const integration = await integrationOf(clientId, integrationCode);
    return await integration.retrieveCategoryCommision(integrationCategoryId);
}

export async function retrieveCategories(clientId: any, integrationCode: any): Promise<any> {
    const integration = await integrationOf(clientId, integrationCode);
    return await integration.retrieveCategories?.();
}

export async function retrieveBrands(clientId: any, integrationCode: any, searchText: any): Promise<any> {
    const integration = await integrationOf(clientId, integrationCode);
    return await integration.retrieveBrands(searchText);
}

export async function retrieveCategoryAttributes(clientId: any, integrationCode: any, integrationCategoryId: any): Promise<any> {
    const integration = await integrationOf(clientId, integrationCode);
    return await integration.retrieveCategoryAttributes?.(integrationCategoryId);
}

/** Adaptör `retrieveCategoryAttributeValues` desteklemiyorsa boş liste. */
export async function retrieveCategoryAttributeValues(clientId: any, integrationCode: any, integrationCategoryId: any, integrationCategoryAttributeId: any): Promise<any> {
    const integration = await integrationOf(clientId, integrationCode);
    if (typeof integration.retrieveCategoryAttributeValues === "function") {
        return await integration.retrieveCategoryAttributeValues(integrationCategoryId, integrationCategoryAttributeId);
    }
    return [];
}
