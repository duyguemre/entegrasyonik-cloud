// [ADR-0023] RPC gövde şemaları için ortak yapı taşları. SAF zod (api/**'yi içe aktarmaz — ADR-0016 sınır kuralı).
//
// Şema politikası (mass assignment, OWASP API3/API6):
//  - ÜST DÜZEY gövde `strictBody` = `.strict()`: bilinmeyen alan REDDEDİLİR (400 VALIDATION). Bu, tenant/owner/rol gibi
//    alanların gövdeden sızmasını keser. (`userContext/principal/order/clientId/requestMeta` RunOperation'da doğrulamadan
//    ÖNCE sunucu tarafından atılır; şemaya girmez.)
//  - İÇ İÇE varlık nesneleri (FE'nin sunucudan aldığı belgeyi geri gönderdiği yerler) `allowList` = zod varsayılanı
//    (strip): yalnız izinli alanlar geçer, kalanı SESSİZCE ATILIR (FE uyumu; servise ulaşmaz).
import { z } from 'zod';

/** Mongo `_id`/belge kimliği: yalnız string (NoSQL operatör nesnesi `{ $ne: … }` enjeksiyonunu reddeder). */
export const idStr = z.string().min(1).max(64);
export const idList = (max = 1000) => z.array(idStr).min(1).max(max);

/** Tenant numarası (order): pozitif tamsayı ya da rakam dizisi. */
export const tenantNo = z.union([z.number().int().positive().max(2_000_000_000), z.string().regex(/^\d{1,10}$/)]);

/** Entegrasyon kodu (ör. `trendyol`, `hepsiburada`). */
export const integrationCode = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const text = (max = 500) => z.string().max(max);
export const reqText = (max = 500) => z.string().min(1).max(max);
export const email = z.string().max(254).email();
/** Parola/sır alanı: yalnız tip+uzunluk (değer asla yansıtılmaz). */
export const secret = z.string().min(1).max(1024);

/** Üst düzey gövde: bilinmeyen alan reddedilir. */
export const strictBody = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
/** İç içe varlık: izin listesi (bilinmeyenler atılır). */
export const allowList = <T extends z.ZodRawShape>(shape: T) => z.object(shape);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Mongo yol/operatör enjeksiyonuna açık anahtarlar: `$` önekli, `.` içeren, NUL, prototip adları. */
export const isSafeKey = (k: string): boolean =>
    k.length > 0 && k.length <= 100 && !FORBIDDEN_KEYS.has(k) && !k.startsWith('$') && !k.includes('.') && !k.includes('\0');

/**
 * Serbest biçimli ayar nesnesi (entegrasyon `settings` vb.): değerler serbest, ÜST DÜZEY anahtarlar güvenli olmalı
 * (bu anahtarlar `$set: { 'marketplace.$.settings.<anahtar>': … }` yollarına gömülür).
 */
export const safeSettings = z.record(z.string(), z.unknown()).superRefine((obj, ctx) => {
    for (const k of Object.keys(obj)) {
        if (!isSafeKey(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'geçersiz ayar anahtarı', path: [] });
    }
});
