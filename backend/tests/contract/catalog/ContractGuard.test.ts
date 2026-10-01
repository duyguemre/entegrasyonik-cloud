// ADR-0018 Karar 2a — ContractGuard/ShapeFingerprint birim testleri (mock FindingService sink, DB/ağ YOK).
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { z } from 'zod';
import { observeContract, observeResponseHeaders, type ContractRef } from '@integration/compliance/ContractGuard';
import { FindingService } from '@integration/compliance/FindingService';
import { computeShapeFingerprint, extractShapePaths } from '@integration/compliance/ShapeFingerprint';
import { reportUnknownEnum, getUnknownEnumCount } from '@integration/modules/common/contract/reportUnknownEnum';

describe('ShapeFingerprint', () => {
    it('aynı şekil (anahtar+tip) -> aynı hash; DEĞER hash\'i etkilemez', () => {
        const a = computeShapeFingerprint({ status: 'Created', total: 10 });
        const b = computeShapeFingerprint({ status: 'ANYTHING_ELSE', total: 999 });
        expect(a).toBe(b);
    });

    it('farklı şekil (yeni alan) -> farklı hash', () => {
        const a = computeShapeFingerprint({ status: 'x' });
        const b = computeShapeFingerprint({ status: 'x', newField: 1 });
        expect(a).not.toBe(b);
    });

    it('dizi elemanları 50 ile sınırlanır (maliyet sınırı, ADR-0018 Karar 2a)', () => {
        const arr = Array.from({ length: 200 }, (_, i) => ({ id: i }));
        const paths = extractShapePaths(arr);
        // yalnız "$:array" + "[].id:number" kombinasyonu üretilir, eleman sayısına göre BÜYÜMEZ (tekilleştirilir).
        expect(paths.size).toBeLessThanOrEqual(3);
    });
});

describe('observeContract — pasif gözlem (yanıtı ASLA değiştirmez/fırlatmaz)', () => {
    let reports: any[];
    beforeEach(() => {
        reports = [];
        FindingService.setSink(async (op, record) => { reports.push({ op, record }); });
    });
    afterEach(() => { FindingService.setSink(undefined); });

    const ref: ContractRef = {
        id: 'test.orders.list@v1', category: 'marketplace',
        schema: z.object({ status: z.string(), amount: z.number() }).strict(),
    };

    it('sözleşmeye uyan veri -> hiçbir bulgu üretmez', async () => {
        observeContract(ref, 'trendyol', 1, { status: 'Created', amount: 10 });
        await flushMicrotasks();
        expect(reports).toHaveLength(0);
    });

    it('eksik zorunlu alan -> kind:schema, subjectKey #mismatch, severity high', async () => {
        observeContract(ref, 'trendyol', 1, { status: 'Created' });
        await flushMicrotasks();
        expect(reports).toHaveLength(1);
        expect(reports[0].record.kind).toBe('schema');
        expect(reports[0].record.subjectKey).toBe('test.orders.list@v1#mismatch');
        expect(reports[0].record.severity).toBe('high');
    });

    it('şemada olmayan yeni alan -> kind:schema, subjectKey #unknown_fields, severity low', async () => {
        observeContract(ref, 'trendyol', 1, { status: 'Created', amount: 10, brandNewField: 'x' });
        await flushMicrotasks();
        expect(reports).toHaveLength(1);
        expect(reports[0].record.subjectKey).toBe('test.orders.list@v1#unknown_fields');
        expect(reports[0].record.severity).toBe('low');
        expect(reports[0].record.evidence.paths).toEqual(['brandNewField']);
    });

    it('bozuk gövde (undefined/null/döngüsel değil) -> ASLA fırlatmaz, yalnız bulgu üretir', async () => {
        expect(() => observeContract(ref, 'trendyol', 1, null)).not.toThrow();
        expect(() => observeContract(ref, 'trendyol', 1, undefined)).not.toThrow();
        expect(() => observeContract(ref, 'trendyol', 1, 'not-an-object')).not.toThrow();
        await flushMicrotasks();
        // üçü de şemaya uymuyor -> mismatch bulguları üretilmiş olabilir ama HİÇBİRİ fırlatmadı (asıl iddia budur)
        expect(reports.length).toBeGreaterThan(0);
    });
});

