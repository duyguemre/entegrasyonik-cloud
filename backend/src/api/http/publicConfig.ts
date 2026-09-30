// ADR-0031 Karar 4 (BE-CFG-3): `GET {context}/public-config` — kimliksiz, salt okunur açılış verisi (bakım/duyuru metni giriş
// ekranında da gerekir). Yanıt HER İSTEKTE DB okumadan, bellekten üretilir: `_platform` yayınlanmış ayarları (`platformOverrideStore`,
// 15 sn'lik `config-head-poll` doldurur; boşsa katalog varsayılanı) + AÇIK İZİN LİSTELİ iki env alanı. Sır/CORS/bağlantı dizesi
// ASLA girmez: `settings` yalnız `exposure:'public'` katalog anahtarlarını, `env` yalnız aşağıdaki iki alanı taşır.
// Hız sınırı: genel sınırlayıcıdan (authenticate ile birlikte, `Webserver.init`) SONRA bağlanır; `authenticate.ts` `OPEN_ROUTES`
// listesinde kamu istisnası olarak yer alır (/health benzeri). MCP yeteneği DEĞİLDİR (ADR-0019/E8 kararı, ADR-0031 Karar 4).
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { config } from '@config';
import { listPublicPlatformSettings, getPlatformSetting, getPlatformVersion } from '@integration/config/platformSettings';
import { readImageUploadSettings } from '@services/storage/imagePolicy';
import { sendHttpError } from './errorEnvelope';

export const PUBLIC_CONFIG_PATH = 'public-config';
export const PUBLIC_CONFIG_CACHE_CONTROL = 'public, max-age=30';

export interface PublicConfigBody {
    version: number;
    env: { images: { productBaseUrl: string; uploadMaxBytes: number } };
    settings: Record<string, unknown>;
}

/** Saf ve bellek-içi: DB/ağ okumaz. */
export function buildPublicConfig(): PublicConfigBody {
    const settings: Record<string, unknown> = {};
    for (const def of listPublicPlatformSettings()) settings[def.key] = getPlatformSetting(def.key);
    return {
        version: getPlatformVersion(),
        env: { images: { productBaseUrl: config.images.productBaseUrl, uploadMaxBytes: readImageUploadSettings().maxBytes } },
        settings,
    };
}

/** ETag: `_platform` yayın sürümü + gövde özeti (aynı sürümde farklı env/dağıtım değerinde önbellek yanlış 304 vermesin). */
function etagOf(body: PublicConfigBody, json: string): string {
    return `W/"${body.version}-${crypto.createHash('sha1').update(json).digest('hex').slice(0, 12)}"`;
}

function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
    if (!header) return false;
    return header.split(',').map((s) => s.trim()).some((t) => t === '*' || t === etag || t.replace(/^W\//, '') === etag.replace(/^W\//, ''));
}

export function configurePublicConfigRoute(app: Pick<Express, 'get'>, context: string): void {
    app.get(context.replace(/\/+$/, '') + '/' + PUBLIC_CONFIG_PATH, (req: Request, res: Response) => {
        try {
            const body = buildPublicConfig();
            const json = JSON.stringify(body);
            const etag = etagOf(body, json);
            res.setHeader('Cache-Control', PUBLIC_CONFIG_CACHE_CONTROL);
            res.setHeader('ETag', etag);
            if (matchesIfNoneMatch(req.headers['if-none-match'] as string | undefined, etag)) { res.status(304).end(); return; }
            res.status(200).type('application/json').send(json);
        } catch {
            sendHttpError(res, 500);
        }
    });
}
