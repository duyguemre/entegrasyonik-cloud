/**
 * ============================================================================================
 * UYARI — BU DOSYA GERÇEK LOCAL MONGODB'YE BAĞLANIR (mock DEĞİL). ADR-0004'ün Test Stratejisi
 * bölümü eşzamanlılık kanıtının mock ile gösterilemeyeceğini AÇIKÇA belirtir; bu yüzden bu klasör
 * (`tests/integration/`) normal `tests/characterization/` (DB/ağ YOK kuralı) klasöründen KASITLI
 * olarak ayrıdır.
 *
 * KESİN KURALLAR (CLAUDE.md kural 2/5 + görev talimatı):
 *  - Yalnızca izinli 7 DB'den biri: `entegrasyonikClient_1` (bağlantı `backend/.env` -> DB_URL/DB_USER/
 *    DB_PASSWORD; local 127.0.0.1, Atlas'a ASLA bağlanılmaz).
 *  - Bu dosyanın oluşturduğu SENTETİK belge dışında hiçbir gerçek ürün/sipariş/müşteri verisine
 *    DOKUNULMAZ. Sentetik belgeler `stockcode: 'ZOT-TEST-<random>'` ile işaretlenir ve HER senaryo
 *    kendi belgesini `finally`'de siler (test çökse de DB'de kalıntı bırakmaz); ayrıca `afterAll`'da
 *    aynı önekle eşleşen artık belgeler için güvenlik süpürmesi yapılır.
 *  - Mongo CLI (mongosh vb.) KULLANILMAZ; bağlantı `mongoose`/`mongodb` sürücüsü ile (üretim kodundaki
 *    `ClientDB`/`Database` sınıfları AYNEN kullanılır — ayrı bir bağlantı mekanizması icat edilmez).
 *
 * İZOLASYON KARARI: bu testler `tests/characterization/` klasöründen AYRI (`tests/integration/`)
 * tutulur çünkü (a) gerçek bir dış kaynağa (local Mongo) bağımlıdır — CI'da Mongo yoksa/hazır değilse
 * hızlıca ayrıştırılıp atlanabilmeli; (b) çalışma süresi mock testlerden belirgin şekilde daha yüksektir
 * (gerçek ağ/disk I/O); (c) "varsayılan tercih mock'tur" kuralına (tests/README.md) sadık kalınarak bu
 * istisna tek bir yerde toplanır. Buna karşın `npm test` (varsayılan jest testMatch) bu dosyayı YİNE DE
 * çalıştırır (roots: src+tests, testMatch her ".test.ts" dosyasını kapsar) — gizli bir kapsam dışı bırakma YOK; ayrıca
 * `npm run test:integration` ile TEK BAŞINA da çalıştırılabilir (hız/CI ihtiyacı için).
 * ============================================================================================
 */
import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';

// .env'den YALNIZCA DB_URL/DB_USER/DB_PASSWORD okumak için (ADR-0001 test izolasyonunu bozmaz:
// dotenv zaten TANIMLI env değişkenlerinin üzerine yazmaz; jwt-env.js'in sentetik değerleri korunur).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

jestGlobal.setTimeout(30000);

const TENANT_DB_NAME = 'entegrasyonikClient_1'; // izinli 7 DB'den biri (CLAUDE.md kural 2)
const TEST_PREFIX = 'ZOT-TEST-';

let ClientDBClass: typeof import('@database/client/ClientDB').default;
let StockAllocator: typeof import('@operations/stock/StockAllocator').StockAllocator;
let VariantModel: any;
let clientDB: any;
let allocator: InstanceType<typeof import('@operations/stock/StockAllocator').StockAllocator>;

function randomSuffix() {
    return crypto.randomBytes(6).toString('hex');
}

async function createSyntheticVariant(stock: number) {
    const suffix = randomSuffix();
    return VariantModel.create({
        productId: new mongoose.Types.ObjectId(),
        stockcode: `${TEST_PREFIX}${suffix}`,
        maincode: `${TEST_PREFIX}MAIN-${suffix}`,
        choices: [],
        prices: { isPlatformBasedPrice: false, salePrice: 0, marketPrice: 0 },
        stock,
        reserved: 0,
        allocations: [],
        stockVersion: 0,
        stockDirty: false,
    });
}

async function deleteSyntheticVariant(id: any) {
    try {
        await VariantModel.deleteOne({ _id: id });
    } catch {
        // temizlik en iyi çaba: test sonucu bundan etkilenmesin
    }
}

