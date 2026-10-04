// INT-05 (HB) karakterizasyon: sipariş/iade DIŞINDAKİ okuma uçları (F-02 kalan yerler). HTTP sahte (ağ YOK).
// (A) testleri F-02 düzeltmesinden ÖNCE yazıldı ve ilk sayfa davranışını sabitler (aynen yeşil kalır). "[F-02 DÜZELTİLDİ]" etiketli testler
// önceki "tek sayfa / sessiz kesme" davranışını BİLİNÇLİ olarak tersine çevirir (INT-05). Mapper davranışı değişmez.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { captureLogs, LogCapture } from '../../helpers/logCapture';
import { ProductService } from '@integration/modules/marketplace/hepsiburada/services/ProductService';
import { FinancialConnector } from '@integration/modules/marketplace/hepsiburada/api/FinancialConnector';
import { QuestionService } from '@integration/modules/marketplace/hepsiburada/services/QuestionService';
import { CategoryConnector } from '@integration/modules/marketplace/hepsiburada/api/CategoryConnector';
import { CategoryService } from '@integration/modules/marketplace/hepsiburada/services/CategoryService';

const params = { clientId: 7, integrationSettings: { settings: { MERCHANTID: 'M-1', SELLERID: 'M-1' }, urls: {} } };
// [eslesme-fiyat WP3, D-HB-1] getProductsAndPersist önce katalog ucunu (all-products-of-merchant) okur: sahte servis bu ucu AYRI yanıtlar
// (boş katalog; sıradaki listing yanıtlarını tüketmez) ve `get` yalnız listing/diğer çağrıları kaydeder (sayfalama beklentileri aynen geçerli).
const catalogGet = jest.fn(async (_url: string, _q?: any) => ({ data: { success: true, data: [], totalPages: 1 } }));
const fakeService = (responses: any[]) => {
    const listingGet = jest.fn(async (_url: string, _q?: any) => {
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return { data: next };
    });
    const get = listingGet;
    const route = jest.fn(async (url: string, q?: any) => (String(url).includes('all-products-of-merchant') ? catalogGet(url, q) : listingGet(url, q)));
    return { service: { get: route } as any, get };
};
let cap: LogCapture;
beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });
const listing = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ barcode: `BC-${from + i}`, merchantSku: `SKU-${from + i}`, status: 'Active', hbSku: `HB-${from + i}` }));

describe('(A) karakterizasyon - updateProductStatuses (listing durum sorgusu)', () => {
    it('tek sayfa listing çeker: GET listings/merchantid/M-1 {limit:500, offset:0}; bulunan COMPLETED, bulunmayan WAITING', async () => {
        const { service, get } = fakeService([{ items: listing(2) }]);
        const r = await new ProductService(params, service).updateProductStatuses({ barcodes: ['BC-1', 'YOK-1'] });
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith('listings/merchantid/M-1', { limit: 500, offset: 0 });
        expect(r).toEqual([
            { matchValue: 'BC-1', barcode: 'BC-1', status: 'COMPLETED', messages: ['Ürün aktif olarak listelendi.'], mapping: { id: 'HB-1', stockcode: 'SKU-1' } },
            { matchValue: 'YOK-1', barcode: 'YOK-1', status: 'WAITING', messages: ['Ürün HB listingde henüz bulunamadı.'] },
        ]);
    });
    it('matchValues barcodes\'a üstündür; merchantSku ile de eşleşir', async () => {
        const { service } = fakeService([{ items: listing(1) }]);
        const r = await new ProductService(params, service).updateProductStatuses({ barcodes: ['x'], matchValues: ['SKU-0'] });
        expect(r[0]).toMatchObject({ matchValue: 'SKU-0', status: 'COMPLETED' });
    });
    it('Active olmayan ürün WAITING (onay bekliyor)', async () => {
        const { service } = fakeService([{ items: [{ barcode: 'BC-9', status: 'Passive' }] }]);
        const r = await new ProductService(params, service).updateProductStatuses({ barcodes: ['BC-9'] });
        expect(r[0]).toMatchObject({ status: 'WAITING', messages: ['Ürün onay bekliyor.'] });
    });
    it('hata fırlatılır ([] yutulmaz)', async () => {
        const { service } = fakeService([new Error('boom')]);
        await expect(new ProductService(params, service).updateProductStatuses({ barcodes: ['a'] })).rejects.toThrow('boom');
    });
    it('[F-02 DÜZELTİLDİ] listing 500 kayıttan büyükse TÜM sayfalar taranır (offset 0/500); ikinci sayfadaki ürün COMPLETED', async () => {
        const { service, get } = fakeService([{ items: listing(500), totalCount: 800 }, { items: listing(300, 500), totalCount: 800 }]);
        const r = await new ProductService(params, service).updateProductStatuses({ barcodes: ['BC-700'] });
        expect(get.mock.calls.map(c => c[1])).toEqual([{ limit: 500, offset: 0 }, { limit: 500, offset: 500 }]);
        expect(r[0]).toMatchObject({ status: 'COMPLETED', mapping: { id: 'HB-700' } });
    });
    it('[F-02 DÜZELTİLDİ] tarama tavanına (20 sayfa) ulaşılırsa bulunamayan WAITING + "eksik olabilir" mesajı + uyarı (sessiz değil)', async () => {
        const pages = Array.from({ length: 25 }, (_, i) => ({ items: listing(500, i * 500), totalCount: 99999 }));
        const { service, get } = fakeService(pages);
        const r = await new ProductService(params, service).updateProductStatuses({ barcodes: ['YOK'] });
        expect(get).toHaveBeenCalledTimes(20);
        expect(r[0].status).toBe('WAITING');
        expect(r[0].messages[0]).toContain('eksik olabilir');
        expect(cap.find(l => l.code === 'PAGINATION_RECORD_CAP')).toBeDefined(); // 20 x 500 = 10.000 kayıt tavanı sayfa tavanıyla aynı anda dolar
    });
});

