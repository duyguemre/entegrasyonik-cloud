// ADR-0017 §10 "Güvenlik başlıkları": helmet (MIT). API JSON sunucusu için sıkı varsayılanlar; CSP ÖNCE Report-Only
// (Vite çıktısı + Vuetify inline stil gereksinimi henüz ölçülmedi -- Aşama D'de raporlar `/client-log`'a bağlanıp
// 2 hafta temiz kalınca zorunlu hale getirilir). `/health`/`/ready` DAHİL tüm yanıtlara uygulanır (Webserver'da
// requestId middleware'inden HEMEN SONRA, health rotalarından ÖNCE takılır).
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { config } from '@config';

export function createSecurityHeadersMiddleware(): RequestHandler {
    return helmet({
        // JSON RPC + ayrıca aynı süreçten sunulan SPA (express.static + index.html catch-all): script/style
        // kaynaklarının gerçek envanteri çıkarılana dek Report-Only -- hiçbir isteği ENGELLEMEZ, yalnız bilgi amaçlı.
        contentSecurityPolicy: {
            reportOnly: true,
            directives: {
                defaultSrc: ["'self'"],
                // Vuetify/Vite üretim çıktısı inline stil kullanabilir (ölçülmedi); Report-Only'de risksiz.
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
                connectSrc: ["'self'", 'https:'],
                fontSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
            },
        },
        // Üretim dışında HTTPS zorlanmaz (yerel http geliştirme kırılmasın).
        strictTransportSecurity: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
        frameguard: { action: 'deny' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        noSniff: true,
        hidePoweredBy: true,
        // Görsel/CDN (R2 public URL) ve mevcut çapraz-origin istemci akışları kırılmasın diye Aşama A'da KAPALI;
        // envanter çıkarılınca (Aşama D) değerlendirilir.
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
    });
}
