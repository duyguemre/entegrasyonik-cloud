/**
 * CHAT-ENT-1 (K46): ajan katmani plan yetkisi. Plan kodu -> katman katalogu, guard kapaliyken `full` (bugunku davranis), plan okunamazsa `limited`,
 * muaf tenant `full`, kota sayaci sohbet+MCP ortak anahtar, asimda anlasilir hata + `upgradeUrl` (yanita tasinir), EntitlementService.getPlanInfo.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express from 'express';
import type http from 'http';
import type { AddressInfo } from 'net';
import { MemoryKv } from '../../../src/operations/agent/kv';

type Mod = typeof import('../../../src/operations/agent/agentEntitlement') & typeof import('../../../src/api/http/errorEnvelope');
const getPlanInfo = jest.fn<(tid: number) => Promise<unknown>>();

function load(guard: boolean): Mod {
    if (guard) process.env.ENTITLEMENT_GUARD_ENABLED = 'true'; else delete process.env.ENTITLEMENT_GUARD_ENABLED;
    let m!: Mod;
    jest.isolateModules(() => {
        jest.doMock('@services/billing/EntitlementService', () => ({ EntitlementService: { getPlanInfo } }));
        // AppError sinif kimligi ayni modul kaydinda kalsin diye hata zarfi da burada yuklenir.
        m = { ...require('../../../src/operations/agent/agentEntitlement'), ...require('../../../src/api/http/errorEnvelope') };
    });
    return m;
}

beforeEach(() => { getPlanInfo.mockReset(); });
afterEach(() => { delete process.env.ENTITLEMENT_GUARD_ENABLED; jest.dontMock('@services/billing/EntitlementService'); });

describe('resolveAgentEntitlement', () => {
    it('guard KAPALI: herkes full, EntitlementService hic cagrilmaz (mevcut davranis)', async () => {
        const m = load(false);
        expect(await m.resolveAgentEntitlement(1)).toMatchObject({ tier: 'full', autonomousAllowed: true, dailyActionQuota: m.DAILY_ACTION_QUOTA.full });
        expect(getPlanInfo).not.toHaveBeenCalled();
    });

    it('guard ACIK: alt plan limited, ust planlar full (katalog); bilinmeyen plan ve abonelik yok limited', async () => {
        const m = load(true);
        const plan = async (planCode: string | undefined, extra: Record<string, unknown> = {}) => {
            getPlanInfo.mockResolvedValueOnce({ status: 'active', planCode, billingExempt: false, ...extra });
            return m.resolveAgentEntitlement(1);
        };
        expect(await plan('starter')).toMatchObject({ tier: 'limited', autonomousAllowed: false, dailyActionQuota: m.DAILY_ACTION_QUOTA.limited });
        expect(await plan('growth')).toMatchObject({ tier: 'full', autonomousAllowed: true });
        expect(await plan('enterprise')).toMatchObject({ tier: 'full' });
        expect(await plan('uydurma')).toMatchObject({ tier: 'limited' });
        expect(await plan(undefined, { status: 'no_subscription' })).toMatchObject({ tier: 'limited' });
        expect(await plan('starter', { billingExempt: true })).toMatchObject({ tier: 'full' }); // legacy muaf
        expect(m.DAILY_ACTION_QUOTA.limited).toBeLessThan(m.DAILY_ACTION_QUOTA.full);
    });

    it('guard ACIK + plan okunamazsa: limited (kisitlayici), hata sizmaz', async () => {
        const m = load(true);
        getPlanInfo.mockRejectedValueOnce(new Error('db down'));
        expect(await m.resolveAgentEntitlement(1)).toMatchObject({ tier: 'limited' });
    });
});

describe('gunluk kota + asim hatasi', () => {
    it('sayac sohbet ve MCP icin ORTAK anahtar; limitten sonra allowed=false; tenant bazli', async () => {
        const m = load(false);
        const kv = new MemoryKv();
        const ent = { ...m.entitlementFor('limited'), dailyActionQuota: 2 };
        const now = new Date('2026-10-01T10:00:00Z');
        expect((await m.consumeActionQuota(kv, 1, ent, now)).allowed).toBe(true); // "sohbet"
        expect((await m.consumeActionQuota(kv, 1, ent, now)).allowed).toBe(true); // "MCP" (ayni fonksiyon/anahtar)
        expect(await m.consumeActionQuota(kv, 1, ent, now)).toMatchObject({ allowed: false, used: 3, limit: 2 });
        expect((await m.consumeActionQuota(kv, 2, ent, now)).allowed).toBe(true);
        expect(kv.keys().filter((k) => k.startsWith('agent:quota:'))).toHaveLength(2);
    });

    it('quotaExceededError: QUOTA_EXCEEDED 403, limited iletisi yukseltmeyi soyler, upgradeUrl + tier + limit; full iletisi yukseltme demez', () => {
        const m = load(false);
        const e = m.quotaExceededError(m.entitlementFor('limited'));
        expect(e).toMatchObject({ code: 'QUOTA_EXCEEDED', status: 403 });
        expect(e.message).toMatch(/yükseltin/);
        expect(e.details).toMatchObject({ tier: 'limited', limit: m.DAILY_ACTION_QUOTA.limited, upgradeUrl: expect.stringMatching(/\/subscription$/) });
        expect(m.quotaExceededError(m.entitlementFor('full')).message).not.toMatch(/yükseltin/);
    });

    it('upgradeUrl HTTP yanitina tasinir (yalniz QUOTA_EXCEEDED; baska details sizmaz)', async () => {
        const m = load(false);
        const app = express();
        app.get('/q', (_req, _res, next) => next(m.quotaExceededError(m.entitlementFor('limited'))));
        app.use(m.errorHandler);
        const server = await new Promise<http.Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
        try {
            const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/q`);
            const j = (await r.json()) as Record<string, unknown>;
            expect(r.status).toBe(403);
            expect(j).toMatchObject({ code: 'QUOTA_EXCEEDED', upgradeUrl: expect.stringMatching(/\/subscription$/) });
            expect(j).not.toHaveProperty('tier');
        } finally { await new Promise<void>((r) => server.close(() => r())); }
        expect(m.publicErrorExtras(new Error('x'))).toBeUndefined();
    });
});