describe('(A) karakterizasyon - getProductsAndPersist (streamProducts)', () => {
    const chunks = () => { const c: any[][] = []; return { c, cb: async (x: any[]) => { c.push(x); } }; };
    it('totalCount verilince sayfa sayfa akar: limit 100, offset 0/100; sayaç ve totalPages', async () => {
        const { service, get } = fakeService([{ items: listing(100), totalCount: 130 }, { items: listing(30, 100), totalCount: 130 }]);
        const { c, cb } = chunks();
        const r = await new ProductService(params, service).getProductsAndPersist(cb);
        expect(get.mock.calls.map(x => x[1])).toEqual([{ limit: 100, offset: 0 }, { limit: 100, offset: 100 }]);
        expect(c.map(x => x.length)).toEqual([100, 30]);
        expect(r).toEqual({ totalElements: 130, totalProcessed: 130, totalPages: 2, status: 'COMPLETED' });
    });
    it('boş sayfa akışı bitirir', async () => {
        const { service } = fakeService([{ items: [] }]);
        const { c, cb } = chunks();
        const r = await new ProductService(params, service).getProductsAndPersist(cb);
        expect(c).toHaveLength(0);
        expect(r).toEqual({ totalElements: 0, totalProcessed: 0, totalPages: 1, status: 'COMPLETED' });
    });
    it('[F-02 DÜZELTİLDİ] totalCount YOKSA dolu sayfadan sonra devam eder, kısa sayfada durur (önceden ilk sayfada kesiliyordu)', async () => {
        const { service, get } = fakeService([{ items: listing(100) }, { items: listing(100, 100) }, { items: listing(7, 200) }]);
        const { c, cb } = chunks();
        const r = await new ProductService(params, service).getProductsAndPersist(cb);
        expect(get).toHaveBeenCalledTimes(3);
        expect(c.map(x => x.length)).toEqual([100, 100, 7]);
        expect(r).toEqual({ totalElements: 207, totalProcessed: 207, totalPages: 3, status: 'COMPLETED' });
    });
    it('[F-02 DÜZELTİLDİ] sunucu offset yok sayıp aynı sayfayı dönerse sonsuz döngü yok: FAILED + hata, işlenen sayfa korunur', async () => {
        const same = listing(100);
        const { service, get } = fakeService([{ items: same }, { items: same }, { items: same }]);
        const { c, cb } = chunks();
        const r = await new ProductService(params, service).getProductsAndPersist(cb);
        expect(get).toHaveBeenCalledTimes(2);
        expect(c).toHaveLength(1);
        expect(r.status).toBe('FAILED');
        expect(r.error).toContain('PAGINATION_REPEATED_PAGE');
    });
    it('[F-02 DÜZELTİLDİ] çağıranın süzgeç query değeri ilk sayfadan itibaren aktarılır; limit/offset sayfalamaya aittir', async () => {
        const { service, get } = fakeService([{ items: listing(1) }]);
        await new ProductService(params, service).getProductsAndPersist(async () => undefined, { status: 'Active' });
        expect(get).toHaveBeenCalledWith('listings/merchantid/M-1', { status: 'Active', limit: 100, offset: 0 });
    });
    it('hata fırlatılır', async () => {
        const { service } = fakeService([new Error('x')]);
        await expect(new ProductService(params, service).getProductsAndPersist(async () => undefined)).rejects.toThrow('x');
    });
});

