/**
 * ADR-0020 Karar 7.2 "B" satırı test stratejisi: "Mongo filtre semantiği testleri (koşullu yayın güncellemesi,
 * kısmi unique indeks, en son yayın sorgusu; C23 dersi) `mongodb-memory-server` ile."
 *
 * Bu dosya GERÇEK bir MongoDB sunucu SÜRECİ (mongod) başlatır — ama `mongodb-memory-server` ile İZOLE, GEÇİCİ
 * (RAM'de, işlem bitince tamamen silinir) bir örnektir. CLAUDE.md kural 1-2'nin kapsadığı "kalıcı/paylaşılan
 * veritabanı" DEĞİLDİR: bu süreç yalnız bu test dosyasının ömrü boyunca var olur, hiçbir izinli/izinsiz DB adıyla
 * çakışmaz, hiçbir gerçek veriye dokunmaz. İkili dosya (mongod) `backend/.mongodb-binaries/`'e (proje-içi,
 * git-ignored) iner (`MONGOMS_DOWNLOAD_DIR`).
 *
 * NEDEN GERÇEK (embedded) MONGO: `IntegrationConfigHeads` üzerindeki KOŞULLU `findOneAndUpdate` ve
 * `IntegrationConfigRevisions` üzerindeki KISMİ TEKİL indeks Mongo'nun gerçek operatör/indeks semantiğine dayanır;
 * bellek-içi (JS taklidi) modeller bu semantiği YANLIŞ taklit edebilir (C23 dersi: `$lt/$eq` ile `null`/eksik alan
 * karşılaştırması tip-kısıtlıdır, mock'lu testler bunu gizler).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import crypto from 'crypto';

jestGlobal.setTimeout(120000);

import {
    getHead, getDraft, getOrCreateDraft, saveDraftPatch, publishDraft, rollbackToVersion, getPublished, discardDraft,
    setIntakeState, DraftConflictError, PublishConflictError, NoDraftError, type RevisionModels,
} from '@integration/config/revisionRepository';
import { IntegrationConfigRevisionSchema, IntegrationConfigHeadSchema } from '@database/application/models/IntegrationConfig';

let MongoMemoryServerClass: typeof import('mongodb-memory-server').MongoMemoryServer;
let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let models: RevisionModels;

beforeAll(async () => {
    ({ MongoMemoryServer: MongoMemoryServerClass } = require('mongodb-memory-server'));
    mongod = await MongoMemoryServerClass.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'adr0020_config_test').asPromise();

    const RevisionModel = conn.model('IntegrationConfigRevision', IntegrationConfigRevisionSchema);
    const HeadModel = conn.model('IntegrationConfigHead', IntegrationConfigHeadSchema);
    await RevisionModel.syncIndexes();
    await HeadModel.syncIndexes();
    models = { revisionModel: RevisionModel, headModel: HeadModel };
});

afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
    await mongod?.stop();
});

function target(name: string): string {
    return `zot-${name}-${crypto.randomBytes(3).toString('hex')}`;
}

describe('C23 semantiği: IntegrationConfigHeads.publishedVersion HER ZAMAN sayısal (null/eksik anlam taşımaz)', () => {
    it('hiç head belgesi yokken getHead() sözde-belge (publishedVersion:0) döner', async () => {
        const t = target('sem-a');
        const head = await getHead(models, t);
        expect(head.publishedVersion).toBe(0);
    });

    it('raw insertOne ile `publishedVersion` alanı HİÇ yazılmadan eklenen belge `{publishedVersion:0}` filtresiyle EŞLEŞMEZ (tip-kısıtlı semantik)', async () => {
        const t = target('sem-b');
        await models.headModel.collection.insertOne({ _id: t } as any);
        const raw: any = await models.headModel.collection.findOne({ _id: t });
        expect(raw.publishedVersion).toBeUndefined();
        const matchedByZero = await models.headModel.collection.findOne({ _id: t, publishedVersion: 0 });
        expect(matchedByZero).toBeNull(); // C23 dersi: eksik alan `{publishedVersion:0}` ile EŞLEŞMEZ
        // Repository katmanı HER ZAMAN .create()/.findOneAndUpdate(...$set) ile yazar -- bu boşluk üretimde oluşmaz.
    });
});

describe('Tek-taslak kısmi tekil indeks (Karar 3.1)', () => {
    it('aynı target için ikinci taslak DOĞRUDAN insertOne ile denenirse E11000 alır (indeks gerçekten Mongo\'da var)', async () => {
        const t = target('idx');
        await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        await expect(
            models.revisionModel.collection.insertOne({
                target: t, version: 999, status: 'draft', overrides: {}, basedOnVersion: 0, catalogVersion: 'v1',
                origin: { kind: 'manual' }, diff: [], createdBy: 'admin-2', createdAt: new Date(), draftRev: 0,
            } as any),
        ).rejects.toMatchObject({ code: 11000 });
    });

    it('bir taslak `discarded`/`published` olduktan SONRA aynı target için yeni taslak açılabilir (kısmi indeks yalnız status=draft\'ı kapsar)', async () => {
        const t = target('idx-after-discard');
        const d = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        await discardDraft(models, t, d.draftRev);
        const d2 = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-2' });
        expect(d2.version).toBe(2);
        expect(d2.status).toBe('draft');
    });

    it('getOrCreateDraft eşzamanlı iki çağrıda İKİSİ DE aynı (tek) taslağı döner (yarış güvenli)', async () => {
        const t = target('idx-race');
        const [a, b] = await Promise.all([
            getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' }),
            getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-2' }),
        ]);
        expect(String(a._id)).toBe(String(b._id));
        const all = await models.revisionModel.find({ target: t, status: 'draft' }).lean();
        expect(all.length).toBe(1);
    });
});

describe('İyimser kilit (draftRev, Karar 3.2/3.7)', () => {
    it('yanlış expectedDraftRev DraftConflictError fırlatır; doğru rev ile kayıt draftRev+1 olur', async () => {
        const t = target('optlock');
        const draft = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        expect(draft.draftRev).toBe(0);

        await expect(saveDraftPatch(models, { target: t, expectedDraftRev: 5, patch: { 'export.publisher.chunkSize': 40 }, updatedBy: 'admin-1' }))
            .rejects.toBeInstanceOf(DraftConflictError);

        const saved = await saveDraftPatch(models, { target: t, expectedDraftRev: 0, patch: { 'export.publisher.chunkSize': 40 }, updatedBy: 'admin-1' });
        expect(saved.draftRev).toBe(1);
        expect(saved.overrides).toEqual({ 'export.publisher.chunkSize': 40 });
    });

    it('hiç taslak yokken saveDraftPatch/discardDraft NoDraftError fırlatır', async () => {
        const t = target('nodraft');
        await expect(saveDraftPatch(models, { target: t, expectedDraftRev: 0, patch: {}, updatedBy: 'a' })).rejects.toBeInstanceOf(NoDraftError);
        await expect(discardDraft(models, t, 0)).rejects.toBeInstanceOf(NoDraftError);
    });
});

describe('Yayın atomikliği (Karar 3.1 "koşullu findOneAndUpdate") — GERÇEK Mongo yarışı', () => {
    it('[ham Mongo primitifi] Heads üzerinde koşullu findOneAndUpdate: iki eşzamanlı çağrıdan yalnız BİRİ eşleşir (basedOnVersion>0)', async () => {
        const t = target('raw-heads-cas');
        await models.headModel.collection.insertOne({ _id: t, publishedVersion: 1, intake: 'on', updatedAt: new Date() } as any);

        const results = await Promise.all([
            models.headModel.collection.findOneAndUpdate({ _id: t, publishedVersion: 1 }, { $set: { publishedVersion: 2 } }, { returnDocument: 'after' } as any),
            models.headModel.collection.findOneAndUpdate({ _id: t, publishedVersion: 1 }, { $set: { publishedVersion: 3 } }, { returnDocument: 'after' } as any),
        ]);
        const matched = results.filter((r: any) => (r?.value ?? r) != null);
        expect(matched.length).toBe(1); // yalnız BİRİ `publishedVersion:1` koşuluna uydu
    });

    it('[ham Mongo primitifi] Heads ilk-yayın: iki eşzamanlı `create({_id:target,...})` -- yalnız biri kazanır, diğeri E11000', async () => {
        const t = target('raw-heads-first');
        const results = await Promise.allSettled([
            models.headModel.create({ _id: t, publishedVersion: 1 }),
            models.headModel.create({ _id: t, publishedVersion: 1 }),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
        const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect((failed.reason as any).code).toBe(11000);
    });

    it('publishDraft: AYNI taslağı iki eşzamanlı çağrı yayınlamaya çalışırsa -- yalnız biri kazanır, diğeri DraftConflictError (draftRev tek belgeyi serileştirir)', async () => {
        const t = target('same-draft-race');
        const draft = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });

        const results = await Promise.allSettled([
            publishDraft(models, { target: t, draft, diff: [], publishedBy: 'admin-1' }),
            publishDraft(models, { target: t, draft, diff: [], publishedBy: 'admin-2' }),
        ]);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DraftConflictError);

        const head = await getHead(models, t);
        expect(head.publishedVersion).toBe(draft.version);
    });

    it('publishDraft: taslak alındıktan SONRA başka bir yayın Heads\'i ilerletirse (basedOnVersion artık bayat) -- PublishConflictError; taslak `draft`a GERİ DÖNER', async () => {
        const t = target('stale-based-on-version');
        const d1 = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        await publishDraft(models, { target: t, draft: d1, diff: [], publishedBy: 'admin-1' }); // head.publishedVersion=1

        const d2 = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-2' }); // basedOnVersion=1 (doğru yakalandı)
        // Dışarıdan (bu akışın DIŞINDA, ör. göç aracı ya da başka bir istek) Heads ilerletilmiş gibi simüle edilir --
        // `d2.basedOnVersion` artık BAYAT. `publishDraft` bunu Heads koşullu güncellemesinde YAKALAMALIDIR.
        await models.headModel.updateOne({ _id: t }, { $set: { publishedVersion: 7 } });

        await expect(publishDraft(models, { target: t, draft: d2, diff: [], publishedBy: 'admin-2' })).rejects.toBeInstanceOf(PublishConflictError);

        // Taslak yarı-yayınlanmış bırakılmadı: GERİ ALINDI (status tekrar 'draft'), admin farkı yeniden gözden geçirip tekrar deneyebilir.
        const reverted = await getDraft(models, t);
        expect(reverted?.status).toBe('draft');
        expect(reverted?.version).toBe(d2.version);
        expect((await getHead(models, t)).publishedVersion).toBe(7); // dış yayın DEĞİŞMEDEN kaldı
    });

    it('publishDraft: hiç yayın yokken (basedOnVersion=0) araya harici bir Heads kaydı girerse -- PublishConflictError', async () => {
        const t = target('stale-first-publish');
        const draft = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' }); // basedOnVersion=0

        // Dışarıdan (bu draft'ın FARKINDA olmadığı) bir ilk-yayın gerçekleşmiş gibi simüle edilir.
        await models.headModel.create({ _id: t, publishedVersion: 1 });

        await expect(publishDraft(models, { target: t, draft, diff: [], publishedBy: 'admin-1' })).rejects.toBeInstanceOf(PublishConflictError);
        const reverted = await getDraft(models, t);
        expect(reverted?.status).toBe('draft');
        expect((await getHead(models, t)).publishedVersion).toBe(1); // harici yayın DEĞİŞMEDEN kaldı
    });
});

describe('Geri alma (rollback) = yeni revizyon (Karar 3.4)', () => {
    it('rollbackToVersion eski overrides\'ı YENİ bir sürüm olarak yayınlar; eski revizyon değişmeden kalır (status=superseded)', async () => {
        const t = target('rollback');
        const d1 = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        const d1Filled = await saveDraftPatch(models, { target: t, expectedDraftRev: d1.draftRev, patch: { 'export.publisher.chunkSize': 40 }, updatedBy: 'admin-1' });
        const p1 = await publishDraft(models, { target: t, draft: d1Filled, diff: [], publishedBy: 'admin-1' });
        expect(p1.head.publishedVersion).toBe(1);

        const d2 = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        const d2Filled = await saveDraftPatch(models, { target: t, expectedDraftRev: d2.draftRev, patch: { 'export.publisher.chunkSize': 999 }, updatedBy: 'admin-1' });
        const p2 = await publishDraft(models, { target: t, draft: d2Filled, diff: [], publishedBy: 'admin-1' });
        expect(p2.head.publishedVersion).toBe(2);

        const rollback = await rollbackToVersion(models, { target: t, toVersion: 1, createdBy: 'admin-9', reason: 'geri al', catalogVersion: 'v1', diff: [] });
        expect(rollback.revision.version).toBe(3); // YENİ revizyon, eskisi ÜZERİNE YAZILMADI
        expect(rollback.revision.origin).toEqual({ kind: 'rollback', ref: '1' });
        expect(rollback.revision.overrides).toEqual({ 'export.publisher.chunkSize': 40 });
        expect(rollback.head.publishedVersion).toBe(3);

        const originalV1: any = await models.revisionModel.findOne({ target: t, version: 1 }).lean();
        expect(originalV1.overrides).toEqual({ 'export.publisher.chunkSize': 40 }); // eski revizyon DEĞİŞMEDİ (tarih yeniden yazılmadı)
        expect(originalV1.status).toBe('superseded');
    });
});

describe('"En son yayın" sorgusu (getPublished, Heads.publishedVersion üzerinden)', () => {
    it('DOĞRU revizyonu getirir; hiç yayın yoksa null döner; yayından sonra taslak boşalır', async () => {
        const t = target('getpub');
        expect(await getPublished(models, t)).toBeNull();

        const d = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        const filled = await saveDraftPatch(models, { target: t, expectedDraftRev: d.draftRev, patch: { a: 1 }, updatedBy: 'admin-1' });
        await publishDraft(models, { target: t, draft: filled, diff: [], publishedBy: 'admin-1' });

        const published = await getPublished(models, t);
        expect(published?.overrides).toEqual({ a: 1 });
        expect(published?.status).toBe('published');
        expect(await getDraft(models, t)).toBeNull();
    });
});

describe('ADR-0020 Karar 3.8 (Aşama D) — setIntakeState: Heads üzerinde DOĞRUDAN günceller (revizyon YARATMAZ)', () => {
    it('hiç Head yokken bile upsert ile publishedVersion:0 + intake yazılır (C23: hiçbir zaman null/eksik)', async () => {
        const t = target('intake-upsert');
        const head = await setIntakeState(models, { target: t, intake: 'drain' });
        expect(head.intake).toBe('drain');
        expect(head.publishedVersion).toBe(0); // schema default -- upsert'te bile korunur
        expect(await getDraft(models, t)).toBeNull(); // YENİ bir taslak/revizyon AÇILMADI
    });

    it('maintenance nesnesi set edilir; sonra null ile $unset edilerek TEMİZLENİR', async () => {
        const t = target('intake-maint');
        await setIntakeState(models, { target: t, intake: 'off', maintenance: { message: { tr: 'Bakımda', en: 'Maintenance' } } });
        let head = await getHead(models, t);
        expect(head.maintenance?.message?.tr).toBe('Bakımda');

        head = await setIntakeState(models, { target: t, intake: 'on', maintenance: null });
        expect(head.intake).toBe('on');
        expect(head.maintenance).toBeUndefined();
    });

    it('mevcut bir yayını (publishedVersion>0) DEĞİŞTİRMEZ -- yalnız intake/maintenance güncellenir', async () => {
        const t = target('intake-preserve');
        const d = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        const filled = await saveDraftPatch(models, { target: t, expectedDraftRev: d.draftRev, patch: { a: 1 }, updatedBy: 'admin-1' });
        await publishDraft(models, { target: t, draft: filled, diff: [], publishedBy: 'admin-1' });

        const head = await setIntakeState(models, { target: t, intake: 'drain' });
        expect(head.publishedVersion).toBe(1); // yayın akışının DIŞINDA -- sürüm ARTMADI
        expect(head.intake).toBe('drain');
        expect((await getPublished(models, t))?.overrides).toEqual({ a: 1 }); // yayınlanan içerik AYNI
    });
});

describe('ADR-0020 Karar 5 (Aşama D) — getOrCreateDraft origin parametresi', () => {
    it('origin verilmezse varsayılan {kind:"manual"} korunur (geriye dönük UYUMLU, Aşama B davranışı DEĞİŞMEZ)', async () => {
        const t = target('origin-default');
        const d = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        expect(d.origin).toEqual({ kind: 'manual' });
    });

    it('origin={kind:"finding",ref} verilirse YENİ taslak bunu taşır', async () => {
        const t = target('origin-finding');
        const d = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1', origin: { kind: 'finding', ref: 'dedup-abc' } });
        expect(d.origin).toEqual({ kind: 'finding', ref: 'dedup-abc' });
    });

    it('VAR OLAN bir taslağın origin\'i İKİNCİ çağrıdaki origin ile DEĞİŞTİRİLMEZ (taslağın kimliği İLK açanınkidir)', async () => {
        const t = target('origin-existing');
        const first = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-1' });
        expect(first.origin).toEqual({ kind: 'manual' });
        const second = await getOrCreateDraft(models, { target: t, catalogVersion: 'v1', createdBy: 'admin-2', origin: { kind: 'finding', ref: 'dedup-xyz' } });
        expect(second.origin).toEqual({ kind: 'manual' }); // DEĞİŞMEDİ
        expect(second.version).toBe(first.version); // AYNI taslak
    });
});
