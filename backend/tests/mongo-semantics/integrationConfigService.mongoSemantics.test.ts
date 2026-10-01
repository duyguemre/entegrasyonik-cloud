/**
 * ADR-0020 Karar 3/6 (Aşama B) — `IntegrationConfigService` uçtan uca: doğrulama + fark/etki + onay kapısı + yayın +
 * geri alma + kilit + denetim. `mongodb-memory-server` (izole/geçici, kural 1-2 kapsamı DIŞI, bkz. dosya başı notu
 * `integrationConfigRevisions.mongoSemantics.test.ts`) kullanır; gerçek/paylaşılan DB'ye DOKUNMAZ.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import crypto from 'crypto';

jestGlobal.setTimeout(120000);

import IntegrationConfigService from '../../src/api/services/integration-config-service';
import { IntegrationConfigRevisionSchema, IntegrationConfigHeadSchema } from '@database/application/models/IntegrationConfig';
import { IntegrationFindingSchema } from '@database/application/models/IntegrationFinding';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getIntegrationDescriptor } from '@integration/catalog/IntegrationDescriptorRegistry';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let RevisionModel: mongoose.Model<any>;
let HeadModel: mongoose.Model<any>;
let FindingModel: mongoose.Model<any>;
let auditRecords: Record<string, any>[];

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'adr0020_service_test').asPromise();
    RevisionModel = conn.model('IntegrationConfigRevision', IntegrationConfigRevisionSchema);
    HeadModel = conn.model('IntegrationConfigHead', IntegrationConfigHeadSchema);
    FindingModel = conn.model('IntegrationFinding', IntegrationFindingSchema);
    await RevisionModel.syncIndexes();
    await HeadModel.syncIndexes();
    await FindingModel.syncIndexes();
});

afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
    await mongod?.stop();
});

beforeEach(async () => {
    auditRecords = [];
    AuditLogger.setSink(async (r: any) => { auditRecords.push(r); });
    delete process.env.TWO_PERSON_RULE_ENABLED;
    // Her test `_engine` hedefini kullanır (gerçek `IntegrationConfigService.assertKnownTarget` yalnız `_engine` ya da
    // gerçek entegrasyon kodlarını kabul eder -- repository testindeki gibi rastgele sentetik hedef ÜRETİLEMEZ).
    // Testler arası izolasyon için koleksiyonlar HER testten ÖNCE temizlenir.
    await RevisionModel.deleteMany({});
    await HeadModel.deleteMany({});
    await FindingModel.deleteMany({});
});
afterEach(() => { AuditLogger.setSink(undefined); });

function fakeApplicationDB(activeTenants = 0) {
    return {
        getIntegrationConfigRevisionModel: () => RevisionModel,
        getIntegrationConfigHeadModel: () => HeadModel,
        getIntegrationFindingModel: () => FindingModel,
        getClientModel: () => ({ countDocuments: () => Promise.resolve(activeTenants) }),
    };
}

/**
 * `s.request = {...}` her testte GÖVDEYİ yeniler ama `principal` (aktör kimliği) HER ZAMAN korunmalı -- gerçek
 * `RunOperation.execute()`'un `enhancedRequest = { ...safeRequest, userContext, principal }` davranışını yansıtır.
 */
function svc(sub = 'admin-1', activeTenants = 0): any {
    const s: any = new IntegrationConfigService(undefined as any, { principal: { sub, tid: undefined } });
    s.applicationDB = fakeApplicationDB(activeTenants);
    let body: any = { principal: { sub, tid: undefined } };
    Object.defineProperty(s, 'request', {
        get: () => body,
        set: (v: any) => { body = { ...(v ?? {}), principal: { sub, tid: undefined } }; },
    });
    return s;
}

