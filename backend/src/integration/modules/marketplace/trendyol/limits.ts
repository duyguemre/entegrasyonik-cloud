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
    /** Tarih verilmediğinde Trendyol "son 1 hafta" döner; taşma bölmesi için bu pencere açık yazılır. */
    defaultWindowMs: 7 * 24 * 60 * 60 * 1000,
    /** Daha dar bölünemeyen pencere (bu kadar dar pencerede >10.000 paket beklenmez; aşılırsa hata). */
    minSplitMs: 60 * 1000,
} as const;

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
