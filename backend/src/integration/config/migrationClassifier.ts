// ADR-0020 Karar 7.1 (Aşama B, göç aracı) — `Integrations.urls` değerlerini manifestoyla KARŞILAŞTIRAN saf sınıflandırıcı.
// I/O yapmaz; `dev-tools/migrate-integration-config.js` (derlenmiş `dist/` üzerinden `loadDist`) bunu çağırır.
//
// BİLİNÇLİ SINIRLAMA (rapora yazılır): `path_diff` sınıfı yalnız Trendyol için (bilinen versiyon işaretçisi `/v2/`
// üzerinden) ISITICI ÖRNEK olarak üretilir. Diğer 5 adaptörde `config.endpoints` (host+pathTemplate tam ayrışması,
// ADR §1.4) Aşama A'da YAZILMADIĞI için genel bir "beklenen yol" kaynağı yok — bu adaptörlerde yol her zaman
// `same`/`host_diff` sınıfına düşer (yalnız HOST karşılaştırılır, YOL karşılaştırılmaz). Bu, otomatik taşımayı
// YANLIŞ yönde etkilemez (yalnız `host_diff` + görünüm alanları taşınır, Karar 7.1); yalnız RAPORUN eksiksizliğini sınırlar.
import { hostMatchesPattern } from '@integration/modules/common/security/outboundHosts';
import { findMatchingRetiredEndpoint, type RetiredEndpointPatternLike } from './urlGuard';

export const MIGRATION_OUTCOMES = ['same', 'host_diff', 'path_diff', 'retired', 'unparseable'] as const;
export type MigrationOutcome = typeof MIGRATION_OUTCOMES[number];

export interface UrlClassification {
    key: string;
    outcome: MigrationOutcome;
    /** Yalnız TANI amaçlı, ASLA sorgu dizesi/kimlik bilgisi içermez (bkz. `redactUrl`). */
    host?: string;
    note: string;
}

export interface ClassifyUrlInput {
    code: string;
    key: string;
    rawValue: unknown;
    allowedHosts: readonly string[];
    retiredEndpoints?: readonly RetiredEndpointPatternLike[];
}

/** Sorgu dizesi/parça ve userinfo kırpılır (CLAUDE.md kural 3/4: sır/bağlantı bilgisi çıktıya YAZILMAZ). */
export function redactUrl(raw: unknown): string {
    if (typeof raw !== 'string') return `<${typeof raw}>`;
    return raw.replace(/[?#].*$/, '').replace(/^(https?:\/\/)[^/@]*@/i, '$1');
}

/** Trendyol için ısıtıcı örnek: bilinen versiyonlu anahtarlarda `/v2/` yoksa (ve emekli desene UYMUYORSA) `path_diff`. */
const TRENDYOL_VERSIONED_KEYS = new Set(['orderListUrl', 'transferUrl', 'productListUrl', 'updateDeliveryUrl', 'categoryAttributeListUrl']);

export function classifyUrlValue(input: ClassifyUrlInput): UrlClassification {
    const { code, key, rawValue, allowedHosts, retiredEndpoints = [] } = input;

    if (typeof rawValue !== 'string' || rawValue.length === 0) {
        return { key, outcome: 'unparseable', note: 'değer boş ya da dize değil' };
    }

    const retiredHit = findMatchingRetiredEndpoint(rawValue, retiredEndpoints);
    if (retiredHit) {
        return { key, outcome: 'retired', note: `emekli desenle eşleşiyor (${retiredHit.retiredAt}); yerine ${retiredHit.replacementKey ?? '(belirtilmemiş)'}` };
    }

    let url: URL;
    try { url = new URL(rawValue); } catch {
        return { key, outcome: 'unparseable', note: 'URL ayrıştırılamadı (mutlak URL değil)' };
    }
    const host = url.hostname.toLowerCase();

    if (!allowedHosts.some((p) => hostMatchesPattern(host, p))) {
        return { key, outcome: 'unparseable', host, note: 'host izin listesinde tanınmıyor' };
    }

    const isDefaultHost = allowedHosts.length > 0 && host === allowedHosts[0].toLowerCase();

    if (code === 'trendyol' && isDefaultHost && TRENDYOL_VERSIONED_KEYS.has(key) && !url.pathname.includes('/v2/')) {
        return { key, outcome: 'path_diff', host, note: 'host güncel ama yol beklenen sürüm işaretçisini (/v2/) taşımıyor' };
    }

    if (isDefaultHost) {
        return { key, outcome: 'same', host, note: 'birincil (varsayılan) host ile eşleşiyor' };
    }
    return { key, outcome: 'host_diff', host, note: 'izinli listede ama birincil (varsayılan) host değil (alternatif ortam seçimi olabilir)' };
}

export interface IntegrationConfigDoc {
    code: string;
    urls?: Record<string, unknown>;
    title?: string;
    color?: string;
    logo?: string;
}

export interface DescriptorLike {
    config: { hosts: readonly string[]; retiredEndpoints?: readonly RetiredEndpointPatternLike[] };
}

export interface CodeReport {
    code: string;
    urls: UrlClassification[];
    /** `--apply` yalnız bunları taşır (Karar 7.1): host farkı taşınacak anahtarlar + görünüm alanları. */
    migratableHostOverrides: string[];
    viewFields: { title?: string; color?: string; logo?: string };
}

/** Tek bir platform `Integrations` belgesini sınıflandırır. Saf; I/O yapmaz. */
export function classifyIntegrationDoc(doc: IntegrationConfigDoc, descriptor: DescriptorLike | undefined): CodeReport {
    const code = String(doc.code || '').trim().toLowerCase();
    const allowedHosts = descriptor?.config.hosts ?? [];
    const retiredEndpoints = descriptor?.config.retiredEndpoints ?? [];
    const urls = doc.urls && typeof doc.urls === 'object' ? doc.urls : {};

    const classifications = Object.keys(urls).map((key) => classifyUrlValue({ code, key, rawValue: urls[key], allowedHosts, retiredEndpoints }));
    const migratableHostOverrides = classifications.filter((c) => c.outcome === 'host_diff').map((c) => c.key);

    return {
        code,
        urls: classifications,
        migratableHostOverrides,
        viewFields: { title: doc.title, color: doc.color, logo: doc.logo },
    };
}

/** Tüm platform kayıtlarını sınıflandırır (rapor; hiçbir yan etkisi yoktur). */
export function buildMigrationReport(docs: IntegrationConfigDoc[], descriptors: Record<string, DescriptorLike | undefined>): CodeReport[] {
    return docs.map((d) => classifyIntegrationDoc(d, descriptors[String(d.code || '').trim().toLowerCase()]));
}
