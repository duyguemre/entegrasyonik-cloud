import { integrationCode } from '../constants';
import Service from './Service';
import { decryptSecrets, encryptSecrets } from '@api/integrationSecrets';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class SecurityService {
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
    }

    private buildTokenUrl(grantType: string, extra: Record<string, string>): string {
        const s = this.params.integrationSettings?.settings || {};
        let url = this.service.getTokenUrl();
        url += `?grant_type=${grantType}`;
        url += `&client_id=${s.key || s.APIKEY || ''}`;
        url += `&client_secret=${s.secret || s.APISECRET || ''}`;
        for (const [k, v] of Object.entries(extra)) {
            url += `&${k}=${encodeURIComponent(v)}`;
        }
        return url;
    }

    public async retrieveToken(data: any): Promise<string | undefined> {
        try {
            const tokenUrl = this.buildTokenUrl('authorization_code', {
                code: data.code,
                redirect_uri: data.redirectUrl || data.redirect_uri || ''
            });
            const response = await this.service.get(tokenUrl, {});
            const tokenData = response.data;

            if (!tokenData?.access_token) throw new Error('No access_token in response');

            tokenData.createdAt = Date.now();
            tokenData.redirectUrl = data.redirectUrl;

            await this.persistToken(tokenData);
            this.service.setCurrentToken(tokenData.access_token);
            return tokenData.access_token;
        } catch (error: any) {
            // [ADR-0006 Karar 2] IntegrationError korunur (code/retryable üst katmana kaybolmadan ulaşır).
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][IdeaSoft:retrieveToken] ${error.message}`);
        }
    }

    public async refreshToken(): Promise<string> {
        try {
            const stored = await this.getStoredAuth();

            if (stored?.access_token && stored?.createdAt &&
                (Date.now() - stored.createdAt) < (stored.expires_in || 3600) * 1000 - 60000) {
                this.service.setCurrentToken(stored.access_token);
                return stored.access_token;
            }

            const refreshToken = stored?.refresh_token;
            if (!refreshToken) throw new Error('No refresh_token stored in DB');

            const tokenUrl = this.buildTokenUrl('refresh_token', { refresh_token: refreshToken });
            const response = await this.service.get(tokenUrl, {});
            const tokenData = response.data;

            if (!tokenData?.access_token) throw new Error('No access_token in refresh response');

            tokenData.createdAt = Date.now();
            await this.persistToken(tokenData);
            this.service.setCurrentToken(tokenData.access_token);
            return tokenData.access_token;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][IdeaSoft:refreshToken] ${error.message}`);
        }
    }

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