describe('IntegrationConfigService — saveDraft doğrulama', () => {
    it('bilinmeyen anahtar 400/VALIDATION ile reddedilir', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'bilinmeyen.anahtar': 1 } };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('salt-okunur (overridable:false) anahtar reddedilir', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'resilience.factoryCallTimeoutMs': 1000 } };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('geçerli anahtar (export.publisher.chunkSize, Aşama B\'de overridable:true) kabul edilir ve taslak oluşturur', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 40 } };
        const result = await s.saveDraft();
        expect(result.overrides).toEqual({ 'export.publisher.chunkSize': 40 });
        expect(result.draftRev).toBe(1);

        const auditEvt = auditRecords.find((r) => r.event === 'integration_config.save_draft');
        expect(auditEvt?.result).toBe('ok');
        expect(JSON.stringify(auditEvt)).not.toMatch(/password|secret/i);
    });

    it('yanlış expectedDraftRev 409/DRAFT_CONFLICT döner', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 40 } };
        await s.saveDraft();
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 41 }, expectedDraftRev: 999 };
        await expect(s.saveDraft()).rejects.toMatchObject({ statusCode: 409, code: 'DRAFT_CONFLICT' });
    });
});

describe('IntegrationConfigService — previewPublish / publish onay kapısı', () => {
    it('previewPublish taslak yoksa 404 döner', async () => {
        const s = svc();
        s.request = { target: '_engine' };
        await expect(s.previewPublish()).rejects.toMatchObject({ statusCode: 404 });
    });

    it('caution seviyeli değişiklik: gerekçesiz publish 400/APPROVAL_REQUIRED; yeterli gerekçeyle başarılı', async () => {
        const s = svc('admin-1', 3);
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 40 } };
        await s.saveDraft();

        s.request = { target: '_engine' };
        const preview = await s.previewPublish();
        expect(preview.danger).toBe('caution');
        expect(preview.requiresReason).toBe(true);
        expect(preview.requiresTypedApproval).toBe(false);
        expect(preview.impact).toEqual({ activeTenants: 3, approximate: false });

        s.request = { target: '_engine' }; // gerekçesiz
        await expect(s.publish()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

        s.request = { target: '_engine', reason: 'chunk boyutunu artiriyorum performans icin' };
        const published = await s.publish();
        expect(published.publishedVersion).toBe(1);
        expect(published.diff).toEqual([{ key: 'export.publisher.chunkSize', from: undefined, to: 40, danger: 'caution' }]);

        const auditEvt = auditRecords.find((r) => r.event === 'integration_config.publish' && r.result === 'ok');
        expect(auditEvt).toBeDefined();
        expect(JSON.stringify(auditEvt)).not.toMatch(/password|secret/i);
    });

    it('dangerous seviyeli değişiklik: yazılı onay (hedef kodu) olmadan reddedilir; doğru onayla başarılı', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'export.dispatcher.leaseTtl': 400000 } }; // danger:'dangerous'
        await s.saveDraft();

        s.request = { target: '_engine', reason: 'lease suresini gecici olarak degistiriyorum' };
        await expect(s.publish()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

        s.request = { target: '_engine', reason: 'lease suresini gecici olarak degistiriyorum', typedConfirmation: '_engine' };
        const published = await s.publish();
        expect(published.publishedVersion).toBe(1);
    });
});

