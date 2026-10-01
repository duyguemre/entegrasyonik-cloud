// ADR-0018 Karar 2c (Aşama B) — SourceMonitor: haftalık kaynak izleyici. GERÇEK ağ/DB YOK (fetchDoc/fetchRobots/
// readSnapshot/writeSnapshot/reportFinding hepsi enjekte edilmiş sahtelerdir). `SOURCE_MONITOR_ENABLED=false`
// varsayılanının hiçbir ağ isteği ATMADIĞI da ayrıca doğrulanır.
import { describe, it, expect, jest } from '@jest/globals';
import {
    runSourceMonitor, listAutoMonitoredDocs, normalizeHtmlToLines, computeContentHash, computeLineHashes,
    summarizeLineDiff, isPathAllowedByRobots, type SourceSnapshotRecord, type DocMonitorTarget,
} from '@integration/compliance/SourceMonitor';
import type { IntegrationDescriptor } from '@integration/catalog/types';

describe('listAutoMonitoredDocs — yalnız monitor==="auto" olan URL\'ler', () => {
    it('manual/off işaretli URL\'ler listeye GİRMEZ', () => {
        const descriptors = [
            {
                code: 'x', category: 'marketplace', api: {
                    hosts: [], docs: [
                        { url: 'https://a.example/auto', kind: 'reference', official: true, monitor: 'auto' },
                        { url: 'https://a.example/manual', kind: 'reference', official: true, monitor: 'manual' },
                    ],
                },
            } as unknown as IntegrationDescriptor,
        ];
        const out = listAutoMonitoredDocs(descriptors);
        expect(out).toEqual([{ integrationCode: 'x', category: 'marketplace', url: 'https://a.example/auto', kind: 'reference' }]);
    });
});

describe('normalizeHtmlToLines / computeContentHash / computeLineHashes — saf fonksiyonlar', () => {
    it('script/style/nav/footer İÇERİĞİ atılır, blok etiketleri satır sonuna çevrilir, boşluk normalize edilir', () => {
        const html = `
            <html><head><script>var x = "gizli";</script><style>.a{color:red}</style></head>
            <body>
              <nav>Menü bağlantıları</nav>
              <header>Başlık alanı</header>
              <p>Birinci   paragraf.</p>
              <div>İkinci  <b>satır</b>.</div>
              <footer>Alt bilgi</footer>
            </body></html>`;
        const lines = normalizeHtmlToLines(html);
        expect(lines.join(' ')).not.toMatch(/gizli|color:red|Menü bağlantıları|Başlık alanı|Alt bilgi/);
        expect(lines).toContain('Birinci paragraf.');
        expect(lines).toContain('İkinci satır .');
    });

    it('AYNI normalize edilmiş içerik AYNI hash\'i üretir; farklı içerik farklı hash', () => {
        const a = computeContentHash(['satır 1', 'satır 2']);
        const b = computeContentHash(['satır 1', 'satır 2']);
        const c = computeContentHash(['satır 1', 'satır 3']);
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computeLineHashes: satır sayısı kadar 12-hex hash üretir', () => {
        const hashes = computeLineHashes(['a', 'b', 'c']);
        expect(hashes).toHaveLength(3);
        for (const h of hashes) expect(h).toMatch(/^[a-f0-9]{12}$/);
    });
});

describe('summarizeLineDiff — ham metin İÇERMEYEN, ≤2KB özet', () => {
    it('eklenen/çıkarılan satır sayısını doğru hesaplar', () => {
        const oldHashes = computeLineHashes(['a', 'b', 'c']);
        const newHashes = computeLineHashes(['a', 'b', 'd', 'e']);
        const summary = summarizeLineDiff(oldHashes, newHashes);
        expect(summary).toContain('+2 eklendi');
        expect(summary).toContain('-1 çıkarıldı');
        expect(summary.length).toBeLessThanOrEqual(2048);
    });
});

describe('isPathAllowedByRobots — yalnız User-agent:* grubu, en uzun eşleşme kazanır', () => {
    it('robots.txt yok/null -> İZİNLİ', () => {
        expect(isPathAllowedByRobots(null, '/docs/x')).toBe(true);
    });
    it('Disallow: / -> HERHANGİ bir yol YASAK', () => {
        expect(isPathAllowedByRobots('User-agent: *\nDisallow: /', '/docs/x')).toBe(false);
    });
    it('Disallow: /private + Allow: /private/public-page daha UZUN eşleşme kazanır -> İZİNLİ', () => {
        const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public-page';
        expect(isPathAllowedByRobots(robots, '/private/public-page')).toBe(true);
        expect(isPathAllowedByRobots(robots, '/private/secret')).toBe(false);
    });
    it('yalnız BAŞKA bir user-agent grubu varsa (wildcard yok) -> İZİNLİ', () => {
        const robots = 'User-agent: SomeBot\nDisallow: /';
        expect(isPathAllowedByRobots(robots, '/docs/x')).toBe(true);
    });
    it('boş Disallow (Disallow:) hiçbir şeyi yasaklamaz', () => {
        expect(isPathAllowedByRobots('User-agent: *\nDisallow:', '/docs/x')).toBe(true);
    });
});

