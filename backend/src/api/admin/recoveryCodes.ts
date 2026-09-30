// ADR-0026 Karar 4.5: 10 kurtarma kodu, bcrypt ozetiyle saklanir, TEK KULLANIMLIKTIR.
// Kod: 10 karakter (base32 alfabesi, 50 bit), gosterimde `XXXXX-XXXXX`. Dogrulamada tire/bosluk/kucuk harf yok sayilir.
import crypto from 'crypto';
import bcrypt from 'bcrypt';

export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I yok (okunabilirlik); 32 sembol -> modulo yanlilik yok
const BCRYPT_COST = 10;

export function normalizeRecoveryCode(input: string): string {
    return String(input ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

export function isRecoveryCodeShape(input: unknown): input is string {
    return typeof input === 'string' && /^[A-HJ-NP-Z2-9]{10}$/.test(normalizeRecoveryCode(input));
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const bytes = crypto.randomBytes(10);
        let raw = '';
        for (const b of bytes) raw += ALPHABET[b & 31];
        out.push(raw.slice(0, 5) + '-' + raw.slice(5));
    }
    return out;
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map(c => bcrypt.hash(normalizeRecoveryCode(c), BCRYPT_COST)));
}

/** Kullanilmamis ozetler arasinda eslesen ilkinin dizinini doner (yoksa -1). Tum ozetler taranir. */
export async function findRecoveryCodeIndex(input: string, entries: Array<{ hash: string; usedAt?: Date | null }>): Promise<number> {
    const norm = normalizeRecoveryCode(input);
    let found = -1;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const ok = await bcrypt.compare(norm, e.hash);
        if (ok && !e.usedAt && found < 0) found = i;
    }
    return found;
}