beforeAll(async () => {
    if (!process.env.DB_URL) {
        throw new Error('[StockAllocator.concurrency] DB_URL tanımlı değil (backend/.env gerekli — gerçek local Mongo testi).');
    }
    ClientDBClass = require('@database/client/ClientDB').default;
    ({ StockAllocator } = require('@operations/stock/StockAllocator'));

    // Üretimdeki AYNI bağlantı yolu (buildTenantDbConfig + Database): ApplicationDB'ye/Clients koleksiyonuna
    // hiç dokunulmaz, doğrudan tenant DB'sine bağlanılır.
    clientDB = await ClientDBClass.getInstance({
        _id: 'stock-allocator-integration-test',
        dbConfig: { dbname: TENANT_DB_NAME, poolsize: 5 },
    } as any);
    VariantModel = clientDB.getVariantModel();
    allocator = new StockAllocator(clientDB);
});

afterAll(async () => {
    // Güvenlik süpürmesi: bir senaryo `finally` çalışmadan çökerse bile sentetik belge kalıntısı bırakmaz.
    if (VariantModel) {
        await VariantModel.deleteMany({ stockcode: { $regex: `^${TEST_PREFIX}` } });
    }
    // Tenant tutamaklarını bırak.
    ClientDBClass?.resetForTests(); // [faz4-arch-p0db] LRU kalkti: tutamak onbellegi temizlenir (kok baglantiyi DatabaseManager.close kapatir)
});

