import Trendyol from './marketplace/trendyol';
import Pazarama from './marketplace/pazarama';
/* import { EntegrasyonikOperations } from 'utility'; */
import { DatabaseManagerInstance } from "@database/DatabaseManager";

import { PlatformMappingProvider } from './provider/PlatformMappingProvider';
import { IPlatformMappingProvider } from './provider/IPlatformMappingProvider';
import { getColoredPrefix } from '../../utils/Logger';
import { IPlatform } from '@interfaces/index';
import { resolveLegacyIntegrationRecord } from '@integration/config/legacyIntegrationRecord';
import { getKnownVersion } from '@integration/config/platformOverrideStore';
import N11 from './marketplace/n11';
import Hepsiburada from './marketplace/hepsiburada';
import Ideasoft from './ecommerce/ideasoft';
import Bizimhesap from './erp/bizimhesap';
import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'IntegrationFactory');

/**
 * [DÜZELTME 2026-09-28] IPlatform sözleşmesinde SENKRON tanımlı metotlar. `wrapWithTimeout` Proxy'si bunları
 * `async` sarmaz (aksi halde Promise döner ve `(instance.getMatchKey() || 'barcode').toLowerCase()` gibi 13 senkron
 * çağıran TypeError verir). Bir senkron süreç zaten zaman aşımına uğratılamaz; timeout yalnızca ağ/IO yapan
 * (Promise döndüren) metotlar içindir. IPlatform'a yeni bir senkron metot eklenirse BURAYA da eklenmelidir
 * (koruyucu test: IntegrationFactory.getMatchKeyPromise.characterization.test.ts adaptör prototip taraması).
 */
export const SYNC_PLATFORM_METHODS = ['getMatchKey'] as const satisfies ReadonlyArray<keyof IPlatform>;
const SYNC_METHOD_SET: ReadonlySet<string | symbol> = new Set<string | symbol>(SYNC_PLATFORM_METHODS);

export default class IntegrationFactory {
    private static configCache: Map<string, any> = new Map();
    /*     private entegrasyonikOperations!: EntegrasyonikOperations; */
    private applicationDB!: any;
    private clientDB!: any;

    private static instanceCache: Map<string, any> = new Map();
    private static lastCacheClear: number = Date.now();
    private static cacheTTL = 5 * 60 * 1000;
    private static readonly EXECUTION_TIMEOUT = 120000; // 2 Minutes

    constructor(private clientId: number) { }

    /**
     * Pazaryeri bazlı dinamik log prefix'i.
     * Format: [Client 2 - trendyol - Factory]
     */
    private getSpecificLog(integrationCode: string): string {
        const label = `Client ${this.clientId} - ${integrationCode} - Factory`;
        return getColoredPrefix('IntegrationFactory', label);
    }

    /*     public async getClientDB(): Promise<any> {
            await this.ensureInitialized();
            return this.clientDB;
        }
     */
    /*     public async getEntegrasyonikOperations(): Promise<any> {
            await this.ensureInitialized();
            return this.entegrasyonikOperations;
        } */

    private static checkAndFlushCache() {
        const now = Date.now();
        if (now - this.lastCacheClear > this.cacheTTL) {
            this.instanceCache.clear();
            this.configCache.clear();
            this.lastCacheClear = now;
            log.debug('INTEGRATIONFACTORY_GLOBAL_CACHE_AUTOMATICALLY_CLEARED', 'Global cache automatically cleared.');
        }
    }

    private validateSettings(instance: any, settings: any, integrationCode: string): void {
        const requirements = instance.requiredSettings as string[];
        if (!requirements || !Array.isArray(requirements)) return;

        const missingFields = requirements.filter(field => !settings?.settings?.[field]);
        if (missingFields.length > 0) {
            const log = this.getSpecificLog(integrationCode);
            throw new Error(`${log} [${instance.constructor.name}] Eksik yapılandırma: ${missingFields.join(', ')}`);
        }
    }

    /**
     * [ADR-0020 Karar 1.1/7.2 Aşama A] Platform `Integrations` kaydı + tenant ayarının (K7 süzülmüş) birleşimi.
     * KOD YOLU `src/integration/config/legacyIntegrationRecord.ts`'e taşındı (tek çözümleyici çağrısı); ÇIKTI ve
     * önbellekleme davranışı BİREBİR AYNI kalır (bkz. `tests/characterization/config/legacyIntegrationRecord.*`).
     */
    private async getIntegrationConfig(integrationCode: string): Promise<any> {
        const cacheKey = `${this.clientId}_${integrationCode}_config`;

        if (IntegrationFactory.configCache.has(cacheKey)) {
            return IntegrationFactory.configCache.get(cacheKey);
        }

        const resolved = await resolveLegacyIntegrationRecord({
            applicationDB: this.applicationDB,
            clientDB: this.clientDB,
            integrationCode,
        });
        if (!resolved) return null;

        IntegrationFactory.configCache.set(cacheKey, resolved.value);
        return resolved.value;
    }

