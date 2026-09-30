// ADR-0029 Karar 4: SMTP hata siniflandirmasi (saf; nodemailer'a bagimli DEGIL -> testler taşıyıcısız calisir).
// 'permanent': yeniden denemek anlamsiz (5xx SMTP reddi, gecersiz adres); 'transient': gecici (4xx, ag, zaman asimi, bilinmeyen).

export type MailErrorKind = 'transient' | 'permanent';

export interface ClassifiedMailError { kind: MailErrorKind; code: string }

/** Hata kodu: ham mesaj / adres SIZDIRMAZ; yalniz sabit sinif etiketi ('smtp_5xx', 'smtp_4xx', 'network', 'unknown'). */
export function classifyMailError(err: unknown): ClassifiedMailError {
    const e = err as { kind?: unknown; responseCode?: unknown; code?: unknown } | null | undefined;
    if (e?.kind === 'permanent' || e?.kind === 'transient') return { kind: e.kind, code: e.kind === 'permanent' ? 'smtp_5xx' : 'transient' };
    const rc = typeof e?.responseCode === 'number' ? e.responseCode : undefined;
    if (rc !== undefined) {
        if (rc >= 500 && rc < 600) return { kind: 'permanent', code: 'smtp_5xx' };
        if (rc >= 400 && rc < 500) return { kind: 'transient', code: 'smtp_4xx' };
    }
    const c = typeof e?.code === 'string' ? e.code : '';
    if (c === 'EENVELOPE') return { kind: 'permanent', code: 'invalid_recipient' };
    if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'EDNS', 'ETIMEOUT'].includes(c)) return { kind: 'transient', code: 'network' };
    return { kind: 'transient', code: 'unknown' };
}

/** Log icin alici maskesi: `ab***@example.com`. */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at < 1) return '***';
    return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
