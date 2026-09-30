import { integrationCode } from '../constants';
import Service from './Service';
import { decryptSecrets, encryptSecrets } from '@platform/core/security/integrationSecrets';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { OAuthTokenCache } from '@integration/modules/common/adapter/OAuthTokenCache';
import { config } from '@config';

/** Süre dolmadan bu kadar önce yenile (saat farkı/ağ gecikmesi payı). */
export const TOKEN_SKEW_MS = 120_000;

export class SecurityService {
    private clientId: string;
    /**
     * Süreç-içi single-flight (örnekler ARASI): aynı tenant için eşzamanlı yenilemeler TEK token isteğine iner (refresh_token döndüren
     * sunucuda yarışı önler). Örnek İÇİ single-flight + bellek önbelleği `OAuthTokenCache`'te (ADR-0033 INT-01).
     */
    private static inflight = new Map<string, Promise<{ token: string; expiresAt: number }>>();
    private expiresAt: number | undefined;
    /** Önbellek token'ı biliyor mu (yenileme/kod değişimi sonrası)? Değilse elle verilmiş token süresi bilinmediğinden olduğu gibi kullanılır. */
    private primed = false;
    private forceNext = false;
    private readonly cache: OAuthTokenCache;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
        this.cache = new OAuthTokenCache(async () => {
            const force = this.forceNext; this.forceNext = false;
            const { token, expiresAt } = await this.refreshShared(force);
            return { token, expiresInSec: Math.max(0, (expiresAt - Date.now()) / 1000) };
        }, TOKEN_SKEW_MS);
    }

    /** [ADR-0022/F-04] Sırlar URL'de DEĞİL, application/x-www-form-urlencoded POST gövdesinde gider. */
    private buildTokenForm(grantType: string, extra: Record<string, string>): string {
        const s = this.params.integrationSettings?.settings || {};
        const form = new URLSearchParams({
            grant_type: grantType,
            client_id: String(s.key || s.APIKEY || ''),
            client_secret: String(s.secret || s.APISECRET || ''),
            ...extra,
        });
        return form.toString();
    }

    /**
     * Token uç noktası çağrısı. Varsayılan: POST form gövdesi (güvenli). `IDEASOFT_TOKEN_LEGACY_GET=true` ile ESKİ
     * (sırları URL sorgusuna koyan) GET biçimi yalnızca geriye dönük uyumluluk için açılabilir; Ideasoft'un POST kabul
     * edip etmediği resmi dokümanla DOĞRULANAMADI (docs/research/API_CONTRACTS_2026-09-30.md §5).
     */
    private async requestToken(grantType: string, extra: Record<string, string>): Promise<any> {
        // [LIVE-RO] Canlı salt-okuma kipinde token degisimi/yenilemesi VARSAYILAN KAPALI: Ideasoft refresh_token dondurur, eski token'i gecersiz kilabilir
        // (uretim ayni baglantiyi kullaniyor olabilir). Acmak: LIVE_READONLY_ALLOW_TOKEN_REFRESH=ideasoft. Istek AGA cikmaz.
        if (config.liveReadonly.enabled && !config.liveReadonly.allowTokenRefresh.includes('ideasoft')) {
            throw new IntegrationError('AUTH',
                'Canlı salt-okuma kipi: Ideasoft token yenilemesi kapalı (refresh_token döner; üretim bağlantısını bozabilir). Mevcut access_token geçersiz/süresi dolmuş; yenilemek için LIVE_READONLY_ALLOW_TOKEN_REFRESH=ideasoft.',
                { integrationCode, operation: 'ensureToken', clientId: this.clientId, platformCode: 'LIVE_READONLY_TOKEN_REFRESH_DISABLED' });
        }
        const tokenUrl = this.service.getTokenUrl();
        if (process.env.IDEASOFT_TOKEN_LEGACY_GET === 'true') {
            const qs = this.buildTokenForm(grantType, extra);
            return (await this.service.get(`${tokenUrl}?${qs}`, {}, { operation: 'GET oauth/token (legacy)' })).data;
        }
        const res = await this.service.postForm(tokenUrl, this.buildTokenForm(grantType, extra), { operation: 'POST oauth/token' });
        return res.data;
    }

    private applyToken(tokenData: any): void {
        this.setKnownToken(tokenData.access_token, tokenData.createdAt + (Number(tokenData.expires_in) || 3600) * 1000);
    }

    private setKnownToken(token: string, expiresAt: number): void {
        this.service.setCurrentToken(token);
        this.expiresAt = expiresAt;
        this.cache.prime(token, Math.max(0, (expiresAt - Date.now()) / 1000));
        this.primed = true;
    }

    public async retrieveToken(data: any): Promise<string | undefined> {
        try {
            const tokenData = await this.requestToken('authorization_code', {
                code: data.code,
                redirect_uri: data.redirectUrl || data.redirect_uri || '',
            });

            if (!tokenData?.access_token) throw new Error('No access_token in response');

            tokenData.createdAt = Date.now();
            tokenData.redirectUrl = data.redirectUrl;

            await this.persistToken(tokenData);
            this.applyToken(tokenData);
            return tokenData.access_token;
        } catch (error: any) {
            // [ADR-0006 Karar 2] IntegrationError korunur (code/retryable üst katmana kaybolmadan ulaşır).
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][IdeaSoft:retrieveToken] ${error.message}`);
        }
    }

    /**
     * [C10] İsteklerden ÖNCE Service tarafından çağrılır. Bellekteki token geçerliyse (skew payıyla) ağa/DB'ye çıkmaz;
     * değilse tenant başına TEK yenileme yapılır (single-flight: OAuthTokenCache + örnekler arası `inflight`). `force`: 401 sonrası zorla yenile.
     * Elle verilmiş (süresi bilinmeyen) token, hiç yenileme yapılmadıysa olduğu gibi kullanılır (eski davranış).
     */
    public async ensureToken(force = false): Promise<string> {
        const current = this.service.getCurrentToken();
        if (!force && current && !this.primed) return current;
        this.forceNext = force;
        return this.cache.get(force);
    }

    /** Aynı tenant için eşzamanlı yenilemeleri (farklı Ideasoft örnekleri dâhil) tek isteğe indirir. */
    private async refreshShared(force: boolean): Promise<{ token: string; expiresAt: number }> {
        const key = String(this.clientId);
        const running = SecurityService.inflight.get(key);
        if (running) {
            const r = await running;
            this.setKnownToken(r.token, r.expiresAt); // başka örnek yeniledi: bu örneğin Service'i de yeni token'ı kullanmalı
            return r;
        }
        const p = this.refreshToken(force).then(token => ({ token, expiresAt: this.expiresAt ?? Date.now() + 3600_000 })).catch((e: any) => {
            if (IntegrationError.isIntegrationError(e)) throw e;
            throw new IntegrationError('AUTH', `Ideasoft OAuth token alınamadı/yenilenemedi: ${e?.message ?? e}`, {
                integrationCode, operation: 'ensureToken', clientId: this.clientId,
            });
        }).finally(() => { SecurityService.inflight.delete(key); });
        SecurityService.inflight.set(key, p);
        return p;
    }

    public async refreshToken(force = false): Promise<string> {
        try {
            const stored = await this.getStoredAuth();

            if (!force && stored?.access_token && stored?.createdAt &&
                (Date.now() - stored.createdAt) < (stored.expires_in || 3600) * 1000 - TOKEN_SKEW_MS) {
                this.setKnownToken(stored.access_token, stored.createdAt + (stored.expires_in || 3600) * 1000);
                return stored.access_token;
            }

            const refreshToken = stored?.refresh_token;
            if (!refreshToken) throw new Error('No refresh_token stored in DB');

            const tokenData = await this.requestToken('refresh_token', { refresh_token: refreshToken });

            if (!tokenData?.access_token) throw new Error('No access_token in refresh response');

            tokenData.createdAt = Date.now();
            // Sunucu refresh_token döndürmezse eskisi korunur (aksi halde bir sonraki yenileme imkânsız kalırdı).
            if (!tokenData.refresh_token) tokenData.refresh_token = refreshToken;
            await this.persistToken(tokenData);
            this.applyToken(tokenData);
            return tokenData.access_token;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][IdeaSoft:refreshToken] ${error.message}`);
        }
    }

    /** Testler için: süreç-içi single-flight belleğini temizler. */
    public static resetInflight(): void { SecurityService.inflight.clear(); }

    /** Testler için: örnek önbelleğini boşaltır (bir sonraki istek yeniden alır). */
    public invalidateCache(): void { this.cache.invalidate(); this.primed = false; }

    private async getStoredAuth(): Promise<any> {
        const clientDB = this.params.clientDB;
        if (!clientDB) return null;

        const docs = await clientDB.getClientIntegrationModel().aggregate([
            { $match: { 'ecommerce.code': integrationCode } },
            {
                $project: {
                    ecommerce: {
                        $filter: { input: '$ecommerce', as: 'item', cond: { $eq: ['$$item.code', integrationCode] } }
                    }
                }
            }
        ]);
        const auth = docs?.[0]?.ecommerce?.[0]?.settings?.auth;
        // ADR-0003 C.11: OAuth token'ları şifreli saklanır; çözme yalnızca bellek içi kullanım içindir (düz metin göç dönemi olduğu gibi geçer)
        return auth ? decryptSecrets(auth, integrationCode) : null;
    }

    private async persistToken(tokenData: any): Promise<void> {
        const clientDB = this.params.clientDB;
        if (!clientDB) return;

        await clientDB.getClientIntegrationModel().findOneAndUpdate(
            { 'ecommerce.code': integrationCode },
            // ADR-0003 C.10: access_token/refresh_token DB'ye şifreli yazılır
            { $set: { 'ecommerce.$.settings.auth': encryptSecrets(tokenData, integrationCode) } },
            { upsert: false }
        ).lean();
    }
}
