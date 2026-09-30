// INT-01 "Bağlantıyı test et": kullanıcı tetiklemeli, yan etkisiz kimlik/erişim doğrulaması (IPlatform.testConnection).
// - Tenant+entegrasyon başına dakikada 3 deneme (süreç içi kayan pencere; aşılırsa 429 RATE_LIMITED + Retry-After saniyesi).
// - Kill-switch `off` iken dış çağrı YAPILMAZ (X6; RPC kapısı zaten keser, bu savunma derinliğidir: RPC dışı çağıranlar için).
// - Her çağrıda fabrika önbelleği bu tenant+entegrasyon için atılır: kullanıcı ayarı yeni kaydettiyse GÜNCEL ayar sınanır.
// - Sonuç yalnız {ok, code, checkedAt}; ham hata/URL/kimlik bilgisi/PII dönmez (detail yalnız sabit metinler).
import { ApplicationError } from '@platform/core/errors/ApplicationError';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { effectiveIntake } from '@integration/config/intakeGate';
import { validateIntegrationCode } from '@operations/stock/stockPolicyValidation';
import type { IPlatform } from '@interfaces/index';

import type { TestConnectionCode } from '@integration/modules/common/adapter/testConnection';
export type { TestConnectionCode };
export interface TestConnectionResponse { ok: boolean; code: TestConnectionCode; detail?: string; checkedAt: string }

export const TEST_CONNECTION_RATE = { max: 3, windowMs: 60_000 } as const;

export interface TestConnectionDeps {
    /** Güncel ayarlarla adaptör örneği (varsayılan: IntegrationFactory; önce tenant+kod önbelleği atılır). */
    getInstance(clientId: number, code: string): Promise<IPlatform>;
    /** Kill-switch etkin durumu. */
    intake(code: string): 'on' | 'drain' | 'off';
    now(): number;
    /** true/false + bekleme (ms). */
    hit(key: string): { allowed: boolean; retryAfterMs: number };
}

const limiter = createRateLimiter({ max: TEST_CONNECTION_RATE.max, windowMs: TEST_CONNECTION_RATE.windowMs, maxKeys: 5000 });

const defaultDeps: TestConnectionDeps = {
    async getInstance(clientId, code) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
        const { default: IntegrationFactory } = (require('@integration/modules/IntegrationFactory') as typeof import('@integration/modules/IntegrationFactory'));
        IntegrationFactory.invalidate(clientId, code);
        return new IntegrationFactory(clientId).getInstance(code);
    },
    intake: (code) => effectiveIntake(code),
    now: () => Date.now(),
    hit: (key) => limiter.hit(key),
};

const NOT_CONFIGURED = 'Entegrasyon kurulu değil, desteklenmiyor veya ayarları eksik.';
const NOT_SUPPORTED = 'Bu entegrasyon için bağlantı testi henüz desteklenmiyor.';
const KNOWN: ReadonlySet<string> = new Set(['OK', 'AUTH_FAILED', 'UNREACHABLE', 'RATE_LIMITED', 'UNKNOWN']);

export async function testIntegrationConnection(clientId: number, rawCode: unknown, deps: TestConnectionDeps = defaultDeps): Promise<TestConnectionResponse> {
    let code: string;
    try { code = validateIntegrationCode(rawCode).toLowerCase(); } catch { throw new ApplicationError('integrationCode geçersiz.', 400); }

    if (deps.intake(code) === 'off') throw new ApplicationError('Bu entegrasyon geçici olarak durduruldu.', 503, 'INTEGRATION_PAUSED');

    const rate = deps.hit(`${clientId}|${code}`);
    if (!rate.allowed) {
        throw new ApplicationError('Bağlantı testi için dakikada en fazla 3 deneme yapılabilir.', 429, 'RATE_LIMITED', { retryAfterSec: Math.max(1, Math.ceil(rate.retryAfterMs / 1000)) });
    }

    const checkedAt = new Date(deps.now()).toISOString();
    let platform: IPlatform;
    try {
        platform = await deps.getInstance(clientId, code);
    } catch {
        return { ok: false, code: 'UNKNOWN', detail: NOT_CONFIGURED, checkedAt };
    }
    if (typeof platform.testConnection !== 'function') return { ok: false, code: 'UNKNOWN', detail: NOT_SUPPORTED, checkedAt };

    try {
        const r = await platform.testConnection();
        const resCode = (typeof r?.code === 'string' && KNOWN.has(r.code) ? r.code : (r?.ok ? 'OK' : 'UNKNOWN')) as TestConnectionCode;
        return { ok: r?.ok === true, code: r?.ok === true ? 'OK' : resCode === 'OK' ? 'UNKNOWN' : resCode, ...(r?.ok ? {} : { detail: String(r?.detail ?? '').slice(0, 200) }), checkedAt };
    } catch {
        // Sözleşme: adaptör fırlatmaz; yine de sızıntı olmasın diye ham hata taşınmaz.
        return { ok: false, code: 'UNKNOWN', detail: 'Bağlantı doğrulanamadı.', checkedAt };
    }
}
