/**
 * ============================================================================================
 * ADR-0021 Karar 5 madde 1 — GERÇEK Mongo semantik testleri için ORTAK yardımcı.
 *
 * KESİN KURALLAR (CLAUDE.md kural 2/5; ADR-0021 Karar 5.1 ile BİREBİR):
 *  - Yalnızca `127.0.0.1` + izinli DB `entegrasyonikClient_1` (CLAUDE.md kural 2'deki 7 DB'den biri).
 *  - TÜM koleksiyon adları `zzTest_<suite>_<rastgele>_` önekli OLMAK ZORUNDADIR; öneksiz koleksiyon adı
 *    veya uzak/izinsiz URL görülürse testi BAŞLATMADAN (fail-fast) hata fırlatılır.
 *  - `cleanup()` önekle eşleşen TÜM koleksiyonları düşürür (kalıntı 0 — StockAllocator.concurrency.test.ts /
 *    mongoLease.realmongo.test.ts / ADR-0004 Aşama A ile AYNI disiplin).
 *  - Model kaydı ADR'nin kendi önerdiği desenle: `connection.model(ad, şema.clone(), 'zzTest_…')`.
 *
 * REDDEDİLEN ALTERNATİF (ADR-0021 Karar 5.1): `mongodb-memory-server` — proje kökü dışına mongod ikilisi
 * indirir (CLAUDE.md kural 1) ve ayrı bir Mongo örneği çalıştırır (kural 5'in ruhu); insan onayıyla
 * yeniden açılabilir.
 *
 * [ÇELİŞKİ NOTU — görev talimatınca buraya kaydedildi, KOD DEĞİŞTİRİLMEDİ] ADR-0021 yazıldığından BERİ,
 * ADR-0020 Aşama B (`tests/mongo-semantics/*.mongoSemantics.test.ts`) `mongodb-memory-server`'ı proje-içi
 * git-ignored bir indirme diziniyle (`MONGOMS_DOWNLOAD_DIR = backend/.mongodb-binaries`) KULLANDI ve
 * `package.json`'a devDependency olarak EKLEDİ. Bu, kural-1 endişesini (dizin proje İÇİNDE) gidermiş
 * olabilir ama ADR-0021'in metni bu doğrultuda GÜNCELLENMEDİ — iki ADR arasında çözülmemiş bir çelişki var.
 * Bu görev BİLEREK ADR-0021'in kendi tercih ettiği yöntemi (gerçek local Mongo + `zzTest_` önek) uygular;
 * hangisinin genel norm olacağı orkestratör/insan kararına bırakılmıştır (bkz. görev raporu).
 * ============================================================================================
 */
import path from 'path';
import crypto from 'crypto';
import mongoose, { Connection, Schema } from 'mongoose';
// ADR-0003 B.6-B.7 (adım 5) ile AYNI DB adı çözümü: `{{DBNAME}}` yer tutucusu yoksa (yerel düz URL) yolu
// (path) tenant DB adıyla DEĞİŞTİRİR. Yeniden icat ETMEZ — üretim kodundaki TEK kaynağı tüketir.
import { withDbName } from '@database/tenantConnection';

/** İzinli 7 DB'den biri (CLAUDE.md kural 2) — bu yardımcı YALNIZ bu tenant DB'sine bağlanır. */
export const REAL_MONGO_TEST_DB_NAME = 'entegrasyonikClient_1';
const PREFIX_RE = /^zzTest_/;
const SEGMENT_RE = /^[a-zA-Z0-9]+$/;

export interface RealMongoTestDb {
    connection: Connection;
    dbName: string;
    /** Bu suite çalıştırmasına özel önek: `zzTest_<suite>_<rastgele>_`. */
    prefix: string;
    /** `<önek><segment>` biçiminde tam koleksiyon adı üretir; segment yalnız harf/rakam olmalı. */
    collectionName(segment: string): string;
    /** `şema.clone()` ile, `zzTest_` önekli koleksiyonda bir model kaydeder (ADR-0021 Karar 5.1 deseni). */
    model(segment: string, schema: Schema): mongoose.Model<any>;
    /** Bu suite'in oluşturduğu TÜM `zzTest_` koleksiyonlarını düşürür (bağlantıyı KAPATMAZ — bkz. `close()`). */
    cleanup(): Promise<{ dropped: string[] }>;
    /** Mongoose bağlantısını kapatır. `cleanup()` sonrası çağrılmalıdır. */
    close(): Promise<void>;
}

