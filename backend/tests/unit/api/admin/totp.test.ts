import { describe, it, expect } from '@jest/globals';
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, totpAt, verifyTotp } from '../../../../src/api/admin/totp';
import { findRecoveryCodeIndex, generateRecoveryCodes, hashRecoveryCodes, isRecoveryCodeShape, normalizeRecoveryCode } from '../../../../src/api/admin/recoveryCodes';

// RFC 6238 Ek B (SHA-1; sir ASCII "12345678901234567890"; 8 hane). Zaman degerleri saniye.
const RFC_SECRET_B32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
];

describe('TOTP (RFC 6238, node:crypto)', () => {
    it('base32 gidis-donus ve RFC sirri', () => {
        expect(RFC_SECRET_B32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
        expect(base32Decode(RFC_SECRET_B32).toString('ascii')).toBe('12345678901234567890');
        const s = generateTotpSecret();
        expect(s).toMatch(/^[A-Z2-7]{32}$/);
        expect(base32Encode(base32Decode(s))).toBe(s);
    });

    it.each(RFC_VECTORS)('RFC 6238 test vektoru T=%i -> %s', (t, code) => {
        expect(totpAt(RFC_SECRET_B32, t * 1000, 8)).toBe(code);
    });

    it('RFC 4226 HOTP vektorleri (sayac 0..2, 6 hane)', () => {
        const secret = Buffer.from('12345678901234567890', 'ascii');
        expect([0, 1, 2].map(c => hotp(secret, c))).toEqual(['755224', '287082', '359152']);
    });

    it('6 haneli kod: +-1 adim kabul, +-2 adim red; eslesen adimi doner', () => {
        const t = 1_700_000_000_000;
        const secret = generateTotpSecret();
        const cur = Math.floor(t / 1000 / 30);
        expect(verifyTotp(secret, totpAt(secret, t), t)).toEqual({ step: cur });
        expect(verifyTotp(secret, totpAt(secret, t - 30_000), t)).toEqual({ step: cur - 1 });
        expect(verifyTotp(secret, totpAt(secret, t + 30_000), t)).toEqual({ step: cur + 1 });
        expect(verifyTotp(secret, totpAt(secret, t - 60_000), t)).toBeUndefined();
        expect(verifyTotp(secret, totpAt(secret, t + 60_000), t)).toBeUndefined();
    });

    it('bicimsiz kod reddedilir (harf, kisa, uzun, bos)', () => {
        const secret = generateTotpSecret();
        for (const bad of ['', '12345', '1234567', 'abcdef', '12 456', undefined as any, 123456 as any]) {
            expect(verifyTotp(secret, bad, 1_700_000_000_000)).toBeUndefined();
        }
    });

    it('otpauth URI: sir, issuer, SHA1/6/30', () => {
        const uri = otpauthUri('ABCDEFGH', 'admin@example.test');
        expect(uri.startsWith('otpauth://totp/Entegrasyonik:admin%40example.test?')).toBe(true);
        const q = new URL(uri).searchParams;
        expect(q.get('secret')).toBe('ABCDEFGH');
        expect(q.get('issuer')).toBe('Entegrasyonik');
        expect([q.get('algorithm'), q.get('digits'), q.get('period')]).toEqual(['SHA1', '6', '30']);
    });
});

describe('kurtarma kodlari', () => {
    it('10 benzersiz kod; bicim XXXXX-XXXXX; normalize tire/bosluk/kucuk harf yok sayar', () => {
        const codes = generateRecoveryCodes();
        expect(codes).toHaveLength(10);
        expect(new Set(codes).size).toBe(10);
        for (const c of codes) {
            expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
            expect(isRecoveryCodeShape(c.toLowerCase().replace('-', ' '))).toBe(true);
        }
        expect(normalizeRecoveryCode(' ab2cd-EF3gh ')).toBe('AB2CDEF3GH');
        expect(isRecoveryCodeShape('123456')).toBe(false);
    });

    it('ozet bcrypt (duz kod saklanmaz); eslesme kullanilmamis girdiyi bulur, kullanilmis girdiyi bulamaz', async () => {
        const codes = generateRecoveryCodes(3);
        const hashes = await hashRecoveryCodes(codes);
        expect(hashes.every(h => h.startsWith('$2') && !codes.some(c => h.includes(c)))).toBe(true);
        const entries = hashes.map(hash => ({ hash } as { hash: string; usedAt?: Date }));
        expect(await findRecoveryCodeIndex(codes[1].toLowerCase(), entries)).toBe(1);
        entries[1].usedAt = new Date();
        expect(await findRecoveryCodeIndex(codes[1], entries)).toBe(-1);
        expect(await findRecoveryCodeIndex('ZZZZZ-ZZZZZ', entries)).toBe(-1);
    });
});
