// RET-02: AuditLogs IP maskeleme isi — saf maskeleme + bellek-ici sahte model ile tur davranisi (sayfalama, idempotens, kismi hata).
// DB/Redis/ag YOK.
import { describe, it, expect } from '@jest/globals';
import {
    maskIp, runAuditIpMask, pendingFilter, AUDIT_IP_MASK_AFTER_DAYS, MASKED_UNKNOWN,
} from '../../../src/operations/retention/auditIpMask';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mig = require('../../../migrations/0024-audit-ip-mask-pending-app');

const DAY = 86_400_000;
const NOW = new Date('2026-10-01T00:00:00Z');

describe('maskIp', () => {
    it('IPv4 -> /24, IPv4-eslenik IPv6 -> IPv4 /24', () => {
        expect(maskIp('203.0.113.77')).toBe('203.0.113.0/24');
        expect(maskIp(' 10.1.2.3 ')).toBe('10.1.2.0/24');
        expect(maskIp('::ffff:198.51.100.9')).toBe('198.51.100.0/24');
    });
    it('IPv6 -> /48 (sifirlar sikistirilmis, kucuk harf, bolge kimligi atilir)', () => {
        expect(maskIp('2001:DB8:abcd:12::1')).toBe('2001:db8:abcd::/48');
        expect(maskIp('2001:0db8:0000:0042:0000:8a2e:0370:7334')).toBe('2001:db8:0::/48');
        expect(maskIp('fe80::1%eth0')).toBe('fe80:0:0::/48');
        expect(maskIp('::1')).toBe('0:0:0::/48');
    });
    it('gecersiz/bos/tip disi -> unknown (ham deger asla geri donmez)', () => {
        for (const v of ['', 'abc', '999.1.1.1', '1.2.3', undefined, null, 42, '1:2:3:4:5:6:7:8:9']) expect(maskIp(v)).toBe(MASKED_UNKNOWN);
    });
});

/** `find(filter).sort().limit().maxTimeMS().lean()` + `bulkWrite` destekli kucuk sahte model (yalniz bu isin kullandigi operatorler). */
function fakeModel(docs: any[], opts: { failIds?: Set<string> } = {}) {
    const calls = { finds: 0, writes: 0 };
    const cmp = (a: any, b: any) => (a.at.getTime() - b.at.getTime()) || String(a._id).localeCompare(String(b._id));
    const matches = (d: any, f: any): boolean => {
        if (f.$and) return f.$and.every((x: any) => matches(d, x));
        if (f.$or) return f.$or.some((x: any) => matches(d, x));
        for (const [k, v] of Object.entries<any>(f)) {
            const dv = d[k];
            if (v && typeof v === 'object' && !(v instanceof Date)) {
                if ('$exists' in v && (dv !== undefined) !== v.$exists) return false;
                if ('$lt' in v && !(dv < v.$lt)) return false;
                if ('$gt' in v && !(dv > v.$gt)) return false;
            } else if (v instanceof Date ? dv?.getTime() !== v.getTime() : dv !== v) return false;
        }
        return true;
    };
    const model = {
        calls,
        find(filter: any) {
            calls.finds++;
            let lim = Infinity;
            const c: any = { sort: () => c, limit: (n: number) => { lim = n; return c; }, maxTimeMS: () => c,
                lean: async () => docs.filter((d) => matches(d, filter)).sort(cmp).slice(0, lim).map((d) => ({ _id: d._id, at: d.at, ip: d.ip })) };
            return c;
        },
        async bulkWrite(ops: any[]) {
            calls.writes++;
            let modified = 0;
            for (const op of ops) {
                const { filter, update } = op.updateOne;
                const d = docs.find((x) => x._id === filter._id);
                if (!d || d.ip !== filter.ip || opts.failIds?.has(d._id)) continue;
                Object.assign(d, update.$set); delete d.ip; modified++;
            }
            if (opts.failIds?.size) throw Object.assign(new Error('partial'), { result: { modifiedCount: modified } });
            return { modifiedCount: modified };
        },
    };
    return model;
}

const doc = (i: number, ageDays: number, ip?: string) => ({ _id: `id${String(i).padStart(4, '0')}`, at: new Date(NOW.getTime() - ageDays * DAY), ...(ip === undefined ? {} : { ip }) });

