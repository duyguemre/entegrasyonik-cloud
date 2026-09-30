// ADR-0026 Karar 4.5: TOTP (RFC 6238; HMAC-SHA1, 30 sn, 6 hane, +-1 adim) `node:crypto` ile; ek bagimlilik YOK.
// Saf fonksiyonlar (DB/ag yok). Yeniden oynatma korumasi (son kullanilan adim) depolama katmaninda atomik uygulanir
// (adminMfaStore.claimStep); burada dogrulama yalnizca "hangi adim eslesti" bilgisini doner.
import crypto from 'crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1; // +-1 adim (saat kaymasi toleransi)
export const TOTP_SECRET_BYTES = 20; // 160 bit (RFC 4226 onerisi)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
    let bits = 0, value = 0, out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(text: string): Buffer {
    const clean = text.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
    let bits = 0, value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx < 0) throw new Error('Gecersiz base32');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Buffer.from(out);
}

export function generateTotpSecret(): string {
    return base32Encode(crypto.randomBytes(TOTP_SECRET_BYTES));
}

/** RFC 4226 HOTP (dinamik kesme). `counter` 0..2^53. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
    const msg = Buffer.alloc(8);
    msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    msg.writeUInt32BE(counter >>> 0, 4);
    const h = crypto.createHmac('sha1', secret).update(msg).digest();
    const off = h[h.length - 1] & 0x0f;
    const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
    return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(nowMs: number, period = TOTP_PERIOD_SECONDS): number {
    return Math.floor(nowMs / 1000 / period);
}

export function totpAt(secretB32: string, nowMs: number, digits = TOTP_DIGITS): string {
    return hotp(base32Decode(secretB32), totpStep(nowMs), digits);
}

/**
 * Kodu +-`window` adimda dogrular. Eslesen adimi doner (yoksa undefined). Sabit zamanli karsilastirma; tum pencere taranir
 * (erken cikis zamanlamayi sizdirmaz).
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number = Date.now(), window = TOTP_WINDOW): { step: number } | undefined {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return undefined;
    const secret = base32Decode(secretB32);
    const cur = totpStep(nowMs);
    let matched: number | undefined;
    for (let d = -window; d <= window; d++) {
        const expected = Buffer.from(hotp(secret, cur + d));
        if (crypto.timingSafeEqual(expected, Buffer.from(code)) && matched === undefined) matched = cur + d;
    }
    return matched === undefined ? undefined : { step: matched };
}

/** Kimlik dogrulayici uygulamalari icin otpauth URI (QR bu dizeden istemcide uretilir). */
export function otpauthUri(secretB32: string, accountLabel: string, issuer = 'Entegrasyonik'): string {
    const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(accountLabel);
    const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
    return `otpauth://totp/${label}?${q.toString()}`;
}
