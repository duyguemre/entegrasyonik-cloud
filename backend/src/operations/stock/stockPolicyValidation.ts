/**
 * ADR-0004 Karar 5/6/7: stok politikası girdi doğrulaması (SAF fonksiyonlar; DB/ağ yok).
 *
 * Kanal başına (`ClientIntegrations.marketplace[].settings.stockPolicy`) alanlar ve sınırları:
 *   bufferUnits        tamsayı  0..STOCK_POLICY_LIMITS.bufferUnitsMax    (varsayılan, birincil olmayan kanal: 1)
 *   bufferPercent      sayı     0..100                                    (varsayılan 0)
 *   safetyStock        tamsayı  0..STOCK_POLICY_LIMITS.safetyStockMax     (varsayılan 0 = bugünkü davranış; kanala yayın = max(0, stok - safetyStock))
 *   graceMinutes       tamsayı  0..STOCK_POLICY_LIMITS.graceMinutesMax    (varsayılan 30)
 *   autoCancelOversold boolean                                            (varsayılan true; kanalın iptal yeteneği yoksa uygulanmaz)
 * Alan değeri `null` = "bu alanı varsayılana döndür" (DB'den $unset edilir).
 *
 * `autoRestock` KASITLI olarak kabul EDİLMEZ: `IStockPolicy`'de tanımlı olsa da hiçbir tüketici okumuyor (StockAllocator
 * notu: restock kararı çağıranın sorumluluğu ve henüz bağlanmadı) — yazılabilir yapmak, etkisiz bir ayar sunmak olurdu.
 */

export const CHANNEL_STOCK_POLICY_FIELDS = ['bufferUnits', 'bufferPercent', 'safetyStock', 'graceMinutes', 'autoCancelOversold'] as const;
export type ChannelStockPolicyField = typeof CHANNEL_STOCK_POLICY_FIELDS[number];

export const STOCK_POLICY_LIMITS = {
    bufferUnitsMax: 100000,
    bufferPercentMax: 100,
    safetyStockMax: 1_000_000,
    lowStockThresholdMax: 1_000_000,
    graceMinutesMax: 7 * 24 * 60, // 7 gün
} as const;

/** ADR-0004 varsayılanları (yalnızca FE'ye bilgi olarak dönülür; tüketiciler kendi varsayılanlarını uygular). */
export const STOCK_POLICY_DEFAULTS = {
    bufferUnits: 1,          // yalnızca birincil olmayan kanallarda; birincil kanalda 0
    bufferPercent: 0,
    safetyStock: 0,
    graceMinutes: 30,
    autoCancelOversold: true,
} as const;

export class StockPolicyValidationError extends Error {
    public readonly statusCode = 400;
    constructor(message: string) {
        super(message);
        this.name = 'StockPolicyValidationError';
    }
}

const isPlainObject = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);

export interface ValidatedChannelPolicyPatch {
    /** Yazılacak alanlar (null olmayan). */
    set: Partial<Record<ChannelStockPolicyField, number | boolean>>;
    /** Varsayılana döndürülecek (silinecek) alanlar. */
    unset: ChannelStockPolicyField[];
}

/**
 * Kısmi (patch) kanal politikasını doğrular. Bilinmeyen anahtar, yanlış tip, aralık dışı değer veya boş patch => 400.
 * Prototip kirletme anahtarları (`__proto__`, `constructor`) bilinmeyen anahtar olarak reddedilir.
 */
