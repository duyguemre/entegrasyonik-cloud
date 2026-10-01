// PRC-R2: rekabet kuralı (B-10 fiyat kuralının `competition` TİPİ) — giriş şeması, platform üst sınırları ve sorumluluk metni.
// SAF (DB yok). Hukuk tasarım kuralları (docs/research/AUTO_PRICING_LEGAL_2026-10.md §c) burada SUNUCU tarafında zorlanır:
//  K1  eşitleme yok: fark > 0 (≥0,01 TL ya da ≥%0,1); kuruşa/0,1'e yuvarlanınca 0 olan değer de reddedilir.
//  K4  satıcının kendi kuralı: şemada VARSAYILAN YOK (fark, taban marjı, tavan, adım, sıklık, soğuma, artış sınırı satıcı girer).
//  K6  rakip hedefleme yok: kuralda rakip/mağaza/satıcı alanı YOK; `.strict()` bilinmeyen alanı reddeder.
//  K8  yukarı yönlü artış sınırı: satıcı ayarı, platform üst sınırı ≤ %10/gün, ≤ %25/30 gün.
//  K12 sıklık/soğuma: SKU başına günde ≤ 24 değişiklik, soğuma ≥ 15 dk (platform sınırları).
//  K20 aynı tenant'ın mağazaları ortak kural kullanabilir: kural tenant DB'sindedir; tenant'lar arası paylaşım/şablon YOK.
import { z } from 'zod';
import { AppError } from '@platform/core/errors';

const OID = z.string().regex(/^[0-9a-fA-F]{24}$/);
const BARCODE = z.string().min(1).max(128);

/** Rekabet kuralının desteklendiği kanallar (PRC-R1 ile aynı: yalnız Trendyol; K57-S1). */
export const PRICE_RULE_CHANNELS = ['trendyol'] as const;

/** Platform üst sınırları (K8, K12). Kodda sabittir: ADR-0031 `platform.pricing` grubu ≤15 anahtar eşiğinde; değiştirmek kod incelemesi ister. */
export const PLATFORM_LIMITS = {
    /** K8: bir günde en fazla artış (satıcı daha düşük girebilir). */
    maxIncreasePercentPerDay: 10,
    /** K8: 30 günde en fazla artış (son 30 günün en düşük fiyatına göre). */
    maxIncreasePercent30d: 25,
    /** K12: SKU başına günlük en fazla değişiklik. */
    maxChangesPerDay: 24,
    /** K12: değişiklikler arası en az süre (dk). */
    minCooldownMin: 15,
    /** Sigorta: tek değişiklikte en fazla düşüş (%) — 0,01 TL olayına karşı (taban zaten korur; bağımsız ikinci çizgi). */
    maxDropPercent: 50,
} as const;

/** K1 alt sınırları: fark ≥ 0,01 TL ve/veya ≥ %0,1 (yuvarlandıktan sonra). */
export const K1_MIN_DELTA_AMOUNT = 0.01;
export const K1_MIN_DELTA_PERCENT = 0.1;

const roundTo = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export const competitionParams = z.object({
    mode: z.enum(['below', 'above']),
    deltaAmount: z.number().finite().min(0).max(100_000).nullable().optional(),
    deltaPercent: z.number().finite().min(0).max(50).nullable().optional(),
    floorMarginPercent: z.number().finite().min(0).max(90),
    ceiling: z.number().finite().positive().max(10_000_000),
    step: z.number().finite().min(0.01).max(1000),
    maxChangesPerDay: z.number().int().min(1).max(PLATFORM_LIMITS.maxChangesPerDay),
    cooldownMin: z.number().int().min(PLATFORM_LIMITS.minCooldownMin).max(1440),
    maxIncreasePercentPerDay: z.number().finite().min(0).max(PLATFORM_LIMITS.maxIncreasePercentPerDay),
    excludeIfOutOfStock: z.boolean(),
}).strict().superRefine((c, ctx) => {
    // K1: 0 ya da 0'a yuvarlanan fark reddedilir; en az bir fark alanı dolu olmalı.
    const amount = c.deltaAmount ?? null, pct = c.deltaPercent ?? null;
    if (amount === null && pct === null) ctx.addIssue({ code: 'custom', path: ['deltaAmount'], message: 'K1_DELTA_REQUIRED' });
    if (amount !== null && roundTo(amount, 2) < K1_MIN_DELTA_AMOUNT) ctx.addIssue({ code: 'custom', path: ['deltaAmount'], message: 'K1_EQUALIZE_FORBIDDEN' });
    if (pct !== null && roundTo(pct, 1) < K1_MIN_DELTA_PERCENT) ctx.addIssue({ code: 'custom', path: ['deltaPercent'], message: 'K1_EQUALIZE_FORBIDDEN' });
    if (roundTo(c.step, 2) < 0.01) ctx.addIssue({ code: 'custom', path: ['step'], message: 'STEP_TOO_SMALL' });
});

