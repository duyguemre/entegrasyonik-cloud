/**
 * Trendyol ÜRÜN/KATALOG tarafı sabitleri — TEK YER (BACKLOG C22; kaynak:
 * docs/research/2026-09-28-trendyol-v2-migration-spec.md §3, §3.7).
 *
 * TODO(ADR-0020): oran limitleri satıcının listeleme kapasitesi kademesine (50K/75K/150K/500K/sınırsız)
 * bağlıdır; ADR-0020 (entegrasyon oran/kota politikası) yazıldığında tenant başına yapılandırılabilir
 * olacak. Şimdilik en MUHAFAZAKÂR (50K) taban değerler tutulur. `Service.ts`'teki `ratePerMin: 1800`
 * bu değerlerin çok üstündedir (spec R8) — o dosyanın düzeltilmesi sipariş tarafı ajanının/orkestratörün
 * işidir; bu sabitler yalnızca ürün tarafı kararlarında (sayfalama/parça boyutu) kullanılır.
 */
export const TRENDYOL_PRODUCT_LIMITS = {
    /** Aktarma/güncelleme/stok-fiyat isteği başına en fazla kalem (spec §3.1/§3.3/§3.5). */
    MAX_ITEMS_PER_WRITE_REQUEST: 1000,

    /** Ürün filtreleme (V2) sayfalama sınırları (spec §3.6). */
    FILTER: {
        APPROVED_PAGE_SIZE: 100,
        UNAPPROVED_PAGE_SIZE: 1000,
        /** `page * size <= 10.000`; aşımda `nextPageToken` kullanılır. */
        MAX_WINDOW: 10000,
        /** `barcodes` filtresi istek başına en fazla. */
        BARCODES_PER_REQUEST: 50,
        /** `barcodes` ile onaysız listede arama yapılırken taranacak en fazla sayfa (filtre desteği belirsiz). */
        UNAPPROVED_LOOKUP_MAX_PAGES: 3,
    },

    /** Yalnızca belgeleme/gelecek limitleyici için (50K kademesi); henüz zorlanmıyor — bkz. TODO(ADR-0020). */
    RATE_PER_MIN_TIER_50K: {
        PRODUCT_READ: 1000,
        PRODUCT_WRITE_GROUP: 200,
        STOCK_PRICE_WRITE: 350,
        PRICE_PER_BARCODE: 30,
    },

    /** "Aynı gövde 15 dk içinde tekrar gönderilemez" (yalnız stok/fiyat servisi). Engel StockPublishTrigger'da. */
    SAME_BODY_COOLDOWN_MS: 15 * 60 * 1000,

    /** Batch sonuçları işlemden sonra yalnızca ~4 saat görüntülenebilir (spec §3.4). */
    BATCH_RESULT_RETENTION_MS: 4 * 60 * 60 * 1000,
};

/**
 * `origin` (menşe, 2 harfli ISO ülke kodu) zorunluluğunun başladığı an: 23 Ekim 2026 00:00 (TR, UTC+3).
 * Bu tarihe kadar alan opsiyoneldir (kategori için zorunlu bir attribute ise menşe attributes altından
 * gitmeye devam eder); sonrasında ürün aktarımında zorunludur (changelog 17.08.2026, spec §3.2).
 */
export const TRENDYOL_ORIGIN_REQUIRED_FROM_MS = Date.parse('2026-10-23T00:00:00+03:00');

/** `origin` biçimi: 2 harfli ülke kodu (ör. TR, US). */
export const TRENDYOL_ORIGIN_PATTERN = /^[A-Za-z]{2}$/;

/** Ürün V2 alan sınırları (resmi: developers.trendyol.com ürün-yaratma-v2, API_CONTRACTS_2026-09-30 §1). */
export const TRENDYOL_FIELD_LIMITS = {
    barcode: 40, title: 100, productMainId: 40, description: 30000, stockCode: 100, lotNumber: 100, images: 8,
} as const;

/** Geçerli KDV oranları (V2). */
export const TRENDYOL_VAT_RATES: ReadonlyArray<number> = [0, 1, 10, 20];
