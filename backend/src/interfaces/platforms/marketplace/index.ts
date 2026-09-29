import { IBrand, ICategory, ICategoryAttribute, ICategoryAttributeValue, IOrderItem, IProduct } from "../../"

export interface IBaseMarketIntegration {
    retrieveCategories?(): Promise<ICategory[]>
    retrieveCategoryAttributes?(categoryId: string): Promise<ICategoryAttribute[]>,
    retrieveCategoryAttributeValues?(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]>,
    retrieveBrands(query: any): Promise<IBrand[]>
    retrieveOrders(): Promise<Array<IOrderItem>>
    retrieveShipments(): Promise<Array<any>>
    retrieveCategoryCommision(integrationCategoryId: any): Promise<any>



    getToken(integrationCode: string, data: any): Promise<string | undefined>;
    getCategories(integrationCode: string): Promise<ICategory[]>;
    getCategoryAttributes(integrationCode: string, categoryId: string): Promise<ICategoryAttribute[]>;
    getCategoryAttributeValues?(integrationCode: string, categoryId: string, attributeId: any): Promise<ICategoryAttributeValue[]>;
    getProducts(integrationCode: string, query?: any): Promise<IProduct[]>
    getBrands(integrationCode: string, searchText?: string): Promise<IBrand[]>

    getCategoryCommision(integrationCode: string, integrationCategoryId: any): Promise<any>
    getOrders(integrationCode: string): Promise<Array<IOrderItem>>
    getShipments(integrationCode: string): Promise<Array<any>>

    transferProducts(integrationCode: string, products: Array<IProduct>): Promise<any>
    updateProductPrice(integrationCode: string, product: Array<IProduct>): Promise<any>
    updateProductStock(integrationCode: string, product: Array<IProduct>): Promise<any>
    updateProductStatuses(integrationCode: string, payload: any): Promise<any>
    updateProduct(integrationCode: string, product: Array<IProduct>): Promise<any>
    checkBatchProduct(integrationCode: string, payload: any): Promise<any>

}




