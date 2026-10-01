import type { NextFunction, Request, Response } from 'express';

// ADR-0001 Karar 10: durum değiştiren isteklerde Origin (yoksa Referer) başlığı CORS_ORIGINS listesine karşı doğrulanır.
// Başlıkların ikisi de yoksa izin verilir (tarayıcı dışı istemci; CSRF vektörü değil). Preflight (OPTIONS) etkilenmez.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CorsOriginConfig { origins: string[]; wildcardRejected: boolean }

/** CORS_ORIGINS -> temiz liste. '*' KABUL EDİLMEZ (listeden çıkarılır, wildcardRejected=true). */
export function parseCorsOrigins(raw: string | undefined): CorsOriginConfig {
    const all = (raw || '').split(',').map(o => o.trim()).filter(Boolean);
    const origins = all.filter(o => o !== '*');
    return { origins, wildcardRejected: origins.length !== all.length };
}

function normalize(o: string): string {
    return o.trim().replace(/\/+$/, '').toLowerCase();
}

/** Referer URL'sinden origin (şema+host+port) çıkarır; ayrıştırılamazsa 'null' sayılır (eşleşmez). */
function originFromReferer(referer: string): string {
    try {
        const u = new URL(referer);
        return u.origin === 'null' ? 'null' : u.origin;
    } catch {
        return 'null';
    }
}

function header(req: Request, name: string): string | undefined {
    const v = (req.headers as any)?.[name];
    if (Array.isArray(v)) return v[0];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function isOriginAllowed(req: Request, allowed: string[]): boolean {
    if (!MUTATING.has((req.method || '').toUpperCase())) return true;
    const origin = header(req, 'origin');
    const referer = header(req, 'referer');
    if (origin === undefined && referer === undefined) return true; // tarayıcı dışı istemci
    const candidate = normalize(origin !== undefined ? origin : originFromReferer(referer as string));
    if (allowed.some(a => normalize(a) === candidate)) return true;
    // Aynı-origin (SPA aynı sunucudan sunuluyorsa): Origin'in host kısmı isteğin Host başlığıyla aynıysa izin ver.
    // Tarayıcıdaki çapraz-site sayfa Host'u sahteleyemez (Host her zaman hedef sunucudur).
    const host = header(req, 'host');
    if (host) {
        try {
            if (new URL(candidate).host.toLowerCase() === host.toLowerCase()) return true;
        } catch { /* eşleşmez */ }
    }
    return false;
}

export function createOriginCheckMiddleware(allowed: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (isOriginAllowed(req, allowed)) { next(); return; }
        res.status(403).send({ error: 'Forbidden origin' });
    };
}