describe('IntegrationConfigService — iki kişi kuralı (varsayılan KAPALI, açıkken davranış değişir)', () => {
    it('bayrak KAPALIYKEN (varsayılan) approvedBy verilmeden dangerous yayın YAPILABİLİR', async () => {
        const s = svc('admin-1');
        s.request = { target: '_engine', patch: { 'export.dispatcher.leaseTtl': 123456 } };
        await s.saveDraft();
        s.request = { target: '_engine', reason: 'test amacli degisiklik yapiyorum', typedConfirmation: '_engine' };
        await expect(s.publish()).resolves.toMatchObject({ publishedVersion: 1 });
    });

    it('bayrak AÇIKKEN approvedBy eksikse ya da yayınlayanla aynıysa reddedilir; farklı approvedBy ile başarılı', async () => {
        process.env.TWO_PERSON_RULE_ENABLED = 'true';
        try {
            const s = svc('admin-1');
            s.request = { target: '_engine', patch: { 'export.dispatcher.leaseTtl': 654321 } };
            await s.saveDraft();

            s.request = { target: '_engine', reason: 'iki kisi kurali testi', typedConfirmation: '_engine' };
            await expect(s.publish()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

            s.request = { target: '_engine', reason: 'iki kisi kurali testi', typedConfirmation: '_engine', approvedBy: 'admin-1' };
            await expect(s.publish()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

            s.request = { target: '_engine', reason: 'iki kisi kurali testi', typedConfirmation: '_engine', approvedBy: 'admin-2' };
            await expect(s.publish()).resolves.toMatchObject({ publishedVersion: 1 });
        } finally {
            delete process.env.TWO_PERSON_RULE_ENABLED;
        }
    });
});

describe('IntegrationConfigService — rollback / takeOverLock / list / history / testEndpoint', () => {
    it('rollback eski sürümü YENİ bir revizyon olarak yayınlar (approval gate uygulanır)', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 33 } };
        await s.saveDraft();
        s.request = { target: '_engine', reason: 'ilk yayin gerekcesi burada' };
        await s.publish();

        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 77 } };
        await s.saveDraft();
        s.request = { target: '_engine', reason: 'ikinci yayin gerekcesi burada' };
        await s.publish();

        s.request = { target: '_engine', toVersion: 1, reason: 'birinci surume geri donuyorum simdi' };
        const rb = await s.rollback();
        expect(rb.publishedVersion).toBe(3);

        s.request = { target: '_engine' };
        const eff = await s.getEffectiveConfig();
        const row = eff.values.find((v: any) => v.key === 'export.publisher.chunkSize');
        expect(row.value).toBe(33);
        expect(row.source).toBe('platform');
    });

    it('takeOverLock: taslak kilidini devralır', async () => {
        const s = svc('admin-1');
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 20 } };
        await s.saveDraft();
        const s2 = svc('admin-2');
        s2.request = { target: '_engine' };
        const res = await s2.takeOverLock();
        expect(res.lockedBy).toBe('admin-2');
    });

    it('list: _engine hedefini içerir ve hasDraft doğru raporlanır', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 25 } };
        await s.saveDraft();
        s.request = {};
        const rows = await s.list();
        const engineRow = rows.find((r: any) => r.target === '_engine');
        expect(engineRow.hasDraft).toBe(true);
    });

    it('history: yayınlanan sürümleri kronolojik listeler', async () => {
        const s = svc();
        s.request = { target: '_engine', patch: { 'export.publisher.chunkSize': 10 } };
        await s.saveDraft();
        s.request = { target: '_engine', reason: 'ilk yayin gerekce metni burada' };
        await s.publish();
        s.request = { target: '_engine' };
        const hist = await s.history();
        expect(hist.length).toBe(1);
        expect(hist[0].status).toBe('published');
    });

    it('testEndpoint: live modu her zaman "platform test hesabı tanımlı değil" döner (sahte başarı YOK)', async () => {
        const s = svc();
        s.request = { target: '_engine', key: 'export.publisher.chunkSize', mode: 'live' };
        const res = await s.testEndpoint();
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/platform test hesabı tanımlı değil/);
    });

    it('testEndpoint: static modu değeri doğrular (geçerli/geçersiz)', async () => {
        const s = svc();
        s.request = { target: '_engine', key: 'export.publisher.chunkSize', mode: 'static', value: 40 };
        expect((await s.testEndpoint()).ok).toBe(true);
        s.request = { target: '_engine', key: 'resilience.factoryCallTimeoutMs', mode: 'static', value: 1 };
        expect((await s.testEndpoint()).ok).toBe(false);
    });
});