    private async ensureInitialized() {
        if (!this.clientDB || !this.applicationDB) {
            this.clientDB = await DatabaseManagerInstance.getClientDB(this.clientId);
            this.applicationDB = await DatabaseManagerInstance.getApplicationDB();

            /*             this.entegrasyonikOperations = new EntegrasyonikOperations(
                            this.clientDB,
                            this.clientId
                        ); */
        }
    }

    private wrapWithTimeout(instance: any, integrationCode: string): any {
        const timeoutMs = IntegrationFactory.EXECUTION_TIMEOUT;
        const log = this.getSpecificLog(integrationCode);

        return new Proxy(instance, {
            get: (target, prop, receiver) => {
                const originalValue = Reflect.get(target, prop, receiver);

                // Only wrap functions to inject timeout logic
                if (typeof originalValue === 'function') {
                    // Senkron sözleşmeli metotlar (getMatchKey vb.): sarmadan, hedefe bağlı ve senkron çağır.
                    if (SYNC_METHOD_SET.has(prop)) {
                        return (...args: any[]) => originalValue.apply(target, args);
                    }
                    return async (...args: any[]) => {
                        let timeoutHandle: any;
                        const timeoutPromise = new Promise((_, reject) => {
                            timeoutHandle = setTimeout(() => {
                                reject(new Error(`${log} [Platform Timeout] ${prop.toString()} call exceeded ${timeoutMs / 1000}s`));
                            }, timeoutMs);
                        });

                        try {
                            // Race the original method against the timeout
                            const result = await Promise.race([
                                originalValue.apply(target, args),
                                timeoutPromise
                            ]);
                            return result;
                        } finally {
                            if (timeoutHandle) clearTimeout(timeoutHandle);
                        }
                    };
                }
                return originalValue;
            }
        });
    }

    public async getInstance(integrationCode: string): Promise<IPlatform> {
        IntegrationFactory.checkAndFlushCache();
        await this.ensureInitialized();

        const code = (integrationCode || '').trim().toLowerCase();
        const log = this.getSpecificLog(code);
        // [ADR-0020 Karar 3.6, Aşama B] Sürüm anahtara eklenir: bir platform yayını `platformOverrideStore`'daki
        // bilinen sürümü değiştirdiğinde eski (bayat) örnek DOĞAL OLARAK düşer (elle `clearCache()` gerekmez).
        // Bugün `getIntegrationConfig()`'in çıktısı henüz platform geçersiz kılmalarını OKUMUYOR (bkz. rapor: bilinçli
        // erteleme) — bu yüzden sürüm hâlâ 0 iken davranış BİREBİR eskisiyle aynıdır (`${clientId}_${code}_v0`).
        const cacheKey = `${this.clientId}_${code}_v${getKnownVersion(code)}`;

        if (IntegrationFactory.instanceCache.has(cacheKey)) {
            return IntegrationFactory.instanceCache.get(cacheKey);
        }

        const integrationSettings = await this.getIntegrationConfig(code);
        const applicationSettings = await this.clientDB.getSettingModel().findOne().lean();

        if (!integrationSettings) {
            throw new Error(`${log} Ayarları bulunamadı.`);
        }

        const mappingProvider: IPlatformMappingProvider = new PlatformMappingProvider(
            this.clientDB,
            this.clientId,
            code
        );

        const config = {
            mappingProvider: mappingProvider,
            clientId: this.clientId,
            integrationSettings: integrationSettings,
            applicationSettings: applicationSettings,
            clientDB: this.clientDB,
        };

        let moduleInstance: any;
        switch (code) {
            case 'trendyol': moduleInstance = new Trendyol(config); break;
            case 'pazarama': moduleInstance = new Pazarama(config); break;
            case 'n11': moduleInstance = new N11(config); break;
            case 'hepsiburada': moduleInstance = new Hepsiburada(config); break;
            case 'ideasoft': moduleInstance = new Ideasoft(config); break;
            case 'bizimhesap': moduleInstance = new Bizimhesap(config); break;
            default:
                throw new Error(`${log} Desteklenmeyen entegrasyon kodu: [${code}] (Uzunluk: ${code.length})`);
        }

        this.validateSettings(moduleInstance, integrationSettings, code);

        const proxiedInstance = this.wrapWithTimeout(moduleInstance, code);
        IntegrationFactory.instanceCache.set(cacheKey, proxiedInstance);

        return proxiedInstance;
    }

    /** Tek bir tenant+entegrasyonun örnek/ayar önbelleğini atar (ayar değişikliği sonrası güncel sınama için; diğer tenant/kodlara dokunmaz). */
    public static invalidate(clientId: number, integrationCode: string): void {
        const prefix = `${clientId}_${(integrationCode || '').trim().toLowerCase()}_`;
        for (const m of [this.instanceCache, this.configCache]) for (const k of [...m.keys()]) if (k.startsWith(prefix)) m.delete(k);
    }

    public static clearCache() {
        this.instanceCache.clear();
        this.configCache.clear();
        log.debug('INTEGRATIONFACTORY_GLOBAL_CACHE_MANUALLY_CLEARED', 'Global cache manually cleared.');
    }
}