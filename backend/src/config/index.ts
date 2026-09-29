// ADR-0017 §10 / ADR-0016 B-R5: tipli, doğrulanmış yapılandırmanın TEK erişim noktası.
//
//   import { config } from '@config';        config.redis.port, config.server.cors.origins ...
//   assertConfig();                          süreç başlangıcında (strict, fail-fast; `entegrasyonik.ts`)
//
// `config` bir "canlı görünüm"dür: her erişimde ham ortamın parmak izi kontrol edilir, değişmemişse önbellekli sonuç döner
// (üretimde env süreç ömrü boyunca sabittir -> fiilen bir kez ayrıştırılır; testler `process.env`'i değiştirince otomatik yenilenir).
// `config/` DIŞINDA `process.env` okunmaz (statik mandal: tests/static/process-env.ratchet.test.ts); enjekte edilebilir `env`
// parametresi alan eski fonksiyonlar varsayılanı için `rawEnv()`'i kullanır.
import { AppConfig, envKeys, parseEnv } from './env';

export { ConfigError } from './env';
export type { AppConfig, AppEnv, AppRoleName, LogFormatName, LogLevelName, MockPrefixName } from './env';
export { APP_ENVS, APP_ROLES, LOG_FORMATS, LOG_LEVELS, MOCK_PREFIXES, envKeys } from './env';

/** Ham ortam (yalnızca enjekte edilebilir `env = rawEnv()` varsayılanları ve dotenv sonrası okuma için). */
export function rawEnv(): NodeJS.ProcessEnv {
    return process.env;
}

let cached: { sig: string; value: AppConfig } | undefined;

function fingerprint(env: NodeJS.ProcessEnv): string {
    const keys = envKeys();
    let s = '';
    for (const k of keys) { const v = env[k]; s += v === undefined ? '\u0001' : v; s += '\u0000'; }
    return s;
}

/** Çalışma anı erişimi (lenient: geçersiz değer eski varsayılana düşer; startup'ta `assertConfig` strict doğrular). */
export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const sig = fingerprint(env);
    if (cached && cached.sig === sig) return cached.value;
    const value = parseEnv(env, { strict: false });
    cached = { sig, value };
    return value;
}

/**
 * Süreç başlangıcı (fail-fast): zorunlu env eksik/yanlış tipli ise `ConfigError` (yalnızca değişken ADI + neden; DEĞER yok).
 * Başarıda tipli yapılandırmayı döner. `warnings` (ör. APP_ENV türetildi) çağıran tarafından loglanır.
 */
export function assertConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    return parseEnv(env, { strict: true });
}

/** Yalnızca testler için: önbelleği düşürür. */
export function resetConfigForTests(): void {
    cached = undefined;
}

export const config: AppConfig = new Proxy({} as AppConfig, {
    get: (_t, prop) => (getConfig() as any)[prop],
    has: (_t, prop) => prop in getConfig(),
    ownKeys: () => Reflect.ownKeys(getConfig()),
    getOwnPropertyDescriptor: (_t, prop) => {
        const d = Object.getOwnPropertyDescriptor(getConfig(), prop);
        return d ? { ...d, configurable: true } : undefined;
    },
});
