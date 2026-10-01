// INT-01 "Bağlantıyı test et" RPC: IntegrationService/testConnection. DB/ağ YOK (adaptör ve sayaç enjekte edilir).
import { describe, it, expect } from '@jest/globals';
import { testIntegrationConnection, type TestConnectionDeps } from '../../../src/operations/integration/TestConnectionOperation';
import { CAPABILITY_BY_RPC } from '../../../src/capabilities';
import { isIntakeGatedRpc } from '../../../src/api/intakeRpcGuard';
import { OPERATION_POLICY } from '../../../src/api/operationPolicy';
import { createRateLimiter } from '../../../src/platform/rateLimit/rateLimit';
import { TEST_CONNECTION_RATE } from '../../../src/operations/integration/TestConnectionOperation';

const RPC = 'IntegrationService/testConnection';
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);

function deps(over: Partial<TestConnectionDeps> & { platform?: any } = {}): TestConnectionDeps & { calls: string[] } {
    const calls: string[] = [];
    const hits = new Map<string, number>();
    const d: TestConnectionDeps & { calls: string[] } = {
        calls,
        getInstance: async (clientId, code) => { calls.push(`${clientId}:${code}`); return (over.platform ?? { testConnection: async () => ({ ok: true, code: 'OK' }) }) as any; },
        intake: () => 'on',
        now: () => NOW,
        hit: (key) => {
            const n = (hits.get(key) ?? 0) + 1; hits.set(key, n);
            return n > 3 ? { allowed: false, retryAfterMs: 42_000 } : { allowed: true, retryAfterMs: 0 };
        },
        ...over,
    };
    delete (d as any).platform;
    return d;
}

describe('IntegrationService/testConnection - sözleşme ve kayıt', () => {
    it('yetenek kaydı: okuma, dış çağrı, integrations:manage, admin+', () => {
        const cap = CAPABILITY_BY_RPC.get(RPC)!;
        expect(cap).toBeTruthy();
        expect(cap.effect).toBe('read');
        expect(cap.external).toBe(true);
        expect(cap.permission).toBe('integrations:manage');
        expect(cap.minTier).toBe('admin');
        expect(OPERATION_POLICY.IntegrationService.testConnection).toBe('admin');
    });

    it('X6-b kapısı otomatik kapsar (integrations alanı + external) ve okuma olarak işaretlenir', () => {
        expect(isIntakeGatedRpc('IntegrationService', 'testConnection')).toEqual({ gated: true, effect: 'read' });
    });
});

