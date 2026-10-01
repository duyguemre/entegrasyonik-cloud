// ADR-0029 Karar 4 (NB5): kimliksiz abonelikten cikma ucu (RFC 8058 one-click). `authenticate`'ten ONCE baglanir (oturum yok;
// yetki = imzali, sureli belirtec). GET yalniz onay sayfasi gosterir (posta tarayicilarinin on-getirmesi tercihi DEGISTIRMEZ);
// POST tercihi kapatir (belirtec sorgudan -- RFC 8058 -- ya da form govdesinden). Basit metin/HTML; ham hata/PII yok.
import express, { Express, Request, Response } from 'express';
import { createRateLimiter } from '@platform/rateLimit/rateLimit';
import { logger } from '@platform/core/logger';
import { applyUnsubscribe, previewUnsubscribe, type UnsubscribeOutcome, type PreferencesWriter } from '@operations/notifications/delivery/unsubscribe';

export const UNSUBSCRIBE_PATH = '/api/notifications/unsubscribe';

export interface UnsubscribeRouteDeps { secret(): string | undefined; prefs(): Promise<PreferencesWriter>; now?(): Date }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const page = (title: string, body: string, form = '') =>
    `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title></head>` +
    `<body style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:0 16px"><h1 style="font-size:18px">${esc(title)}</h1><p>${esc(body)}</p>${form}</body></html>`;

function send(res: Response, status: number, html: string) {
    res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }).send(html);
}

const MESSAGES: Record<UnsubscribeOutcome['status'], { code: number; title: string; body: string }> = {
    ok: { code: 200, title: 'Abonelik güncellendi', body: 'Bu kategorideki e-posta bildirimleri kapatıldı. Uygulama içi bildirimler etkilenmez. Tercihlerinizi uygulamadan değiştirebilirsiniz.' },
    mandatory: { code: 200, title: 'Kapatılamaz', body: 'Bu bir hizmet bildirimidir (güvenlik/faturalama) ve kapatılamaz.' },
    invalid: { code: 400, title: 'Geçersiz bağlantı', body: 'Bu abonelik bağlantısı geçersiz. Tercihlerinizi uygulamadaki bildirim ayarlarından değiştirebilirsiniz.' },
    expired: { code: 410, title: 'Bağlantının süresi dolmuş', body: 'Bu abonelik bağlantısının süresi dolmuş. Tercihlerinizi uygulamadaki bildirim ayarlarından değiştirebilirsiniz.' },
};

export function configureNotificationUnsubscribeRoutes(app: Express, deps: UnsubscribeRouteDeps) {
    const limiter = createRateLimiter({ max: 30, windowMs: 60_000 });
    const tokenOf = (req: Request) => {
        const q = req.query.t; const b = (req.body as Record<string, unknown> | undefined)?.t;
        return typeof q === 'string' ? q : typeof b === 'string' ? b : undefined;
    };

    app.get(UNSUBSCRIBE_PATH, limiter, (req: Request, res: Response) => {
        const t = tokenOf(req);
        const r = previewUnsubscribe(t, { secret: deps.secret(), now: deps.now });
        if (r.status !== 'ok') { const m = MESSAGES[r.status]; return send(res, m.code, page(m.title, m.body)); }
        const form = `<form method="post" action="${UNSUBSCRIBE_PATH}"><input type="hidden" name="t" value="${esc(String(t))}"><button type="submit">Abonelikten çık</button></form>`;
        send(res, 200, page('E-posta aboneliğinden çık', 'Bu kategorideki e-posta bildirimlerini almayı bırakmak için onaylayın.', form));
    });

    app.post(UNSUBSCRIBE_PATH, limiter, express.urlencoded({ extended: false, limit: '4kb' }), async (req: Request, res: Response) => {
        try {
            const r = await applyUnsubscribe(tokenOf(req), { secret: deps.secret(), prefs: await deps.prefs(), now: deps.now });
            const m = MESSAGES[r.status];
            send(res, m.code, page(m.title, m.body));
        } catch (e: any) {
            logger.error({ err: { message: e?.message }, module: 'notifications.unsubscribe' }, 'abonelikten cikma basarisiz');
            send(res, 500, page('Beklenmeyen hata', 'İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.'));
        }
    });
}
