import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { BrandRepository } from '@database/repositories/tenant/BrandRepository'

export default class BrandService extends BaseApi implements IService {
    private get brands() { return new BrandRepository(this.clientDB) }

    async get(_parentId = 0): Promise<any> {
        // Opsiyonel sayfalama (yanıt şekli aynı: dizi). Verilmezse tümü döner (FE sözleşmesi).
        return await this.brands.list({ skip: this.request?.skip, limit: this.request?.limit })
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addBrand(): Promise<any> {
        return await this.brands.create(this.request.title)
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async saveIntegrationBrand(): Promise<any> {
        const result = await this.brands.setPlatformBrand(this.request.brandId as string, this.request.integrationCode, this.request.integrationBrand)
        return { result }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateBrand(): Promise<any> {
        // FE iki anahtar yollar: BrandSync `brandId`, BrandList `_id` (eskiden `_id` gelince rastgele ObjectId'ye yazılıp sessizce başarısız olurdu).
        const brandId = this.request.brandId ?? this.request._id
        if (!brandId) throw new ApplicationError('brandId gerekli', 400)
        return { result: await this.brands.updateTitle(brandId as string, this.request.title) }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async deleteBrand(): Promise<any> {
        return await this.brands.delete(this.request._id as string)
    }
}
