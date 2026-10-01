/**
 * X2 — stok tek kapısı: GERÇEK Mongo semantiği (mongodb-memory-server; izole/geçici, bkz. integrationProjectionShape testi).
 * (1) Kullanıcı stok düzenlemesi ($set stock, ProductService.updateProduct yazımı) ile eşzamanlı sipariş rezervasyonları
 *     birbirinin alanını EZMEZ: reserved doğru, stock kullanıcı değeri, stockDirty=true.
 * (2) StockPublishTrigger'ın koşullu dirty temizleme filtresi: tarama sonrası araya giren düzenleme/rezervasyon bayrağı
 *     KAYBETMEZ; değişmeyen varyant temizlenir.
 */
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../.mongodb-binaries');

import { describe, it, expect, beforeAll, afterAll, jest as jestGlobal } from '@jest/globals';
import mongoose from 'mongoose';
import { VariantSchema } from '@database/client/models/Variant';
import { StockAllocator } from '@operations/stock/StockAllocator';
import { stockDirtyFields } from '@operations/stock/markStockDirty';

jestGlobal.setTimeout(120000);

let mongod: import('mongodb-memory-server').MongoMemoryServer;
let conn: mongoose.Connection;
let Variant: mongoose.Model<any>;

beforeAll(async () => {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  conn = await mongoose.createConnection(mongod.getUri('x2')).asPromise();
  Variant = conn.model('Variants', VariantSchema.clone(), 'Variants');
});
afterAll(async () => { await conn?.close(); await mongod?.stop(); });

const mk = (stock: number, over: any = {}) => Variant.create({
  tempId: String(new mongoose.Types.ObjectId()), productId: new mongoose.Types.ObjectId(), stockcode: `S-${new mongoose.Types.ObjectId()}`, maincode: 'M', choices: [],
  prices: { isPlatformBasedPrice: false, salePrice: 1, marketPrice: 1 }, stock, reserved: 0, allocations: [], stockVersion: 0, stockDirty: false, ...over,
});

describe('X2 stok tek kapısı (gerçek Mongo)', () => {
  it('eşzamanlı kullanıcı düzenlemesi + 20 rezervasyon: kayıp güncelleme yok, oversell yok, stockDirty=true', async () => {
    const v = await mk(10);
    const allocator = new StockAllocator({ getVariantModel: () => Variant } as any);
    const reserves = Array.from({ length: 20 }, (_, i) => allocator.reserve(v._id, `t:O${i}:L1`, 1));
    // kullanıcı, rezervasyonlar sürerken stoğu 15'e çeker (ProductService.updateProduct'ın $set biçimi)
    const edit = Variant.updateOne({ _id: v._id }, { $set: { stock: 15, ...stockDirtyFields() } });
    await Promise.all([...reserves, edit]);

    const after: any = await Variant.findById(v._id).lean();
    const reserved = (after.allocations as any[]).filter(a => a.state === 'RESERVED').length;
    expect(after.stock).toBe(15);                 // kullanıcı düzenlemesi kaybolmadı
    expect(after.reserved).toBe(reserved);        // sayaç = aktif rezervasyonlar (rezervasyon güncellemesi kaybolmadı)
    expect(after.reserved).toBeLessThanOrEqual(after.stock);
    expect(after.stockDirty).toBe(true);
    expect(after.stockDirtyAt).toBeInstanceOf(Date);
  });

  it('koşullu temizleme: tarama sonrası araya giren düzenleme bayrağı kaybetmez; dokunulmayan varyant temizlenir', async () => {
    const t0 = new Date('2026-09-30T10:00:00Z');
    const raced = await mk(5, { stockDirty: true, stockDirtyAt: t0 });
    const calm = await mk(5, { stockDirty: true, stockDirtyAt: t0 });
    const legacy = await mk(5, { stockDirty: true }); // stockDirtyAt/stockVersion alanı olmayan eski belge
    await Variant.updateOne({ _id: legacy._id }, { $unset: { stockDirtyAt: 1, stockVersion: 1 } });
    const scanned: any[] = await Variant.find({ _id: { $in: [raced._id, calm._id, legacy._id] } }).lean();

    // tarama ile temizleme arasında kullanıcı düzenlemesi
    await Variant.updateOne({ _id: raced._id }, { $set: { stock: 0, ...stockDirtyFields(new Date('2026-09-30T10:00:05Z')) } });

    // StockPublishTrigger'daki temizleme filtresinin AYNISI
    await Variant.bulkWrite(scanned.map((c: any) => ({
      updateOne: { filter: { _id: c._id, stockDirtyAt: c.stockDirtyAt ?? null, stockVersion: c.stockVersion ?? null }, update: { $set: { stockDirty: false } } },
    })));

    expect((await Variant.findById(raced._id).lean() as any).stockDirty).toBe(true);
    expect((await Variant.findById(calm._id).lean() as any).stockDirty).toBe(false);
    expect((await Variant.findById(legacy._id).lean() as any).stockDirty).toBe(false);
  });
});
