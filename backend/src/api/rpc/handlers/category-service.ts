import { InvalidatesTenantCache } from '@utils/decorator/cache'
import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { deleteMappingsOfCategory } from '@operations/catalog/mapping/mappingCleanup'
import { CategoryRepository } from '@database/repositories/tenant/CategoryRepository'
import { AttributeMappingRepository } from '@database/repositories/tenant/AttributeMappingRepository'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'category-service');

export default class CategoryService extends BaseApi implements IService {
    // Getter: test, servisi kurduktan SONRA `svc.clientDB` atar (BrandService deseni).
    private get categories() { return new CategoryRepository(this.clientDB) }
    private get mappings() { return new AttributeMappingRepository(this.clientDB) }

    async get(parentId = 0): Promise<any> {
        const categories = await this.categories.listOrdered()
        if (categories?.length <= 0) return []
        var mainCategory: any = undefined
        for (const category of categories) {
            if (category.parentId == 0) {
                mainCategory = category
                break
            }
        }
        const structedCategories: any = this.buildCategory(mainCategory._id, categories, 0)

        return [mainCategory, ...structedCategories]
    }

    buildCategory(parentId: any, categories: any, level: number): any {
        const hebele = []
        for (const category of categories) {
            if (!parentId.equals(category.parentId)) continue
            category.menu = false
            category.newTitle = ''
            category.updateTitle = '' + level
            category.isOpen = false
            category.isOrderDropPossible = false
            category.isDropPossible = false
            category.level = level
            category.children = this.buildCategory(category._id, categories, level + 1)
            hebele.push(category)
        }
        return hebele
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async addCategory(): Promise<any> {
        var parentId: string = this.request.parentCategoryId
        if (!parentId) {
            const mainCategory = await this.categories.findMain()
            parentId = mainCategory._id
        }
        const document = { parentId: new ObjectId(parentId), title: this.request.title, icon: 'mdi-shape', order: Date.now() }
        const resp = await this.categories.create(document)
        return { _id: resp._id }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    @InvalidatesTenantCache('PlatformMappingProvider')
    async updateCategory(): Promise<any> {
        const resp = await this.categories.updateTitle(this.request.categoryId as string, this.request.title)
        return { result: resp.modifiedCount == 1 ? true : false }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async moveCategory(): Promise<any> {
        const resp = await this.categories.setParent(this.request.moveCategoryId as string, this.request.moveInCategoryId)
        const updatedCategories = await this.get(this.request.parentId)
        return { result: resp, categories: updatedCategories }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async changeOrderCategory(): Promise<any> {
        const categories = await this.categories.findPair(this.request.fromCategoryId as string, this.request.toCategoryId as string)
        var fromResp: any = undefined
        var toResp: any = undefined
        if (categories && categories.length == 2) {
            let fromCategory: any = undefined
            let toCategory: any = undefined
            if (categories[0]._id == this.request.fromCategoryId) {
                fromCategory = categories[0]
                toCategory = categories[1]
            } else {
                fromCategory = categories[1]
                toCategory = categories[0]
            }
            log.debug('CATEGORY_REORDER', '[CategoryService] sıra değişimi', { fromId: String(fromCategory?._id ?? ''), toId: String(toCategory?._id ?? '') })
            let tempOrder = -1
            tempOrder = fromCategory.order
            fromCategory.order = toCategory.order
            toCategory.order = tempOrder

            fromResp = await this.categories.setOrder(fromCategory._id as string, fromCategory.order)
            toResp = await this.categories.setOrder(toCategory._id as string, toCategory.order)
        }
        return { result: { fromResp, toResp } }
    }

    @InvalidatesTenantCache('PlatformMappingProvider')
    async deleteCategory(): Promise<any> {
        const resp = await this.categories.remove(this.request._id as string)
        // Yetim referans temizliği (P1-5): idempotent, silme sonucundan bağımsız. Yanıt şekli korunur (+ sayaç alanı).
        const deletedMappings = await deleteMappingsOfCategory(this.mappings, String(this.request._id))
        return { ...resp, deletedMappings }
    }
}
