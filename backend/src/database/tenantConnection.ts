import { DBConfig } from '@interfaces/index';
import { rawEnv } from '@config';

/**
 * ADR-0003 B.6-B.7 (adım 5): tenant DB bağlantısı, uygulamanın env'deki bağlantı bilgisinden (DB_URL/DB_USER/DB_PASSWORD) kurulur.
 * `Clients.dbConfig` YALNIZCA `dbname` ve `poolsize` taşır; kayıtlarda göç öncesinden kalan `url/user/password` alanları YOK SAYILIR
 * (yeni kod ASLA onları okumaz). Tek uygulama DB kullanıcısı; tenant başına kullanıcı yok.
 *
 * DB_URL iki biçimde olabilir:
 *  - `{{DBNAME}}` yer tutuculu (Atlas şablonu; `{{USER}}`/`{{PASSWORD}}` de olabilir): Database.createConnectionString doldurur.
 *  - yer tutucusuz düz URL (local: `mongodb://127.0.0.1/<appdb>?authSource=admin`): yol (path) kısmındaki DB adı tenant'ınkiyle DEĞİŞTİRİLİR
 *    (aksi halde tenant bağlantısı yanlışlıkla uygulama DB'sine düşerdi).
 */
export interface TenantDbRecord {
    dbConfig?: { dbname?: string; poolsize?: number } & Record<string, any>;
}

// MongoDB DB adı güvenli alt kümesi: URL'e enjeksiyon (`/`, `?`, `@`, `{{` vb.) mümkün olmasın
const DBNAME_RE = /^[A-Za-z0-9_-]{1,63}$/;

export function isValidTenantDbName(name: unknown): name is string {
    return typeof name === 'string' && DBNAME_RE.test(name);
}

/** URL'in yol kısmındaki DB adını değiştirir; `{{DBNAME}}` yer tutucusu varsa onu bırakır (Database doldurur). */
export function withDbName(url: string, dbname: string): string {
    if (url.includes('{{DBNAME}}')) return url;
    const m = /^(mongodb(?:\+srv)?:\/\/[^/?]*)(\/[^?]*)?(\?.*)?$/.exec(url);
    if (!m) throw new Error('[TenantDb] DB_URL geçersiz biçimde (mongodb:// veya mongodb+srv:// bekleniyor).');
    return `${m[1]}/${dbname}${m[3] ?? ''}`;
}

/** Env'den uygulama bağlantı bilgisi + kayıttan yalnızca dbname/poolsize. Hata mesajları değer içermez. */
export function buildTenantDbConfig(client: TenantDbRecord, env: NodeJS.ProcessEnv = rawEnv()): DBConfig {
    const dbname = client?.dbConfig?.dbname;
    if (!isValidTenantDbName(dbname)) throw new Error('[TenantDb] Tenant kaydında geçerli bir dbConfig.dbname yok.');
    const url = env.DB_URL;
    if (!url) throw new Error('[TenantDb] DB_URL tanımlı değil (tenant bağlantısı env\'den kurulur).');
    const poolsize = Number(client.dbConfig?.poolsize) || Number(env.DB_POOL_SIZE) || 20;
    return {
        url: withDbName(url, dbname),
        user: env.DB_USER ?? '',
        password: env.DB_PASSWORD ?? '',
        dbname,
        poolsize,
    };
}

/**
 * Tenant DB adı İZİN KAPISI (CLAUDE.md kural 2 + ADR-0003/0024): ad güvenli alt kümeden olmalı VE ya izinli bilinen tenant
 * adlarından biri ya da provisioning'in ürettiği kalıp (`entegrasyonikClient_<n>`, n yalnız rakam) olmalı. Genel önek kuralı
 * (ör. `entegrasyonik*`) BİLİNÇLİ OLARAK kullanılmaz — `entegrasyonik_test` gibi keyfi adları geçirirdi. Uygulama DB'si
 * (`entegrasyonikDB`, env `DB_NAME`) tenant olamaz. Başka projelerin DB'leri (aynı cluster) bu kapıdan geçemez.
 */
const KNOWN_TENANT_DB_NAMES: ReadonlySet<string> = new Set([
    'entegrasyonik',
    'entegrasyonik_client',
    'entegrasyonik_client_2',
    'entegrasyonik_client_24',
    'entegrasyonik_client_25',
    'entegrasyonikClient_1',
]);
const PROVISIONED_TENANT_DB = /^entegrasyonikClient_[1-9]\d{0,8}$/;
export function isAllowedTenantDbName(name: unknown, appDbName: string | undefined = rawEnv().DB_NAME): name is string {
    if (!isValidTenantDbName(name)) return false;
    if (!KNOWN_TENANT_DB_NAMES.has(name) && !PROVISIONED_TENANT_DB.test(name)) return false;
    if (name === 'entegrasyonikDB' || (appDbName && name === appDbName)) return false;
    return true;
}
