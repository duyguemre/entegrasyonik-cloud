/**
 * ============================================================================================
 * UYARI — BU DOSYA GERÇEK LOCAL MONGODB'YE BAĞLANIR (mock DEĞİL). `tests/integration/` klasörü
 * StockAllocator.concurrency.test.ts ile AYNI kuralları izler (CLAUDE.md kural 2/5):
 *  - Yalnızca izinli DB `entegrasyonikClient_1`; üretimdeki `ClientDB`/`Database` bağlantı yolu AYNEN kullanılır.
 *  - Yalnızca BU DOSYANIN yarattığı SENTETİK koleksiyon (`ZOT_TEST_LeaseProbe_<rastgele>`) kullanılır; gerçek
 *    koleksiyon/belgeye (ExportFlag dahil) DOKUNULMAZ. Koleksiyon `afterAll`'da DÜŞÜRÜLÜR ve kalıntı 0 doğrulanır.
 *  - `.env` yolu `DOTENV_CONFIG_PATH` ile verilebilir (worktree'de `.env` bulunmaz; `.env` kopyalanmaz/commit'lenmez).
 *
 * NEDEN GERÇEK MONGO: [DÜZELTME 2026-09-28] `acquireLease`'in eski filtresi (`$or: [{leaseUntil: {$lt: now}},
 * {leaseOwner: owner}]`) mock'lu testte "null < Date" varsayımıyla yeşildi, ama GERÇEK MongoDB karşılaştırma
 * operatörlerini TİP-KISITLI (type bracketing) işler: `{$lt: Date}` alanı null olan/OLMAYAN belgeyle EŞLEŞMEZ.
 * Bu yüzden hiç lease alınmamış/bırakılmış (`leaseUntil: null`) bayrak için `acquireLease` her zaman `null`
 * dönüyordu. Bu dosya (1) o gerçek semantiği belgeler, (2) düzeltilmiş `acquireLease`'i gerçek Mongo'da kanıtlar.
 * ============================================================================================
 */
import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { acquireLease, releaseLease } from '@utils/mongoLease';

require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../../.env') });

jestGlobal.setTimeout(30000);

const TENANT_DB_NAME = 'entegrasyonikClient_1'; // izinli 7 DB'den biri (CLAUDE.md kural 2)
const COLLECTION_PREFIX = 'ZOT_TEST_LeaseProbe_';
const COLLECTION_NAME = `${COLLECTION_PREFIX}${crypto.randomBytes(4).toString('hex')}`;

let ClientDBClass: typeof import('@database/client/ClientDB').default;
let Probe: mongoose.Model<any>;
let dbHandle: any;

/** ESKİ (hatalı) filtre — yalnızca gerçek Mongo'da hatayı belgelemek için; üretim kodu bunu KULLANMAZ. */
async function legacyAcquire(match: Record<string, any>, owner: string, ttlMs: number) {
    const now = new Date();
    return Probe.collection.findOneAndUpdate(
        { ...match, $or: [{ leaseUntil: { $lt: now } }, { leaseOwner: owner }] },
        { $set: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + ttlMs) } },
        { returnDocument: 'after' },
    );
}

/** Raw driver ile ekler: `leaseUntil` alanı HİÇ olmayan belge için mongoose default'ları atlanır. */
async function insertRaw(doc: Record<string, any>) {
    const _id = new mongoose.Types.ObjectId();
    await Probe.collection.insertOne({ _id, ...doc } as any);
    return _id;
}

const T0 = 5 * 60 * 1000;

beforeAll(async () => {
    if (!process.env.DB_URL) {
        throw new Error('[mongoLease.realmongo] DB_URL tanımlı değil (DOTENV_CONFIG_PATH veya backend/.env gerekli — gerçek local Mongo testi).');
    }
    ClientDBClass = require('@database/client/ClientDB').default;
    const clientDB: any = await ClientDBClass.getInstance({
        _id: 'mongo-lease-integration-test',
        dbConfig: { dbname: TENANT_DB_NAME, poolsize: 5 },
    } as any);
    const conn = clientDB.getVariantModel().db; // mongoose Connection (tenant DB)
    dbHandle = conn.db;
    expect(dbHandle.databaseName).toBe(TENANT_DB_NAME); // izinli-DB doğrulaması
    // Gerçek ExportFlag şeması (leaseOwner/leaseUntil `default: null`) — ama SENTETİK koleksiyon adıyla.
    const { ExportFlagSchema } = require('@database/application/models/Export');
    const schema = ExportFlagSchema.clone();
    schema.set('collection', COLLECTION_NAME);
    Probe = conn.model(`LeaseProbe_${COLLECTION_NAME}`, schema, COLLECTION_NAME);
    await Probe.createCollection();
});

