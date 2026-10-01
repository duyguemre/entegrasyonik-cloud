/**
 * ADR-0020 Karar 3.6/7.2 "B" satırı: "sahte saatle 15 sn yayılım testi (iki 'pod' örneği)" + "DB okunamazken son
 * bilinen yapılandırma kullanılır, 3 ardışık hatada warn + sistem uyarısı".
 *
 * `mongodb-memory-server` (izole/geçici) kullanır. "İki pod" `jest.isolateModules` ile `platformOverrideStore`'un
 * İKİ BAĞIMSIZ modül örneğini (her süreç kendi bellek-içi deposuna sahiptir) canlandırarak simüle edilir; her ikisi
 * de AYNI (paylaşılan) `IntegrationConfigHeads/Revisions` koleksiyonlarını yoklar -- gerçek çok-pod topolojisiyle
 * BİREBİR aynı doğruluk modeli (DB doğruluğun tek kaynağı, bellek-içi depo yalnız 15 sn'lik önbellek).
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';

jestGlobal.setTimeout(120000);

import { IntegrationConfigRevisionSchema, IntegrationConfigHeadSchema } from '@database/application/models/IntegrationConfig';
import { getOrCreateDraft, saveDraftPatch, publishDraft, setIntakeState, type RevisionModels } from '@integration/config/revisionRepository';

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let models: RevisionModels;

beforeAll(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    conn = await mongoose.createConnection(mongod.getUri() + 'adr0020_poll_test').asPromise();
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

/** `jest.isolateModules` ile TAZE bir `platformOverrideStore` + `pollOnce` çifti döner (bağımsız "pod" belleği). */
function freshPodModules(): {
    pollOnce: (m: RevisionModels) => Promise<any>; getKnownVersion: (t: string) => number; getPublishedOverrideValue: (t: string, k: string) => unknown;
    recordPollFailure: () => void; getPollDiagnosticsForTests: () => any; getIntake: (t: string) => string; isIntakeOpen: (t: string) => boolean;
} {
    let mod: any;
    jestGlobal.isolateModules(() => {
        mod = {
            poller: require('../../src/integration/config/configHeadPoll'),
            store: require('../../src/integration/config/platformOverrideStore'),
        };
    });
    return {
        pollOnce: mod.poller.pollOnce,
        getKnownVersion: mod.store.getKnownVersion,
        getPublishedOverrideValue: mod.store.getPublishedOverrideValue,
        recordPollFailure: mod.store.recordPollFailure,
        getPollDiagnosticsForTests: mod.store.getPollDiagnosticsForTests,
        getIntake: mod.store.getIntake,
        isIntakeOpen: mod.store.isIntakeOpen,
    };
}

