import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
export default class CategoryService extends BaseApi implements IService {
    async get(parentId = 0): Promise<any> {
        try {
            const filterQuery = {}
            const categories = await this.clientDB.getCategoryModel().find(filterQuery).sort({ order: 1 }).lean()
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
        } catch (error) {
            throw error
        }
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

    async addCategory(): Promise<any> {
        try {
            var parentId: string = this.request.parentCategoryId
            if (!parentId) {
                const mainCategory = await this.clientDB.getCategoryModel().findOne({ isMain: true })
                parentId = mainCategory._id
            }
            const document = { parentId: new ObjectId(parentId), title: this.request.title, icon: 'mdi-shape', order: Date.now() }
            const resp = await this.clientDB.getCategoryModel().create(document)
            return { _id: resp._id }
        } catch (error) {
            throw error
        }
    }

    async saveIntegrationCategory(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request.categoryId as string) }
            const updateSet = { $set: { ['platforms.' + this.request.integrationCode]: this.request.integrationCategoryId } }
            const resp = await this.clientDB.getCategoryModel().updateOne(updateQuery, updateSet)
            return { result: resp.modifiedCount == 1 ? true : false }
        } catch (error) {
            throw error
        }
    }


    async updateCategory(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request.categoryId as string) }
            const updateSet = { $set: { title: this.request.title } }
            const resp = await this.clientDB.getCategoryModel().updateOne(updateQuery, updateSet)
            return { result: resp.modifiedCount == 1 ? true : false }
        } catch (error) {
            throw error
        }
    }

    async moveCategory(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request.moveCategoryId as string) }
            const updateSet = { $set: { parentId: this.request.moveInCategoryId } }
            const resp = await this.clientDB.getCategoryModel().updateOne(updateQuery, updateSet)
            const updatedCategories = await this.get(this.request.parentId)
            return { result: resp, categories: updatedCategories }
        } catch (error) {
            throw error
        }
    }

    async changeOrderCategory(): Promise<any> {
        try {
            const filterQuery = { $or: [{ '_id': new ObjectId(this.request.fromCategoryId as string) }, { '_id': new ObjectId(this.request.toCategoryId as string) }] }
            const categories = await this.clientDB.getCategoryModel().find(filterQuery)
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
                console.log(fromCategory, toCategory)
                let tempOrder = -1
                tempOrder = fromCategory.order
                fromCategory.order = toCategory.order
                toCategory.order = tempOrder


                var updateQuery = { _id: new ObjectId(fromCategory._id as string) }
                var updateSet: any = { $set: { order: fromCategory.order } }
                fromResp = await this.clientDB.getCategoryModel().updateOne(updateQuery, updateSet)

                updateQuery = { _id: new ObjectId(toCategory._id as string) }
                updateSet = { $set: { order: toCategory.order } }
                toResp = await this.clientDB.getCategoryModel().updateOne(updateQuery, updateSet)

            }
            return { result: { fromResp, toResp } }
        } catch (error) {
            throw error
        }
    }

    async deleteCategory(): Promise<any> {
        try {
            const deleteQuery = { _id: new ObjectId(this.request._id as string) }
            const resp = await this.clientDB.getCategoryModel().deleteOne(deleteQuery)
            return resp
        } catch (error) {
            throw error
        }
    }
}
