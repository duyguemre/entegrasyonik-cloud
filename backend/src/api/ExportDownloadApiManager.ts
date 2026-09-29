import { Express, Request, Response } from 'express';
import { AuditLogger } from '@services/audit/AuditLogger';
import { storageService } from '@services/storage/StorageService';
import { prepareExportDownload, ExportDownloadDeps } from '@operations/tenant/exportDownload';
import { isAllowed, resolveTier } from './operationPolicy';
import { createRateLimiter } from './rateLimit';
import { getClientIp } from './clientIp';

// KVKK dışa aktarma indirme rotası (docs/API_TENANT_SURFACE.md §5; ADR-0003 adım 8 / F.22).
// `TenantDataService.exportTenantData` bir `downloadToken` üretir; bu rota onu tüketir. Jenerik RPC'ye (JSON yanıt) sığmaz
// (ikili/akış içerik) -> ImageApiManager gibi ayrı, `authenticate` middleware'inden SONRA bağlanan bir rotadır (oturum çerezi ZORUNLU).
// Yetki: yalnızca tenant SAHİBİ (owner) — exportTenantData ile aynı kademe; platformAdmin owner DEĞİLDİR (403).
// Karar mantığı (token doğrulama, tenant bağı, tek kullanım, denetim) `@operations/tenant/exportDownload`'dadır.

const DOWNLOAD_RATE_MAX = Number(process.env.EXPORT_DOWNLOAD_RATE_LIMIT_MAX) > 0 ? Number(process.env.EXPORT_DOWNLOAD_RATE_LIMIT_MAX) : 20;
const DOWNLOAD_RATE_WINDOW_MS = Number(process.env.EXPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS) > 0 ? Number(process.env.EXPORT_DOWNLOAD_RATE_LIMIT_WINDOW_MS) : 10 * 60_000;

export const EXPORT_DOWNLOAD_ROUTE = '/tenant-data/export/download';

const defaultDeps = (): ExportDownloadDeps => ({
    storage: {
        open: (clientId, key) => storageService.openExportArchive(clientId, key),
        remove: (clientId, key) => storageService.deleteExportArchive(clientId, key),
    },
    audit: (entry) => { void AuditLogger.log(entry); },
});

export function configureExportDownloadRoutes(app: Express, context: string, deps: ExportDownloadDeps = defaultDeps()) {
    const limiter = createRateLimiter({ max: DOWNLOAD_RATE_MAX, windowMs: DOWNLOAD_RATE_WINDOW_MS });

    app.get(context + EXPORT_DOWNLOAD_ROUTE, limiter, async (req: Request, res: Response) => {
        try {
            // Fail-closed: authenticate middleware'i takılmamışsa/oturum yoksa 401
            if (!res.locals || !res.locals.principal) { res.status(401).send({ error: 'Token is undefined' }); return; }

            const isOwner = isAllowed('owner', resolveTier(res.locals.userContext, res.locals.principal));
            const outcome = await prepareExportDownload({
                token: typeof req.query?.token === 'string' ? req.query.token : undefined,
                order: res.locals.userContext?.order,
                sub: res.locals.principal?.sub,
                ip: getClientIp(req),
                isOwner,
            }, deps);

            if (!outcome.ok) { res.status(outcome.status).send({ error: outcome.error }); return; }

            // Token URL'de taşındığı için: önbellek yok, Referer sızıntısı yok, içerik türü koklama yok
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${outcome.filename}"`);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Referrer-Policy', 'no-referrer');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            if (typeof outcome.contentLength === 'number') res.setHeader('Content-Length', String(outcome.contentLength));
            res.status(200);

            let finished = false;
            res.on('finish', () => { finished = true; void outcome.complete(); });
            res.on('close', () => { if (!finished) { outcome.abort(); if (typeof outcome.body?.destroy === 'function') outcome.body.destroy(); } });
            outcome.body.on('error', (e: any) => {
                console.error('[ExportDownload] akış hatası:', e?.name || e?.message);
                outcome.abort();
                if (!res.headersSent) res.status(500).send({ error: 'Arşiv şu anda indirilemiyor.' });
                else res.destroy();
            });
            outcome.body.pipe(res);
        } catch (e: any) {
            console.error('[ExportDownload] beklenmeyen hata:', e?.name || e?.message);
            if (!res.headersSent) res.status(500).send({ error: 'Arşiv şu anda indirilemiyor.' });
        }
    });
}
