import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { ObjectId } from 'mongodb'
import { ApplicationError } from '@platform/core/security/Security'
export default class BrandService extends BaseApi implements IService {
    async get(parentId = 0): Promise<any> {
        try {
            const filterQuery = {}
            // Opsiyonel sayfalama (yanıt şekli aynı: dizi). Verilmezse tümü döner (FE sözleşmesi).
            let query = this.clientDB.getBrandModel().find(filterQuery).collation({ locale: "tr", strength: 2 }).sort({ isMain: -1, title: 1 })
            if (this.request?.skip) query = query.skip(Number(this.request.skip))
            if (this.request?.limit) query = query.limit(Number(this.request.limit))
            return await query.lean()
        } catch (error) {
            throw error
        }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addBrand(): Promise<any> {
        try {
            const document = { title: this.request.title }
            const resp = await this.clientDB.getBrandModel().create(document)
            return { _id: resp._id }
        } catch (error) {
            throw error
        }
    }




    @InvalidatesTenantCache('PlatformMappingProvider')
    async saveIntegrationBrand(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request.brandId as string) }
            const updateSet = { $set: { ['platforms.' + this.request.integrationCode]: this.request.integrationBrand } }
            const resp = await this.clientDB.getBrandModel().updateOne(updateQuery, updateSet)
            return { result: resp.modifiedCount == 1 ? true : false }
        } catch (error) {
            throw error
        }
    }


    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateBrand(): Promise<any> {
        try {
            // FE iki anahtar yollar: BrandSync `brandId`, BrandList `_id` (eskiden `_id` gelince rastgele ObjectId'ye yazılıp sessizce başarısız olurdu).
            const brandId = this.request.brandId ?? this.request._id
            if (!brandId) throw new ApplicationError('brandId gerekli', 400)
            const updateQuery = { _id: new ObjectId(brandId as string) }
            const updateSet = { $set: { title: this.request.title } }
            const resp = await this.clientDB.getBrandModel().updateOne(updateQuery, updateSet)
            return { result: resp.modifiedCount == 1 ? true : false }
        } catch (error) {
            throw error
        }
    }


    @InvalidatesTenantCache('PlatformMappingProvider')
    async deleteBrand(): Promise<any> {
        try {
            const deleteQuery = { _id: new ObjectId(this.request._id as string) }
            const resp = await this.clientDB.getBrandModel().deleteOne(deleteQuery)
            return resp
        } catch (error) {
            throw error
        }
    }
}