describe('observeResponseHeaders — Deprecation/Sunset/Warning gözlemi', () => {
    let reports: any[];
    beforeEach(() => {
        reports = [];
        FindingService.setSink(async (op, record) => { reports.push({ op, record }); });
    });
    afterEach(() => { FindingService.setSink(undefined); });

    it('başlık yoksa hiçbir şey üretmez', async () => {
        observeResponseHeaders('trendyol', 1, 'GET /orders', { 'content-type': 'application/json' });
        await flushMicrotasks();
        expect(reports).toHaveLength(0);
    });

    it('Deprecation başlığı -> kind:deprecation, severity medium (Sunset yakın değilse)', async () => {
        observeResponseHeaders('trendyol', 1, 'GET /orders', { deprecation: 'true' });
        await flushMicrotasks();
        expect(reports).toHaveLength(1);
        expect(reports[0].record.kind).toBe('deprecation');
        expect(reports[0].record.severity).toBe('medium');
        expect(reports[0].record.evidence.headerNames).toEqual(['Deprecation']);
    });

    it('Sunset < 30 gün -> severity high; DEĞER (tarih) saklanır, diğer başlık değerleri saklanmaz', async () => {
        const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        observeResponseHeaders('trendyol', 1, 'GET /orders', { sunset: soon });
        await flushMicrotasks();
        expect(reports[0].record.severity).toBe('high');
        expect(reports[0].record.evidence.sunsetAt).toBe(soon);
    });
});

describe('reportUnknownEnum sink -> FindingService (ADR-0018 Karar 2a iii köprüsü)', () => {
    // ContractGuard modülü zaten yukarıdaki testlerde içe aktarıldığı için sink otomatik bağlıdır
    // (modül-yükleme yan etkisi). Burada yalnız köprünün GERÇEKTEN çalıştığı doğrulanır.
    let reports: any[];
    beforeEach(() => {
        reports = [];
        // NOT: `resetUnknownEnumState()` BİLİNÇLİ OLARAK burada ÇAĞRILMAZ — o, `customSink`'i null'a çeker.
        // ContractGuard bu dosyanın en üstünde statik `import` edildiği için modül-yükleme yan etkisiyle
        // sink zaten bağlıdır; `resetUnknownEnumState()` çağırmak (Node modül önbelleği bir kez yüklenmiş
        // modülü yeniden ÇALIŞTIRMAZ) sink'i kalıcı olarak koparır. Yalnız yakalama dizisini sıfırlıyoruz.
        FindingService.setSink(async (op, record) => { reports.push({ op, record }); });
    });
    afterEach(() => { FindingService.setSink(undefined); });

    it('bilinmeyen enum değeri raporlanınca FindingService.report çağrılır (kind:unknown_enum)', async () => {
        reportUnknownEnum('trendyol.orders.list@v2', 'status', 'BrandNewStatus');
        await flushMicrotasks();
        expect(reports).toHaveLength(1);
        expect(reports[0].record.kind).toBe('unknown_enum');
        expect(reports[0].record.integrationCode).toBe('trendyol');
        expect(reports[0].record.category).toBe('marketplace');
        expect(reports[0].record.evidence.enumValue).toBe('BrandNewStatus');
        expect(getUnknownEnumCount('trendyol.orders.list@v2', 'status', 'BrandNewStatus')).toBe(0); // özel sink kullanıldığında iç sayaç ARTIRILMAZ (reportUnknownEnum.ts tasarımı)
    });
});

/** `Promise.resolve().then()` ile ertelenmiş gözlem çağrılarının tamamlanmasını bekler. */
async function flushMicrotasks(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
}
