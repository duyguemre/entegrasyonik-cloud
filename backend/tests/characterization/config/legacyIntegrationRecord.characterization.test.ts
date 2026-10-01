/**
 * ADR-0020 Karar 7.2 Aşama A DoD: "6 adaptörde 'yerel Integrations.urls fikstürü → adaptörün çağırdığı URL' anlık
 * görüntüsü". Bu dosya `resolveLegacyIntegrationRecord` (bugünkü `IntegrationFactory.getIntegrationConfig`'in KOD YOLU
 * DEĞİŞTİRİLEREK taşınmış hâli — davranış BİREBİR AYNI, bkz. `legacyIntegrationRecord.ts` dosya başı notu) için
 * TÜM 6 adaptörde platform `Integrations.urls`/`settings` + tenant ayarının BİRLEŞİM ŞEKLİNİ sabitler.
 *
 * Aynı zamanda K7 (ADR-0020 §1.6) REGRESYON KİLİDİDİR: tenant ayarındaki URL-benzeri üst düzey anahtarlar (ör.
 * `settings.urls.BASEURL`) SONUÇTA ASLA görünmez (bu davranış zaten `stripTenantUrlFields` ile kapatılmıştı, K7/K8
 * BACKLOG kaydı 2026-09-28; bu test yalnız YENİ kod yolunda da AYNI kaldığını kilitler).
 *
 * Gerçek ağ/DB YOK: `applicationDB`/`clientDB` sahte (in-memory) nesnelerdir.
 */
import { describe, it, expect } from '@jest/globals';
import { resolveLegacyIntegrationRecord } from '@integration/config/legacyIntegrationRecord';

const lean = (v: any) => ({ lean: async () => v });

function fakeApplicationDB(integrations: any[]) {
    return { getIntegrationModel: () => ({ find: () => lean(integrations) }) };
}
function fakeClientDB(clientIntegrations: any) {
    return { getClientIntegrationModel: () => ({ findOne: () => lean(clientIntegrations) }) };
}

// 6 adaptörün BUGÜNKÜ (2026-09-29, yerel DB kopyası taraması) `Integrations.urls` şeklini yansıtan TEMSİLİ fikstürler.
// Gerçek sır/host değeri İÇERMEZ (sentetik test verisi).
const FIXTURES: Array<{ code: string; category: 'marketplace' | 'ecommerce' | 'erp'; urls: Record<string, string>; tenantSettings: Record<string, any> }> = [
    { code: 'trendyol', category: 'marketplace', urls: { orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' }, tenantSettings: { SELLERID: '123', APIKEY: 'k', APISECRET: 's' } },
    { code: 'hepsiburada', category: 'marketplace', urls: { BASEURL: 'https://mpop.hepsiburada.com' }, tenantSettings: { APIKEY: 'k', APISECRET: 's', SELLERID: '9' } },
    { code: 'n11', category: 'marketplace', urls: { BASEURL: 'https://api.n11.com' }, tenantSettings: { APIKEY: 'k', APISECRET: 's' } },
    { code: 'pazarama', category: 'marketplace', urls: { BASEURL: 'https://isortagimapi.pazarama.com' }, tenantSettings: { APIKEY: 'k', APISECRET: 's' } },
    { code: 'ideasoft', category: 'ecommerce', urls: {}, tenantSettings: { storeName: 'magaza', key: 'k', secret: 's' } },
    { code: 'bizimhesap', category: 'erp', urls: { BASEURL: 'https://api.bizimhesap.com' }, tenantSettings: { key: 'k', secret: 's' } },
];

describe('ADR-0020 §1.4/§1.6 — resolveLegacyIntegrationRecord: 6 adaptör anlık görüntüsü (davranış-aynı refactor)', () => {
    for (const fx of FIXTURES) {
        it(`${fx.code}: platform \`urls\` OLDUĞU GİBİ, tenant ayarı K7-süzülmüş biçimde döner; source='legacy'`, async () => {
            const applicationDB = fakeApplicationDB([{ code: fx.code, urls: fx.urls, settings: {}, title: fx.code, color: '#fff', logo: 'x.png' }]);
            const clientIntegrations = { [fx.category]: [{ code: fx.code, settings: fx.tenantSettings }] };
            const clientDB = fakeClientDB(clientIntegrations);

            const result = await resolveLegacyIntegrationRecord({ applicationDB, clientDB, integrationCode: fx.code });

            expect(result).not.toBeNull();
            expect(result!.source).toBe('legacy');
            // Platform `urls` HİÇ DEĞİŞMEDEN (`...integration` yayılımı) döner — ADR §1.4 "yol kodda, host platformda"nın
            // Aşama A'daki karşılığı: bugün host+yol AYRIŞTIRILMAZ, tam URL olduğu gibi taşınır.
            expect(result!.value.urls).toEqual(fx.urls);
            // Tenant ayarı: K7 süzülmüş (URL-benzeri üst düzey anahtar YOK) ama iş/kimlik alanları KORUNUR.
            expect(result!.value.settings).toEqual(fx.tenantSettings);
        });
    }

    it('K7 REGRESYON KİLİDİ: tenant ayarına eklenmiş `settings.urls.BASEURL` (SSRF denemesi) SONUÇTA HİÇ GÖRÜNMEZ', async () => {
        const applicationDB = fakeApplicationDB([{ code: 'hepsiburada', urls: { BASEURL: 'https://mpop.hepsiburada.com' }, settings: {}, title: 'HB', color: '#fff', logo: 'x.png' }]);
        const clientDB = fakeClientDB({
            marketplace: [{ code: 'hepsiburada', settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '9', urls: { BASEURL: 'http://169.254.169.254/latest/meta-data' } } }],
        });

        const result = await resolveLegacyIntegrationRecord({ applicationDB, clientDB, integrationCode: 'hepsiburada' });

        expect(result!.value.settings.urls).toBeUndefined();
        expect(result!.value.urls).toEqual({ BASEURL: 'https://mpop.hepsiburada.com' }); // platform değeri değişmedi
    });

    it('kayıt bulunamazsa (bugünkü davranışla BİREBİR AYNI) `null` döner', async () => {
        const applicationDB = fakeApplicationDB([{ code: 'trendyol', urls: {}, settings: {} }]);
        const clientDB = fakeClientDB({ marketplace: [] }); // tenant hiç ayar yapmamış
        const result = await resolveLegacyIntegrationRecord({ applicationDB, clientDB, integrationCode: 'trendyol' });
        expect(result).toBeNull();
    });
});
