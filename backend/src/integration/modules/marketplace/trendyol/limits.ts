// Trendyol oran limiti + sipariş V2 sorgu sınırları — TEK YERDE SABİT.
// Kaynak: docs/research/2026-09-28-trendyol-v2-migration-spec.md §2.1 (sipariş V2 sınırları) ve §3.7 (oran limitleri).
//
// [ADR-0020 Aşama A, 2026-09-29] Varsayılan (env yokken kullanılan) değerin KAYNAĞI kataloğa taşındı:
// `trendyolGlobalRatePerMin`/`trendyolOrderListRatePerMin` artık `catalog/integrationHttp.ts`teki
// `resilience.ratePerMin`/`resilience.trendyol.orderListRatePerMin` varsayılanını okur (bkz. `catalogDefault`
// altta). BİLİNÇLİ SEÇİM: `ConfigResolver.getSetting()` DEĞİL, yalnız katalog `default`'unu okuyan yerel bir
// yardımcı kullanılır — çünkü `getSetting()`'in `envLock` katmanı TY_RATE_PER_MIN/TY_ORDER_LIST_RATE_PER_MIN'i
// KENDİSİ de okur ama bu adaptöre özgü `positiveIntEnv` (tamsayı + pozitiflik) doğrulamasını UYGULAMAZ; iki
// katmanı birlikte kullanmak geçersiz env değerlerinde (ör. `TY_RATE_PER_MIN=-1`) YANLIŞ sonuç üretirdi
// (bkz. tests/characterization/trendyol-orders/Trendyol.orderV2.behavior.test.ts "geçersiz değer varsayılana
// düşer"). Bu yüzden env okuma/doğrulama YİNE `positiveIntEnv` ile burada yapılır (davranış BİREBİR AYNI);
// yalnız "env yoksa ne olur" sorusunun cevabı artık kataloğa bakar.
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { sleep } from '@integration/modules/common/http/RateLimiter';
import { getSettingDef } from '@integration/config/catalog';
import { isPerIntegrationDefault } from '@integration/config/types';

/** Yalnız katalog `default` katmanını okur (env/tenant/platform'u ASLA görmez) — bkz. dosya başı notu. */
function catalogDefault(key: string, integrationCode: string): number {
    const def = getSettingDef(key);
    if (!def) throw new Error(`[Trendyol limits] Bilinmeyen katalog anahtarı: ${key}`);
    if (isPerIntegrationDefault<number>(def.default)) {
        return Object.prototype.hasOwnProperty.call(def.default, integrationCode)
            ? (def.default as any)[integrationCode]
            : (def.default as any)._;
    }
    return def.default as number;
}

/** Sipariş V2 (GET .../v2/orders) sorgu sınırları (spec §2.1). */
export const TRENDYOL_ORDER_V2 = {
    /** `size` üst sınırı. */
    pageSize: 200,
    /** `size=200` iken güvenli son sayfa indeksi (0..49 => 10.000 kayıt). */
    maxPageIndex: 49,
    /** maxQueryWindowResult: bir sorgu penceresinden okunabilecek en fazla paket. Aşılırsa pencere daraltılır. */
    maxWindowResults: 10_000,
    /**
     * startDate/endDate aralığı en fazla 2 hafta. Sınır dahil/hariç belirsiz olduğundan 1 dk pay bırakılır.
     */
    maxWindowMs: 14 * 24 * 60 * 60 * 1000 - 60 * 1000,
    /** Sorgulanabilir en eski an: yalnızca SON 1 AY (30 gün; sınır belirsiz olduğundan 1 sa pay). */
    maxLookbackMs: 30 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
    /** Tarih verilmediğinde Trendyol "son 1 hafta" döner; taşma bölmesi için bu pencere açık yazılır. */
    defaultWindowMs: 7 * 24 * 60 * 60 * 1000,
    /** Daha dar bölünemeyen pencere (bu kadar dar pencerede >10.000 paket beklenmez; aşılırsa hata). */
    minSplitMs: 60 * 1000,
} as const;

/**
 * [INT-05] İade listesi (GET .../claims) sayfalama güvenliği. size=50 sabit; resmi bir sayfa/pencere üst sınırı belgelenmemiş
 * (API_CONTRACTS:22), bu yüzden sipariş V2 ile tutarlı 50 sayfa (maxPageIndex 49 + 1) tavan alınır (= 10.000 iade/sorgu penceresi; WP4 C-7 ile size 200).
 * Aşılırsa sonuç PAGINATION_PAGE_CAP ile işaretlenir (imleç ilerlemez). Eşzamanlılık 3: X1 grup kotasını patlatmadan hız.
 */
export const TRENDYOL_CLAIM_PAGING = { maxPages: TRENDYOL_ORDER_V2.maxPageIndex + 1, concurrency: 3 } as const;

