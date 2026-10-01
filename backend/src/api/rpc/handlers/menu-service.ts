import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { MenuRepository } from '@database/repositories/app/MenuRepository'
import { FavoriteRepository } from '@database/repositories/tenant/FavoriteRepository'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'menu-service');
export default class MenuService extends BaseApi implements IService {

    private get menus() { return new MenuRepository(this.applicationDB) }
    private get favorites() { return new FavoriteRepository(this.clientDB) }

    async get(): Promise<any> {
        try {
            const res = await this.menus.findById("entegrator")
            if (res && res.list) return res.list
            throw (new Error("no list"))
        } catch (error) {
            log.error('MENU_GET_FAILED', '[MenuService] menü alınamadı', { err: error })
            throw error
        }
    }

    async retrieveFavorites() {
        const res = await this.favorites.listOrdered()
        if (res) return res
        throw (new Error("favorite menu error"))
    }

    async addFavorite() {
        return await this.favorites.add(this.request.code)
    }

    async deleteFavorite() {
        return await this.favorites.deleteByCode(this.request.code)
    }

    async sortFavorites(): Promise<any> {
        return await this.favorites.sort(this.request.sortedCodes)
    }

}