describe('[K-1 DÜZELTİLDİ] FinancialConnector.fetchTransactions — mpfinance `transactions` (eski settlements canlıda 404)', () => {
    // ÖNCEKİ: tek GET settlements/merchantid/M-1 {startDate,endDate YYYY-MM-DD}, ilk istek limit/offset'siz.
    // ŞİMDİ: GET transactions/merchantid/M-1; PascalCase Offset/Limit her istekte; tarih çifti ≤28 günlük dilimlere bölünür.
    it('tek dilim: GET transactions/merchantid/M-1 {RecordDateStart, RecordDateEnd, Offset:0, Limit:100}; items okunur', async () => {
        const { service, get } = fakeService([{ items: [{ transactionId: 'T1' }], totalCount: 1 }]);
        const r = await new FinancialConnector(service, params).fetchTransactions({ startDate: '2026-01-02T10:00:00Z', endDate: '2026-01-20T10:00:00Z' });
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith('transactions/merchantid/M-1', { RecordDateStart: '2026-01-02', RecordDateEnd: '2026-01-20', Offset: 0, Limit: 100 });
        expect(r).toEqual([{ transactionId: 'T1' }]);
    });
    it('30 günlük pencere iki dilime bölünür (≤1 ay kısıtı); dilimler örtüşmez; TransactionTypes virgülle', async () => {
        const { service, get } = fakeService([{ items: [{ transactionId: 'A' }] }, { items: [{ transactionId: 'B' }] }]);
        const r = await new FinancialConnector(service, params).fetchTransactions({ startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-30T00:00:00Z', transactionTypes: ['Payment', 'Commission'] });
        expect(get.mock.calls.map(c => c[1])).toEqual([
            { TransactionTypes: 'Payment,Commission', RecordDateStart: '2026-01-01', RecordDateEnd: '2026-01-28', Offset: 0, Limit: 100 },
            { TransactionTypes: 'Payment,Commission', RecordDateStart: '2026-01-29', RecordDateEnd: '2026-01-30', Offset: 0, Limit: 100 },
        ]);
        expect(r.map((x: any) => x.transactionId)).toEqual(['A', 'B']);
    });
    it('dilimler arası aynı transactionId tekilleşir; gövde dizi ise aynen; gövde yoksa []', async () => {
        const dup = await new FinancialConnector(fakeService([{ items: [{ transactionId: 'X' }] }, { items: [{ transactionId: 'X' }, { transactionId: 'Y' }] }]).service, params)
            .fetchTransactions({ startDate: '2026-01-01T00:00:00Z', endDate: '2026-01-30T00:00:00Z' });
        expect(dup.map((x: any) => x.transactionId)).toEqual(['X', 'Y']);
        expect(await new FinancialConnector(fakeService([[{ id: 2 }]]).service, params).fetchTransactions({ startDate: '2026-01-01', endDate: '2026-01-01' })).toEqual([{ id: 2 }]);
        expect(await new FinancialConnector(fakeService([undefined]).service, params).fetchTransactions({ startDate: '2026-01-01', endDate: '2026-01-01' })).toEqual([]);
    });
    it('100 kayıt dolu dönerse sonraki sayfa Offset=100 ile istenir', async () => {
        const { service, get } = fakeService([{ items: Array.from({ length: 100 }, (_, i) => ({ transactionId: i })) }, { items: [{ transactionId: 999 }] }]);
        const r = await new FinancialConnector(service, params).fetchTransactions({ startDate: '2026-01-01', endDate: '2026-01-01' });
        expect(get.mock.calls.map(c => [c[1].Offset, c[1].Limit])).toEqual([[0, 100], [100, 100]]);
        expect(r).toHaveLength(101);
        expect(getIncomplete(r)).toBeUndefined();
    });
    it('sunucu Offset yok sayarsa tekrar yakalanır + incomplete (birleşik sonuca taşınır)', async () => {
        const same = Array.from({ length: 10 }, (_, i) => ({ transactionId: i }));
        const { service, get } = fakeService([{ items: same, totalCount: 50 }, { items: same, totalCount: 50 }]);
        const r = await new FinancialConnector(service, params).fetchTransactions({ startDate: '2026-01-01', endDate: '2026-01-01' });
        expect(get).toHaveBeenCalledTimes(2);
        expect(r).toHaveLength(10);
        expect(getIncomplete(r)).toMatchObject({ incomplete: true, reason: 'PAGINATION_REPEATED_PAGE' });
    });
});

describe('(A) karakterizasyon - QuestionService.fetchQuestions', () => {
    it('tek GET questions/merchantid/M-1 (sorgu aynen geçer); items okunur', async () => {
        const { service, get } = fakeService([{ items: [{ id: 5, text: 'Soru', status: 'WaitingForAnswer' }] }]);
        const r = await new QuestionService(params, service).fetchQuestions({ status: 'WaitingForAnswer' });
        expect(get).toHaveBeenCalledWith('questions/merchantid/M-1', { status: 'WaitingForAnswer' });
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ externalMessageId: '5', text: 'Soru' });
    });
    it('[F-02 DÜZELTİLDİ] 100 kayıt dolu dönerse ikinci sayfa istenir (ilk istek değişmedi; sorgu korunur)', async () => {
        const { service, get } = fakeService([{ items: Array.from({ length: 100 }, (_, i) => ({ id: i })) }, { items: [{ id: 1000 }] }]);
        const r = await new QuestionService(params, service).fetchQuestions({ status: 'Answered' });
        expect(get.mock.calls.map(c => c[1])).toEqual([{ status: 'Answered' }, { status: 'Answered', limit: 100, offset: 100 }]);
        expect(r).toHaveLength(101);
    });
    it('dizi gövde ve sorgusuz çağrı: ilk istek sorgu undefined ile (eski davranış)', async () => {
        const { service, get } = fakeService([[{ id: 1 }]]);
        const r = await new QuestionService(params, service).fetchQuestions();
        expect(get).toHaveBeenCalledWith('questions/merchantid/M-1', undefined);
        expect(r).toHaveLength(1);
    });
});