function fakeTarget(url = 'https://example.com/changelog'): DocMonitorTarget {
    return { integrationCode: 'trendyol', category: 'marketplace', url, kind: 'changelog' };
}

describe('runSourceMonitor — enabled=false (varsayılan): HİÇBİR ağ isteği atmaz', () => {
    it('skipped="source_monitor_disabled" döner, fetchDoc/fetchRobots HİÇ ÇAĞRILMAZ', async () => {
        const fetchDoc = jest.fn();
        const fetchRobots = jest.fn();
        const outcome = await runSourceMonitor({ enabled: false, fetchDoc: fetchDoc as any, fetchRobots: fetchRobots as any });
        expect(outcome).toEqual({ skipped: 'source_monitor_disabled', processed: 0 });
        expect(fetchDoc).not.toHaveBeenCalled();
        expect(fetchRobots).not.toHaveBeenCalled();
    });
});

describe('runSourceMonitor — enabled=true (yalnız enjekte edilmiş sahtelerle, GERÇEK ağ YOK)', () => {
    function deps(overrides: Record<string, any> = {}): Record<string, any> {
        const store = new Map<string, SourceSnapshotRecord>();
        const findings: any[] = [];
        return {
            enabled: true,
            targets: [fakeTarget()],
            sleep: async () => undefined,
            now: () => new Date('2026-09-29T00:00:00.000Z'),
            userAgent: 'Test-Agent/1.0',
            fetchRobots: jest.fn(async () => null),
            readSnapshot: jest.fn(async (url: string) => store.get(url) ?? null),
            writeSnapshot: jest.fn(async (rec: SourceSnapshotRecord) => { store.set(rec.url, rec); }),
            reportFinding: jest.fn(async (input: any) => { findings.push(input); }),
            _store: store,
            _findings: findings,
            ...overrides,
        };
    }

    it('ilk çalıştırma (snapshot yok): temel çizgi kaydedilir, bulgu ÜRETİLMEZ', async () => {
        const d = deps({ fetchDoc: jest.fn(async () => ({ status: 200, headers: {}, body: '<p>Merhaba dünya</p>' })) });
        const outcome = await runSourceMonitor(d as any);
        expect(outcome.processed).toBe(1);
        expect(outcome.changed).toBe(0);
        expect(d._findings).toHaveLength(0);
        expect(d._store.get('https://example.com/changelog')?.contentHash).toBeDefined();
    });

    it('içerik DEĞİŞMEDİYSE (aynı hash): bulgu ÜRETİLMEZ, yalnız lastCheckedAt güncellenir', async () => {
        const d = deps({ fetchDoc: jest.fn(async () => ({ status: 200, headers: {}, body: '<p>Aynı içerik</p>' })) });
        await runSourceMonitor(d as any);
        d.now = () => new Date('2026-10-06T00:00:00.000Z'); // 7 gün sonra (haftalık kapı açık)
        await runSourceMonitor(d as any);
        expect(d._findings).toHaveLength(0);
    });

    it('içerik DEĞİŞTİYSE: kind="doc" severity="info" bir IntegrationFinding üretilir + snapshot güncellenir', async () => {
        let call = 0;
        const d = deps({
            fetchDoc: jest.fn(async () => {
                call++;
                return { status: 200, headers: {}, body: call === 1 ? '<p>Eski içerik</p>' : '<p>Yeni içerik burada</p>' };
            }),
        });
        await runSourceMonitor(d as any);
        d.now = () => new Date('2026-10-06T00:00:00.000Z');
        const outcome2 = await runSourceMonitor(d as any);
        expect(outcome2.changed).toBe(1);
        expect(d._findings).toHaveLength(1);
        expect(d._findings[0]).toMatchObject({ kind: 'doc', source: 'source_monitor', severity: 'info', subjectKey: 'https://example.com/changelog' });
        expect(d._findings[0].evidence.docDiff).toEqual(expect.any(String));
        expect(d._findings[0].evidence.docDiff.length).toBeLessThanOrEqual(2048);
    });

    it('URL haftada BİRDEN FAZLA kez çekilmez (weekly gate): ikinci çağrı hemen sonra fetchDoc çağırmaz', async () => {
        const fetchDoc = jest.fn(async () => ({ status: 200, headers: {}, body: '<p>x</p>' }));
        const d = deps({ fetchDoc });
        await runSourceMonitor(d as any);
        const outcome2 = await runSourceMonitor(d as any); // AYNI `now()` -> 7 gün geçmedi
        expect(fetchDoc).toHaveBeenCalledTimes(1);
        expect(outcome2.skippedByWeeklyGate).toBe(1);
    });

    it('robots.txt tarafından YASAKLANMIŞSA: fetchDoc HİÇ ÇAĞRILMAZ', async () => {
        const fetchDoc = jest.fn();
        const d = deps({ fetchDoc, fetchRobots: jest.fn(async () => 'User-agent: *\nDisallow: /') });
        const outcome = await runSourceMonitor(d as any);
        expect(fetchDoc).not.toHaveBeenCalled();
        expect(outcome.skippedByRobots).toBe(1);
    });

    it('304 Not Modified: bulgu ÜRETİLMEZ, contentHash DEĞİŞMEZ, yalnız lastCheckedAt güncellenir', async () => {
        const d = deps({ fetchDoc: jest.fn(async () => ({ status: 200, headers: { etag: 'abc' }, body: '<p>ilk</p>' })) });
        await runSourceMonitor(d as any);
        d.now = () => new Date('2026-10-06T00:00:00.000Z');
        d.fetchDoc = jest.fn(async () => ({ status: 304, headers: {}, body: '' }));
        const outcome2 = await runSourceMonitor(d as any);
        expect(outcome2.changed).toBe(0);
        expect(d._findings).toHaveLength(0);
        expect(d._store.get('https://example.com/changelog')?.contentHash).toBeDefined();
    });

    it('fetchDoc HATA fırlatırsa: SESSİZCE atlanır (bulgu YOK), job outcome failed++', async () => {
        const d = deps({ fetchDoc: jest.fn(async () => { throw new Error('ECONNRESET'); }) });
        const outcome = await runSourceMonitor(d as any);
        expect(outcome.failed).toBe(1);
        expect(d._findings).toHaveLength(0);
    });

    it('beklenmeyen HTTP durumu (ör. 500): SESSİZCE atlanır (bulgu YOK), job outcome failed++', async () => {
        const d = deps({ fetchDoc: jest.fn(async () => ({ status: 500, headers: {}, body: '' })) });
        const outcome = await runSourceMonitor(d as any);
        expect(outcome.failed).toBe(1);
        expect(d._findings).toHaveLength(0);
    });
});