/**
 * Muhafazakâr taban (spec §3.7): sipariş çekme için resmi kaynaklar ÇELİŞİYOR (kademeli tablo 30/40/50/100/100 istek/dk
 * vs. servis sayfasında 1000/dk). En düşük kademe (50K listeleme kapasitesi) = 30 istek/dk alınır.
 */
export const DEFAULT_ORDER_LIST_RATE_PER_MIN = 30;

/**
 * Trendyol HTTP istemcisinin GENEL (tüm servis grupları için ortak) oran tavanı. Servis grupları (ürün yazma 200/dk,
 * stok-fiyat 350/dk, okuma 1000/dk — en düşük kademe) için en düşük ortak değer 200'dür; ESKİ 1800 tüm kademelerin
 * çok üstündeydi (spec R8). Sipariş çekme bu tavandan bağımsız, ayrıca 30/dk ile sınırlanır (bkz. OrderListPacer).
 */
export const DEFAULT_GLOBAL_RATE_PER_MIN = 200;

function positiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * [ADR-0020 Aşama A] Varsayılan (env yokken/geçersizken) artık katalogdan okunur (`resilience.ratePerMin`
 * trendyol varsayılanı — bugün 200, `DEFAULT_GLOBAL_RATE_PER_MIN` ile AYNI, katalog tutarlılık testiyle
 * doğrulanır). Env okuma/doğrulama (TY_RATE_PER_MIN, pozitif tamsayı) DEĞİŞMEDİ.
 */
export function trendyolGlobalRatePerMin(): number {
    return positiveIntEnv('TY_RATE_PER_MIN', catalogDefault('resilience.ratePerMin', 'trendyol'));
}

/**
 * [ADR-0020 Aşama A] Varsayılan (env yokken/geçersizken) artık katalogdan okunur
 * (`resilience.trendyol.orderListRatePerMin` — bugün 30, `DEFAULT_ORDER_LIST_RATE_PER_MIN` ile AYNI).
 * Env okuma/doğrulama (TY_ORDER_LIST_RATE_PER_MIN, pozitif tamsayı) DEĞİŞMEDİ.
 */
export function trendyolOrderListRatePerMin(): number {
    return positiveIntEnv('TY_ORDER_LIST_RATE_PER_MIN', catalogDefault('resilience.trendyol.orderListRatePerMin', 'trendyol'));
}

/**
 * Sipariş listesi sayfa çekimi için satıcı başına sıralı aralık: art arda iki GET arasında en az 60000/ratePerMin ms.
 * Süreç-içi (tek worker); ilk istek beklemez, patlama (burst) yoktur.
 */
class OrderListPacer {
    private nextAllowedAt = new Map<string, number>();

    public async wait(key: string, ratePerMin: number): Promise<void> {
        const interval = ResilientHttpClient.scaleDelayMs(60_000 / ratePerMin);
        const now = Date.now();
        const at = Math.max(now, this.nextAllowedAt.get(key) ?? 0);
        this.nextAllowedAt.set(key, at + interval);
        if (at - now > 0) await sleep(at - now);
    }

    public reset(): void { this.nextAllowedAt.clear(); }
}

export const orderListPacer = new OrderListPacer();

// ---------------------------------------------------------------------------------------------------------------------
// [ADR-0030 X1] Servis grubu kovaları (Trendyol 14 Eyl 2026 limitleri: docs/research/API_CONTRACTS_2026-09-30.md:16,
// https://developers.trendyol.com/docs/1-servis-limitleri.md). Limitler satıcının ürün sayısı kademesine bağlıdır.
// KADEME SEÇİMİ İNSAN KARARI BEKLİYOR (gap raporu §5-3): tenant başına kademe ayarı yok; ORKESTRATÖR VARSAYILANI en muhafazakâr
// 50K kademesidir. Diğer kademeler için kaynakta yalnız aralık var (okuma 1000-2000, ürün yazma 200-600, stok-fiyat 350-2000);
// kesin kademe değerleri doğrulanamadığından tabloya EKLENMEDİ (uydurma yok) — env ile grup bazında yükseltilebilir.
// Gruplu çağrılar YALNIZ kendi kovasından geçer (genel 200/dk kovasını tüketmez); toplam tavan = grup kovaları toplamı.
// ---------------------------------------------------------------------------------------------------------------------
export type TrendyolRateGroup = 'product_read' | 'product_write' | 'inventory_price_write';

/** 50K kademesi (en muhafazakâr) — orkestratör varsayılanı. */
export const TRENDYOL_GROUP_RATE_PER_MIN_50K: Readonly<Record<TrendyolRateGroup, number>> = {
    product_read: 1000,
    product_write: 200,
    inventory_price_write: 350,
};

const GROUP_ENV: Readonly<Record<TrendyolRateGroup, string>> = {
    product_read: 'TY_RATE_PRODUCT_READ_PER_MIN',
    product_write: 'TY_RATE_PRODUCT_WRITE_PER_MIN',
    inventory_price_write: 'TY_RATE_INVENTORY_PRICE_PER_MIN',
};