describe('(A) karakterizasyon - kategori listesi / öznitelik değerleri sayfalama', () => {
    it('kategori: totalPages kadar sayfa (?page=N); data birleştirilir', async () => {
        const { service, get } = fakeService([{ data: [{ categoryId: 1 }], totalPages: 2 }, { data: [{ categoryId: 2 }], totalPages: 2 }]);
        const r = await new CategoryConnector(service, params).fetchCategoriesFromPlatform();
        expect(get.mock.calls.map(c => c[0])).toEqual([
            'product/api/categories/get-all-categories?page=0', 'product/api/categories/get-all-categories?page=1']);
        expect(r).toEqual([{ categoryId: 1 }, { categoryId: 2 }]);
    });
    it('kategori: doğrudan dizi gövde ilk sayfada aynen döner', async () => {
        const r = await new CategoryConnector(fakeService([[{ categoryId: 9 }]]).service, params).fetchCategoriesFromPlatform();
        expect(r).toEqual([{ categoryId: 9 }]);
    });
    it('kategori: 200 sayfa bildirilirse 200 istek (tavan 500 altında; davranış değişmedi)', async () => {
        const pages = Array.from({ length: 200 }, (_, i) => ({ data: [{ categoryId: i }], totalPages: 200 }));
        const { service, get } = fakeService(pages);
        const r = await new CategoryConnector(service, params).fetchCategoriesFromPlatform();
        expect(get).toHaveBeenCalledTimes(200);
        expect(r).toHaveLength(200);
    });
    it('[F-02 DÜZELTİLDİ] kategori: sunucu 600 sayfa bildirirse 500 de durur ve kısmi liste DÖNMEZ (VALIDATION/CATALOG_PAGE_CAP; 6 sa önbellek zehirlenmez)', async () => {
        const pages = Array.from({ length: 600 }, (_, i) => ({ data: [{ categoryId: i }], totalPages: 600 }));
        const { service, get } = fakeService(pages);
        await expect(new CategoryConnector(service, params).fetchCategoriesFromPlatform())
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'CATALOG_PAGE_CAP' });
        expect(get).toHaveBeenCalledTimes(500);
    });
    it('öznitelik değerleri: totalPages kadar sayfa, birleştirilir', async () => {
        const pages = Array.from({ length: 3 }, (_, i) => ({ data: [{ id: i, name: `V${i}` }], totalPages: 3 }));
        const { service, get } = fakeService(pages);
        const cs = new CategoryService(params, service);
        (cs as any).mapper = { toInternalAttributeValues: (x: any[]) => x };
        const r = await cs.fetchCategoryAttributeValues('10', '20');
        expect(get).toHaveBeenCalledTimes(3);
        expect(r).toHaveLength(3);
        expect(getIncomplete(r)).toBeUndefined();
    });
    it('[F-02 DÜZELTİLDİ] öznitelik değerleri: 50 sayfa tavanında kesilir AMA sessiz değil (uyarı + incomplete işareti)', async () => {
        const pages = Array.from({ length: 80 }, (_, i) => ({ data: [{ id: i, name: `V${i}` }], totalPages: 80 }));
        const { service, get } = fakeService(pages);
        const cs = new CategoryService(params, service);
        (cs as any).mapper = { toInternalAttributeValues: (x: any[]) => x };
        const r = await cs.fetchCategoryAttributeValues('10', '20');
        expect(get).toHaveBeenCalledTimes(50);
        expect(r).toHaveLength(50);
        expect(getIncomplete(r)).toMatchObject({ reason: 'PAGINATION_PAGE_CAP' });
        expect(cap.find(l => l.code === 'PAGINATION_PAGE_CAP')).toBeDefined();
    });
});
