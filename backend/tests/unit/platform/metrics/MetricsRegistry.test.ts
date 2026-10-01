/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.1/2.3): `MetricsRegistry` -- süreç-içi sayaç/histogram, sabit kovalar,
 * `drain()` anlık görüntü + sıfırlama, kardinalite sınırı (`MAX_SERIES`) + `metrics_series_dropped`.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MetricsRegistry, HISTOGRAM_BUCKETS_MS, MAX_SERIES } from '@platform/runtime/metrics/MetricsRegistry';

describe('MetricsRegistry', () => {
    let reg: MetricsRegistry;
    beforeEach(() => { reg = new MetricsRegistry(); });

    it('incCounter: aynı etiket kümesi ARTAR, farklı etiket AYRI seri açar', () => {
        reg.incCounter('http_requests', { op: 'A', statusClass: '2xx' });
        reg.incCounter('http_requests', { op: 'A', statusClass: '2xx' });
        reg.incCounter('http_requests', { op: 'B', statusClass: '2xx' });
        const snap = reg.drain();
        const a = snap.find((s) => s.labels.op === 'A')!;
        const b = snap.find((s) => s.labels.op === 'B')!;
        expect(a.count).toBe(2);
        expect(b.count).toBe(1);
    });

    it('etiket SIRASI seri kimliğini ETKİLEMEZ (canonical anahtar sıralı)', () => {
        reg.incCounter('m', { a: '1', b: '2' });
        reg.incCounter('m', { b: '2', a: '1' });
        const snap = reg.drain();
        expect(snap).toHaveLength(1);
        expect(snap[0].count).toBe(2);
    });

    it('observeHistogram: count/sum/kova doğru güncellenir', () => {
        reg.observeHistogram('dur', { op: 'X' }, 40);   // ilk kova (<=50)
        reg.observeHistogram('dur', { op: 'X' }, 40);
        reg.observeHistogram('dur', { op: 'X' }, 999999); // +Inf kovası
        const snap = reg.drain();
        const s = snap[0];
        expect(s.count).toBe(3);
        expect(s.sum).toBe(40 + 40 + 999999);
        expect(s.buckets[0]).toBe(2);
        expect(s.buckets[HISTOGRAM_BUCKETS_MS.length]).toBe(1); // +Inf
        expect(s.buckets.reduce((a, b) => a + b, 0)).toBe(3);
    });

    it('kova sınırları: değer TAM sınırdaysa o kovaya (kümülatif DEĞİL, <=) düşer', () => {
        reg.observeHistogram('dur', {}, 50);   // == ilk sınır
        reg.observeHistogram('dur', {}, 51);   // ikinci kovaya
        const snap = reg.drain();
        expect(snap[0].buckets[0]).toBe(1);
        expect(snap[0].buckets[1]).toBe(1);
    });

    it('drain() İÇ DURUMU SIFIRLAR: ikinci drain boş döner (bir sonraki flush aynı olayı tekrar SAYMAZ)', () => {
        reg.incCounter('m', {});
        expect(reg.drain()).toHaveLength(1);
        expect(reg.drain()).toHaveLength(0);
    });

    it('kardinalite sınırı: MAX_SERIES aşan YENİ seri REDDEDİLİR, metrics_series_dropped sayılır', () => {
        for (let i = 0; i < MAX_SERIES + 10; i++) reg.incCounter('m', { i: String(i) });
        expect(reg.seriesCountForTests()).toBe(MAX_SERIES);
        const snap = reg.drain();
        const dropped = snap.find((s) => s.metric === 'metrics_series_dropped');
        expect(dropped).toBeDefined();
        expect(dropped!.count).toBe(10);
    });

    it('sınıra ULAŞMIŞ registryde MEVCUT bir seriye artış YAPILABİLİR (yalnız YENİ seri reddedilir)', () => {
        reg.incCounter('m', { k: 'existing' });
        for (let i = 0; i < MAX_SERIES; i++) reg.incCounter('m', { i: String(i) });
        reg.incCounter('m', { k: 'existing' }); // zaten var olan seri -- reddedilmez
        const snap = reg.drain();
        const existing = snap.find((s) => s.labels.k === 'existing');
        expect(existing!.count).toBe(2);
    });

    it('incCounter/observeHistogram HİÇBİR ZAMAN fırlatmaz (geçersiz/eksik girdi bile)', () => {
        expect(() => reg.incCounter('m', undefined as any)).not.toThrow();
        expect(() => reg.observeHistogram('m', {}, NaN)).not.toThrow();
    });

    it('resetForTests(): drain çağırmadan durumu temizler', () => {
        reg.incCounter('m', {});
        reg.resetForTests();
        expect(reg.drain()).toHaveLength(0);
    });
});
