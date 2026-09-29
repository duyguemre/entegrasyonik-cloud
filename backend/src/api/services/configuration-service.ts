import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import MenuService from './menu-service'
import ProductService from './product-service'
import CategoryService from './category-service'
import ChoiceService from './choice-service'
import HashtagService from './hashtag-service'
import BrandService from './brand-service'
import IntegrationService from './integration-service'

export default class ConfigurationService extends BaseApi implements IService {
    currentClientId: number = 0
    constructor(clientId: number, protected request: any) {
        super(clientId, request)
        this.currentClientId = clientId
    }

    async get(): Promise<any> {

        const menuServiceInstance = new MenuService(this.currentClientId, this.request)
        const productServiceInstance = new ProductService(this.currentClientId, this.request)
        const categoryServiceInstance = new CategoryService(this.currentClientId, this.request)
        const brandServiceInstance = new BrandService(this.currentClientId, this.request)
        const choiceServiceInstance = new ChoiceService(this.currentClientId, this.request)
        const hashtagServiceInstance = new HashtagService(this.currentClientId, this.request)
        const integrationServiceInstance = new IntegrationService(this.currentClientId, this.request)

        await Promise.all([
            menuServiceInstance.init(),
            productServiceInstance.init(),
            categoryServiceInstance.init(),
            brandServiceInstance.init(),
            choiceServiceInstance.init(),
            hashtagServiceInstance.init(),
            integrationServiceInstance.init()
        ]);

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
