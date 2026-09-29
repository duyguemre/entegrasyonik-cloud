import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ImageOperations, storageService } from '@services/index'

export default class SettingService extends BaseApi implements IService {
    choices: any = undefined
    async get(): Promise<any> {
    }

    async getSettings(): Promise<any> {
        try {
            const filterQuery = {}
            const res = await this.clientDB.getSettingModel().findOne(filterQuery).lean()
            if (res) return { settings: res }
            return {}
        } catch (error) {
            throw error
        }
    }


    async updateSettings(): Promise<any> {
        try {
            const settings = this.request.settings
            settings.docId = 1
            const filterQuery = { docId: 1 }
            const updateQuery = { $set: settings }
            const res = await this.clientDB.getSettingModel().findOneAndUpdate(filterQuery, updateQuery, { new: true, upsert: true }).lean()
            if (res) return res
            return {}
        } catch (error) {
            throw error
        }
    }

    async uploadLogo(): Promise<any> {
        try {
            const file = this.request.files[0];
            const { url, imageUpload } = await ImageOperations.prepareIdentityImage(this.clientId.toString(), file, 'logo');

            await storageService.uploadImage(this.clientId.toString(), imageUpload);

            // Veritabanını güncelle
            const filterQuery = { docId: 1 };
            const updateQuery = { $set: { logo: url } };
            await this.clientDB.getSettingModel().findOneAndUpdate(filterQuery, updateQuery, { new: true, upsert: true }).lean();

            return { result: true, url };
        } catch (error) {
            throw error;
        }
    }
}
