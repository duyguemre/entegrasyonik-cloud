import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
export default class MenuService extends BaseApi implements IService {

    async get(): Promise<any> {
        try {
            const filterQuery = { _id: "entegrator" }
            const res = await this.applicationDB.getMenuModel().findOne(filterQuery).lean()
            if (res && res.list) return res.list
            throw (new Error("no list"))
        } catch (error) {
            console.log(error)
            throw error
        }
    }

    async retrieveFavorites() {
        try {
            const res = await this.clientDB.getFavoriteModel().find({}).sort({ order: 1 }).lean()
            if (res) return res
            throw (new Error("favorite menu error"))
        } catch (error) {
            throw error
        }
    }

    async addFavorite() {
        try {
            // Order alanındaki en yüksek değeri bulmak için
            const maxOrder = await this.clientDB.getFavoriteModel().findOne().sort({ order: -1 }).exec();

            // Yeni order değeri en yüksek değerden bir fazla olacak
            const newOrderValue = maxOrder ? maxOrder.order + 1 : 1;

            return await this.clientDB.getFavoriteModel().create({ code: this.request.code, order: newOrderValue })
        } catch (error) {
            throw error
        }
    }

    async deleteFavorite() {
        try {
            return await this.clientDB.getFavoriteModel().deleteOne({ code: this.request.code })
        } catch (error) {
            throw error
        }
    }


    async sortFavorites(): Promise<any> {
        try {
            var order = 1
            var updates = []
            for (var code of this.request.sortedCodes) {
                updates.push({
                    updateOne: {
                        filter: { code: code },
                        update: { $set: { 'order': order++ } }
                    }
                },)
            }
            const resp = await this.clientDB.getFavoriteModel().bulkWrite(updates)
            return resp
        } catch (error) {
            throw error
        }
    }

}
