'use strict';
/**
 * ADR-0020 §2 madde 3 (Aşama A, hafif versiyon) — "config drift" taraması.
 *
 * NE YAPAR: ApplicationDB `Integrations` koleksiyonundaki platform kaydını (`urls`, `settings`) kod tarafındaki
 * TEK doğruluk kaynaklarıyla (host izin listesi `outboundHosts.ts`, Trendyol emekli-uç köprüsü `urlSafetyNet.ts` +
 * `productUrls.ts`, adaptör `descriptor.ts` `auth.requiredSettings`) KARŞILAŞTIRIR ve şu 3 çelişki türünü RAPORLAR
 * (ADR §1.5 "genel çelişki taraması"):
 *   (a) host izinli listede değil,
 *   (b) Trendyol emekli (bilinen eski) URL deseniyle eşleşiyor,
 *   (c) `settings` içinde adaptörün beklemediği (requiredSettings dışı) bir üst düzey anahtar var.
 *
 * SALT OKUMA: hiçbir alanı YAZMAZ/GÜNCELLEMEZ. Çıktıda yalnızca ANAHTAR ADI + durum etiketi (VAR/YOK) basılır;
 * URL/host DEĞERİ, sorgu dizesi ya da `settings` içeriği YAZDIRILMAZ (CLAUDE.md kural 2/3 + ADR §1.5 "yalnız
 * anahtar adları/fark VAR/YOK, DEĞER YAZDIRMA sır varsa" ilkesi).
 *
 * Kullanım: cd backend && npm run build && node dev-tools/config-drift-scan.js [appDbName]
 * (yazma bayrağı YOKTUR — bu araç hiçbir zaman `--apply` almaz, her zaman salt-okunur; `runCli`'nin `--allow-remote`
 * koruması yine de geçerlidir: varsayılan yalnızca local 127.0.0.1).
 */
const { runCli, loadDist } = require('./_migrationCommon');

const INTEGRATIONS_COLLECTION = 'Integrations';

async function main({ appDb }) {
    const { ALLOWED_OUTBOUND_HOSTS, hostMatchesPattern, adapterKeyOf } = loadDist('integration/modules/common/security/outboundHosts.js');
    const { isLegacyOrderListUrl } = loadDist('integration/modules/marketplace/trendyol/urlSafetyNet.js');
    const { PRODUCT_URL_MIGRATIONS } = loadDist('integration/modules/marketplace/trendyol/api/productUrls.js');

    // Adaptör -> requiredSettings (descriptor.ts'ten; TEK kaynak, burada KOPYALANMAZ, doğrudan import edilir).
    const descriptors = {
        trendyol: loadDist('integration/modules/marketplace/trendyol/descriptor.js').default,
        hepsiburada: loadDist('integration/modules/marketplace/hepsiburada/descriptor.js').default,
        n11: loadDist('integration/modules/marketplace/n11/descriptor.js').default,
        pazarama: loadDist('integration/modules/marketplace/pazarama/descriptor.js').default,
        ideasoft: loadDist('integration/modules/ecommerce/ideasoft/descriptor.js').default,
        bizimhesap: loadDist('integration/modules/erp/bizimhesap/descriptor.js').default,
    };

    // Bilinen, MEŞRU (sır olmayan) settings anahtarları — descriptor requiredSettings'e ek olarak beklenir.
    // (ADR-0020 §1.6 tenant izinli listesiyle AYNI ruh: bilinmeyen anahtar "drift" sayılır, otomatik silinmez.)
    const KNOWN_NON_SECRET_SETTINGS_KEYS = new Set(['profitRate', 'commissin', 'stockPolicy', 'auth', 'catalog']);

    function hostOf(rawUrl) {
        try { return new URL(rawUrl).hostname.toLowerCase(); } catch { return undefined; }
    }

    const docs = await appDb.collection(INTEGRATIONS_COLLECTION)
        .find({}, { projection: { code: 1, urls: 1, settings: 1 } })
        .toArray();

    const findings = []; // { code, area, key, issue }

    for (const doc of docs) {
        const code = String(doc.code || '').trim().toLowerCase();
        const adapterKey = adapterKeyOf(code);
        const allowedHosts = ALLOWED_OUTBOUND_HOSTS[adapterKey];

        // (a) + (b) urls.*
        const urls = doc.urls && typeof doc.urls === 'object' ? doc.urls : {};
        for (const key of Object.keys(urls)) {
            const raw = urls[key];
            if (typeof raw !== 'string' || !raw) continue;
            const host = hostOf(raw);
            if (host && allowedHosts && !allowedHosts.some((p) => hostMatchesPattern(host, p))) {
                findings.push({ code, area: 'urls', key, issue: 'host_not_allowlisted' });
            }
            if (code === 'trendyol') {
                if (key === 'orderListUrl' && isLegacyOrderListUrl(raw)) {
                    findings.push({ code, area: 'urls', key, issue: 'legacy_pattern (bkz. urlSafetyNet.ts köprüsü — okuma anında zaten V2\'ye çevriliyor)' });
                }
                const migration = PRODUCT_URL_MIGRATIONS.find((m) => m.key === key && m.from);
                if (migration && typeof raw === 'string' && raw.includes(migration.from.replace('<SELLERID>', ''))) {
                    findings.push({ code, area: 'urls', key, issue: 'legacy_pattern (bkz. productUrls.ts köprüsü — okuma anında zaten V2\'ye çevriliyor)' });
                }
            }
        }

        // (c) settings.* — üst düzey anahtar beklenmedik mi?
        const settings = doc.settings && typeof doc.settings === 'object' ? doc.settings : {};
        const descriptor = descriptors[code];
        const required = new Set((descriptor && descriptor.auth && descriptor.auth.requiredSettings) || []);
        for (const key of Object.keys(settings)) {
            if (required.has(key) || KNOWN_NON_SECRET_SETTINGS_KEYS.has(key)) continue;
            findings.push({ code, area: 'settings', key, issue: 'unexpected_settings_key (requiredSettings dışı — DEĞER yazdırılmadı)' });
        }
    }

    console.log(`[config-drift-scan] ${docs.length} platform entegrasyon kaydı tarandı (SALT OKUMA, hiçbir alan değiştirilmedi).`);
    if (findings.length === 0) {
        console.log('[config-drift-scan] Bulgu YOK: taranan anahtarlarda host-izin-listesi/emekli-desen/beklenmedik-settings-anahtarı çelişkisi bulunamadı.');
        return;
    }
    console.log(`[config-drift-scan] ${findings.length} bulgu (yalnız anahtar adı + tür; DEĞER yazdırılmadı):`);
    for (const f of findings) {
        console.log(`  - ${f.code} / ${f.area}.${f.key}: ${f.issue}`);
    }
}

runCli('config-drift-scan', main);