describe('runAuditIpMask', () => {
    it('yalniz 90 gunden eski + ip alani olan kayitlar maskelenir; genc kayit ve ip\'siz kayit dokunulmaz', async () => {
        const docs = [doc(1, 91, '203.0.113.5'), doc(2, 89, '203.0.113.6'), doc(3, 200), doc(4, 364, '2001:db8:1:2::9')];
        const m = fakeModel(docs);
        const r = await runAuditIpMask({ model: m, now: () => NOW });
        expect(r).toMatchObject({ processed: 2, failed: 0, more: false });
        expect(r.cutoff.getTime()).toBe(NOW.getTime() - AUDIT_IP_MASK_AFTER_DAYS * DAY);
        expect(docs[0]).toMatchObject({ ipMasked: '203.0.113.0/24' }); expect(docs[0].ip).toBeUndefined();
        expect(docs[1]).toMatchObject({ ip: '203.0.113.6' }); expect((docs[1] as any).ipMasked).toBeUndefined();
        expect((docs[2] as any).ipMasked).toBeUndefined();
        expect(docs[3]).toMatchObject({ ipMasked: '2001:db8:1::/48' });
        expect(docs[0].at.getTime()).toBe(NOW.getTime() - 91 * DAY); // `at` (365 g TTL anahtari) degismez
    });

    it('idempotent: ikinci tur hicbir sey yazmaz', async () => {
        const docs = [doc(1, 120, '198.51.100.1'), doc(2, 150, '198.51.100.2')];
        const m = fakeModel(docs);
        await runAuditIpMask({ model: m, now: () => NOW });
        const snapshot = JSON.stringify(docs);
        const r2 = await runAuditIpMask({ model: m, now: () => NOW });
        expect(r2).toMatchObject({ processed: 0, batches: 0 });
        expect(JSON.stringify(docs)).toBe(snapshot);
    });

    it('keyset sayfalama: ayni `at` degerinde _id ile ilerler; tur ust siniri `more:true` doner, kalan sonraki turda biter', async () => {
        const docs = Array.from({ length: 7 }, (_, i) => ({ ...doc(i, 100, `192.0.2.${i}`), at: new Date(NOW.getTime() - 100 * DAY) }));
        const m = fakeModel(docs);
        const r1 = await runAuditIpMask({ model: m, now: () => NOW, batchSize: 2, maxBatches: 2 });
        expect(r1).toMatchObject({ processed: 4, batches: 2, more: true });
        const r2 = await runAuditIpMask({ model: m, now: () => NOW, batchSize: 2, maxBatches: 10 });
        expect(r2).toMatchObject({ processed: 3, more: false });
        expect(docs.every((d: any) => d.ip === undefined && d.ipMasked === '192.0.2.0/24')).toBe(true);
    });

    it('kismi yazma hatasi: basarisizlar `failed` sayilir, ip korunur ve tur devam eder (sonraki tur yeniden dener)', async () => {
        const docs = [doc(1, 100, '192.0.2.1'), doc(2, 101, '192.0.2.2'), doc(3, 102, '192.0.2.3')];
        const m = fakeModel(docs, { failIds: new Set(['id0002']) });
        const r = await runAuditIpMask({ model: m, now: () => NOW, batchSize: 2 });
        expect(r).toMatchObject({ processed: 2, failed: 1 });
        expect(docs.find((d) => d._id === 'id0002')!.ip).toBe('192.0.2.2');
    });

    it('iptal sinyali: yeni sayfa okunmaz; heartbeat sayfa basina cagrilir', async () => {
        const ac = new AbortController(); ac.abort();
        const m = fakeModel([doc(1, 100, '192.0.2.1')]);
        expect(await runAuditIpMask({ model: m, now: () => NOW }, { signal: ac.signal })).toMatchObject({ processed: 0, more: true });
        expect(m.calls.finds).toBe(0);
        const beats: unknown[] = [];
        await runAuditIpMask({ model: fakeModel([doc(1, 100, '192.0.2.1'), doc(2, 100, '192.0.2.2')]), now: () => NOW, batchSize: 1 }, { heartbeat: async (p) => { beats.push(p); } });
        expect(beats.length).toBe(2);
    });

    it('sorgu filtresi goc 0024 kismi indeksinin kosulunu (ip $exists) tasir', () => {
        const idx = mig.TARGETS[0].indexes[0];
        expect(idx.fields).toEqual({ at: 1, _id: 1 });
        expect(pendingFilter(NOW)).toMatchObject(idx.options.partialFilterExpression);
        expect(mig.id).toBe('0024-audit-ip-mask-pending-app');
    });
});