// ADR-0022 (F-03): güvenli GET (allowlist + elle yönlendirme + tavan). Gerçek ağ YOK (httpGet enjekte).
import { safeGetText, isSafeMonitorUrl } from '../../../src/integration/compliance/SourceMonitor';

describe('SourceMonitor safeGetText (ADR-0022)', () => {
    const allowed = new Set(['docs.example.com']);
    const mk = (responses: any[]) => { const calls: any[] = []; const fn = jest.fn(async (u: string, cfg: any) => { calls.push({ u, cfg }); return responses.shift(); }); return { fn, calls }; };

    it('axios otomatik yönlendirme KAPALI ve gövde tavanı verilir', async () => {
        const { fn, calls } = mk([{ status: 200, headers: {}, data: 'ok' }]);
        const r = await safeGetText('https://docs.example.com/a', {}, { allowedHosts: allowed, timeoutMs: 1, maxRedirects: 3, httpGet: fn as any });
        expect(r.body).toBe('ok');
        expect(calls[0].cfg.maxRedirects).toBe(0);
        expect(calls[0].cfg.maxContentLength).toBeGreaterThan(0);
    });
    it('aynı host yönlendirmesi izlenir, izin dışı host\'a İSTEK ATILMAZ', async () => {
        const ok = mk([{ status: 301, headers: { location: '/b' } }, { status: 200, headers: {}, data: 'b' }]);
        expect((await safeGetText('https://docs.example.com/a', {}, { allowedHosts: allowed, timeoutMs: 1, maxRedirects: 3, httpGet: ok.fn as any })).body).toBe('b');
        const bad = mk([{ status: 302, headers: { location: 'http://169.254.169.254/latest' } }]);
        await expect(safeGetText('https://docs.example.com/a', {}, { allowedHosts: allowed, timeoutMs: 1, maxRedirects: 3, httpGet: bad.fn as any })).rejects.toThrow(/izin listesi/);
        expect(bad.fn).toHaveBeenCalledTimes(1);
        const evil = mk([{ status: 302, headers: { location: 'https://evil.example.org/' } }]);
        await expect(safeGetText('https://docs.example.com/a', {}, { allowedHosts: allowed, timeoutMs: 1, maxRedirects: 3, httpGet: evil.fn as any })).rejects.toThrow();
        expect(evil.fn).toHaveBeenCalledTimes(1);
    });
    it('yönlendirme sınırı aşılınca hata; IP literal/kimlik bilgili URL reddedilir', async () => {
        const loop = mk(Array.from({ length: 10 }, () => ({ status: 302, headers: { location: '/x' } })));
        await expect(safeGetText('https://docs.example.com/a', {}, { allowedHosts: allowed, timeoutMs: 1, maxRedirects: 2, httpGet: loop.fn as any })).rejects.toThrow(/sınır/);
        expect(loop.fn).toHaveBeenCalledTimes(3);
        expect(isSafeMonitorUrl('http://127.0.0.1/', new Set(['127.0.0.1']))).toBe(false);
        expect(isSafeMonitorUrl('https://u:p@docs.example.com/', allowed)).toBe(false);
        expect(isSafeMonitorUrl('file:///etc/passwd', allowed)).toBe(false);
    });
});