function assertLocalUrl(url: string) {
    if (!/^mongodb:\/\/([^@/]*@)?(127\.0\.0\.1)(:\d+)?(\/|\?|$)/.test(url)) {
        throw new Error('[realMongoTestDb] Yalnızca 127.0.0.1 bağlantısı kabul edilir (CLAUDE.md kural 5; localhost YASAK — IPv6\'ya çözülür).');
    }
}

/** Test edilebilirlik için export edilir: suite adından `zzTest_<suite>_<rastgele>_` öneki üretir. */
export function makeTestPrefix(suite: string): string {
    if (!suite || !SEGMENT_RE.test(suite)) {
        throw new Error('[realMongoTestDb] suite adı yalnız harf/rakam içermeli (örn. "MigrateExample").');
    }
    return `zzTest_${suite}_${crypto.randomBytes(4).toString('hex')}_`;
}

/**
 * Gerçek local `entegrasyonikClient_1` bağlantısı açar. `.env` yolu `DOTENV_CONFIG_PATH` ile override
 * edilebilir (worktree'lerde `backend/.env` bulunmaz — mevcut `tests/integration/*.realmongo.test.ts`
 * dosyalarıyla AYNI desen). DB_URL tanımlı değilse veya izinli DB dışına çözülürse fail-fast hata fırlatır.
 */
export async function openRealMongoTestDb(
    suite: string,
    opts: { envPath?: string } = {},
): Promise<RealMongoTestDb> {
    const envPath = opts.envPath || path.resolve(__dirname, '../../.env');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || envPath });

    const rawUrl = process.env.DB_URL;
    if (!rawUrl) {
        throw new Error('[realMongoTestDb] DB_URL tanımlı değil (backend/.env veya DOTENV_CONFIG_PATH gerekli — gerçek local Mongo testi).');
    }
    const url = withDbName(rawUrl, REAL_MONGO_TEST_DB_NAME)
        .replace('{{USER}}', encodeURIComponent(process.env.DB_USER || ''))
        .replace('{{PASSWORD}}', encodeURIComponent(process.env.DB_PASSWORD || ''))
        .replace('{{DBNAME}}', REAL_MONGO_TEST_DB_NAME);
    assertLocalUrl(url);

    const connection = await mongoose.createConnection(url, { serverSelectionTimeoutMS: 5000 }).asPromise();
    const actualDbName = connection.db?.databaseName;
    if (actualDbName !== REAL_MONGO_TEST_DB_NAME) {
        await connection.close().catch(() => undefined);
        throw new Error(`[realMongoTestDb] Beklenmeyen/izinsiz DB: '${actualDbName}' (yalnız '${REAL_MONGO_TEST_DB_NAME}' izinli — CLAUDE.md kural 2).`);
    }

    const prefix = makeTestPrefix(suite);

    function collectionName(segment: string): string {
        if (!segment || !SEGMENT_RE.test(segment)) {
            throw new Error(`[realMongoTestDb] koleksiyon segmenti yalnız harf/rakam olmalı: '${segment}'`);
        }
        return `${prefix}${segment}`;
    }

    return {
        connection,
        dbName: REAL_MONGO_TEST_DB_NAME,
        prefix,
        collectionName,
        model(segment: string, schema: Schema) {
            const collection = collectionName(segment);
            if (!PREFIX_RE.test(collection)) {
                // Teorik olarak imkansız (collectionName her zaman prefix ekler) — ekstra fail-fast koruma.
                throw new Error(`[realMongoTestDb] koleksiyon adı 'zzTest_' önekli olmalı: ${collection}`);
            }
            const clonedSchema = schema.clone();
            clonedSchema.set('collection', collection);
            const modelName = `RealMongoTestDb_${collection}`;
            return connection.model(modelName, clonedSchema, collection);
        },
        async cleanup() {
            const dropped: string[] = [];
            if (!connection.db) return { dropped };
            const found = await connection.db.listCollections({ name: { $regex: `^${prefix}` } }).toArray();
            for (const c of found) {
                try {
                    await connection.db.dropCollection(c.name);
                    dropped.push(c.name);
                } catch {
                    // en iyi çaba: temizlik test sonucunu etkilemesin
                }
            }
            return { dropped };
        },
        async close() {
            await connection.close().catch(() => undefined);
        },
    };
}