/** Grup başına dk limiti: env (pozitif tamsayı) yoksa/geçersizse 50K kademe varsayılanı. */
export function trendyolGroupRatePerMin(): Record<TrendyolRateGroup, number> {
    const out = {} as Record<TrendyolRateGroup, number>;
    for (const g of Object.keys(TRENDYOL_GROUP_RATE_PER_MIN_50K) as TrendyolRateGroup[]) {
        out[g] = positiveIntEnv(GROUP_ENV[g], TRENDYOL_GROUP_RATE_PER_MIN_50K[g]);
    }
    return out;
}

/** Ürün yazma URL'sinden servis grubu: stok-fiyat ucu ayrı kovadır, diğer ürün yazmaları `product_write`. */
export function trendyolWriteGroupForUrl(url: string): TrendyolRateGroup {
    return /price-and-inventory/i.test(url) ? 'inventory_price_write' : 'product_write';
}

/** Barkod başına fiyat güncelleme sınırı: 30/dk (50K ve diğer kademelerde aynı; API_CONTRACTS:16). */
export const TRENDYOL_PRICE_PER_BARCODE_PER_MIN = 30;

/**
 * Barkod başına kayan-pencere (60 sn) fiyat yazım sayacı, süreç-içi (tek replika). `reserve` çağrısı bir slot ayırır ve slot
 * boşalana dek beklenmesi gereken ms'yi döner (0 = hemen gönderilebilir). Reddetmez/düşürmez: çağıran ertelemeyi uygular.
 */
export class BarcodePriceGate {
    private stamps = new Map<string, number[]>();
    constructor(private readonly perMin = TRENDYOL_PRICE_PER_BARCODE_PER_MIN, private readonly windowMs = 60_000) { }

    public reserve(key: string, now = Date.now()): number {
        const arr = (this.stamps.get(key) ?? []).filter(t => now - t < this.windowMs);
        let at = now;
        if (arr.length >= this.perMin) at = arr[arr.length - this.perMin] + this.windowMs;
        arr.push(at);
        this.stamps.set(key, arr);
        if (this.stamps.size > 20_000) this.gc(now);
        return Math.max(0, at - now);
    }

    private gc(now: number): void {
        for (const [k, a] of this.stamps) if (a.every(t => now - t >= this.windowMs)) this.stamps.delete(k);
    }

    public reset(): void { this.stamps.clear(); }
}

export const barcodePriceGate = new BarcodePriceGate();

/**
 * [COM-03] Finans (settlements/otherfinancials) servis grubu: resmi limit 100 istek/dk (docs/research/API_CONTRACTS_2026-09-30.md:16,
 * "Finance 100"; kademeye bagli aralik belirtilmemis). Ayri kova: finans taramasi siparis/urun kovalarini tuketmez.
 * TODO: kademe/limit degisirse buradan guncelle (env dugmesi bilincli EKLENMEDI).
 */
export const TRENDYOL_FINANCE_GROUP = 'finance';
export const TRENDYOL_FINANCE_RATE_PER_MIN = 100;
/** Finans istekleri `storeFrontCode` basligini ZORUNLU tutar (resmi belge); bu entegrasyon yalnizca Turkiye magazasini kapsar. */
export const TRENDYOL_STOREFRONT_CODE = 'TR';

/**
 * [eslesme-fiyat WP4, D-TY-2] Ek servis grubu kovaları (02-ekler/trendyol.md C-3/C-7, §soru): marka/kategori okuma 50/dk,
 * iade onay/red 5/dk, soru cevaplama 500/dk. Gruplu çağrılar yalnız kendi kovasından geçer (genel 200/dk kovasını tüketmez).
 * Kademe bağımsız resmî değerler; env düğmesi bilinçli eklenmedi (finans kovası ile aynı yaklaşım).
 */
export const TRENDYOL_EXTRA_GROUP_RATE_PER_MIN = {
    brand_category_read: 50,
    claim_action: 5,
    qna_answer: 500,
} as const;
export type TrendyolExtraRateGroup = keyof typeof TRENDYOL_EXTRA_GROUP_RATE_PER_MIN;

/** [D-TY-4] Marka listesi sayfa boyutu: resmî aralık 1000–2000 (500 geçersiz). */
export const TRENDYOL_BRAND_PAGE_SIZE = 1000;
/** [C-2] Özellik değerleri ucu sayfalı: `size` ≤ 1000; güvenlik tavanı 50 sayfa (50.000 değer). */
export const TRENDYOL_ATTRIBUTE_VALUE_PAGING = { size: 1000, maxPages: 50 } as const;
/** [C-7] İade listesi: resmî azami `size` 200 (eski 50). */
export const TRENDYOL_CLAIM_PAGE_SIZE = 200;
