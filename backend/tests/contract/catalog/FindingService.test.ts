// ADR-0018 Karar 2 — FindingService birim testleri (mock sink, DB/ağ YOK).
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    FindingService, computeDedupKey, computeDefaultSeverity, redactEvidence,
    type IntegrationFindingRecord,
} from '@integration/compliance/FindingService';

describe('FindingService — dedup/upsert/redaksiyon (mock sink)', () => {
    let store: Map<string, IntegrationFindingRecord>;

    beforeEach(() => {
        store = new Map();
        FindingService.setReader(async (dedupKey) => store.get(dedupKey) ?? null);
        FindingService.setSink(async (op, record) => {
            if (op === 'upsert') {
                store.set(record.dedupKey, { ...(store.get(record.dedupKey) ?? {}), ...record } as IntegrationFindingRecord);
            } else {
                const existing = store.get(record.dedupKey);
                if (existing) store.set(record.dedupKey, { ...existing, ...record });
            }
        });
    });

    afterEach(() => {
        FindingService.setReader(undefined);
        FindingService.setSink(undefined);
    });

    it('computeDedupKey: aynı girdi -> aynı hash; farklı subjectKey -> farklı hash', () => {
        const a = computeDedupKey('trendyol', 'unknown_enum', 'orders.status', 'FOO');
        const b = computeDedupKey('trendyol', 'unknown_enum', 'orders.status', 'FOO');
        const c = computeDedupKey('trendyol', 'unknown_enum', 'claims.status', 'FOO');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('ilk çağrı: yeni bulgu occurrences=1, status=new, confirmed=false (tek tenant, az gözlem)', async () => {
        await FindingService.report({
            integrationCode: 'trendyol', category: 'marketplace', kind: 'unknown_enum', source: 'guard',
            subjectKey: 'trendyol.orders.list@v2#status', evidence: { enumValue: 'NEWSTATUS' }, tenantId: 1,
        });
        const key = computeDedupKey('trendyol', 'unknown_enum', 'trendyol.orders.list@v2#status', 'trendyol.orders.list@v2#status');
        const rec = store.get(key)!;
        expect(rec.occurrences).toBe(1);
        expect(rec.status).toBe('new');
        expect(rec.confirmed).toBe(false);
        expect(rec.affectedTenants).toEqual([1]);
        expect(rec.severity).toBe('high'); // computeDefaultSeverity('unknown_enum') === 'high'
    });

    it('tekilleştirme: aynı dedupKey ikinci kez raporlanınca occurrences artar, $addToSet ile yeni tenant eklenir', async () => {
        const input = {
            integrationCode: 'trendyol', category: 'marketplace', kind: 'unknown_enum' as const, source: 'guard' as const,
            subjectKey: 'trendyol.orders.list@v2#status',
        };
        await FindingService.report({ ...input, tenantId: 1 });
        await FindingService.report({ ...input, tenantId: 2 });
        await FindingService.report({ ...input, tenantId: 1 }); // aynı tenant tekrar -> $addToSet, büyümez

        const key = computeDedupKey('trendyol', 'unknown_enum', input.subjectKey, input.subjectKey);
        const rec = store.get(key)!;
        expect(rec.occurrences).toBe(3);
        expect(rec.affectedTenants.sort()).toEqual([1, 2]);
        // yanlış pozitif kapısı: >=2 tenant -> confirmed=true
        expect(rec.confirmed).toBe(true);
    });

    it('yanlış pozitif kapısı: source=probe/manual TEK gözlemde bile confirmed=true yapar', async () => {
        await FindingService.report({
            integrationCode: 'trendyol', category: 'marketplace', kind: 'doc', source: 'manual',
            subjectKey: 'https://developers.trendyol.com/docs/1-servis-limitleri',
        });
        const key = computeDedupKey('trendyol', 'doc', 'https://developers.trendyol.com/docs/1-servis-limitleri', 'https://developers.trendyol.com/docs/1-servis-limitleri');
        expect(store.get(key)!.confirmed).toBe(true);
        expect(store.get(key)!.severity).toBe('info'); // doc her zaman info
    });

    it('regresyon: fixed bulgu closedAt+24sa SONRA aynı imzayla tekrar görülürse new\'e döner', async () => {
        const input = {
            integrationCode: 'hepsiburada', category: 'marketplace', kind: 'schema' as const, source: 'guard' as const,
            subjectKey: 'hepsiburada.orders#field',
        };
        await FindingService.report(input);
        const key = computeDedupKey('hepsiburada', 'schema', input.subjectKey, input.subjectKey);
        // Bulguyu kapat (fixed), closedAt'i 25 saat öncesine sabitle (regresyon penceresini aş).
        const rec = store.get(key)!;
        store.set(key, { ...rec, status: 'fixed', closedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });

        await FindingService.report(input);
        expect(store.get(key)!.status).toBe('new');
        expect(store.get(key)!.closedAt).toBeUndefined();
    });

    it('regresyon YOK: fixed bulgu closedAt+24sa İÇİNDE tekrar görülürse fixed kalır', async () => {
        const input = {
            integrationCode: 'hepsiburada', category: 'marketplace', kind: 'schema' as const, source: 'guard' as const,
            subjectKey: 'hepsiburada.orders#field2',
        };
        await FindingService.report(input);
        const key = computeDedupKey('hepsiburada', 'schema', input.subjectKey, input.subjectKey);
        const rec = store.get(key)!;
        store.set(key, { ...rec, status: 'fixed', closedAt: new Date(Date.now() - 1 * 60 * 60 * 1000) });

        await FindingService.report(input);
        expect(store.get(key)!.status).toBe('fixed');
    });

    it('redaksiyon: PII/sır benzeri değerler evidence\'a asla sızmaz (yasak anahtar filtresi + desen)', () => {
        const red = redactEvidence({
            enumValue: 'not a valid enum value with spaces and secret=abc123',
            paths: ['orders[].status', 'password=hunter2'],
            headerNames: ['Deprecation', 'Authorization'],
            docDiff: 'x'.repeat(3000),
        });
        expect(red?.enumValue).toBe('<redacted>'); // boşluk/karakter deseni uymuyor
        // 'password=hunter2' FORBIDDEN_KEY deseniyle ('pass') eşleşir -> listeden tamamen ATILIR (sızmaz).
        expect(red?.paths).toEqual(['orders[].status']);
        expect(red?.headerNames).toContain('Deprecation');
        expect(red?.docDiff?.length).toBeLessThanOrEqual(2049); // 2KB + '…'
    });

    it('R12 kancası (NB8): onaylı high/critical bulgu ilk kez new olunca bir kez çağrılır; aynı bulgu tekrarında çağrılmaz; kanca hatası kaydı etkilemez', async () => {
        const calls: any[] = [];
        FindingService.setAlertHook(async (c) => { calls.push(c); throw new Error('kanca patladi'); });
        try {
            const input = { integrationCode: 'trendyol', category: 'marketplace', kind: 'unknown_enum' as const, source: 'probe' as const, subjectKey: 'trendyol.orders.list@v2#status' };
            await FindingService.report(input);   // probe => confirmed, unknown_enum => high
            await FindingService.report(input);   // zaten new: tekrar uyarı yok
            await new Promise((r) => setImmediate(r));
            const key = computeDedupKey('trendyol', 'unknown_enum', input.subjectKey, input.subjectKey);
            expect(calls).toEqual([{ integrationCode: 'trendyol', kind: 'unknown_enum', severity: 'high', findingId: key.slice(0, 16) }]);
            expect(store.get(key)!.occurrences).toBe(2);
        } finally { FindingService.setAlertHook(undefined); }
    });

    it('R12 kancası: onaysız (tek gözlem, tek tenant) ya da düşük önemli bulgu için çağrılmaz; kanca yoksa no-op', async () => {
        const calls: any[] = [];
        FindingService.setAlertHook((c) => { calls.push(c); });
        try {
            await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'unknown_enum', source: 'guard', subjectKey: 'n11.x#y', tenantId: 1 });
            await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'doc', source: 'probe', subjectKey: 'n11.doc' });
            expect(calls).toEqual([]);
        } finally { FindingService.setAlertHook(undefined); }
        await expect(FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'unknown_enum', source: 'probe', subjectKey: 'n11.z#w' })).resolves.toBeUndefined();
    });

    it('report() ASLA fırlatmaz: sink hata fırlatsa bile Promise reddedilmez', async () => {
        FindingService.setSink(async () => { throw new Error('DB kapalı'); });
        await expect(FindingService.report({
            integrationCode: 'trendyol', category: 'marketplace', kind: 'doc', source: 'manual', subjectKey: 'x',
        })).resolves.toBeUndefined();
    });

    it('transition: fixed işlemi fixRef olmadan Error fırlatır (ZORUNLU alan)', async () => {
        await expect(FindingService.transition('deadbeef', 'fixed', { decidedBy: 'admin@example.com' }))
            .rejects.toThrow(/fixRef/);
    });

    it('transition: triage/accept/wontfix/false_positive/fixed durum geçişleri doğru status\'e yazar', async () => {
        await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#x' });
        const key = computeDedupKey('n11', 'schema', 'n11#x', 'n11#x');

        await FindingService.transition(key, 'triage', { decidedBy: 'admin' });
        expect(store.get(key)!.status).toBe('triaged');

        await FindingService.transition(key, 'fixed', { decidedBy: 'admin', fixRef: 'commit-abc123', fixedInAdapterVersion: '1.2.0' });
        expect(store.get(key)!.status).toBe('fixed');
        expect(store.get(key)!.closedAt).toBeInstanceOf(Date);
        expect(store.get(key)!.fixedInAdapterVersion).toBe('1.2.0');
    });
});