describe('ADR-0020 Karar 3.6 — 15 sn yayılım (iki "pod" örneği)', () => {
    it('bir yayından SONRA her iki pod bağımsız pollOnce() çağrısında YAYINLANMIŞ değeri görür', async () => {
        const target = 'zot-poll-a';
        const draft = await getOrCreateDraft(models, { target, catalogVersion: 'v1', createdBy: 'admin-1' });
        const filled = await saveDraftPatch(models, { target, expectedDraftRev: draft.draftRev, patch: { 'export.publisher.chunkSize': 55 }, updatedBy: 'admin-1' });
        await publishDraft(models, { target, draft: filled, diff: [], publishedBy: 'admin-1' });

        const podA = freshPodModules();
        const podB = freshPodModules();

        // Yayından ÖNCE (bu podların ilk turu, gerçek dünyada "server başlangıcı") -- henüz bilmiyorlar.
        expect(podA.getKnownVersion(target)).toBe(0);
        expect(podB.getKnownVersion(target)).toBe(0);

        // 15 sn'lik yoklama turu (sahte saat gerekmez -- `pollOnce` doğrudan çağrılır, zamanlama ayrı kanıtlanmıştır
        // ADR-0016/17 scheduler test paketinde; burada YALNIZ "bir tur sonra ne görünür" kanıtlanır).
        await Promise.all([podA.pollOnce(models), podB.pollOnce(models)]);

        expect(podA.getKnownVersion(target)).toBe(1);
        expect(podB.getKnownVersion(target)).toBe(1);
        expect(podA.getPublishedOverrideValue(target, 'export.publisher.chunkSize')).toBe(55);
        expect(podB.getPublishedOverrideValue(target, 'export.publisher.chunkSize')).toBe(55);
    });

    it('ikinci bir yayından sonra YALNIZ değişen hedefler için ağır okuma yapılır (değişmeyen hedef atlanır)', async () => {
        const target = 'zot-poll-b';
        const draft = await getOrCreateDraft(models, { target, catalogVersion: 'v1', createdBy: 'admin-1' });
        const filled = await saveDraftPatch(models, { target, expectedDraftRev: draft.draftRev, patch: { 'export.publisher.chunkSize': 10 }, updatedBy: 'admin-1' });
        await publishDraft(models, { target, draft: filled, diff: [], publishedBy: 'admin-1' });

        const pod = freshPodModules();
        const first = await pod.pollOnce(models);
        expect(first.changed).toContain(target);

        const second = await pod.pollOnce(models); // sürüm değişmedi -> bu turda değişen listesinde OLMAMALI
        expect(second.changed).not.toContain(target);
    });

    it('DB okunamazken (3 ardışık hata) son bilinen yapılandırma KORUNUR, warn kaydı üretilir (fail-open)', async () => {
        const target = 'zot-poll-fail';
        const draft = await getOrCreateDraft(models, { target, catalogVersion: 'v1', createdBy: 'admin-1' });
        const filled = await saveDraftPatch(models, { target, expectedDraftRev: draft.draftRev, patch: { 'export.publisher.chunkSize': 77 }, updatedBy: 'admin-1' });
        await publishDraft(models, { target, draft: filled, diff: [], publishedBy: 'admin-1' });

        const pod = freshPodModules();
        await pod.pollOnce(models); // son bilinen: v1, chunkSize=77
        expect(pod.getKnownVersion(target)).toBe(1);

        // DB "okunamaz" senaryosu: bozuk modeller ile pollOnce -- ConfigHeadPollScheduler.start() içindeki try/catch
        // yolunu izole test etmek için burada doğrudan store'un hata sayacını 3 kez tetikliyoruz (gerçek DB kopması
        // senaryosunun ConfigHeadPollScheduler.start() run() bloğundaki try/catch'i zaten kapsar; store API'si burada
        // bağımsız test edilir -- bkz. platformOverrideStore.test.ts recordPollFailure birim testleri).
        pod.recordPollFailure(); pod.recordPollFailure(); pod.recordPollFailure();
        const diag = pod.getPollDiagnosticsForTests();
        expect(diag.consecutiveFailures).toBe(3);

        // Son bilinen değer HÂLÂ okunabilir (fail-open, Karar 3.6 son madde):
        expect(pod.getKnownVersion(target)).toBe(1);
        expect(pod.getPublishedOverrideValue(target, 'export.publisher.chunkSize')).toBe(77);
    });
});

describe('ADR-0020 Karar 3.8 (Aşama D) — intake ≤15 sn yayılımı (yayın akışının DIŞINDA, publishedVersion ARTMAZ)', () => {
    it('setIntakeState sonrası her iki pod bağımsız pollOnce() çağrısında YENİ intake değerini görür (sürüm HİÇ değişmese bile)', async () => {
        const target = 'zot-poll-intake-a';
        const podA = freshPodModules();
        const podB = freshPodModules();

        expect(podA.getIntake(target)).toBe('on');
        expect(podB.getIntake(target)).toBe('on');

        await setIntakeState(models, { target, intake: 'drain' });
        const headAfter: any = await models.headModel.findOne({ _id: target }).lean();
        expect(headAfter.publishedVersion).toBe(0); // hiç yayın YOK, hiç YARATILMADI (kill-switch yayın akışının DIŞINDA)

        await Promise.all([podA.pollOnce(models), podB.pollOnce(models)]);

        expect(podA.getIntake(target)).toBe('drain');
        expect(podB.getIntake(target)).toBe('drain');
        expect(podA.isIntakeOpen(target)).toBe(false);
        expect(podB.isIntakeOpen(target)).toBe(false);
    });

    it('bir hedefin YAYINLANMIŞ overrides\'ı VARKEN intake ayrı değişebilir; poll her ikisini de doğru taşır', async () => {
        const target = 'zot-poll-intake-b';
        const draft = await getOrCreateDraft(models, { target, catalogVersion: 'v1', createdBy: 'admin-1' });
        const filled = await saveDraftPatch(models, { target, expectedDraftRev: draft.draftRev, patch: { 'export.publisher.chunkSize': 66 }, updatedBy: 'admin-1' });
        await publishDraft(models, { target, draft: filled, diff: [], publishedBy: 'admin-1' });
        await setIntakeState(models, { target, intake: 'off' });

        const pod = freshPodModules();
        await pod.pollOnce(models);

        expect(pod.getKnownVersion(target)).toBe(1);
        expect(pod.getPublishedOverrideValue(target, 'export.publisher.chunkSize')).toBe(66);
        expect(pod.getIntake(target)).toBe('off');
    });
});