// =====================================================================================================================
// ADR-0020 Karar 3.8 (Aşama D) — setIntake (kill-switch)
// =====================================================================================================================
describe('IntegrationConfigService — setIntake (Karar 3.8)', () => {
    it('geçersiz intake değeri 400/VALIDATION ile reddedilir', async () => {
        const s = svc();
        s.request = { target: '_engine', intake: 'paused' };
        await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('drain: gerekçesiz 400/APPROVAL_REQUIRED; yeterli gerekçeyle başarılı, Heads.intake=drain olur ve denetlenir', async () => {
        const s = svc();
        s.request = { target: 'trendyol', intake: 'drain' };
        await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

        s.request = { target: 'trendyol', intake: 'drain', reason: 'bakim penceresi icin gecici olarak durduruyorum' };
        const res = await s.setIntake();
        expect(res.intake).toBe('drain');

        const head: any = await HeadModel.findOne({ _id: 'trendyol' }).lean();
        expect(head.intake).toBe('drain');
        expect(head.publishedVersion).toBe(0); // yayın akışının DIŞINDA -- revizyon YARATILMADI

        const auditEvt = auditRecords.find((r) => r.event === 'integration_config.set_intake' && r.result === 'ok');
        expect(auditEvt).toBeDefined();
        expect(JSON.stringify(auditEvt)).not.toMatch(/password|secret/i);
    });

    it('off: yazılı onay (hedef kodu) olmadan reddedilir; doğru onayla başarılı', async () => {
        const s = svc();
        s.request = { target: 'trendyol', intake: 'off', reason: 'guvenlik olayi nedeniyle kapatiyorum simdi' };
        await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

        s.request = { target: 'trendyol', intake: 'off', reason: 'guvenlik olayi nedeniyle kapatiyorum simdi', typedConfirmation: 'trendyol' };
        const res = await s.setIntake();
        expect(res.intake).toBe('off');
    });

    it('off: iki kişi kuralı AÇIKKEN approvedBy eksik/aynı kişi reddedilir, farklı approvedBy ile başarılı', async () => {
        process.env.TWO_PERSON_RULE_ENABLED = 'true';
        try {
            const s = svc('admin-1');
            s.request = { target: 'trendyol', intake: 'off', reason: 'iki kisi kurali testi off icin', typedConfirmation: 'trendyol' };
            await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

            s.request = { target: 'trendyol', intake: 'off', reason: 'iki kisi kurali testi off icin', typedConfirmation: 'trendyol', approvedBy: 'admin-1' };
            await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400, code: 'APPROVAL_REQUIRED' });

            s.request = { target: 'trendyol', intake: 'off', reason: 'iki kisi kurali testi off icin', typedConfirmation: 'trendyol', approvedBy: 'admin-2' };
            await expect(s.setIntake()).resolves.toMatchObject({ intake: 'off' });
        } finally {
            delete process.env.TWO_PERSON_RULE_ENABLED;
        }
    });

    it('maintenance iletisi drain ile birlikte yazılır; sonra on\'a dönüşte AÇIKÇA verilmezse TEMİZLENİR', async () => {
        const s = svc();
        s.request = {
            target: 'trendyol', intake: 'drain', reason: 'bakim penceresi icin gecici olarak durduruyorum',
            maintenance: { message: { tr: 'Bakımdayız', en: 'Under maintenance' } },
        };
        const drained = await s.setIntake();
        expect(drained.maintenance?.message?.tr).toBe('Bakımdayız');

        s.request = { target: 'trendyol', intake: 'on' };
        const restored = await s.setIntake();
        expect(restored.intake).toBe('on');
        expect(restored.maintenance).toBeUndefined();
    });

    it('maintenance.until geçersiz tarihse 400/VALIDATION döner', async () => {
        const s = svc();
        s.request = { target: 'trendyol', intake: 'drain', reason: 'bakim penceresi icin gecici olarak durduruyorum', maintenance: { until: 'not-a-date' } };
        await expect(s.setIntake()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('on: onaysız/gerekçesiz her zaman başarılıdır (normale dönüş "safe")', async () => {
        const s = svc();
        s.request = { target: 'trendyol', intake: 'on' };
        await expect(s.setIntake()).resolves.toMatchObject({ intake: 'on' });
    });
});

// =====================================================================================================================
// ADR-0020 Karar 5 (Aşama D) — proposeFromFinding (drift entegrasyonu)
// =====================================================================================================================
describe('IntegrationConfigService — proposeFromFinding (Karar 5)', () => {
    async function insertFinding(overrides: Record<string, any> = {}) {
        const doc = await FindingModel.create({
            dedupKey: overrides.dedupKey ?? `dedup-${crypto.randomBytes(4).toString('hex')}`,
            integrationCode: 'trendyol',
            category: 'orders',
            kind: 'endpoint',
            source: 'guard',
            subjectKey: 'order/sellers/<SELLERID>/orders',
            severity: 'high',
            status: 'new',
            ...overrides,
        });
        return doc.toObject();
    }

    it('findingId zorunludur (400/VALIDATION)', async () => {
        const s = svc();
        s.request = {};
        await expect(s.proposeFromFinding()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('bilinmeyen findingId 404/NOT_FOUND döner', async () => {
        const s = svc();
        s.request = { findingId: 'olmayan-dedup-key' };
        await expect(s.proposeFromFinding()).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

    it('kod değişikliği gerektiren bulgu türü (schema) REDDEDİLİR', async () => {
        const finding = await insertFinding({ kind: 'schema' });
        const s = svc();
        s.request = { findingId: finding.dedupKey };
        await expect(s.proposeFromFinding()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('kapanmış bulgu durumu (fixed) REDDEDİLİR', async () => {
        const finding = await insertFinding({ status: 'fixed', closedAt: new Date() });
        const s = svc();
        s.request = { findingId: finding.dedupKey };
        await expect(s.proposeFromFinding()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });

    it('mutlu yol: endpoint/new bulgudan {kind:"finding",ref} originli bir TASLAK açar; denetlenir', async () => {
        const finding = await insertFinding();
        const s = svc('admin-1');
        s.request = { findingId: finding.dedupKey };
        const res = await s.proposeFromFinding();
        expect(res.target).toBe('trendyol');
        expect(res.draftVersion).toBe(1);
        expect(res.origin).toEqual({ kind: 'finding', ref: finding.dedupKey });

        const draft: any = await RevisionModel.findOne({ target: 'trendyol', status: 'draft' }).lean();
        expect(draft?.origin).toEqual({ kind: 'finding', ref: finding.dedupKey });

        const auditEvt = auditRecords.find((r) => r.event === 'integration_config.propose_from_finding' && r.result === 'ok');
        expect(auditEvt).toBeDefined();
    });

    it('emekli uç eşleşmesi varsa öneri (suggestion) BİLGİ olarak döner; taslağa OTOMATİK DEĞER YAZILMAZ', async () => {
        const retired = getIntegrationDescriptor('trendyol')!.config.retiredEndpoints![0];
        const finding = await insertFinding({ subjectKey: retired.pattern });
        const s = svc();
        s.request = { findingId: finding.dedupKey };
        const res = await s.proposeFromFinding();
        expect(res.suggestion).toMatchObject({ kind: 'retiredEndpoint', pattern: retired.pattern, replacementKey: retired.replacementKey });

        const draft: any = await RevisionModel.findOne({ target: 'trendyol', status: 'draft' }).lean();
        // `overrides:{}` boş nesne Mongoose `minimize` ile kaydedilirken düşer (alan HİÇ yazılmaz, `saveDraftPatch`
        // ile bir yama YAZILMADIĞI SÜRECE) -- bu yüzden `?? {}` ile eşitleniyor; ÖNEMLİ olan alanın YOKLUĞUDUR
        // (patch UYGULANMADI), 'değer' değil.
        expect(draft?.overrides ?? {}).toEqual({}); // OTOMATİK yazılan hiçbir değer YOK
    });

    it('idempotency (key=findingId): var olan taslak varsa YENİ revizyon YARATILMAZ, AYNI taslak döner', async () => {
        const finding = await insertFinding();
        const s = svc();
        s.request = { findingId: finding.dedupKey };
        const first = await s.proposeFromFinding();
        const second = await s.proposeFromFinding();
        expect(second.draftVersion).toBe(first.draftVersion);
        const drafts = await RevisionModel.find({ target: 'trendyol' }).lean();
        expect(drafts.length).toBe(1);
    });

    it('bilinmeyen integrationCode taşıyan bulgu 404/NOT_FOUND döner (assertKnownTarget)', async () => {
        const finding = await insertFinding({ integrationCode: 'olmayan-entegrasyon' });
        const s = svc();
        s.request = { findingId: finding.dedupKey };
        await expect(s.proposeFromFinding()).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
});