describe('StockAllocator — gerçek local Mongo eşzamanlılık kanıtı (ADR-0004 Test Stratejisi, entegrasyonikClient_1)', () => {
    it('(a) stock=10, 50 paralel farklı-anahtarlı reserve(qty=1) -> tam 10 RESERVED + 40 OVERSOLD, reserved=10, available hiçbir anda <0', async () => {
        const variant = await createSyntheticVariant(10);
        try {
            const keys = Array.from({ length: 50 }, (_, i) => `zt-test:ORD-${i}:LINE-1`);

            let sampling = true;
            const samples: number[] = [];
            const samplerPromise = (async () => {
                while (sampling) {
                    const snap = await VariantModel.findById(variant._id).lean();
                    if (snap) samples.push(StockAllocator.available(snap));
                    await new Promise((r) => setTimeout(r, 1));
                }
            })();

            const results = await Promise.all(keys.map((k) => allocator.reserve(variant._id, k, 1)));

            sampling = false;
            await samplerPromise;

            const reservedCount = results.filter((r) => r.state === 'RESERVED').length;
            const oversoldCount = results.filter((r) => r.state === 'OVERSOLD').length;
            expect(reservedCount).toBe(10);
            expect(oversoldCount).toBe(40);
            expect(reservedCount + oversoldCount).toBe(50);

            const final = await VariantModel.findById(variant._id).lean();
            expect(final.reserved).toBe(10);
            expect(final.stock).toBe(10); // reserve stock'u DEĞİŞTİRMEZ (yalnızca commit değiştirir)
            expect(StockAllocator.available(final)).toBe(0);
            expect(final.allocations.filter((a: any) => a.state === 'RESERVED').length).toBe(10);
            expect(final.allocations.filter((a: any) => a.state === 'OVERSOLD').length).toBe(40);

            // Ara örnekleme: floodlama sırasında hiçbir anda available negatif OLMADI.
            expect(samples.length).toBeGreaterThan(0);
            expect(samples.every((s) => s >= 0)).toBe(true);
        } finally {
            await deleteSyntheticVariant(variant._id);
        }
    });

    it('(b) idempotency: aynı anahtarla 20 paralel reserve(qty=1) -> tek RESERVED (reserved=1), yalnızca 1 kez sayılmış', async () => {
        const variant = await createSyntheticVariant(10);
        try {
            const key = 'zt-test:ORD-SAME:LINE-1';

            const results = await Promise.all(
                Array.from({ length: 20 }, () => allocator.reserve(variant._id, key, 1)),
            );

            expect(results.every((r) => r.state === 'RESERVED')).toBe(true);
            const winners = results.filter((r) => !r.idempotent);
            expect(winners.length).toBe(1); // yalnızca 1 çağrı gerçekten yazdı, diğer 19'u idempotent no-op

            const final = await VariantModel.findById(variant._id).lean();
            expect(final.reserved).toBe(1);
            expect(final.allocations.filter((a: any) => a.key === key).length).toBe(1);
        } finally {
            await deleteSyntheticVariant(variant._id);
        }
    });

    it('(c1) sırasızlık: iptal (release) -> bayat "oluşturuldu" (reserve) no-op; stok hiç değişmez', async () => {
        const variant = await createSyntheticVariant(10);
        try {
            const key = 'zt-test:ORD-SEQ1:LINE-1';

            const rel = await allocator.release(variant._id, key); // hiç görülmemiş satır -> mezar taşı RELEASED
            expect(rel.state).toBe('RELEASED');
            expect(rel.idempotent).toBe(false);

            const staleCreate = await allocator.reserve(variant._id, key, 1); // bayat "oluşturuldu" sonra gelir
            expect(staleCreate.idempotent).toBe(true);
            expect(staleCreate.state).toBe('RELEASED'); // terminal -- RESERVED'a geri DÖNMEDİ

            const final = await VariantModel.findById(variant._id).lean();
            expect(final.reserved).toBe(0);
            expect(final.stock).toBe(10); // tam bir kez (hiç) değişti
        } finally {
            await deleteSyntheticVariant(variant._id);
        }
    });

    it('(c2) sırasızlık: oluşturuldu -> sevk (commit) -> bayat "oluşturuldu"; stok tam bir kez değişir', async () => {
        const variant = await createSyntheticVariant(10);
        try {
            const key = 'zt-test:ORD-SEQ2:LINE-1';

            const r1 = await allocator.reserve(variant._id, key, 2);
            expect(r1.state).toBe('RESERVED');

            const c1 = await allocator.commit(variant._id, key, 2);
            expect(c1.state).toBe('COMMITTED');
            expect(c1.idempotent).toBe(false);

            const staleCreate = await allocator.reserve(variant._id, key, 2); // bayat "oluşturuldu" sonra gelir
            expect(staleCreate.idempotent).toBe(true);
            expect(staleCreate.state).toBe('COMMITTED'); // terminal -- geri dönüş YOK

            const final = await VariantModel.findById(variant._id).lean();
            expect(final.stock).toBe(8); // 10 - 2, TAM BİR KEZ düştü
            expect(final.reserved).toBe(0);
        } finally {
            await deleteSyntheticVariant(variant._id);
        }
    });

    it('(c3) ilk kez sevk edilmiş görülen sipariş (hiç rezerve görülmeden commit) + bayat tekrar commit -> stok tam bir kez düşer', async () => {
        const variant = await createSyntheticVariant(10);
        try {
            const key = 'zt-test:ORD-SEQ3:LINE-1';

            const c1 = await allocator.commit(variant._id, key, 3);
            expect(c1.state).toBe('COMMITTED');
            expect(c1.idempotent).toBe(false);

            const afterFirst = await VariantModel.findById(variant._id).lean();
            expect(afterFirst.stock).toBe(7); // 10 - 3
            expect(afterFirst.reserved).toBe(0); // reserved'a hiç dokunulmadı (hiç rezerve edilmemişti)

            const c2 = await allocator.commit(variant._id, key, 3); // bayat retry (ör. webhook tekrar)
            expect(c2.idempotent).toBe(true);
            expect(c2.state).toBe('COMMITTED');

            const final = await VariantModel.findById(variant._id).lean();
            expect(final.stock).toBe(7); // DEĞİŞMEDİ -- tam bir kez düştü
        } finally {
            await deleteSyntheticVariant(variant._id);
        }
    });

    it('(d) terminal state\'ten geri dönüş denemesi etkisiz kalır (COMMITTED sonrası release/restock no-op)', async () => {
        const variant = await createSyntheticVariant(10);
        try {
            const key = 'zt-test:ORD-TERM:LINE-1';

            await allocator.reserve(variant._id, key, 1);
            const committed = await allocator.commit(variant._id, key, 1);
            expect(committed.state).toBe('COMMITTED');

            const releaseAttempt = await allocator.release(variant._id, key);
            expect(releaseAttempt.idempotent).toBe(true);
            expect(releaseAttempt.state).toBe('COMMITTED'); // RELEASED'a GEÇMEDİ

            const restockAttempt = await allocator.restock(variant._id, key, 1, { allowed: true });
            expect(restockAttempt.idempotent).toBe(true);
            expect(restockAttempt.state).toBe('COMMITTED'); // RESTOCKED'a GEÇMEDİ

            const final = await VariantModel.findById(variant._id).lean();
            expect(final.stock).toBe(9); // yalnızca İLK commit'ten (10-1) etkilendi
            expect(final.reserved).toBe(0);
            expect(final.allocations.filter((a: any) => a.key === key).length).toBe(1); // tek allocation kaydı, çoğalmadı
        } finally {
            await deleteSyntheticVariant(variant._id);
        }
    });
});
