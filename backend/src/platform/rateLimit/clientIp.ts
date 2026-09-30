import type { Request } from 'express';
import { config } from '@config';

// ADR-0001 Karar 10: istemci IP'si rate limit ve audit log için kullanılır.
// X-Forwarded-For istemci tarafından sahtelenebilir; bu yüzden VARSAYILAN olarak GÜVENİLMEZ.
// Güvenilir ters vekil (Railway/Render vb.) arkasındaysa TRUSTED_PROXY_HOPS=<vekil sayısı> ayarlanır:
// bu durumda yalnızca güvenilir vekillerin eklediği (sağdan N. eleman) adres kullanılır; soldaki (istemcinin
// yazabildiği) değerler yok sayılır.

export function getTrustedProxyHops(): number {
    return config.rateLimit.trustedProxyHops;
}

export function getClientIp(req: Request): string {
    const remote = (req as any)?.socket?.remoteAddress || (req as any)?.connection?.remoteAddress || 'unknown';
    const hops = getTrustedProxyHops();
    if (hops > 0) {
        const raw = (req as any)?.headers?.['x-forwarded-for'];
        const header = Array.isArray(raw) ? raw.join(',') : raw;
        if (typeof header === 'string' && header.trim()) {
            const parts = header.split(',').map(s => s.trim()).filter(Boolean);
            const picked = parts[parts.length - hops];
            if (picked) return picked;
        }
    }
    return remote;
}