export type CompetitionParams = z.infer<typeof competitionParams>;

export const saveRuleInput = z.object({
    id: OID.optional(),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    integrationCode: z.enum(PRICE_RULE_CHANNELS),
    scope: z.object({
        productIds: z.array(OID).max(500).optional(),
        barcodes: z.array(BARCODE).max(500).optional(),
    }).strict().optional(),
    competition: competitionParams,
}).strict();

export type SaveRuleInput = z.infer<typeof saveRuleInput>;

/** Zod hatasını alan yollarıyla 400'e çevirir; K1 ihlali ayrı, anlaşılır iletiyle döner (değer yansıtılmaz). */
export function parseRuleInput(raw: unknown): SaveRuleInput {
    const r = saveRuleInput.safeParse(raw ?? {});
    if (r.success) return r.data;
    const k1 = r.error.issues.some((i) => i.message === 'K1_EQUALIZE_FORBIDDEN' || i.message === 'K1_DELTA_REQUIRED');
    const details = r.error.issues.map((i) => ({ path: i.path.join('.'), ...(i.message.startsWith('K1_') ? { rule: i.message } : {}) }));
    throw AppError.of('VALIDATION', {
        message: k1 ? 'Fark sıfırdan büyük olmalıdır (en az 0,01 TL ya da %0,1). Buybox fiyatına eşitleme yapılmaz.' : 'Geçersiz fiyat kuralı.',
        details,
    });
}

/**
 * K3: satıcı sorumluluk metni (AUTO_PRICING_LEGAL §f "Özelliği açarken" önerisinden). AVUKAT GÖZDEN GEÇİRENE KADAR TASLAKTIR (`draft: true`).
 * R2'de fiyat yalnız onayla değişir; metin buna göre uyarlandı ("onayınız olmadan" ifadesi R3'e aittir). Sürüm değişince yeniden kabul gerekir.
 */
export const PRICING_CONSENT = {
    version: '2026-10-01-draft',
    draft: true,
    text: {
        tr: 'Fiyat kuralları yalnız sizin girdiğiniz değerlerle çalışır ve yalnız öneri üretir; fiyatınız ancak siz onayladığınızda değişir. '
            + 'Taban ve tavan fiyatı siz belirlersiniz. Fiyat kararlarınızın sorumluluğu size aittir. Verileriniz başka hiçbir satıcının fiyatlandırmasında kullanılmaz. '
            + 'Bu araç hukuki danışmanlık değildir; fiyat ve indirim mevzuatına uyum için danışmanınıza başvurun.',
        en: 'Pricing rules work only with the values you enter and only produce suggestions; your price changes only when you approve it. '
            + 'You set the floor and ceiling price. You are responsible for your pricing decisions. Your data is never used to price any other seller. '
            + 'This tool is not legal advice; consult your adviser on pricing and discount regulations.',
    },
} as const;

/** K17: pazaryerinin kendi otomatik fiyat aracıyla çift motor uyarısı (ekranda ve kural açılırken). */
export const DUAL_ENGINE_WARNING = {
    tr: 'Pazaryerinin kendi otomatik fiyatlandırma aracını aynı ürünlerde kapatın. İki araç birbirini tetikleyebilir. Fiyat Entegrasyonik dışında değişirse kural duraklatılır.',
    en: 'Turn off the marketplace\'s own automatic pricing tool for the same products. Two tools can trigger each other. If the price changes outside Entegrasyonik, the rule is paused.',
} as const;
