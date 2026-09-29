export interface IBaseIntegrationSettings {
    code: string; // Entegrasyon kodu
    baseUrl: string
    urls: Record<string, any>
}

export interface IErpIntegrationSettings extends IBaseIntegrationSettings {
    settings: {
        key: string,
        secret: string,
        [key: string]: any
    },
    integrationSettings: any,
    appSettings: any
}


export interface IMarketplaceIntegrationSettings extends IBaseIntegrationSettings {
    settings: {
        sellerId: string,
        key: string,
        secret: string,
        /** ADR-0004 Karar 1/5 (zero-oversell) — kanal başına tampon/telafi ayarı. Varsayılan KAPALI/muhafazakar (bkz. IStockPolicy). */
        stockPolicy?: import('@interfaces/stock').IStockPolicy,
        [key: string]: any
    },
    integrationSettings: any,
    appSettings: any
}


export interface IShipmentIntegrationSettings extends IBaseIntegrationSettings {
    platforms?: Record<string, any>,// Entegrasyonun desteklediği platformlar
    settings: {
        barcode?: {
            start: number,
            end: number,
            current?: number
        },
        key: string,
        secret: string,
        [key: string]: any
    }

    apiKey: string;
    apiSecret: string;
    integrationId: string;
    integrationName: string;
    integrationType: string;
    integrationVersion: string;
    integrationSettings?: any; // Ek ayarlar
}

export interface IECommerceIntegrationSettings extends IBaseIntegrationSettings {
    platforms?: Record<string, any>,// Entegrasyonun desteklediği platformlar
    settings: {
        barcode?: {
            start: number,
            end: number,
            current?: number
        },
        storeName?: string,
        key: string,
        secret: string,
        [key: string]: any
    }

    apiKey: string;
    apiSecret: string;
    integrationId: string;
    integrationName: string;
    integrationType: string;
    integrationVersion: string;
    integrationSettings?: any; // Ek ayarlar
}