export function validateChannelStockPolicyPatch(input: any): ValidatedChannelPolicyPatch {
    if (!isPlainObject(input)) throw new StockPolicyValidationError('stockPolicy bir nesne olmalıdır.');
    const keys = Object.keys(input);
    if (keys.length === 0) throw new StockPolicyValidationError('stockPolicy en az bir alan içermelidir.');

    const out: ValidatedChannelPolicyPatch = { set: {}, unset: [] };
    for (const key of keys) {
        if (!(CHANNEL_STOCK_POLICY_FIELDS as ReadonlyArray<string>).includes(key)) {
            throw new StockPolicyValidationError(`Bilinmeyen stok politikası alanı: ${key.slice(0, 40)}`);
        }
        const field = key as ChannelStockPolicyField;
        const value = input[field];
        if (value === null) { out.unset.push(field); continue; }

        switch (field) {
            case 'bufferUnits':
                if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > STOCK_POLICY_LIMITS.bufferUnitsMax) {
                    throw new StockPolicyValidationError(`bufferUnits 0 ile ${STOCK_POLICY_LIMITS.bufferUnitsMax} arasında bir tamsayı olmalıdır.`);
                }
                break;
            case 'bufferPercent':
                if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > STOCK_POLICY_LIMITS.bufferPercentMax) {
                    throw new StockPolicyValidationError(`bufferPercent 0 ile ${STOCK_POLICY_LIMITS.bufferPercentMax} arasında bir sayı olmalıdır.`);
                }
                break;
            case 'safetyStock':
                if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > STOCK_POLICY_LIMITS.safetyStockMax) {
                    throw new StockPolicyValidationError(`safetyStock 0 ile ${STOCK_POLICY_LIMITS.safetyStockMax} arasında bir tamsayı olmalıdır.`);
                }
                break;
            case 'graceMinutes':
                if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > STOCK_POLICY_LIMITS.graceMinutesMax) {
                    throw new StockPolicyValidationError(`graceMinutes 0 ile ${STOCK_POLICY_LIMITS.graceMinutesMax} arasında bir tamsayı olmalıdır.`);
                }
                break;
            case 'autoCancelOversold':
                if (typeof value !== 'boolean') throw new StockPolicyValidationError('autoCancelOversold true/false olmalıdır.');
                break;
        }
        (out.set as any)[field] = value;
    }
    return out;
}

/** Kanal `integrationCode` girdisi: boş olmayan, makul uzunlukta, yalnızca [A-Za-z0-9_-] (operatör/nokta enjeksiyonu yok). */
export function validateIntegrationCode(code: any): string {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
        throw new StockPolicyValidationError('integrationCode geçersiz.');
    }
    return code;
}

/** DB'den okunan ham kanal politikasını yalnızca bilinen alanlarla, güvenli tiplerde döner. */
export function pickChannelStockPolicy(raw: any): Partial<Record<ChannelStockPolicyField, number | boolean>> {
    const out: Partial<Record<ChannelStockPolicyField, number | boolean>> = {};
    if (!isPlainObject(raw)) return out;
    if (typeof raw.bufferUnits === 'number') out.bufferUnits = raw.bufferUnits;
    if (typeof raw.bufferPercent === 'number') out.bufferPercent = raw.bufferPercent;
    if (typeof raw.safetyStock === 'number') out.safetyStock = raw.safetyStock;
    if (typeof raw.graceMinutes === 'number') out.graceMinutes = raw.graceMinutes;
    if (typeof raw.autoCancelOversold === 'boolean') out.autoCancelOversold = raw.autoCancelOversold;
    return out;
}

/**
 * Pazaryeri iptal yeteneği GERÇEK ve testli olan kanallar (OversellCompensationJob.CANCEL_SUPPORTED_CHANNELS'in salt-okunur
 * yansıması — yalnızca FE'ye "oto-iptal bu kanalda etkili mi" bilgisi vermek için). Job'daki küme değişirse
 * tests/characterization/stock/stock-policy-api.test.ts (statik eşitlik testi) kırılır.
 */
export const AUTO_CANCEL_SUPPORTED_CHANNELS: ReadonlyArray<string> = ['trendyol', 'hepsiburada', 'pazarama'];

/**
 * Tenant düzeyi düşük stok eşiği (`ClientIntegrations.stockPolicy.lowStockThreshold`). Varsayılan YOK = özellik kapalı.
 * `null` = temizle (kapat). Tamsayı 0..lowStockThresholdMax. `undefined` çağıranın işi (alan gönderilmedi).
 */
export function validateLowStockThreshold(value: any): number | null {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > STOCK_POLICY_LIMITS.lowStockThresholdMax) {
        throw new StockPolicyValidationError(`lowStockThreshold 0 ile ${STOCK_POLICY_LIMITS.lowStockThresholdMax} arasında bir tamsayı (ya da temizlemek için null) olmalıdır.`);
    }
    return value;
}

/** DB'den okunan tenant eşiği: yalnız geçerli tamsayı; aksi (yok/bozuk) = kapalı (`null`). */
export function pickLowStockThreshold(raw: any): number | null {
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= STOCK_POLICY_LIMITS.lowStockThresholdMax ? raw : null;
}