describe('computeDefaultSeverity — ADR-0018 Karar 2 basitleştirilmiş tablo', () => {
    it('doc her zaman info', () => expect(computeDefaultSeverity('doc')).toBe('info'));
    it('auth: <2 tenant high, >=2 tenant critical', () => {
        expect(computeDefaultSeverity('auth', { affectedTenantsCount: 1 })).toBe('high');
        expect(computeDefaultSeverity('auth', { affectedTenantsCount: 2 })).toBe('critical');
    });
    it('endpoint: 410/404 critical, diğerleri medium', () => {
        expect(computeDefaultSeverity('endpoint', { httpStatus: 410 })).toBe('critical');
        expect(computeDefaultSeverity('endpoint', { httpStatus: 404 })).toBe('critical');
        expect(computeDefaultSeverity('endpoint', { httpStatus: 500 })).toBe('medium');
    });
    it('schema/unknown_enum: high', () => {
        expect(computeDefaultSeverity('schema')).toBe('high');
        expect(computeDefaultSeverity('unknown_enum')).toBe('high');
    });
    it('deprecation/ratelimit/version: medium', () => {
        expect(computeDefaultSeverity('deprecation')).toBe('medium');
        expect(computeDefaultSeverity('ratelimit')).toBe('medium');
        expect(computeDefaultSeverity('version')).toBe('medium');
    });
});
