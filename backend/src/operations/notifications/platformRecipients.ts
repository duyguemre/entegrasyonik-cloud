// ADR-0029 Karar 7 / NB8: platform alarm alicilari (`ALERT_EMAIL_TO`). Adres outbox'a YAZILMAZ: teslim kaydinda yalniz kisa ozet
// (`userId = 'platform:<ozet>'`); gonderim aninda ozetten env listesine donulur (ayni ADR-0029 "e-posta adresi saklanmaz" kurali).
import { createHash } from 'crypto';

export const PLATFORM_USER_PREFIX = 'platform:';
const EMAIL_RE = /^[^\s@<>",;]{1,64}@[^\s@<>",;]{1,200}\.[^\s@<>",;]{2,30}$/;
const MAX_RECIPIENTS = 10;

export interface PlatformRecipient { hash: string; email: string }

export const recipientHash = (email: string): string => createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 12);

/** Virgulle ayrik liste -> gecerli, tekil, en fazla 10 alici. Gecersiz girdiler sessizce atilir. */
export function parseAlertRecipients(raw: string | undefined): PlatformRecipient[] {
    const seen = new Set<string>();
    const out: PlatformRecipient[] = [];
    for (const part of (raw ?? '').split(',')) {
        const email = part.trim();
        if (!email || !EMAIL_RE.test(email)) continue;
        const hash = recipientHash(email);
        if (seen.has(hash)) continue;
        seen.add(hash);
        out.push({ hash, email });
        if (out.length >= MAX_RECIPIENTS) break;
    }
    return out;
}

export const isPlatformUserId = (userId: string): boolean => typeof userId === 'string' && userId.startsWith(PLATFORM_USER_PREFIX);
export const platformUserId = (hash: string): string => `${PLATFORM_USER_PREFIX}${hash}`;
export const platformHashOf = (userId: string): string => userId.slice(PLATFORM_USER_PREFIX.length);