describe('testIntegrationConnection', () => {
    it('başarı: {ok:true, code:OK, checkedAt}; ham alan sızmaz', async () => {
        const d = deps();
        const r = await testIntegrationConnection(7, 'trendyol', d);
        expect(r).toEqual({ ok: true, code: 'OK', checkedAt: new Date(NOW).toISOString() });
        expect(d.calls).toEqual(['7:trendyol']);
    });

    it('kod normalize edilir (büyük harf) ve geçersiz kod 400', async () => {
        const d = deps();
        await testIntegrationConnection(7, 'TRENDYOL', d);
        expect(d.calls).toEqual(['7:trendyol']);
        for (const bad of [undefined, '', 'a b', '../x', 'x'.repeat(65), { $ne: 1 }]) {
            await expect(testIntegrationConnection(7, bad, d)).rejects.toMatchObject({ statusCode: 400 });
        }
    });

    it('adaptör hata kodlarını aynen iletir; detail kırpılır', async () => {
        for (const code of ['AUTH_FAILED', 'UNREACHABLE', 'RATE_LIMITED', 'UNKNOWN'] as const) {
            const r = await testIntegrationConnection(7, 'n11', deps({ platform: { testConnection: async () => ({ ok: false, code, detail: 'x'.repeat(500) }) } } as any));
            expect(r).toMatchObject({ ok: false, code });
            expect(r.detail!.length).toBeLessThanOrEqual(200);
        }
    });

    it('bilinmeyen/eksik kod ok:false -> UNKNOWN; ok:true ama kod sapık -> OK', async () => {
        const a = await testIntegrationConnection(7, 'n11', deps({ platform: { testConnection: async () => ({ ok: false, code: 'AUTH' }) } } as any));
        expect(a).toMatchObject({ ok: false, code: 'UNKNOWN' });
        const b = await testIntegrationConnection(7, 'n11', deps({ platform: { testConnection: async () => ({ ok: true, code: 'WHATEVER' }) } } as any));
        expect(b).toMatchObject({ ok: true, code: 'OK' });
    });

    it('testConnection yoksa (ör. henüz taşınmamış adaptör) -> UNKNOWN + açıklama; fırlatmaz', async () => {
        const r = await testIntegrationConnection(7, 'hepsiburada', deps({ platform: {} } as any));
        expect(r).toMatchObject({ ok: false, code: 'UNKNOWN' });
        expect(r.detail).toMatch(/desteklenmiyor/);
    });

    it('kurulu değil / ayar eksik (fabrika fırlatır) -> UNKNOWN, ham hata mesajı sızmaz', async () => {
        const r = await testIntegrationConnection(7, 'trendyol', deps({ getInstance: async () => { throw new Error('Eksik yapılandırma: APISECRET secret=abc123'); } }));
        expect(r).toMatchObject({ ok: false, code: 'UNKNOWN' });
        expect(JSON.stringify(r)).not.toContain('abc123');
    });

    it('adaptör sözleşmeyi bozup fırlatırsa ham mesaj taşınmaz', async () => {
        const r = await testIntegrationConnection(7, 'trendyol', deps({ platform: { testConnection: async () => { throw new Error('Bearer zzz-secret'); } } } as any));
        expect(r).toMatchObject({ ok: false, code: 'UNKNOWN' });
        expect(JSON.stringify(r)).not.toContain('zzz-secret');
    });

    it('kill-switch off: dış çağrı YAPILMAZ (503 INTEGRATION_PAUSED), sayaç tüketilmez', async () => {
        const d = deps({ intake: () => 'off' });
        await expect(testIntegrationConnection(7, 'trendyol', d)).rejects.toMatchObject({ statusCode: 503, code: 'INTEGRATION_PAUSED' });
        expect(d.calls).toEqual([]);
    });

    it('drain: okuma olduğundan çalışır', async () => {
        const r = await testIntegrationConnection(7, 'trendyol', deps({ intake: () => 'drain' }));
        expect(r.ok).toBe(true);
    });

    it('hız sınırı: tenant+entegrasyon başına dakikada 3; 4. istek 429 RATE_LIMITED (+retryAfterSec), adaptöre gitmez', async () => {
        const d = deps();
        for (let i = 0; i < 3; i++) await testIntegrationConnection(7, 'trendyol', d);
        await expect(testIntegrationConnection(7, 'trendyol', d)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', details: { retryAfterSec: 42 } });
        expect(d.calls).toHaveLength(3);
        // başka entegrasyon ve başka tenant ayrı kova
        await expect(testIntegrationConnection(7, 'n11', d)).resolves.toMatchObject({ ok: true });
        await expect(testIntegrationConnection(8, 'trendyol', d)).resolves.toMatchObject({ ok: true });
    });
});

describe('gerçek kayan pencere sayacı (limiter.hit)', () => {
    it('3/dk: 4. vuruş reddedilir, pencere dolunca yeniden izinli', () => {
        let t = 0;
        const l = createRateLimiter({ max: TEST_CONNECTION_RATE.max, windowMs: TEST_CONNECTION_RATE.windowMs, now: () => t });
        expect([1, 2, 3].map(() => l.hit('7|trendyol').allowed)).toEqual([true, true, true]);
        const r = l.hit('7|trendyol');
        expect(r.allowed).toBe(false);
        expect(r.retryAfterMs).toBe(60_000);
        t = 60_001;
        expect(l.hit('7|trendyol').allowed).toBe(true);
        l.stop();
    });
});
