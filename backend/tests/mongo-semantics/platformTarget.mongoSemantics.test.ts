/**
 * ADR-0031 BE-CFG-2 — `IntegrationConfigService` `_platform` hedefi: taslak -> yayın -> geçmiş -> geri alma, doğrulama,
 * gerekçe kapısı, kapsam yalıtımı. `mongodb-memory-server` (izole/geçici) kullanır; gerçek/paylaşılan DB'ye DOKUNMAZ.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import IntegrationConfigService from '../../src/api/rpc/handlers/integration-config-service';
import { IntegrationConfigRevisionSchema, IntegrationConfigHeadSchema } from '@database/application/models/IntegrationConfig';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getSettingWithPublishedOverrides } from '@integration/config/ConfigResolver';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { setTargetOverride, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let RevisionModel: mongoose.Model<any>;
let HeadModel: mongoose.Model<any>;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'adr0031_platform_test').asPromise();
    RevisionModel = conn.model('IntegrationConfigRevision', IntegrationConfigRevisionSchema);
    HeadModel = conn.model('IntegrationConfigHead', IntegrationConfigHeadSchema);
    await RevisionModel.syncIndexes();
    await HeadModel.syncIndexes();
});

afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
    await mongod?.stop();
});

beforeEach(async () => {
    AuditLogger.setSink(async () => undefined);
    delete process.env.TWO_PERSON_RULE_ENABLED;
    await RevisionModel.deleteMany({});
    await HeadModel.deleteMany({});
});
afterEach(() => { AuditLogger.setSink(undefined); resetPlatformOverrideStoreForTests(); });

function svc(sub = 'admin-1'): any {
    const s: any = new IntegrationConfigService(undefined as any, { principal: { sub, tid: undefined } });
    s.applicationDB = {
        getIntegrationConfigRevisionModel: () => RevisionModel,
        getIntegrationConfigHeadModel: () => HeadModel,
        getIntegrationFindingModel: () => ({}),
        getClientModel: () => ({ countDocuments: () => Promise.resolve(0) }),
    };
    let body: any = { principal: { sub, tid: undefined } };
    Object.defineProperty(s, 'request', {
        get: () => body,
        set: (v: any) => { body = { ...(v ?? {}), principal: { sub, tid: undefined } }; },
    });
    return s;
}

const T = '_platform';

describe('IntegrationConfigService — _platform hedefi', () => {
    it('taslak -> yayın -> geçmiş -> geri alma', async () => {
        const s = svc();
        s.request = { target: T, patch: { 'support.phone': '+90 850 111 22 33', 'ui.listPageSize': 50 } };
        const d = await s.saveDraft();
        expect(d.overrides).toEqual({ 'support.phone': '+90 850 111 22 33', 'ui.listPageSize': 50 });
        s.request = { target: T };
        await s.publish(); // safe: gerekçe gerekmez
        s.request = { target: T, patch: { 'ui.listPageSize': 100 } };
        await s.saveDraft();
        s.request = { target: T };
        const p2 = await s.publish();
        expect(p2.publishedVersion).toBe(2);

        s.request = { target: T };
        const eff = await s.getEffectiveConfig();
        expect(eff.values.map((v: any) => v.key).sort()).toEqual([
            // ADR-0029 NB8: alarm eşikleri (catalog/alerts.ts, yöneticiye özel)
            'alerts.r1.criticalPercent', 'alerts.r1.minCalls', 'alerts.r1.warnPercent', 'alerts.r2.authErrors', 'alerts.r2.circuitOpenMin',
            'alerts.r3.lagCriticalMin', 'alerts.r3.lagWarnMin', 'alerts.r4.oldestWaitMin', 'alerts.r4.queueWait', 'alerts.r7.deadPerHour', 'alerts.r8.unresolvedMin',
            'announcement.enabled', 'announcement.level', 'announcement.text', 'features.agent', 'features.agent.disabledCapabilities', 'maintenance.enabled', 'maintenance.message',
            'support.email', 'support.phone', 'ui.listPageSize', 'ui.reportPollMs',
        ]);
        expect(eff.values.find((v: any) => v.key === 'ui.listPageSize')).toMatchObject({ value: 100, source: 'platform' });
        expect(eff.values.find((v: any) => v.key === 'ui.reportPollMs')).toMatchObject({ value: 5000, source: 'default' });

        s.request = { target: T, limit: 20 };
        const hist = await s.history();
        expect(hist.map((h: any) => h.version)).toEqual(expect.arrayContaining([1, 2]));

        s.request = { target: T, toVersion: 1 };
        const rb = await s.rollback();
        expect(rb.publishedVersion).toBe(3);
        s.request = { target: T };
        const eff2 = await s.getEffectiveConfig();
        expect(eff2.values.find((v: any) => v.key === 'ui.listPageSize').value).toBe(50);
    });

    it.each([
        ['support.email', 'x'],
        ['ui.listPageSize', 30],
        ['ui.reportPollMs', 100],
        ['support.phone', 'abc'],
        ['announcement.level', 'danger'],
        ['announcement.text', '<b>x</b>'],
        ['announcement.text', 'a'.repeat(281)],
        ['maintenance.message', 'satir\nsonu'],
    ])('geçersiz değer %s=%p 400 VALIDATION', async (key, value) => {
        const s = svc();
        s.request = { target: T, patch: { [key]: value } };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('maintenance.enabled (caution) yayını gerekçe ister', async () => {
        const s = svc();
        s.request = { target: T, patch: { 'maintenance.enabled': true } };
        await s.saveDraft();
        s.request = { target: T };
        await expect(s.publish()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });
        s.request = { target: T, reason: 'planli bakim penceresi acildi' };
        await expect(s.publish()).resolves.toMatchObject({ publishedVersion: 1 });
    });

    it('kapsam yalıtımı: platform anahtarı _engine/entegrasyona, motor anahtarı _platform hedefine yazılamaz', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'support.email': 'a@b.co' } };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        s.request = { target: 'trendyol', patch: { 'ui.listPageSize': 10 } };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        s.request = { target: T, patch: { 'export.publisher.chunkSize': 40 } };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });

        const isPlatformKey = (v: any) => /^(support|ui|announcement|maintenance)\./.test(v.key);
        s.request = { target: '_engine' };
        expect((await s.getEffectiveConfig()).values.some(isPlatformKey)).toBe(false);
        s.request = { target: 'trendyol' };
        expect((await s.getEffectiveConfig()).values.some(isPlatformKey)).toBe(false);
    });

    it('setIntake _platform hedefinde reddedilir; bilinmeyen hedef hâlâ 404', async () => {
        const s = svc();
        s.request = { target: T, intake: 'off', reason: 'x'.repeat(20), typedConfirmation: T };
        await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400 });
        s.request = { target: '_nope' };
        await expect(s.getEffectiveConfig()).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('getPlatformSetting / ConfigResolver (bellek)', () => {
    it('store boşken katalog varsayılanı; yayınlanmış değer varsa o; geçersiz yayın değeri varsayılana düşer', () => {
        expect(getPlatformSetting('ui.listPageSize')).toBe(25);
        setTargetOverride(T, 4, { 'ui.listPageSize': 50, 'ui.reportPollMs': 1 });
        expect(getPlatformSetting('ui.listPageSize')).toBe(50);
        expect(getPlatformSetting('ui.reportPollMs')).toBe(5000);
        expect(getSettingWithPublishedOverrides('ui.listPageSize')).toBe(50);
        expect(() => getPlatformSetting('export.publisher.chunkSize')).toThrow();
    });
});
