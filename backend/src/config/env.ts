// ADR-0017 §10 "Yapılandırma doğrulama" + ADR-0016 §1 (`config/`, B-R5): TEK zod env şeması.
//
// Kural: kod tabanındaki `process.env` okumaları buraya taşınır; `config/` DIŞINDA yeni `process.env` okuması EKLENEMEZ
// (statik mandal: tests/static/process-env.ratchet.test.ts). Burası iki kipte çalışır:
//   - strict  (süreç başlangıcı, `assertConfig`): eksik zorunlu / yanlış tipli / geçersiz enum -> ConfigError (sırsız, yalnız
//              değişken ADI + neden listesi; değerler ASLA hata iletisine girmez). Süreç başlamaz (fail-fast).
//   - lenient (çalışma anı, `getConfig`): geçersiz değer, eski davranışın verdiği varsayılana düşer (bugüne dek `Number(x) || def`
//              gibi toleranslı okuma vardı; testler env'i çalışırken değiştirir). Startup zaten strict doğruladığı için üretimde
//              lenient yola yalnızca test/operasyonel sapma düşer.
// Sırlar (JWT_SECRET, DB_PASSWORD, R2_SECRET..., FIELD_ENCRYPTION_KEYS, ZOHO_SMTP_PASS ...) burada yalnızca TİPLENİR; hiçbir
// yerde loglanmaz. Bu modül log/redaksiyon katmanına bağımlı DEĞİLDİR (Sv 1: yalnızca `interfaces`/`utils` alt katmanı).
import { z } from 'zod';

export const APP_ENVS = ['local', 'staging', 'production'] as const;
export type AppEnv = typeof APP_ENVS[number];
export const APP_ROLES = ['web', 'worker', 'all'] as const;
export type AppRoleName = typeof APP_ROLES[number];
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
export type LogLevelName = typeof LOG_LEVELS[number];
export const LOG_FORMATS = ['json', 'legacy'] as const;
export type LogFormatName = typeof LOG_FORMATS[number];
export const MOCK_PREFIXES = ['TY', 'PAZARAMA', 'N11', 'HEPSIBURADA', 'IDEASOFT', 'BIZIMHESAP'] as const;
export type MockPrefixName = typeof MOCK_PREFIXES[number];

const JWT_SECRET_MIN_BYTES = 32;

