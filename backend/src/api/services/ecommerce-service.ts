/* import { IService, BaseApi, PLATFORM_PROCESS } from 'library'
import { ObjectId } from 'mongodb'
import ECommerce from 'ecommerce'
import { addToQueue, IBaseMarketIntegration, QueueName } from 'utility'


export default class ECommerceService extends BaseApi implements IService {

    async get(): Promise<any> {
        try {
        } catch (error) {
            throw error
        }
    }

    private async getClientIntegrations(integrationCode: string): Promise<any> {
        try {
            const integrations = await this.applicationDB.getIntegrationModel().find().lean();
            const clientIntegrations = await this.clientDB.getClientIntegrationModel().findOne().lean();
            for (const integration of integrations) {
                if (integration.code !== integrationCode) continue; // sadece belirli entegrasyon kodunu getir
                const clientIntegration = clientIntegrations?.ecommerce?.find((item: any) => item.code == integration.code)
                if (clientIntegration) {
                    return { ...integration, settings: clientIntegration.settings }
                }
            }
        } catch (error) {
            throw error
        }
    }


    async retrieveClientECommerceSettings(): Promise<any> {
        try {
            const integrationCode = this.request.integrationCode;

            const doc = await this.clientDB.getClientIntegrationModel().findOne(
                { 'ecommerce.code': integrationCode },
                { ecommerce: { $elemMatch: { code: integrationCode } }, _id: 0 } // _id çıkarılır, sadece ilgili shipment elemanı döner
            ).lean();
            const ecommerceSettings = doc?.ecommerce?.[0]
            if (ecommerceSettings?.settings?.auth?.access_token) {
                ecommerceSettings.settings.auth.access_token = 'sensitive'
            }
            if (ecommerceSettings?.settings?.auth?.refresh_token) {
                ecommerceSettings.settings.auth.refresh_token = 'sensitive'
            }
            return doc?.ecommerce?.[0] || null;
        } catch (error) {
            throw error
        }
    }

    async saveClientECommerceSettings(): Promise<any> {
        try {
            const filterQuery = { 'ecommerce.code': this.request.clientECommerce.code }
            const clientECommerceSettings = this.request.clientECommerce.settings
            delete clientECommerceSettings.auth
            const setObject = Object.fromEntries(
                Object.entries(clientECommerceSettings).map(([key, value]) => [`ecommerce.$.settings.${key}`, value])
            )
            const editIntegration = await this.clientDB.getClientIntegrationModel().findOneAndUpdate(filterQuery, { $set: setObject },
                { upsert: false, returnDocument: 'after' }
            ).lean()
            return editIntegration.ecommerce.find((ecommerce: any) => ecommerce.code === this.request.clientECommerce.code) || null
        } catch (error) {
            throw error
        }
    }




    async retrieveAndSetExternalToken(): Promise<any> {
        try {
            const ecommerce: IBaseMarketIntegration = new ECommerce(this.currentClientId, this.applicationDB, this.clientDB)
            return await ecommerce.getToken(this.request.integrationCode, this.request.data)
        } catch (error) {
            throw error
        }
    }

    async retrieveCategoriesFromIntegration() {
        try {
            const ecommerce: IBaseMarketIntegration = new ECommerce(this.currentClientId, this.applicationDB, this.clientDB)
            return await ecommerce.getCategories(this.request.integrationCode)
        } catch (error) {
            throw error
        }
    }

    async retrieveCategoryAttributesFromIntegration() {
        try {
            const ecommerce: IBaseMarketIntegration = new ECommerce(this.currentClientId, this.applicationDB, this.clientDB)
            return await ecommerce.getCategoryAttributes(this.request.integrationCode, this.request.categoryId)
        } catch (error) {
            throw error
        }
    }

    async retrieveBrandsFromIntegration() {
        try {
            const ecommerce: IBaseMarketIntegration = new ECommerce(this.currentClientId, this.applicationDB, this.clientDB)
            return await ecommerce.getBrands(this.request.integrationCode)
        } catch (error) {
            throw error
        }
    }


    async retrieveProductsFromIntegration() {
        try {
            const ecommerce: IBaseMarketIntegration = new ECommerce(this.currentClientId, this.applicationDB, this.clientDB)
            return await ecommerce.getProducts(this.request.integrationCode)
        } catch (error) {
            throw error
        }
    }




    async deliverOrder(): Promise<any> {
        try {
        } catch (error) {
            throw error
        }
    }
    async trackOrder(): Promise<any> {
        try {
        } catch (error) {
            throw error
        }
    }
} */