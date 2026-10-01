// BE-05 (kayıtlı görünümler) + BE-06 (sorun gruplarında müşteri süzgeci). Bellek-içi sahte model; DB/Redis YOK.
import { describe, it, expect } from '@jest/globals';
import { listViews, saveView, deleteView, MAX_VIEWS_PER_ADMIN } from '../../../../src/operations/backoffice/viewsAdmin';
import { BACKOFFICE_ATTENTION_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-attention';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { getRequiredTier } from '../../../../src/api/rpc/operationPolicy';
import { getIssueGroups, LogQueryError } from '../../../../src/platform/runtime/logs/logQuery';
import { tenantBucketOf } from '../../../../src/platform/runtime/metrics/errorEvents';
import { BackofficeViewSchema, BACKOFFICE_VIEW_INDEXES } from '../../../../src/database/application/models/BackofficeView';

/** Yalnız viewsAdmin'in kullandığı yüzeyi taklit eder. */
class FakeViews {
    docs: any[] = []; seq = 1;
    private match = (d: any, f: any) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
    private chain<T>(fn: () => T) { const c: any = { select: () => c, sort: () => c, limit: () => c, maxTimeMS: () => c, lean: () => c, then: (res: any, rej: any) => Promise.resolve().then(fn).then(res, rej) }; return c; }
    find(f: any) { return this.chain(() => this.docs.filter((d) => this.match(d, f)).sort((a, b) => b.updatedAt - a.updatedAt || b.seq - a.seq).slice(0, 20)); }
    findOne(f: any) { return this.chain(() => this.docs.find((d) => this.match(d, f)) ?? null); }
    countDocuments(f: any) { return this.chain(() => this.docs.filter((d) => this.match(d, f)).length); }
    findOneAndUpdate(f: any, u: any) {
        return this.chain(() => {
            let d = this.docs.find((x) => this.match(x, f));
            if (!d) { d = { _id: 'v' + this.seq, seq: this.seq++, ...f, createdAt: new Date(this.seq) }; this.docs.push(d); }
            Object.assign(d, u.$set, { updatedAt: new Date(this.seq++ * 1000) });
            return d;
        });
    }
    deleteOne(f: any) { return this.chain(() => { const i = this.docs.findIndex((d) => this.match(d, f)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }); }
}

describe('BE-05 viewsAdmin', () => {
    it('kaydet = (sub, screen, name) upsert: ikinci kayıt aynı kaydı günceller (idempotent), sayaç artmaz', async () => {
        const model = new FakeViews();
        const a = await saveView({ model }, 'adm1', { screen: 'tenants', name: 'Sorunlular', query: { hasIssues: '1' } });
        expect(a).toMatchObject({ created: true, count: 1 });
        const b = await saveView({ model }, 'adm1', { screen: 'tenants', name: 'Sorunlular', query: { hasIssues: '1', sortBy: 'openIssues' } });
        expect(b).toMatchObject({ created: false, count: 1, id: a.id });
        expect(model.docs).toHaveLength(1);
        expect(model.docs[0].query).toEqual({ hasIssues: '1', sortBy: 'openIssues' });
    });
    it('yönetici başına en çok 20: 21. YENİ kayıt 409 VIEW_LIMIT; mevcut ad güncellenebilir', async () => {
        const model = new FakeViews();
        for (let i = 0; i < MAX_VIEWS_PER_ADMIN; i++) await saveView({ model }, 'adm1', { screen: 'engine', name: 'v' + i, query: {} });
        await expect(saveView({ model }, 'adm1', { screen: 'engine', name: 'yeni', query: {} })).rejects.toMatchObject({ statusCode: 409, code: 'VIEW_LIMIT' });
        await expect(saveView({ model }, 'adm1', { screen: 'engine', name: 'v3', query: { a: 'b' } })).resolves.toMatchObject({ created: false });
        // başka yönetici etkilenmez
        await expect(saveView({ model }, 'adm2', { screen: 'engine', name: 'yeni', query: {} })).resolves.toMatchObject({ created: true, count: 1 });
    });
    it('liste yalnız çağıranın kayıtları (+ ekran süzgeci); silme yalnız kendi kaydı, başkasınınki/yok -> deleted:false (sızıntı yok)', async () => {
        const model = new FakeViews();
        const mine = await saveView({ model }, 'adm1', { screen: 'tenants', name: 'A', query: {} });
        await saveView({ model }, 'adm1', { screen: 'engine', name: 'B', query: {} });
        const theirs = await saveView({ model }, 'adm2', { screen: 'tenants', name: 'C', query: {} });
        expect((await listViews({ model }, 'adm1')).items.map((v: any) => v.name).sort()).toEqual(['A', 'B']);
        expect((await listViews({ model }, 'adm1', 'engine')).items.map((v: any) => v.name)).toEqual(['B']);
        expect(await deleteView({ model }, 'adm1', theirs.id)).toEqual({ id: theirs.id, deleted: false });
        expect(model.docs.some((d) => d._id === theirs.id)).toBe(true);
        expect(await deleteView({ model }, 'adm1', mine.id)).toEqual({ id: mine.id, deleted: true });
        await expect(listViews({ model }, undefined)).rejects.toMatchObject({ statusCode: 401 });
    });
    it('model: autoIndex kapalı, (sub,screen,name) tekil indeks; şemalar sıkı', () => {
        expect((BackofficeViewSchema as any).options.autoIndex).toBe(false);
        expect(BACKOFFICE_VIEW_INDEXES[0]).toMatchObject({ fields: { sub: 1, screen: 1, name: 1 }, options: { unique: true } });
        const S = BACKOFFICE_ATTENTION_RPC_INPUT as any;
        const ok = { screen: 'tenants', name: ' Sorunlu müşteriler ', query: { hasIssues: '1', status: ['past_due', 'trialing'] } };
        expect(S['BackofficePrefsService/saveView'].safeParse(ok).success).toBe(true);
        expect(S['BackofficePrefsService/saveView'].parse(ok).name).toBe('Sorunlu müşteriler');
        for (const bad of [
            { ...ok, screen: 'Bad Screen' }, { ...ok, name: '' }, { ...ok, name: 'x'.repeat(61) }, { ...ok, query: { '$where': 'x' } }, { ...ok, query: { 'a.b': 'x' } },
            { ...ok, query: { a: { $ne: 1 } } }, { ...ok, query: { a: 'x'.repeat(201) } }, { ...ok, query: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['k' + i, 'v'])) }, { ...ok, evil: 1 },
        ]) expect(S['BackofficePrefsService/saveView'].safeParse(bad).success).toBe(false);
        expect(S['BackofficePrefsService/deleteView'].safeParse({ id: 'zz' }).success).toBe(false);
    });
    it('yetenek: platformAdmin, yazanlar write ve step-up İSTEMEZ (kişisel tercih), okuma read', () => {
        for (const rpc of ['BackofficePrefsService/listViews', 'BackofficePrefsService/saveView', 'BackofficePrefsService/deleteView']) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(requiresStepUp(rpc)).toBe(false);
            expect(CAPABILITY_BY_RPC.get(rpc)?.effect).toBe(rpc.endsWith('listViews') ? 'read' : 'write');
        }
    });
});

describe('BE-06 getIssueGroups tenantId', () => {
    const NOW = new Date('2026-10-01T12:00:00Z');
    function errorModel() { const calls: any[] = []; return { calls, aggregate: (p: any[]) => { calls.push(p); return { option: () => Promise.resolve([]) }; } }; }
    it('kova eşleşmesi: $match.tenantBuckets = tenantBucketOf(tid); süzgeçsizde alan yok', async () => {
        const m = errorModel();
        await getIssueGroups({ tenantId: 7, status: 'open' }, { errorModel: m, now: () => NOW });
        expect(m.calls[0][0].$match).toMatchObject({ status: 'open', tenantBuckets: tenantBucketOf(7) });
        const m2 = errorModel();
        await getIssueGroups({}, { errorModel: m2, now: () => NOW });
        expect(m2.calls[0][0].$match).not.toHaveProperty('tenantBuckets');
    });
    it('geçersiz tenantId (0, negatif, kesirli, string) LogQueryError', async () => {
        for (const bad of [0, -3, 1.5, '7' as any]) await expect(getIssueGroups({ tenantId: bad }, { errorModel: errorModel(), now: () => NOW })).rejects.toThrow(LogQueryError);
    });
});
