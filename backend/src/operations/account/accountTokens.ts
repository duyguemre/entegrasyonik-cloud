import crypto from 'crypto';
import type { AccountTokenPurpose } from '@database/application/models/AccountToken';

// Tek kullanımlık, kısa ömürlü hesap token'ları. Düz token yalnızca üretim anında (e-posta bağlantısı için) bellekte bulunur;
// veritabanına YALNIZCA SHA-256 özeti yazılır. Token'lar loglanmaz, audit meta'ya girmez, API yanıtına girmez.

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;       // 30 dakika
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;    // 24 saat
/** Aynı kullanıcı/amaç için en sık bu aralıkla yeni token/e-posta üretilir (posta kutusu taşırma savunması). */
export const TOKEN_RESEND_COOLDOWN_MS = 60 * 1000;

const TOKEN_BYTES = 32; // 256 bit
// base64url(32 bayt) = 43 karakter. Üst sınır gevşek; biçim dışı girdi veritabanına HİÇ gitmez.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

export function ttlFor(purpose: AccountTokenPurpose): number {
    return purpose === 'password_reset' ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFY_TTL_MS;
}

export function generateToken(): string {
    return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** İstemciden gelen token: yalnızca beklenen biçimdeki string kabul edilir (NoSQL operatör nesnesi/dizi/uzun girdi reddedilir). */
export function isWellFormedToken(value: unknown): value is string {
    return typeof value === 'string' && TOKEN_SHAPE.test(value);
}

export interface IssuedToken {
    /** Düz token: YALNIZCA e-posta bağlantısına konur; saklanmaz, loglanmaz. */
    token: string;
    expiresAt: Date;
}

/**
 * Aynı kullanıcı+amaç için önceki kullanılmamış token'ları geçersiz kılar (tek aktif token) ve yenisini yazar.
 * `model`: ApplicationDB.getAccountTokenModel().
 */
export async function issueToken(model: any, sub: string, purpose: AccountTokenPurpose, opts: { ip?: string; now?: number } = {}): Promise<IssuedToken> {
    const nowMs = opts.now ?? Date.now();
    const now = new Date(nowMs);
    await model.updateMany({ sub, purpose, usedAt: null }, { $set: { usedAt: now } });
    const token = generateToken();
    const expiresAt = new Date(nowMs + ttlFor(purpose));
    const record: Record<string, any> = { sub, purpose, tokenHash: hashToken(token), createdAt: now, expiresAt };
    if (opts.ip) record.ip = String(opts.ip).slice(0, 64);
    await model.create(record);
    return { token, expiresAt };
}

/** Son üretilen token cooldown içinde mi? (kullanıcıya yeni e-posta göndermeme kararı) */
export async function isWithinCooldown(model: any, sub: string, purpose: AccountTokenPurpose, nowMs: number = Date.now()): Promise<boolean> {
    const last: any = await model.findOne({ sub, purpose }).sort({ createdAt: -1 }).lean();
    if (!last || !last.createdAt) return false;
    return nowMs - new Date(last.createdAt).getTime() < TOKEN_RESEND_COOLDOWN_MS;
}

/** Tüketmeden bakar (parola politikası kullanıcı bağlamıyla değerlendirilebilsin ve zayıf parola token'ı yakmasın diye). */
export async function peekToken(model: any, token: string, purpose: AccountTokenPurpose, nowMs: number = Date.now()): Promise<{ sub: string } | null> {
    if (!isWellFormedToken(token)) return null;
    const doc: any = await model.findOne({ tokenHash: hashToken(token), purpose, usedAt: null, expiresAt: { $gt: new Date(nowMs) } }).lean();
    return doc && typeof doc.sub === 'string' ? { sub: doc.sub } : null;
}

/**
 * ATOMİK tek kullanım: yalnızca kullanılmamış + süresi dolmamış token için `usedAt` yazılır ve kayıt döner; aksi hâlde null.
 * İki eşzamanlı istekten yalnızca biri null olmayan sonuç alır.
 */
export async function consumeToken(model: any, token: string, purpose: AccountTokenPurpose, nowMs: number = Date.now()): Promise<{ sub: string } | null> {
    if (!isWellFormedToken(token)) return null;
    const now = new Date(nowMs);
    const doc: any = await model.findOneAndUpdate(
        { tokenHash: hashToken(token), purpose, usedAt: null, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { new: false },
    ).lean();
    return doc && typeof doc.sub === 'string' ? { sub: doc.sub } : null;
}

/** Bir kullanıcının bu amaçtaki tüm kullanılmamış token'larını geçersiz kılar (parola değişince kalan sıfırlama bağlantıları ölür). */
export async function revokeOutstanding(model: any, sub: string, purpose: AccountTokenPurpose, nowMs: number = Date.now()): Promise<void> {
    await model.updateMany({ sub, purpose, usedAt: null }, { $set: { usedAt: new Date(nowMs) } });
}
