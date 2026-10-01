/**
 * ADR-0017 §10 / ADR-0016 B-R5: config/env şeması. Testler process.env'i DOKUNMADAN, enjekte edilen ham env nesneleriyle
 * çalışır (yalnızca `config` Proxy testi process.env'i geçici değiştirir ve geri yükler). DB/Redis/ağ YOK.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { ConfigError, assertConfig, config, envKeys, getConfig, resetConfigForTests } from '@config';

const SECRET = 'A'.repeat(48);
const KEYS = 'k1:' + Buffer.alloc(32, 1).toString('base64');
/** Startup (strict) için asgari geçerli env. */
const valid = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  JWT_SECRET: SECRET, FIELD_ENCRYPTION_KEYS: KEYS, FIELD_ENCRYPTION_ACTIVE_KID: 'k1', DB_URL: 'mongodb://127.0.0.1:27017/x', ...over,
} as NodeJS.ProcessEnv);

afterEach(() => resetConfigForTests());

describe('config: varsayılanlar (lenient çalışma-anı erişimi)', () => {
  it('boş ortamdan tipli varsayılanlar üretir (eski hard-code varsayılanlarıyla AYNI)', () => {
    const c = getConfig({} as NodeJS.ProcessEnv);
    expect(c.role).toBe('all');
    expect(c.server).toMatchObject({ name: 'EntegrasyonikApiServer', context: '/api', host: '0.0.0.0', port: 5001, imageFilesPath: 'products/' });
    expect(c.server.cors).toEqual({ origins: undefined, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', credentials: false });
    expect(c.redis).toEqual({ host: undefined, port: 6379, password: undefined, tls: false });
    expect(c.db.poolSize).toBe(20);
    expect(c.rateLimit.login).toEqual({ max: 10, windowMs: 60_000 });
    expect(c.rateLimit.register).toEqual({ max: 3, windowMs: 3_600_000 });
    expect(c.rateLimit.global).toEqual({ enabled: true, max: 600, windowMs: 60_000 });
    expect(c.rateLimit.trustedProxyHops).toBe(0);
    expect(c.auth.jwtIssuer).toBe('entegrasyonik');
    expect(c.log.format).toBe('json');
    expect(c.appEnv).toBe('local');
    expect(c.version).toBe('dev');
    expect(c.mock.TY).toEqual({ enabled: false, baseUrl: undefined, mockableEndpoints: [] });
  });

  it('lenient: geçersiz sayı/enum/bool eski davranışla varsayılana düşer (throw ETMEZ)', () => {
    const c = getConfig({ SERVER_PORT: 'abc', REDIS_PORT: '-5', LOGIN_RATE_LIMIT_MAX: '0', APP_ROLE: 'wroker', REDIS_TLS: 'yes', CORS_CREDENTIALS: 'TRUE', LOG_FORMAT: 'xml', TRUSTED_PROXY_HOPS: 'x' } as any);
    expect(c.server.port).toBe(5001);
    expect(c.redis.port).toBe(6379);
    expect(c.rateLimit.login.max).toBe(10);
    expect(c.role).toBe('all');
    expect(c.redis.tls).toBe(false);
    expect(c.server.cors.credentials).toBe(false);
    expect(c.log.format).toBe('json');
    expect(c.rateLimit.trustedProxyHops).toBe(0);
  });

  it('geçerli değerler tiplenir; APP_ROLE büyük/küçük harf ve boşluğa toleranslıdır (eski resolveAppRole)', () => {
    const c = getConfig({
      SERVER_PORT: '6000', APP_ROLE: ' Worker ', REDIS_TLS: 'true', REDIS_PORT: '6380', CORS_CREDENTIALS: 'true', TRUSTED_PROXY_HOPS: '1',
      TY_MOCK_MODE: 'true', TY_MOCKABLE_ENDPOINTS: ' order , claims ,,', TY_MOCK_BASE_URL: 'http://127.0.0.1:9', PAYMENT_PROVIDER: ' MOCK ',
      GIT_SHA: 'abcdef0123456', LOG_LEVEL: 'WARN',
    } as any);
    expect(c.server.port).toBe(6000);
    expect(c.role).toBe('worker');
    expect(c.redis).toMatchObject({ tls: true, port: 6380 });
    expect(c.server.cors.credentials).toBe(true);
    expect(c.rateLimit.trustedProxyHops).toBe(1);
    expect(c.mock.TY).toEqual({ enabled: true, baseUrl: 'http://127.0.0.1:9', mockableEndpoints: ['order', 'claims'] });
    expect(c.billing.provider).toBe('mock');
    expect(c.version).toBe('abcdef0');
    expect(c.log.level).toBe('warn');
  });

  it('APP_ENV: verilmişse kullanılır; yoksa NODE_ENV=production -> production + uyarı, aksi local', () => {
    expect(getConfig({ APP_ENV: 'staging' } as any).appEnv).toBe('staging');
    const prod = getConfig({ NODE_ENV: 'production' } as any);
    expect(prod.appEnv).toBe('production');
    expect(prod.isProduction).toBe(true);
    expect(prod.warnings.join(' ')).toMatch(/APP_ENV tanımsız/);
    expect(getConfig({ NODE_ENV: 'development' } as any).appEnv).toBe('local');
  });

  it('env değişince önbellek otomatik yenilenir; değişmediyse AYNI nesne döner', () => {
    const env = { SERVER_PORT: '7001' } as any;
    const a = getConfig(env);
    expect(getConfig(env)).toBe(a);
    env.SERVER_PORT = '7002';
    expect(getConfig(env).server.port).toBe(7002);
  });

  it('`config` görünümü process.env değişikliklerini izler (test izolasyonu: geri yüklenir)', () => {
    const saved = process.env.SERVER_PORT;
    try {
      process.env.SERVER_PORT = '8123';
      expect(config.server.port).toBe(8123);
      process.env.SERVER_PORT = '8124';
      expect(config.server.port).toBe(8124);
    } finally {
      if (saved === undefined) delete process.env.SERVER_PORT; else process.env.SERVER_PORT = saved;
    }
  });
});

describe('config: fail-fast (strict, süreç başlangıcı)', () => {
  it('geçerli asgari ortam geçer ve tipli yapılandırma döner', () => {
    const c = assertConfig(valid());
    expect(c.auth.jwtSecret).toBe(SECRET);
    expect(c.db.url).toBe('mongodb://127.0.0.1:27017/x');
  });

  it('zorunlu env eksikse ConfigError: hangi değişkenler eksik LİSTELENİR', () => {
    let err: any;
    try { assertConfig({} as any); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.issues.map((i: string) => i.split(':')[0]).sort()).toEqual(['DB_URL', 'FIELD_ENCRYPTION_ACTIVE_KID', 'FIELD_ENCRYPTION_KEYS', 'JWT_SECRET']);
    expect(err.message).toMatch(/JWT_SECRET: zorunlu/);
  });

  it('yanlış tipli/geçersiz değerler ADIYLA raporlanır; DEĞERLER hata iletisine ASLA girmez (sırsız)', () => {
    const leakProbe = 'super-secret-probe-value';
    let err: any;
    try {
      assertConfig(valid({ JWT_SECRET: 'kisa-' + leakProbe.slice(0, 5), SERVER_PORT: leakProbe, APP_ROLE: leakProbe, REDIS_TLS: leakProbe, LOG_LEVEL: leakProbe, APP_ENV: leakProbe, JWT_SECRET_PREVIOUS: leakProbe }));
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ConfigError);
    const names = err.issues.map((i: string) => i.split(':')[0]);
    expect(names).toEqual(expect.arrayContaining(['JWT_SECRET', 'SERVER_PORT', 'APP_ROLE', 'REDIS_TLS', 'LOG_LEVEL', 'APP_ENV', 'JWT_SECRET_PREVIOUS']));
    expect(err.message).not.toContain(leakProbe);
    expect(err.message).not.toContain('kisa-');
    expect(JSON.stringify(err.issues)).not.toContain(leakProbe);
  });

  it('kısa JWT_SECRET (< 32 bayt) reddedilir', () => {
    expect(() => assertConfig(valid({ JWT_SECRET: 'x'.repeat(31) }))).toThrow(/JWT_SECRET: en az 32 bayt/);
  });

  it('APP_ROLE yazım hatası startup\'ta reddedilir (sessizce "all" olmaz)', () => {
    expect(() => assertConfig(valid({ APP_ROLE: 'wroker' }))).toThrow(/APP_ROLE: geçersiz değer \(izinli: web\|worker\|all\)/);
  });
});

describe('config: şema kapsamı', () => {
  it('tüm mock bayrakları ve sıcak-yol değişkenleri şemada tanımlı', () => {
    const keys = envKeys();
    for (const p of ['TY', 'PAZARAMA', 'N11', 'HEPSIBURADA', 'IDEASOFT', 'BIZIMHESAP']) {
      expect(keys).toEqual(expect.arrayContaining([`${p}_MOCK_MODE`, `${p}_MOCK_BASE_URL`, `${p}_MOCKABLE_ENDPOINTS`]));
    }
    expect(keys).toEqual(expect.arrayContaining(['APP_ENV', 'LOG_LEVEL', 'LOG_FORMAT', 'GLOBAL_RATE_LIMIT_MAX', 'REDIS_HOST', 'DB_URL', 'ZOHO_SMTP_HOST', 'R2_BUCKET_IMAGE']));
  });
});

describe('config: ENTITLEMENT_GUARD_ENABLED (ADR-0008 §3 guard bağlama — varsayılan KAPALI)', () => {
  it('boş ortamda varsayılan false', () => {
    expect(getConfig({} as NodeJS.ProcessEnv).flags.entitlementGuardEnabled).toBe(false);
  });

  it('"true" ise açılır; lenient: geçersiz değer varsayılana (false) düşer', () => {
    expect(getConfig({ ENTITLEMENT_GUARD_ENABLED: 'true' } as any).flags.entitlementGuardEnabled).toBe(true);
    expect(getConfig({ ENTITLEMENT_GUARD_ENABLED: 'evet' } as any).flags.entitlementGuardEnabled).toBe(false);
  });

  it('strict (assertConfig): tanımsızsa false ile başlar, production dahil fail-fast TETİKLEMEZ (yalnız açıkça "live" gibi başka alanlar insan onayı gerektirir)', () => {
    expect(() => assertConfig(valid())).not.toThrow();
    expect(assertConfig(valid()).flags.entitlementGuardEnabled).toBe(false);
  });
});

describe('config: IDEMPOTENCY_ENFORCE (ADR-0030 X3 — varsayılan observe)', () => {
  it('varsayılan observe; enforce açılır; geçersiz değer observe', () => {
    expect(getConfig({} as NodeJS.ProcessEnv).flags.idempotencyEnforce).toBe('observe');
    expect(getConfig({ IDEMPOTENCY_ENFORCE: 'enforce' } as any).flags.idempotencyEnforce).toBe('enforce');
    expect(getConfig({ IDEMPOTENCY_ENFORCE: 'bogus' } as any).flags.idempotencyEnforce).toBe('observe');
  });
});

describe('config: DB_AUTO_INDEX (ADR-0021 D8 / DB-08 — varsayılan ortama göre)', () => {
  it('tanımsız: local açık (mevcut davranış), staging/production kapalı', () => {
    expect(getConfig({} as NodeJS.ProcessEnv).db.autoIndex).toBe(true);
    expect(getConfig({ APP_ENV: 'local' } as any).db.autoIndex).toBe(true);
    expect(getConfig({ APP_ENV: 'staging' } as any).db.autoIndex).toBe(false);
    expect(getConfig({ APP_ENV: 'production' } as any).db.autoIndex).toBe(false);
    expect(getConfig({ NODE_ENV: 'production' } as any).db.autoIndex).toBe(false); // APP_ENV tanımsız + NODE_ENV=production => production
  });
  it('açık değer her ortamda önceliklidir; strict geçersiz değeri reddeder', () => {
    expect(getConfig({ APP_ENV: 'production', DB_AUTO_INDEX: 'true' } as any).db.autoIndex).toBe(true);
    expect(getConfig({ APP_ENV: 'local', DB_AUTO_INDEX: 'false' } as any).db.autoIndex).toBe(false);
    expect(() => assertConfig(valid({ DB_AUTO_INDEX: 'maybe' }))).toThrow(ConfigError);
  });
});
