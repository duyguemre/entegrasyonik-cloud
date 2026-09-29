import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
export default class BrandService extends BaseApi implements IService {
    async get(parentId = 0): Promise<any> {
        try {
            const filterQuery = {}
            return await this.clientDB.getBrandModel().find(filterQuery).collation({ locale: "tr", strength: 2 }).sort({ isMain: -1, title: 1 }).lean()
        } catch (error) {
            throw error
        }
    }

    async addBrand(): Promise<any> {
        try {
            const document = { title: this.request.title }
            const resp = await this.clientDB.getBrandModel().create(document)
            return { _id: resp._id }
        } catch (error) {
            throw error
        }
    }




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


    async updateBrand(): Promise<any> {
        try {
            const updateQuery = { _id: new ObjectId(this.request.brandId as string) }
            const updateSet = { $set: { title: this.request.title } }
            const resp = await this.clientDB.getBrandModel().updateOne(updateQuery, updateSet)
            return { result: resp.modifiedCount == 1 ? true : false }
        } catch (error) {
            throw error
        }
    }


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
