// ADR-0020 Karar 2.2 (Aşama B) — bir taslak yamasının (patch) YAZMA anındaki doğrulaması. Saf; I/O yapmaz.
// `getSettingDef` enjekte edilebilir (varsayılan: gerçek katalog) -- testler synthetic `SettingDef` ile çağırabilir,
// gerçek kataloğa (bugün `type:'host'` ayarı YOK) bağımlı KALMAZ.
import { getSettingDef as realGetSettingDef } from './catalog';
import type { SettingDef } from './types';
import { ENGINE_TARGET } from './targets';
import { assertSafeHostOverride, assertNotRetiredEndpoint, HostGuardError, type RetiredEndpointPatternLike } from './urlGuard';

export interface PatchValidationError {
    key: string;
    message: string;
}

export interface DescriptorHostInfo {
    /** İzinli host listesi (manifesto `config.hosts`). */
    allowedHosts?: readonly string[];
    /** Manifesto `config.retiredEndpoints` (Karar 1.5). */
    retiredEndpoints?: readonly RetiredEndpointPatternLike[];
}

export interface ValidatePatchOptions {
    target: string;
    /** Yalnız `type:'host'` anahtarlar için gerekir (bugün kataloğa GİRMEDİ, bkz. urlGuard.ts dosya başı notu). */
    descriptor?: DescriptorHostInfo;
    getSettingDef?: (key: string) => SettingDef<any> | undefined;
}

const FORBIDDEN_KEY_SEGMENT = /(^|\.)(password|secret|token|key)($|\.)/i;

function scopeAllowsTarget(scope: SettingDef['scope'], target: string): boolean {
    if (scope === 'engine') return target === ENGINE_TARGET;
    if (scope === 'integration') return target !== ENGINE_TARGET;
    return true; // 'engine+integration': her iki hedefte de geçerli
}

/** Tek bir `{key: value}` yamasını doğrular; ihlal listesini döner (boşsa geçerli). */
export function validatePatch(patch: Record<string, unknown>, opts: ValidatePatchOptions): PatchValidationError[] {
    const getDef = opts.getSettingDef ?? realGetSettingDef;
    const errors: PatchValidationError[] = [];

    for (const [key, value] of Object.entries(patch)) {
        // Sır adı yasağı (ADR §2.2) -- katalog bunu zaten statik testle garantiler (settingsCatalog.test.ts), ama
        // yazma yolunda İKİNCİ bir savunma hattı: bilinmeyen/gelecekteki bir anahtar bile bu deseni geçemez.
        if (FORBIDDEN_KEY_SEGMENT.test(key)) {
            errors.push({ key, message: `Anahtar adı yasaklı bir sır deseni içeriyor: ${key}` });
            continue;
        }

        const def = getDef(key);
        if (!def) {
            errors.push({ key, message: `Bilinmeyen ayar anahtarı (katalogda yok): ${key}` });
            continue;
        }

        if (!scopeAllowsTarget(def.scope, opts.target)) {
            errors.push({ key, message: `Anahtar '${key}' bu hedefte (${opts.target}) geçerli değil (scope=${def.scope}).` });
            continue;
        }

        if (def.overridable !== true) {
            errors.push({ key, message: `Anahtar '${key}' salt-okunurdur (platformdan geçersiz kılınamaz).` });
            continue;
        }

        if (def.envLock && process.env[def.envLock] !== undefined) {
            errors.push({ key, message: `Anahtar '${key}' ortam değişkeniyle kilitli: ${def.envLock}` });
            continue;
        }

        const parsed = def.schema.safeParse(value);
        if (!parsed.success) {
            errors.push({ key, message: `Geçersiz değer '${key}': ${parsed.error.issues.map((i) => i.message).join('; ')}` });
            continue;
        }

        if (def.type === 'host' && typeof value === 'string') {
            try {
                assertSafeHostOverride(value, opts.descriptor?.allowedHosts ?? []);
            } catch (e) {
                errors.push({ key, message: e instanceof HostGuardError ? e.message : String(e) });
                continue;
            }
        }
        if (typeof value === 'string' && opts.descriptor?.retiredEndpoints?.length) {
            try {
                assertNotRetiredEndpoint(value, opts.descriptor.retiredEndpoints);
            } catch (e) {
                errors.push({ key, message: e instanceof HostGuardError ? e.message : String(e) });
                continue;
            }
        }
    }

    return errors;
}

/** Kısayol: geçersizse ilk hata iletisini içeren bir Error fırlatır (servis katmanı için). */
export function assertValidPatch(patch: Record<string, unknown>, opts: ValidatePatchOptions): void {
    const errors = validatePatch(patch, opts);
    if (errors.length) {
        const msg = errors.map((e) => e.message).join(' | ');
        throw new Error(msg);
    }
}
