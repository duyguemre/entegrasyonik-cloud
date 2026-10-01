/**
 * ============================================================================================
 * BU DOSYA GERÇEK LOCAL MONGODB'YE BAĞLANIR (mock DEĞİL). `tests/helpers/realMongoTestDb.ts`
 * yardımcısının (ADR-0021 Karar 5 madde 1) GERÇEKTEN `entegrasyonikClient_1`'e bağlandığını, yalnızca
 * `zzTest_` önekli koleksiyon oluşturduğunu, öneksiz/geçersiz ad istendiğinde fail-fast hata verdiğini VE
 * `cleanup()` sonrası koleksiyon sayısının ÖNCEKİYLE BİREBİR AYNI olduğunu (kalıntı 0) kanıtlar.
 *
 * Kurallar `tests/integration/mongoLease.realmongo.test.ts` ile AYNI (CLAUDE.md kural 2/5): yalnız izinli
 * `entegrasyonikClient_1`; yalnız bu dosyanın ürettiği sentetik koleksiyonlar; Mongo CLI kullanılmaz.
 * ============================================================================================
 */
import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import { openRealMongoTestDb, makeTestPrefix, RealMongoTestDb, REAL_MONGO_TEST_DB_NAME } from '../helpers/realMongoTestDb';

jestGlobal.setTimeout(30000);

let helper: RealMongoTestDb;
let beforeCollectionCount = -1;

beforeAll(async () => {
    helper = await openRealMongoTestDb('RealMongoHelperSelfcheck');
    expect(helper.dbName).toBe(REAL_MONGO_TEST_DB_NAME);
    const all = await helper.connection.db!.listCollections().toArray();
    beforeCollectionCount = all.length;
});

afterAll(async () => {
    if (!helper) return;
    const { dropped } = await helper.cleanup();
    console.log(`[realMongoTestDb.selfcheck] silinen koleksiyonlar: ${dropped.join(',') || '(yok)'}`);
    const after = await helper.connection.db!.listCollections().toArray();
    console.log(`[realMongoTestDb.selfcheck] koleksiyon sayisi once=${beforeCollectionCount} sonra=${after.length}`);
    expect(after.length).toBe(beforeCollectionCount); // kalıntı 0
    await helper.close();
});

describe('realMongoTestDb yardımcısı — gerçek entegrasyonikClient_1 kanıtı', () => {
    it('zzTest_ önekli koleksiyonda gerçek yazar/okur; önek doğru üretilir', async () => {
        const schema = new mongoose.Schema({ probe: { type: String, required: true } }, { strict: true });
        const Model = helper.model('Probe', schema);
        expect(Model.collection.name.startsWith(helper.prefix)).toBe(true);
        expect(Model.collection.name.startsWith('zzTest_')).toBe(true);

        const created = await Model.create({ probe: 'merhaba-dunya' });
        expect(created._id).toBeDefined();

        const found: any = await Model.findOne({ probe: 'merhaba-dunya' }).lean();
        expect(found?.probe).toBe('merhaba-dunya');

        const rawCount = await helper.connection.db!
            .collection(helper.collectionName('Probe'))
            .countDocuments();
        expect(rawCount).toBe(1);
    });

    it('aynı suite içinde ikinci bir koleksiyon da aynı önekle açılır (izole ama aynı suite)', async () => {
        const schema = new mongoose.Schema({ n: Number }, { strict: true });
        const Model = helper.model('Counter', schema);
        await Model.create({ n: 1 });
        expect(Model.collection.name).toBe(helper.collectionName('Counter'));
        expect(Model.collection.name).not.toBe(helper.collectionName('Probe'));
    });

    it('geçersiz segment adı fail-fast hata fırlatır (bağlantı/koleksiyon oluşturmadan)', () => {
        expect(() => helper.collectionName('bad name')).toThrow();
        expect(() => helper.collectionName('')).toThrow();
        expect(() => helper.collectionName('kotu-ad')).toThrow();
    });

    it('makeTestPrefix geçersiz suite adını fail-fast REDDEDER (bağlantı açmadan)', () => {
        expect(() => makeTestPrefix('')).toThrow();
        expect(() => makeTestPrefix('kotu ad')).toThrow();
    });
});

describe('realMongoTestDb — DB_URL eksikse fail-fast (bağlantı denemeden statik kontrol)', () => {
    it('DB_URL yoksa ve .env yolu da geçersizse hata fırlatır', async () => {
        // NOT: DOTENV_CONFIG_PATH bu süreçte tanımlıysa openRealMongoTestDb onu tercih eder (mevcut .env'i
        // yeniden yükler) — bu yüzden process.env.DB_URL'i SİLMEK yerine, geçici olarak DOTENV_CONFIG_PATH'i
        // de geçersiz bir yola çeviriyoruz ki dotenv gerçek .env'i sessizce YENİDEN doldurmasın.
        const savedUrl = process.env.DB_URL;
        const savedDotenvPath = process.env.DOTENV_CONFIG_PATH;
        delete process.env.DB_URL;
        process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env.does-not-exist';
        try {
            await expect(
                openRealMongoTestDb('WontConnect', { envPath: '/nonexistent/.env.does-not-exist' }),
            ).rejects.toThrow(/DB_URL/);
        } finally {
            if (savedUrl !== undefined) process.env.DB_URL = savedUrl;
            if (savedDotenvPath !== undefined) process.env.DOTENV_CONFIG_PATH = savedDotenvPath;
            else delete process.env.DOTENV_CONFIG_PATH;
        }
    });
});
