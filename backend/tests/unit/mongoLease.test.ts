/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 4): genel Mongo lease yardımcısı.
 * Kaynak: backend/src/utils/mongoLease.ts
 * Gerçek Mongo YOK: `FakeLeaseCollection` gerçek MongoDB'nin `findOneAndUpdate`/`$or`/`$lt` semantiğini
 * belleklenmiş bir dizi üzerinde taklit eder (BSON tip sıralamasında `null < Date` kuralı dahil), böylece
 * iki "pod"un (iki farklı `owner` string'i) AYNI kaydı eşzamanlı talep etmesi gerçekçi biçimde test edilir.
 *
 * [DÜZELTME 2026-09-28] Bu sahte koleksiyon eskiden "BSON'da null < Date olduğundan `$lt: now` null/yok değeri eşler"
 * diye YANLIŞ modelliyordu ve hatalı `acquireLease` filtresi (yalnızca `$lt`) mock'ta yeşil görünüyordu. GERÇEK MongoDB
 * karşılaştırma operatörlerini TİP-KISITLI (type bracketing) işler: `{$lt: Date}` null/OLMAYAN alanı EŞLEŞMEZ;
 * `{leaseUntil: null}` ise hem null hem alan-yok belgeyi eşler. Sahte artık bunu birebir taklit eder (gerçek Mongo
 * kanıtı: tests/integration/mongoLease.realmongo.test.ts).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { acquireLease, releaseLease } from '@utils/mongoLease';

/** Gerçek Mongo'nun findOneAndUpdate + $or + $lt(null-aware) davranışını taklit eden minik sahte koleksiyon. */
class FakeLeaseCollection {
    docs: any[];
    constructor(docs: any[]) { this.docs = docs.map((d) => ({ ...d })); }

    private matchesOr(doc: any, or: any[]): boolean {
        return or.some((cond) => {
            if ('leaseUntil' in cond && cond.leaseUntil === null) {
                return doc.leaseUntil === null || doc.leaseUntil === undefined; // `{field: null}` null VE alan-yok eşler
            }
            if (cond.leaseUntil && typeof cond.leaseUntil === 'object' && '$lt' in cond.leaseUntil) {
                const bound = cond.leaseUntil.$lt as Date;
                const val = doc.leaseUntil;
                if (!(val instanceof Date)) return false; // type bracketing: $lt(Date) null/yok/başka tip ile EŞLEŞMEZ
                return val.getTime() < bound.getTime();
            }
            if ('leaseOwner' in cond) return doc.leaseOwner === cond.leaseOwner;
            return false;
        });
    }

    async findOneAndUpdate(filter: any, update: any, _options: any): Promise<any | null> {
        const { $or, ...rest } = filter;
        const doc = this.docs.find((d) => {
            for (const [k, v] of Object.entries(rest)) if (d[k] !== v) return false;
            return $or ? this.matchesOr(d, $or) : true;
        });
        if (!doc) return null;
        Object.assign(doc, update.$set);
        return { ...doc };
    }

    async updateOne(filter: any, update: any): Promise<any> {
        const doc = this.docs.find((d) => Object.entries(filter).every(([k, v]) => d[k] === v));
        if (doc) Object.assign(doc, update.$set);
        return { acknowledged: true, matchedCount: doc ? 1 : 0 };
    }
}

const FLAG_ID = 'flag-1';
const NOW = new Date('2026-09-27T10:00:00Z');

describe('acquireLease - tek pod (mevcut/normal senaryo)', () => {
  it('hiç lease alınmamış kayıt (leaseUntil yok) ilk talep edende talep edilir', async () => {
    const col = new FakeLeaseCollection([{ _id: FLAG_ID }]);
    const result = await acquireLease(col, { _id: FLAG_ID }, 'pod-a', { ttlMs: 5 * 60000, now: NOW });
    expect(result).toMatchObject({ _id: FLAG_ID, leaseOwner: 'pod-a' });
    expect(result.leaseUntil.getTime()).toBe(NOW.getTime() + 5 * 60000);
  });

  it('[DÜZELTME 2026-09-28] leaseUntil: null (mongoose default / releaseLease sonrası) kayıt da talep edilir', async () => {
    const col = new FakeLeaseCollection([{ _id: FLAG_ID, leaseOwner: null, leaseUntil: null }]);
    const result = await acquireLease(col, { _id: FLAG_ID }, 'pod-a', { ttlMs: 5 * 60000, now: NOW });
    expect(result).toMatchObject({ _id: FLAG_ID, leaseOwner: 'pod-a' });
  });

  it('aktif (gelecek tarihli) lease başka sahip tarafından ALINAMAZ', async () => {
    const col = new FakeLeaseCollection([{ _id: FLAG_ID, leaseOwner: 'pod-a', leaseUntil: new Date(NOW.getTime() + 1000) }]);
    expect(await acquireLease(col, { _id: FLAG_ID }, 'pod-b', { ttlMs: 60000, now: NOW })).toBeNull();
  });

  it('süresi dolmuş lease yeniden talep edilebilir (farklı sahip dahi)', async () => {
    const col = new FakeLeaseCollection([{ _id: FLAG_ID, leaseOwner: 'pod-old', leaseUntil: new Date(NOW.getTime() - 1000) }]);
    const result = await acquireLease(col, { _id: FLAG_ID }, 'pod-new', { ttlMs: 60000, now: NOW });
    expect(result.leaseOwner).toBe('pod-new');
  });

  it('aynı sahip yeniden çağırırsa (heartbeat/yeniden giriş) lease süresi uzatılır', async () => {
    const col = new FakeLeaseCollection([{ _id: FLAG_ID, leaseOwner: 'pod-a', leaseUntil: new Date(NOW.getTime() + 1000) }]);
    const result = await acquireLease(col, { _id: FLAG_ID }, 'pod-a', { ttlMs: 5 * 60000, now: NOW });
    expect(result.leaseOwner).toBe('pod-a');
    expect(result.leaseUntil.getTime()).toBe(NOW.getTime() + 5 * 60000);
  });

  it('kayıt yoksa null döner', async () => {
    const col = new FakeLeaseCollection([]);
    const result = await acquireLease(col, { _id: 'missing' }, 'pod-a', { ttlMs: 60000, now: NOW });
    expect(result).toBeNull();
  });
});

describe('acquireLease - iki pod eşzamanlı talep (ADR-0006: sadece biri alır)', () => {
  let col: FakeLeaseCollection;
  beforeEach(() => { col = new FakeLeaseCollection([{ _id: FLAG_ID }]); });

  it('aynı anda iki farklı podIdentity aynı kaydı talep ederse SADECE ilk çağrıyı yapan alır', async () => {
    // Gerçek Mongo'da findOneAndUpdate atomiktir; burada sıralı çağırarak (aynı belleklenmiş koleksiyon üzerinde)
    // "önce gelen kazanır" garantisi doğrulanır.
    const winner = await acquireLease(col, { _id: FLAG_ID }, 'pod-A', { ttlMs: 5 * 60000, now: NOW });
    const loser = await acquireLease(col, { _id: FLAG_ID }, 'pod-B', { ttlMs: 5 * 60000, now: NOW });

    expect(winner).not.toBeNull();
    expect(winner.leaseOwner).toBe('pod-A');
    expect(loser).toBeNull(); // pod-B bu turda ATLAR, hata fırlatmaz
  });

  it('lease sahibi işini bırakınca (releaseLease) başka bir pod hemen devralabilir', async () => {
    await acquireLease(col, { _id: FLAG_ID }, 'pod-A', { ttlMs: 5 * 60000, now: NOW });
    await releaseLease(col, { _id: FLAG_ID }, 'pod-A');

    const next = await acquireLease(col, { _id: FLAG_ID }, 'pod-B', { ttlMs: 5 * 60000, now: NOW });
    expect(next.leaseOwner).toBe('pod-B');
  });

  it('releaseLease başka bir sahibin (artık kendisine ait olmayan) lease\'ine DOKUNMAZ', async () => {
    await acquireLease(col, { _id: FLAG_ID }, 'pod-A', { ttlMs: 1, now: NOW }); // hemen sonra süresi dolar
    const takeover = await acquireLease(col, { _id: FLAG_ID }, 'pod-B', { ttlMs: 5 * 60000, now: new Date(NOW.getTime() + 10) });
    expect(takeover.leaseOwner).toBe('pod-B');

    await releaseLease(col, { _id: FLAG_ID }, 'pod-A'); // artık sahibi pod-B; pod-A'nın release'i etkisiz olmalı
    expect(col.docs[0].leaseOwner).toBe('pod-B');
  });
});
