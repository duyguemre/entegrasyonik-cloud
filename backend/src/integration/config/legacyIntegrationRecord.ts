// ADR-0020 Karar 1.1 (`legacy` katmanı) + Karar 7.2 Aşama A: "IntegrationFactory.getIntegrationConfig çözümleyiciden
// okur (adaptöre giden `integrationSettings.urls` şekli AYNI kalır)".
//
// BİLİNÇLİ KAPSAM SINIRI (rapora yazılır): ADR §1.4 "yol kodda, host platformda" ayrışması (host+pathTemplate) her
// adaptörün `descriptor.ts`'ine `config.hosts/endpoints` alanı gerektirir; bu görevde descriptor.ts dosyalarına
// dokunulmaması ZORUNLU olduğundan (yalnız oku/referans ver), bu ayrışma bu turda YAPILMADI. Bunun yerine bu fonksiyon
// BUGÜNKÜ davranışı (platform `Integrations` kaydı + tenant ayarının K7 filtrelenmiş birleşimi) AYNEN korur; yalnız
// KOD YOLU `IntegrationFactory`'den buraya taşınır (davranış-aynı refactor, Protokol 13).
import { decryptSecrets } from '@api/integrationSecrets';
import { stripTenantUrlFields } from '@api/tenantSettingsGuard';

export interface LegacyIntegrationRecordResult {
    /** `{ ...integration, settings: <tenant ayarı, K7 süzülmüş> }` — bugünkü `IntegrationFactory` çıktısıyla BİREBİR AYNI şekil. */
    value: any;
    source: 'legacy';
}

export interface ResolveLegacyIntegrationRecordDeps {
    /** ApplicationDB — `getIntegrationModel().find().lean()` sözleşmesini karşılayan nesne. */
    applicationDB: any;
    /** ClientDB — `getClientIntegrationModel().findOne().lean()` sözleşmesini karşılayan nesne. */
    clientDB: any;
    integrationCode: string;
}

/**
 * Platform `Integrations` kaydını + tenant `ClientIntegrations.<kategori>[]` ayarını (K7 süzülmüş, sır çözülmüş)
 * birleştirir. Bulunamazsa `null` (bugünkü `IntegrationFactory.getIntegrationConfig` ile BİREBİR AYNI davranış).
 */
export async function resolveLegacyIntegrationRecord(deps: ResolveLegacyIntegrationRecordDeps): Promise<LegacyIntegrationRecordResult | null> {
    const { applicationDB, clientDB, integrationCode } = deps;
    const integrations = await applicationDB.getIntegrationModel().find().lean();
    const clientIntegrations = await clientDB.getClientIntegrationModel().findOne().lean();

    for (const integration of integrations) {
        if ((integration.code || '').trim() !== integrationCode) continue;

        const clientSetting = (clientIntegrations?.marketplace || []).find((item: any) => item.code == integration.code) ||
            (clientIntegrations?.ecommerce || []).find((item: any) => item.code == integration.code) ||
            (clientIntegrations?.erp || []).find((item: any) => item.code == integration.code);

        if (clientSetting) {
            // ADR-0003 C.11: şifre çözme YALNIZCA burada. [K7 / ADR-0020] Dış hedefler (urls/baseUrl/host/endpoint...)
            // YALNIZCA platform `Integrations.urls`'ten (`integration.urls`, aşağıdaki `...integration` yayılımı) gelir;
            // tenant ayarındaki URL-benzeri üst düzey anahtarlar adaptöre HİÇ verilmez (en dar nokta burasıdır).
            const tenantSettings = stripTenantUrlFields(decryptSecrets(clientSetting.settings, integration.code)).settings;
            return { value: { ...integration, settings: tenantSettings }, source: 'legacy' };
        }
    }
    return null;
}
