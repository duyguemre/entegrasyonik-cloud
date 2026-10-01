/**
 * YENİ (ADR-0005 Karar 3): Queue (OrderQueueProducer) ve Worker (worker-runner) tarafındaki
 * `removeOnComplete`/`removeOnFail` ayarlarının TEKİL kaynaktan (order.config.json > memoryManagement)
 * geldiğini doğrular. ÖNCEKİ DAVRANIŞ: Queue tarafı `removeOnComplete: true, removeOnFail: false`
 * (BullMQ tanımlı seçenekler farklı formatta), Worker tarafı `removeOnComplete: {count:100},
 * removeOnFail: {count:500}` -- iki taraf ÇELİŞİYORDU (ADR-0005 Bağlam #8/İnceleme bulgusu).
 *
 * Bu dosya gerçek Redis/BullMQ'ya bağlanmaz; yalnızca `order.config.json` şeklini ve her iki
 * modülün AYNI değerleri kullandığını (uçtan uca, OrderQueueProducer/worker-runner davranış
 * testleriyle birlikte) sözleşme olarak sabitler.
 */
import { describe, it, expect } from '@jest/globals';
import orderConfig from '../../../src/integration/engine/order/order.config.json';

describe('order.config.json - memoryManagement (ADR-0005 Karar 3)', () => {
    it('[YENİ DAVRANIŞ] removeOnComplete: {age:86400, count:1000}; removeOnFail: {count:500}', () => {
        expect(orderConfig.memoryManagement).toEqual({
            removeOnComplete: { age: 86400, count: 1000 },
            removeOnFail: { count: 500 },
        });
    });

    it('[YENİ DAVRANIŞ, ADR-0005 Karar 7] syncIntervalMs artık 60000 (60 sn) -- eskiden 20000 (20 sn)', () => {
        expect(orderConfig.syncIntervalMs).toBe(60000);
    });

    it('[YENİ DAVRANIŞ, ADR-0005 Karar 7] kaynak başına polling aralıkları: iade 15dk, finans 6sa, mesaj 5dk', () => {
        expect(orderConfig.claimSync.intervalMs).toBe(15 * 60 * 1000);
        expect(orderConfig.financeSync.intervalMs).toBe(6 * 60 * 60 * 1000);
        expect(orderConfig.messageSync.intervalMs).toBe(5 * 60 * 1000);
    });

    it('[YENİ DAVRANIŞ, ADR-0005 Karar 7] günlük tam süpürme pencereleri: iade 32 gün, finans 30 gün', () => {
        expect(orderConfig.claimSync.fullSweepWindowDays).toBe(32);
        expect(orderConfig.financeSync.fullSweepWindowDays).toBe(30);
        expect(orderConfig.claimSync.fullSweepIntervalMs).toBe(24 * 60 * 60 * 1000);
        expect(orderConfig.financeSync.fullSweepIntervalMs).toBe(24 * 60 * 60 * 1000);
    });

    it('[YENİ DAVRANIŞ, ADR-0005 adım 2] sipariş imleç örtüşmesi 5 dk (300000ms)', () => {
        expect(orderConfig.orderSync.cursorOverlapMs).toBe(5 * 60 * 1000);
    });
});