afterAll(async () => {
    try {
        if (Probe) await Probe.collection.drop();
    } catch {
        // en iyi çaba
    }
    if (dbHandle) {
        const leftovers = await dbHandle.listCollections({ name: { $regex: `^${COLLECTION_PREFIX}` } }).toArray();
        console.log(`[mongoLease.realmongo] kalinti koleksiyon sayisi: ${leftovers.length}`);
        expect(leftovers.length).toBe(0);
    }
    ClientDBClass?.resetForTests(); // [faz4-arch-p0db] LRU kalkti: tutamak onbellegi temizlenir (kok baglantiyi DatabaseManager.close kapatir)
});

describe('MongoDB tip kısıtlaması (type bracketing) — gerçek semantik belgesi', () => {
    it('`{leaseUntil: {$lt: Date}}` alanı null/OLMAYAN belgeyle EŞLEŞMEZ; `{leaseUntil: null}` ikisiyle de eşleşir', async () => {
        const idNull = await insertRaw({ clientId: 'ZOT-sem', integrationCode: 'sem-null', leaseOwner: null, leaseUntil: null });
        const idMissing = await insertRaw({ clientId: 'ZOT-sem', integrationCode: 'sem-missing' });
        const idPast = await insertRaw({ clientId: 'ZOT-sem', integrationCode: 'sem-past', leaseUntil: new Date(Date.now() - 1000) });
        const ids = [idNull, idMissing, idPast];

        const lt = await Probe.collection.find({ _id: { $in: ids }, leaseUntil: { $lt: new Date() } }).toArray();
        const eqNull = await Probe.collection.find({ _id: { $in: ids }, leaseUntil: null }).toArray();
        console.log(`[mongoLease.realmongo] $lt:Date eslesen: ${lt.map((d) => d.integrationCode).join(',')} | leaseUntil:null eslesen: ${eqNull.map((d) => d.integrationCode).sort().join(',')}`);

        expect(lt.map((d) => d.integrationCode)).toEqual(['sem-past']); // null ve alan-yok EŞLEŞMEDİ
        expect(eqNull.map((d) => d.integrationCode).sort()).toEqual(['sem-missing', 'sem-null']);
    });
});

describe('ESKİ filtre (hata belgesi) — gerçek Mongo', () => {
    it('(a) leaseUntil:null belgede eski filtre null döner (HATA)', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-old', integrationCode: 'a', leaseOwner: null, leaseUntil: null });
        const res: any = await legacyAcquire({ _id }, 'pod-A', T0);
        console.log(`[mongoLease.realmongo] ESKI filtre (a) leaseUntil:null -> ${res ? 'ESLESTI' : 'null (HATA)'}`);
        expect(res).toBeNull();
    });

    it('(b) leaseUntil alanı hiç olmayan belgede eski filtre null döner (HATA)', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-old', integrationCode: 'b' });
        const res: any = await legacyAcquire({ _id }, 'pod-A', T0);
        console.log(`[mongoLease.realmongo] ESKI filtre (b) alan-yok -> ${res ? 'ESLESTI' : 'null (HATA)'}`);
        expect(res).toBeNull();
    });

    it('(c) süresi geçmiş tarihli belgede eski filtre eşleşir (yalnızca bu dal çalışıyordu)', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-old', integrationCode: 'c', leaseOwner: 'pod-x', leaseUntil: new Date(Date.now() - 1000) });
        const res: any = await legacyAcquire({ _id }, 'pod-A', T0);
        console.log(`[mongoLease.realmongo] ESKI filtre (c) suresi gecmis -> ${res ? 'ESLESTI' : 'null'}`);
        expect(res).not.toBeNull();
    });
});

