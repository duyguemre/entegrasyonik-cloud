import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import MenuService from './menu-service'
import ProductService from './product-service'
import CategoryService from './category-service'
import ChoiceService from './choice-service'
import HashtagService from './hashtag-service'
import BrandService from './brand-service'
import IntegrationService from './integration-service'

export default class ConfigurationService extends BaseApi implements IService {

    async get(): Promise<any> {

        // ADR-0024 P1-CORE: 7 kardeş servis ApplicationDB/ClientDB'yi bu servisten DEVRALIR (init() yok; ek okuma yok).
        const sibling = <T extends BaseApi>(Svc: new (clientId: number, request: any) => T): T => this.sibling(Svc)
        const menuServiceInstance = sibling(MenuService)
        const productServiceInstance = sibling(ProductService)
        const categoryServiceInstance = sibling(CategoryService)
        const brandServiceInstance = sibling(BrandService)
        const choiceServiceInstance = sibling(ChoiceService)
        const hashtagServiceInstance = sibling(HashtagService)
        const integrationServiceInstance = sibling(IntegrationService)

        const [
            productStatistics,
            menu,
            favorites,
            choices,
            hashtags,
            categories,
            brands,
            clientIntegrations,
            integrations,
            integrationTypes
        ] = await Promise.all([
            productServiceInstance.getProductStatistics(),
            menuServiceInstance.get(),
            menuServiceInstance.retrieveFavorites(),
            choiceServiceInstance.get(),
            hashtagServiceInstance.get(),
            categoryServiceInstance.get(),
            brandServiceInstance.get(),
            integrationServiceInstance.getClientIntegrations(),
            integrationServiceInstance.get(),
            integrationServiceInstance.integrationTypes()
        ]);
        return {
            productStatistics,
            menu,
            favorites,
            categories,
            brands,
            choices,
            hashtags,
            clientIntegrations,
            integrations,
            integrationTypes
        }
    }
}
