import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { storageService } from '@services/index'
import { SettingRepository } from '@database/repositories/tenant/SettingRepository'
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations'

/**
 * Sunucu-sahipli ayar alt nesneleri: tenant ayar RPC'leriyle OKUNMAZ/YAZILMAZ (ADR-0034 BR-5: `agent` = BYOK anahtari + KVKK aktarim onayi;
 * yalniz `/api/agent/provider*` uclari yazar; MCP-2: `mcp` = tenant MCP erisimi + sahip aktarim onayi, yalniz `/api/mcp/settings` yazar). Aksi halde settings:manage sahibi bir yonetici `agent.transferConsent`i sahte yazabilir.
 */
const SERVER_OWNED_SETTINGS_KEYS = ['agent', 'mcp'] as const;

export default class SettingService extends BaseApi implements IService {
    choices: any = undefined
    private get settingsRepo() { return new SettingRepository(this.clientDB) }

    async get(): Promise<any> {
    }

    async getSettings(): Promise<any> {
        const res: any = await this.settingsRepo.findOne()
        if (res) { for (const k of SERVER_OWNED_SETTINGS_KEYS) delete res[k]; return { settings: res } }
        return {}
    }


    async updateSettings(): Promise<any> {
        const settings = this.request.settings
        settings.docId = 1
        for (const k of SERVER_OWNED_SETTINGS_KEYS) delete settings[k] // sunucu-sahipli alt nesneler istemciden yazilamaz
        const res = await this.settingsRepo.upsertSet(settings)
        if (res) { for (const k of SERVER_OWNED_SETTINGS_KEYS) delete (res as any)[k]; return res }
        return {}
    }

    async uploadLogo(): Promise<any> {
        const file = this.request.files[0];
        const { url, imageUpload } = await ImageOperations.prepareIdentityImage(this.clientId.toString(), file, 'logo');

        await storageService.uploadImage(this.clientId.toString(), imageUpload);

        // Veritabanını güncelle
        await this.settingsRepo.upsertSet({ logo: url });

        return { result: true, url };
    }
}