export class ConfigError extends Error {
    public readonly issues: string[];
    constructor(issues: string[]) {
        super('Yapılandırma (env) geçersiz; süreç başlatılamaz:\n' + issues.map(i => ' - ' + i).join('\n'));
        this.name = 'ConfigError';
        this.issues = issues;
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Alan yardımcıları. `strict=false` iken hatalı/boş değer `undefined`'a düşer (varsayılan uygulanır).
// ---------------------------------------------------------------------------------------------------------------------
type Mode = { strict: boolean };

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

function f(m: Mode) {
    const lenient = <T extends z.ZodTypeAny>(s: T) => (m.strict ? s : s.catch(undefined as any));
    return {
        /** İsteğe bağlı düz metin (boş -> undefined). */
        str: () => z.preprocess(blank, z.string().optional()),
        /** Varsayılanlı düz metin. */
        strDef: (def: string) => z.preprocess(blank, z.string().optional()).transform(v => v ?? def),
        /** Kırpılıp küçük harfe çevrilen isteğe bağlı metin (PAYMENT_PROVIDER gibi). */
        lower: () => z.preprocess(v => { const b = blank(v); return typeof b === 'string' ? b.trim().toLowerCase() : b; }, z.string().optional()),
        /** Tam sayı; boş -> varsayılan. Lenient: geçersiz/aralık dışı -> varsayılan. */
        int: (def: number | undefined, o: { min?: number; max?: number } = {}) => {
            const min = o.min ?? 1;
            const base = z.string().regex(/^-?\d+$/, 'tam sayı olmalı').transform(Number)
                .pipe(z.number().int().min(min, `en az ${min} olmalı`).max(o.max ?? Number.MAX_SAFE_INTEGER, `en çok ${o.max} olmalı`));
            return z.preprocess(blank, lenient(base.optional())).transform(v => (v === undefined ? def : v));
        },
        /**
         * Eski `Number(process.env.X) || def` deseninin BİREBİR eşdeğeri (DatabaseManager karakterizasyonu: negatif/kesirli
         * DEĞER GEÇER, yalnızca NaN/0/boş varsayılana düşer). Yeni okuma eklemek için KULLANILMAZ — yalnız zaten bu deseni
         * kullanan, karakterizasyon testiyle kilitli tek alan (`DB_POOL_SIZE`) için.
         */
        looseNum: (def: number) => z.preprocess(blank, z.string().optional()).transform(v => {
            if (v === undefined) return def;
            const n = Number(v);
            return Number.isFinite(n) && n !== 0 ? n : def;
        }),
        /** 'true' | 'false'. Lenient: eski `=== 'true'` semantiği. */
        bool: (def: boolean) => z.preprocess(blank, m.strict
            ? z.enum(['true', 'false'], { errorMap: () => ({ message: "'true' veya 'false' olmalı" }) }).optional()
            : z.any()).transform(v => (v === undefined ? def : v === 'true')),
        /** Sabit küme; lenient: geçersiz -> varsayılan. */
        enumOf: <V extends readonly [string, ...string[]]>(values: V, def: V[number] | undefined) => {
            const base = z.enum(values, { errorMap: () => ({ message: `izinli değerler: ${values.join('|')}` }) });
            return z.preprocess(v => { const b = blank(v); return typeof b === 'string' ? b.trim().toLowerCase() : b; }, lenient(base.optional()))
                .transform(v => (v === undefined ? def : v)) as unknown as z.ZodType<V[number] | undefined>;
        },
        /** Virgüllü liste -> trim'lenmiş, boşları atılmış dizi. */
        list: () => z.preprocess(blank, z.string().optional()).transform(v => (v ?? '').split(',').map(s => s.trim()).filter(s => s.length > 0)),
    };
}

/** Düz (flat) env şemasının şekli. Anahtar = ortam değişkeni adı. */
function buildShape(m: Mode) {
    const t = f(m);
    const shape: Record<string, z.ZodTypeAny> = {
        // --- Uygulama / ortam ---
        NODE_ENV: t.str(),
        APP_ENV: t.enumOf(APP_ENVS, undefined),
        APP_ROLE: t.enumOf(APP_ROLES, 'all'),
        POD_NAME: t.str(),
        GIT_SHA: t.str(),
        RENDER_GIT_COMMIT: t.str(),
        RAILWAY_GIT_COMMIT_SHA: t.str(),
        LOG_LEVEL: t.enumOf(LOG_LEVELS, undefined),
        LOG_FORMAT: t.enumOf(LOG_FORMATS, 'json'),

        // --- HTTP sunucusu / CORS ---
        SERVER_NAME: t.strDef('EntegrasyonikApiServer'),
        SERVER_CONTEXT: t.strDef('/api'),
        SERVER_HOST: t.strDef('0.0.0.0'),
        SERVER_PORT: t.int(5001, { max: 65535 }),
        SERVER_TIMEOUT_SEC: t.int(undefined),
        IMAGE_FILES_PATH: t.strDef('products/'),
        CORS_ORIGINS: t.str(),
        CORS_METHODS: t.strDef('GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'),
        CORS_CREDENTIALS: t.bool(false),
        TRUSTED_PROXY_HOPS: t.int(0, { min: 0 }),

        // --- Rate limit (süreç-içi, tek replika varsayımı: ADR-0017 §10 — web pod >= 2 iken Redis tabanlıya geçilir) ---
        GLOBAL_RATE_LIMIT_ENABLED: t.bool(true),
        GLOBAL_RATE_LIMIT_MAX: t.int(600),
        GLOBAL_RATE_LIMIT_WINDOW_MS: t.int(60_000),
        LOGIN_RATE_LIMIT_MAX: t.int(10),
        LOGIN_RATE_LIMIT_WINDOW_MS: t.int(60_000),
        REGISTER_RATE_LIMIT_MAX: t.int(3),
        REGISTER_RATE_LIMIT_WINDOW_MS: t.int(3_600_000),
        PASSWORD_RESET_RATE_LIMIT_MAX: t.int(3),
        PASSWORD_RESET_RATE_LIMIT_IP_MAX: t.int(10),
        PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: t.int(3_600_000),
        ACCOUNT_TOKEN_RATE_LIMIT_MAX: t.int(20),
        ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS: t.int(600_000),
        BILLING_WEBHOOK_RATE_LIMIT_MAX: t.int(60),
        BILLING_WEBHOOK_RATE_LIMIT_WINDOW_MS: t.int(60_000),
        MOCK_CHECKOUT_RATE_LIMIT_MAX: t.int(30),
        MOCK_CHECKOUT_RATE_LIMIT_WINDOW_MS: t.int(60_000),
        EXPORT_DOWNLOAD_RATE_LIMIT_MAX: t.int(20),
        EXPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS: t.int(600_000),
        // ADR-0017 Karar 1.8: "istemci başına 20 olay/5 dk" (IP+oturum anahtarlı).
        CLIENT_LOG_RATE_LIMIT_MAX: t.int(20),
        CLIENT_LOG_RATE_LIMIT_WINDOW_MS: t.int(300_000),

        // --- Kimlik (ADR-0001) ---
        JWT_SECRET: m.strict
            ? z.string({ required_error: 'zorunlu (tanımsız)' }).refine(s => Buffer.byteLength(s, 'utf8') >= JWT_SECRET_MIN_BYTES, `en az ${JWT_SECRET_MIN_BYTES} bayt olmalı`)
            : t.str(),
        JWT_SECRET_PREVIOUS: m.strict
            ? z.preprocess(blank, z.string().refine(s => Buffer.byteLength(s, 'utf8') >= JWT_SECRET_MIN_BYTES, `tanımlıysa en az ${JWT_SECRET_MIN_BYTES} bayt olmalı`).optional())
            : t.str(),
        JWT_ISSUER: z.preprocess(v => (typeof v === 'string' ? v.trim() : v), z.string().optional()).transform(v => (v ? v : 'entegrasyonik')),

        // --- Alan şifreleme (ADR-0003 C.10): biçim doğrulaması FieldCrypto'dadır; burada yalnız varlık ---
        FIELD_ENCRYPTION_KEYS: m.strict ? z.string({ required_error: 'zorunlu (tanımsız)' }).min(1, 'zorunlu') : t.str(),
        FIELD_ENCRYPTION_ACTIVE_KID: m.strict ? z.string({ required_error: 'zorunlu (tanımsız)' }).min(1, 'zorunlu') : t.str(),

        // --- Veritabanı (ADR-0003: tenant bağlantıları da bu değerlerden kurulur) ---
        DB_URL: m.strict ? z.string({ required_error: 'zorunlu (tanımsız)' }).min(1, 'zorunlu') : t.str(),
        DB_USER: t.str(),
        DB_PASSWORD: t.str(),
        DB_NAME: t.str(),
        DB_POOL_SIZE: t.looseNum(20),
        TENANT_DB_ROLE_MAX: t.str(), // biçimi TenantProvisioningService'te (geçersiz -> uyarı + sınır yok)

        // --- Redis ---
        REDIS_HOST: t.str(),
        REDIS_PORT: t.int(6379, { max: 65535 }),
        REDIS_PASSWORD: t.str(),
        REDIS_TLS: t.bool(false),

        // --- Mail (Zoho SMTP) ---
        ZOHO_SMTP_HOST: t.str(),
        ZOHO_SMTP_PORT: t.int(undefined, { max: 65535 }),
        ZOHO_SMTP_USER: t.str(),
        ZOHO_SMTP_PASS: t.str(),
        FROM_EMAIL: t.str(),
        FROM_NAME: t.strDef('Entegrasyonik'),
        PUBLIC_APP_URL: t.str(),

        // --- Depolama (R2) — zorunluluk kontrolü kullanım anında (storageEnv) ---
        R2_ACCESS_KEY_ID: t.str(),
        R2_SECRET_ACCESS_KEY: t.str(),
        R2_ENDPOINT: t.str(),
        R2_REGION: t.str(),
        R2_BUCKET_IMAGE: t.str(),
        R2_BUCKET_ARCHIVE: t.str(),
        R2_PUBLIC_URL_IMAGE: t.str(),
        R2_PUBLIC_URL_ARCHIVE: t.str(),

        // --- Ödeme (ADR-0008) ---
        PAYMENT_PROVIDER: t.lower(),
        PAYMENT_ENV: t.lower(),
        BILLING_MOCK_HMAC_SECRET: t.str(),
        MOCK_CHECKOUT_BASE_URL: t.str(),
        MOCK_CHECKOUT_RETURN_URL: t.str(),
        SEED_PLANS_BACKUP_CONFIRMED: t.str(),
        // ADR-0008 §3(a-c) guard bağlama görevi: `EntitlementService.checkAccess`'in API katmanına (RunOperation.ts)
        // ve IntegrationEngine iş planlayıcısına (Dispatcher/OrderQueueProducer) bağlanmasını AÇAR/KAPATIR.
        // Varsayılan `false` (KAPALI): production'da legacy migration (npm run migrate:legacy-subscriptions) çalışıp
        // insan onayı olmadan otomatik AÇILMAZ (BACKLOG C16 uyarısı). Kapalıyken mevcut davranış birebir korunur.
        ENTITLEMENT_GUARD_ENABLED: t.bool(false),

        // --- Entegrasyon adaptörleri ---
        TY_HTTP_TIMEOUT_MS: t.int(undefined),
        PAZARAMA_HTTP_TIMEOUT_MS: t.int(undefined),
        N11_HTTP_TIMEOUT_MS: t.int(undefined),
        HB_HTTP_TIMEOUT_MS: t.int(undefined),
        IDEASOFT_HTTP_TIMEOUT_MS: t.int(undefined),
        BIZIMHESAP_HTTP_TIMEOUT_MS: t.int(undefined),
        TY_RATE_PER_MIN: t.int(undefined),
        TY_ORDER_LIST_RATE_PER_MIN: t.int(undefined),

        // --- Gözlemlenebilirlik bayrakları (yalnız test/geliştirme) ---
        INTEGRATION_METRICS_DISABLED: t.bool(false),
        AUDIT_LOG_DISABLED: t.bool(false),

        // --- Zamanlayıcı (ADR-0016 §2.2) ---
        // Kaçış anahtarı: yalnız acil durum için `off`. Varsayılan `on` (Mongo lease etkin).
        SCHEDULER_LEASE: t.enumOf(['on', 'off'] as const, 'on'),
        // [ADR-0016 §2.4 / MM-14] `ExportOrchestrator` boşta uyku üst sınırı; bugün 5 dk (`export.config.json`
        // exportLoopDelay), yerine 15 sn'lik DB yoklama yedeği (web->worker sinyal kaybını kapatır).
        EXPORT_IDLE_POLL_MS: t.int(15_000, { min: 1000 }),

        // --- ADR-0018 Karar 2b/2c (Aşama B): aktif probe + kaynak izleyici kapı bayrakları ---
        // Varsayılan `false`: probe YALNIZ replay modunda (kayıtlı fikstür) koşar, gerçek ağ isteği ATMAZ.
        // `true` yapılması İNSAN KARARIDIR (Karar 6 #3, platform düzeyi test hesapları); `ProbeRunner` mock modu
        // AÇIK bir entegrasyonla aynı anda `true` görürse fail-fast reddeder (ADR-0018 Karar 2b son madde).
        PROBES_LIVE: t.bool(false),
        // Varsayılan `false`: haftalık kaynak izleyici (`SourceMonitor`) GERÇEK dış ağ isteği atar (dış web sayfası,
        // tenant/platform kimlik bilgisi içermez) -- ilk çalıştırmada canlı istek atmaması için varsayılan KAPALI.
        SOURCE_MONITOR_ENABLED: t.bool(false),
        // Kaynak izleyicinin User-Agent'i (ADR-0018 Karar 2c "kimliği belli bir User-Agent, ürün adı + iletişim").
        SOURCE_MONITOR_USER_AGENT: t.strDef('Entegrasyonik-SourceMonitor/1.0 (+https://entegrasyonik.com; kaynak-izleme, robots.txt uyumlu)'),

        // --- ADR-0020 Karar 3.2/9.1 (Aşama B): iki kişi kuralı iskeleti ---
        // Varsayılan `false` (KAPALI): bugün tek platformAdmin var; açılırsa hiçbir `dangerous` yayın yapılamaz
        // (Karar 9.1). Açılma eşiği insan kararıdır (aktif platformAdmin ≥2 ve ekip dışı erişim ya da bir olay).
        TWO_PERSON_RULE_ENABLED: t.bool(false),

        // --- Yalnız geliştirme araçları (dev-tools/*, backup/): uygulama süreci okumaz, .env.example tutarlılığı için tanımlı ---
        LOCAL_DB_URL: t.str(),
        LOCAL_DB_USER: t.str(),
        LOCAL_DB_PASSWORD: t.str(),
        LOCAL_DB_NAME: t.str(),
    };
    // C19: mock modu (fail-closed) bayrakları — adaptör başına 3 değişken
    for (const p of MOCK_PREFIXES) {
        shape[`${p}_MOCK_MODE`] = t.bool(false);
        shape[`${p}_MOCK_BASE_URL`] = t.str();
        shape[`${p}_MOCKABLE_ENDPOINTS`] = t.list();
    }
    return shape;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ham (flat) -> tipli, iç içe `AppConfig`
// ---------------------------------------------------------------------------------------------------------------------
type RL = { max: number; windowMs: number };

function nest(e: Record<string, any>) {
    const nodeEnv: string | undefined = e.NODE_ENV;
    const warnings: string[] = [];
    let appEnv: AppEnv | undefined = e.APP_ENV;
    if (!appEnv) {
        appEnv = nodeEnv === 'production' ? 'production' : 'local';
        if (nodeEnv === 'production') warnings.push('APP_ENV tanımsız; NODE_ENV=production nedeniyle "production" varsayıldı (staging ise APP_ENV=staging ayarlayın).');
    }
    const sha: string | undefined = e.GIT_SHA || e.RENDER_GIT_COMMIT || e.RAILWAY_GIT_COMMIT_SHA;
    const mock = {} as Record<MockPrefixName, { enabled: boolean; baseUrl: string | undefined; mockableEndpoints: string[] }>;
    for (const p of MOCK_PREFIXES) {
        mock[p] = { enabled: e[`${p}_MOCK_MODE`], baseUrl: e[`${p}_MOCK_BASE_URL`], mockableEndpoints: e[`${p}_MOCKABLE_ENDPOINTS`] };
    }
    const rl = (max: string, win: string): RL => ({ max: e[max], windowMs: e[win] });
    return {
        nodeEnv,
        appEnv,
        isProduction: appEnv === 'production',
        role: e.APP_ROLE as AppRoleName,
        podName: e.POD_NAME as string | undefined,
        version: sha ? String(sha).slice(0, 7) : 'dev',
        warnings,
        log: { level: e.LOG_LEVEL as LogLevelName | undefined, format: e.LOG_FORMAT as LogFormatName },
        server: {
            name: e.SERVER_NAME as string,
            context: e.SERVER_CONTEXT as string,
            host: e.SERVER_HOST as string,
            port: e.SERVER_PORT as number,
            timeoutSec: e.SERVER_TIMEOUT_SEC as number | undefined,
            imageFilesPath: e.IMAGE_FILES_PATH as string,
            cors: { origins: e.CORS_ORIGINS as string | undefined, methods: e.CORS_METHODS as string, credentials: e.CORS_CREDENTIALS as boolean },
        },
        rateLimit: {
            trustedProxyHops: e.TRUSTED_PROXY_HOPS as number,
            global: { enabled: e.GLOBAL_RATE_LIMIT_ENABLED as boolean, ...rl('GLOBAL_RATE_LIMIT_MAX', 'GLOBAL_RATE_LIMIT_WINDOW_MS') },
            login: rl('LOGIN_RATE_LIMIT_MAX', 'LOGIN_RATE_LIMIT_WINDOW_MS'),
            register: rl('REGISTER_RATE_LIMIT_MAX', 'REGISTER_RATE_LIMIT_WINDOW_MS'),
            passwordResetEmail: rl('PASSWORD_RESET_RATE_LIMIT_MAX', 'PASSWORD_RESET_RATE_LIMIT_WINDOW_MS'),
            passwordResetIp: rl('PASSWORD_RESET_RATE_LIMIT_IP_MAX', 'PASSWORD_RESET_RATE_LIMIT_WINDOW_MS'),
            accountToken: rl('ACCOUNT_TOKEN_RATE_LIMIT_MAX', 'ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS'),
            billingWebhook: rl('BILLING_WEBHOOK_RATE_LIMIT_MAX', 'BILLING_WEBHOOK_RATE_LIMIT_WINDOW_MS'),
            mockCheckout: rl('MOCK_CHECKOUT_RATE_LIMIT_MAX', 'MOCK_CHECKOUT_RATE_LIMIT_WINDOW_MS'),
            exportDownload: rl('EXPORT_DOWNLOAD_RATE_LIMIT_MAX', 'EXPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS'),
            clientLog: rl('CLIENT_LOG_RATE_LIMIT_MAX', 'CLIENT_LOG_RATE_LIMIT_WINDOW_MS'),
        },
        auth: { jwtSecret: e.JWT_SECRET as string | undefined, jwtSecretPrevious: e.JWT_SECRET_PREVIOUS as string | undefined, jwtIssuer: e.JWT_ISSUER as string },
        fieldEncryption: { keys: e.FIELD_ENCRYPTION_KEYS as string | undefined, activeKid: e.FIELD_ENCRYPTION_ACTIVE_KID as string | undefined },
        db: {
            url: e.DB_URL as string | undefined, user: e.DB_USER as string | undefined, password: e.DB_PASSWORD as string | undefined,
            name: e.DB_NAME as string | undefined, poolSize: e.DB_POOL_SIZE as number, tenantRoleMax: e.TENANT_DB_ROLE_MAX as string | undefined,
        },
        redis: { host: e.REDIS_HOST as string | undefined, port: e.REDIS_PORT as number, password: e.REDIS_PASSWORD as string | undefined, tls: e.REDIS_TLS as boolean },
        mail: {
            host: e.ZOHO_SMTP_HOST as string | undefined, port: e.ZOHO_SMTP_PORT as number | undefined, user: e.ZOHO_SMTP_USER as string | undefined,
            pass: e.ZOHO_SMTP_PASS as string | undefined, fromEmail: e.FROM_EMAIL as string | undefined, fromName: e.FROM_NAME as string,
            publicAppUrl: e.PUBLIC_APP_URL as string | undefined,
        },
        billing: {
            provider: e.PAYMENT_PROVIDER as string | undefined, env: e.PAYMENT_ENV as string | undefined,
            mockHmacSecret: e.BILLING_MOCK_HMAC_SECRET as string | undefined,
            mockCheckoutBaseUrl: e.MOCK_CHECKOUT_BASE_URL as string | undefined, mockCheckoutReturnUrl: e.MOCK_CHECKOUT_RETURN_URL as string | undefined,
        },
        mock,
        httpTimeoutMs: {
            trendyol: e.TY_HTTP_TIMEOUT_MS as number | undefined, pazarama: e.PAZARAMA_HTTP_TIMEOUT_MS as number | undefined,
            n11: e.N11_HTTP_TIMEOUT_MS as number | undefined, hepsiburada: e.HB_HTTP_TIMEOUT_MS as number | undefined,
            ideasoft: e.IDEASOFT_HTTP_TIMEOUT_MS as number | undefined, bizimhesap: e.BIZIMHESAP_HTTP_TIMEOUT_MS as number | undefined,
        },
        trendyolRatePerMin: { global: e.TY_RATE_PER_MIN as number | undefined, orderList: e.TY_ORDER_LIST_RATE_PER_MIN as number | undefined },
        flags: {
            integrationMetricsDisabled: e.INTEGRATION_METRICS_DISABLED as boolean, auditLogDisabled: e.AUDIT_LOG_DISABLED as boolean,
            entitlementGuardEnabled: e.ENTITLEMENT_GUARD_ENABLED as boolean,
        },
        scheduler: {
            leaseEnabled: (e.SCHEDULER_LEASE as 'on' | 'off') !== 'off',
            exportIdlePollMs: e.EXPORT_IDLE_POLL_MS as number,
        },
        // ADR-0018 Karar 2b/2c (Aşama B)
        compliance: {
            probesLive: e.PROBES_LIVE as boolean,
            sourceMonitorEnabled: e.SOURCE_MONITOR_ENABLED as boolean,
            sourceMonitorUserAgent: e.SOURCE_MONITOR_USER_AGENT as string,
        },
        // ADR-0020 Karar 3.2/9.1 (Aşama B)
        integrationConfig: {
            twoPersonRuleEnabled: e.TWO_PERSON_RULE_ENABLED as boolean,
        },
    };
}

export type AppConfig = ReturnType<typeof nest>;

const schemas: Partial<Record<'strict' | 'lenient', { shape: Record<string, z.ZodTypeAny>; schema: z.ZodType<AppConfig, z.ZodTypeDef, unknown> }>> = {};
function getSchema(strict: boolean) {
    const key = strict ? 'strict' : 'lenient';
    let s = schemas[key];
    if (!s) {
        const shape = buildShape({ strict });
        s = { shape, schema: z.object(shape).transform(nest) as any };
        schemas[key] = s;
    }
    return s;
}

/** Şemanın tanıdığı TÜM ortam değişkeni adları (`.env.example` tutarlılık testi ve parmak izi için). */
export function envKeys(): string[] {
    return Object.keys(getSchema(false).shape);
}

function reasonOf(issue: z.ZodIssue): string {
    // `received` değeri ASLA iletiye katılmaz (sır sızıntısı olmaz); yalnız sabit/şema kaynaklı metin.
    switch (issue.code) {
        case 'invalid_type': return issue.received === 'undefined' ? 'zorunlu (tanımsız)' : `geçersiz tip (beklenen: ${issue.expected})`;
        case 'invalid_enum_value': return `geçersiz değer (izinli: ${issue.options.join('|')})`;
        default: return issue.message;
    }
}

/** Ham ortamı (varsayılan process.env) doğrular. Strict: hata listesi + ConfigError; lenient: hep tipli sonuç. */
export function parseEnv(raw: NodeJS.ProcessEnv, opts: { strict: boolean }): AppConfig {
    const { schema } = getSchema(opts.strict);
    const res = schema.safeParse(raw);
    if (res.success) return res.data;
    const issues = res.error.issues.map(i => `${String(i.path[0] ?? '(env)')}: ${reasonOf(i)}`);
    throw new ConfigError(issues);
}
