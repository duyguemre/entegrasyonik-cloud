/**
 * CHARACTERIZATION: şema dosyalarındaki varsayılan-bağlantı `mongoose.model(...)` kancaları (ADR-0021 D6) — Protokol 13.
 * DB/ağ YOK: bağlantısız `mongoose.createConnection()` + sahte koleksiyon; hiçbir sunucuya bağlanılmaz.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { CategorySchema } from '@database/client/models/Category';
import { ProductSchema } from '@database/client/models/Product';
import { ImageSchema } from '@database/client/models/Image';

/** Tenant bağlantısı gibi: modeller varsayılan bağlantıya DEĞİL, ayrı bir bağlantıya kayıtlıdır (ClientMongooseSchemas.ts). */
function tenantModel(name: string, schema: mongoose.Schema) {
  const conn = mongoose.createConnection(); // bağlanmaz
  const model: any = conn.model(name, schema.clone());
  const calls: any[] = [];
  // Sahte sürücü koleksiyonu: gerçek DB yok; çağrılar kaydedilir.
  for (const m of ['deleteOne', 'deleteMany', 'updateMany', 'find']) {
    model.collection[m] = jest.fn(async (...args: any[]) => { calls.push([m, ...args]); return { deletedCount: 1, acknowledged: true, matchedCount: 0, modifiedCount: 0 }; });
  }
  return { model, calls };
}

afterEach(() => { jest.restoreAllMocks(); });

describe('D6: cascade kancaları (kaldırıldı)', () => {
  it('[ADR-0021 2026-09-28] Category/Product/Image şemalarında silme kancası YOK (eskiden varsayılan bağlantıya bağlı, tenant modellerinde hiç çalışmayan ölü kod)', () => {
    const hooks = (s: any, kind: string) => (s.s.hooks._pres.get(kind) || []).length;
    expect(hooks(CategorySchema, 'deleteOne')).toBe(0);
    expect(hooks(ProductSchema, 'deleteOne')).toBe(0);
    expect(hooks(ImageSchema, 'deleteMany')).toBe(0);
  });

  it('servislerin kullandığı sorgu-düzeyi Model.deleteOne(filtre) kancadan bağımsız çalışır ve YALNIZ ilgili koleksiyona yazar (cascade yok — davranış kaldırmadan önce de aynıydı)', async () => {
    const defaultModelSpy = jest.spyOn(mongoose, 'model');
    for (const [name, schema] of [['category', CategorySchema], ['product', ProductSchema]] as const) {
      const { model, calls } = tenantModel(name, schema);
      const id = new mongoose.Types.ObjectId();
      const res: any = await model.deleteOne({ _id: id });
      expect(res.deletedCount).toBe(1);
      expect(calls.map((c) => c[0])).toEqual(['deleteOne']); // başka koleksiyona/çağrıya dokunulmadı
    }
    // varsayılan bağlantıya model araması hiç yapılmadı (kanca çalışsaydı mongoose.model('category'/'image') çağrılırdı)
    expect(defaultModelSpy).not.toHaveBeenCalled();
  });

  it('belge-düzeyi doc.deleteOne() artık varsayılan bağlantıda model aramaz (eskiden MissingSchemaError: Schema hasn\'t been registered for model "category")', async () => {
    const { model, calls } = tenantModel('category', CategorySchema);
    const doc: any = new model({ title: 't', icon: 'i', order: 1 });
    doc.isNew = false;
    await expect(doc.deleteOne()).resolves.toBeDefined();
    expect(calls.map((c) => c[0])).toEqual(['deleteOne']);
  });
});

describe('D6: şema dosyalarında varsayılan-bağlantı model kaydı yasak (DATA_MODEL_CONVENTIONS §7, statik mandal)', () => {
  const modelsRoot = path.resolve(__dirname, '../../../src/database');
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  it('database/**/models/*.ts içinde `mongoose.model(` çağrısı yok', () => {
    const offenders = walk(modelsRoot)
      .filter((f) => f.includes(`${path.sep}models${path.sep}`))
      .filter((f) => /\bmongoose\.model\s*\(/.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map((f) => path.relative(modelsRoot, f).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });
});