describe('acquireLease (düzeltilmiş) — gerçek Mongo', () => {
    it('(a) leaseUntil:null (mongoose default, hiç alınmamış/bırakılmış) belge alınır', async () => {
        const doc: any = await Probe.create({ clientId: 'ZOT-new', integrationCode: 'a' }); // default: leaseUntil null, leaseOwner null
        const raw: any = await Probe.collection.findOne({ _id: doc._id });
        expect(raw.leaseUntil).toBeNull();
        const res = await acquireLease(Probe as any, { _id: doc._id }, 'pod-A', { ttlMs: T0 });
        expect(res).not.toBeNull();
        expect(res.leaseOwner).toBe('pod-A');
        expect(res.leaseUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('(b) leaseUntil alanı hiç olmayan belge alınır', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-new', integrationCode: 'b' });
        const res = await acquireLease(Probe as any, { _id }, 'pod-A', { ttlMs: T0 });
        expect(res).not.toBeNull();
        expect(res.leaseOwner).toBe('pod-A');
    });

    it('(c) süresi geçmiş tarihli belge (başka sahipte) alınır', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-new', integrationCode: 'c', leaseOwner: 'pod-x', leaseUntil: new Date(Date.now() - 1000) });
        const res = await acquireLease(Probe as any, { _id }, 'pod-A', { ttlMs: T0 });
        expect(res).not.toBeNull();
        expect(res.leaseOwner).toBe('pod-A');
    });

    it('aynı sahip aktif lease\'ini yeniden alır (süre uzar); başka sahip aktif lease\'i ALAMAZ', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-new', integrationCode: 'd', leaseOwner: null, leaseUntil: null });
        const first = await acquireLease(Probe as any, { _id }, 'pod-A', { ttlMs: 60_000 });
        expect(first.leaseOwner).toBe('pod-A');

        const again = await acquireLease(Probe as any, { _id }, 'pod-A', { ttlMs: T0 });
        expect(again).not.toBeNull();
        expect(again.leaseUntil.getTime()).toBeGreaterThan(first.leaseUntil.getTime());

        const other = await acquireLease(Probe as any, { _id }, 'pod-B', { ttlMs: T0 });
        expect(other).toBeNull();
        const raw: any = await Probe.collection.findOne({ _id });
        expect(raw.leaseOwner).toBe('pod-A');
    });

    it('iki eşzamanlı acquire (farklı sahipler) — yalnızca biri kazanır (10 tekrar; her tekrarda 1 kazanan)', async () => {
        for (let i = 0; i < 10; i++) {
            const _id = await insertRaw({ clientId: 'ZOT-new', integrationCode: `race-${i}`, leaseOwner: null, leaseUntil: null });
            const results = await Promise.all([
                acquireLease(Probe as any, { _id }, 'pod-A', { ttlMs: T0 }),
                acquireLease(Probe as any, { _id }, 'pod-B', { ttlMs: T0 }),
            ]);
            expect(results.filter((r) => r !== null).length).toBe(1);
            const raw: any = await Probe.collection.findOne({ _id });
            const winner = results.find((r) => r !== null);
            expect(raw.leaseOwner).toBe(winner.leaseOwner);
        }
    });

    it('8 eşzamanlı farklı sahip -> tam 1 kazanan', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-new', integrationCode: 'race-many' });
        const results = await Promise.all(
            Array.from({ length: 8 }, (_, i) => acquireLease(Probe as any, { _id }, `pod-${i}`, { ttlMs: T0 })),
        );
        expect(results.filter((r) => r !== null).length).toBe(1);
    });

    it('releaseLease sonrası (leaseOwner/leaseUntil null) başka sahip yeniden alabilir; başkasının lease\'ine release dokunmaz', async () => {
        const _id = await insertRaw({ clientId: 'ZOT-new', integrationCode: 'rel' });
        const a = await acquireLease(Probe as any, { _id }, 'pod-A', { ttlMs: T0 });
        expect(a.leaseOwner).toBe('pod-A');

        await releaseLease(Probe as any, { _id }, 'pod-B'); // sahibi değil -> etkisiz
        expect(((await Probe.collection.findOne({ _id })) as any).leaseOwner).toBe('pod-A');

        await releaseLease(Probe as any, { _id }, 'pod-A');
        const released: any = await Probe.collection.findOne({ _id });
        expect(released.leaseOwner).toBeNull();
        expect(released.leaseUntil).toBeNull(); // bırakılmış = null -> eski filtre bunu HİÇ alamazdı

        const b = await acquireLease(Probe as any, { _id }, 'pod-B', { ttlMs: T0 });
        expect(b).not.toBeNull();
        expect(b.leaseOwner).toBe('pod-B');
    });
});
