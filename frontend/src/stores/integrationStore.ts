import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
import { get } from 'sortablejs'
export const useIntegrationStore = defineStore('integrationStore', () => {
  const restApi = useRestApi()
  const integrationImageBase = '/assets/images/integrations/'
  const integrationCategories = ref(new Map<string, any>())
  const integrationList = ref()
  const integrationTypes = ref()
  const clientIntegrations: any = ref([])

  const integrationCategoryAttributes: any = ref(new Map())

  const processCategories = (categories: any, breadcrumb: any) => {
    var categoryList = []
    for (let category of categories) {
      category.breadcrumb = [...breadcrumb, category.title]
      categoryList.push(category)
      if (category.children && category.children.length > 0) {
        let childCategoryList: any = processCategories(category.children, category.breadcrumb)
        if (!category.childSearch) category.childSearch = [category.title]
        for (let childCategory of childCategoryList) {
          category.childSearch.push(childCategory.title)
        }
        if (childCategoryList && childCategoryList.length > 0) {
          categoryList = categoryList.concat(childCategoryList)
        }
      }
    }
    return categoryList
  }


  const retrievePlatformInfos = async (integrationCode: any) => {
    const response = await restApi.post("IntegrationService/retrievePlatformInfos", { integrationCode: integrationCode })
    if (response) {
      return response
    }
    return undefined
  }


  const getServiceName = (integrationCode: any) => {
    let marketPlacelientIntegration = clientIntegrations.value?.marketplace?.find((marketplace: any) => marketplace.code == integrationCode)
    let ecommerceClientIntegration = clientIntegrations.value?.ecommerce?.find((ecommerce: any) => ecommerce.code == integrationCode)
    return marketPlacelientIntegration ? 'IntegrationService' : 'ECommerceService'
  }

  const retrieveIntegrationCategories = async (integrationCode: string) => {
    await restApi.post("IntegrationService/retrieveCategoriesFromIntegration", { integrationCode }).then((response: any) => {
      if (response) {
        integrationCategories.value.set(integrationCode, processCategories(response, []))
        return response
      }
      return undefined
    })
  }

  const retrieveClientIntegrations = async () => {
    const response = await restApi.post("IntegrationService/getClientIntegrations", { projection: 0 })
    if (response) {
      clientIntegrations.value = response
    }
  }

  const sortClientMarketplaces = async (sortedCodes: Array<string>) => {
    const response = await restApi.post("IntegrationService/sortClientMarketplaces", { sortedCodes })
    if (response) {
      retrieveClientIntegrations()
    }
  }



  const retrieveIntegrationBrands = async (integrationCode: string, searchText: string) => {
    const response = await restApi.post("IntegrationService/retrieveBrandsFromIntegration", { integrationCode, searchText })
    if (response) {
      return response
    }
    return undefined
  }



  const init = async () => {
    integrationTypes.value = await restApi.post("IntegrationService/integrationTypes", {})
    integrationList.value = await restApi.get("IntegrationService")
  }
  const clientInit = async () => {
    retrieveClientIntegrations()
    await init()
  }
  const getIntegration = (integrationCode: string) => {
    for (const integration of integrationList.value) {
      if (integration.code == integrationCode) {
        return integration
      }
    }
    return undefined
  }
  const getIntegrationImagePathByCode = (integrationCode: any) => {
    let integration = getIntegration(integrationCode)
    return getIntegrationImagePath(integration)
  }


  const getIntegrationImagePath = (integration: any) => {
    if (integration)
      return integrationImageBase + integration.type.code + '/' + integration.logo
    return undefined
    /*     let paths: any = new Map()
        let foundIntegration: any = getIntegration(integrationCode)
        if (foundIntegration) {
          for (const type of integrationTypes.value) {
            if (type._id == foundIntegration._id) {
              return integrationImageBase + type.code + '/' + foundIntegration.logo
            }
          }
        }
        return undefined */
  }

  const getIntegrationImagePathWithIntegrationCode = (integrationCode: any) => {
    let foundIntegration: any = getIntegration(integrationCode)

    if (foundIntegration)
      return integrationImageBase + foundIntegration.type.code + '/' + foundIntegration.logo
    return undefined
    /*     let paths: any = new Map()
        if (foundIntegration) {
          for (const type of integrationTypes.value) {
            if (type._id == foundIntegration._id) {
              return integrationImageBase + type.code + '/' + foundIntegration.logo
            }
          }
        }
        return undefined */
  }


  const getIntegrationCategories = async (integrationCode: string, reset = false) => {
    let categories = integrationCategories.value.get(integrationCode)
    if (reset == true || categories == undefined) {
      await retrieveIntegrationCategories(integrationCode)
      categories = integrationCategories.value.get(integrationCode)
    }
    return categories
  }

  const getIntegrationCategory2 = (integrationCode: string, integrationCategoryId: any) => {
    let categories = integrationCategories.value.get(integrationCode)
    if (categories) {
      return categories.find((item: any) => item._id == integrationCategoryId)
    }
    return undefined
  }


  const getIntegrationCategory3 = async (integrationCode: string, integrationCategoryId: any) => {
    let categories = await getIntegrationCategories(integrationCode)
    if (categories) {
      return categories.find((item: any) => item._id == integrationCategoryId)
    }
    return undefined
  }



  //TODO burada cache tutuluyor belki sınır koymak gerekebilir
  const retrieveIntegrationCategoryChoices = async (integrationCode: string, integrationCategoryId: number) => {
    const key = integrationCode + '_' + integrationCategoryId
    if (integrationCode && integrationCategoryId && integrationCategoryId != -1) {
      if (!integrationCategoryAttributes.value.has(key)) {
        const resp = await restApi.post("IntegrationService/retrieveCategoryAttributesFromIntegration", { integrationCode, integrationCategoryId })
        if (resp && resp.length > 0)
          integrationCategoryAttributes.value.set(key, resp)
      }
    }
    return integrationCategoryAttributes.value.get(key)
  }


  const retrieveIntegrationCategoryAttributeValues = async (integrationCode: string, integrationCategoryId: number, integrationCategoryAttributeId: string) => {
    if (integrationCode && integrationCategoryId && integrationCategoryId != -1 && integrationCategoryAttributeId)
      return await restApi.post("IntegrationService/retrieveCategoryAttributeValuesFromIntegration", { integrationCode, integrationCategoryId, integrationCategoryAttributeId })
  }




  const retrieveCommisionForCategoryFromIntegration = async (integrationCode: string, integrationCategoryId: number) => {
    if (integrationCode && integrationCategoryId && integrationCategoryId != -1)
      return await restApi.post("IntegrationService/retrieveCommisionForCategoryFromIntegration", { integrationCode, integrationCategoryId })
  }


  const getIntegrationTitle = (integrationCode: string) => {
    const integration = integrationList.value.find((item: any) => item.code == integrationCode)
    return integration?.title
  }


  const getIntegrationCustomMap = (integrationCode: string) => {
    const integration = integrationList.value.find((item: any) => item.code == integrationCode)
    return integration?.customMap
  }

  const getPlatforms = () => {
    /*     return integrationList.value.filter((item: any) => item.type.code == 'marketplace') */
    return integrationList.value
  }

  const getClientPlatforms = () => {
    /*     return integrationList.value.filter((item: any) => item.type.code == 'marketplace') */
    return [...getClientMarketplaces(), ...getClientECommerces(), ...getClientErps()]
  }

  const getClientMarketplaces = () => {
    if (integrationList.value) {
      const temp = integrationList.value.filter((item: any) => item.type.code == 'marketplace' && isClientHasIntegration(item))
      if (temp) temp.sort((a: any, b: any) => a.order - b.order);
      return temp
    }
  }

  const getClientErps = () => {
    if (integrationList.value) {
      const temp = integrationList.value.filter((item: any) => item.type.code == 'erp' && isClientHasIntegration(item))
      if (temp) temp.sort((a: any, b: any) => a.order - b.order);
      return temp
    }
  }



  const getClientShipments = () => {
    if (integrationList.value) {
      const temp = integrationList.value.filter((item: any) => item.type.code == 'shipment' && isClientHasIntegration(item))
      if (temp) temp.sort((a: any, b: any) => a.order - b.order);
      return temp
    }
  }

  const getClientECommerces = () => {
    if (integrationList.value) {
      const temp = integrationList.value.filter((item: any) => item.type.code == 'ecommerce' && isClientHasIntegration(item))
      if (temp) temp.sort((a: any, b: any) => a.order - b.order);
      return temp
    }
  }

  const isIntegrationType = (code: any, typeId: string) => {
    const integrationType = integrationTypes.value.find((item: any) => item._id == typeId)
    console.log(typeId)
    return integrationType?.code == code
  }

  const getClientIntegration = (integrationCode: any) => { //TODO
    if (!clientIntegrations.value) return undefined
    return Object.entries(clientIntegrations.value).flatMap(([key, items]: any) =>
      Array.isArray(items)
        ? items
          .filter((item: any) => item.code === integrationCode)
          .map((item: any) => (item))
        : []
    )[0];
  }

  const isClientHasIntegration = (integration: any) => { //TODO
    let temp = getClientIntegration(integration.code)
    if (temp) {
      integration.order = temp.order
      return true
    }
    return false
  }


  const hasBrandMapping = (integrationCode: string) => {
    const integration = integrationList.value.find((item: any) => item.code == integrationCode)
    if (integration) {
      if (integration.hasBrandMapping == false)
        return false
      else return true
    }
    return false
  }

  // R9b: kiracıya özel entegrasyon durumu çıkışta sıfırlanır. `integrationList`/`integrationTypes` (platform kataloğu)
  // kiracıya özel DEĞİL ve giriş ekranı (LoginView -> init) tarafından yüklendiği için bilerek SIFIRLANMAZ.
  registerStoreReset('integrationStore', () => {
    clientIntegrations.value = []
    integrationCategories.value = new Map<string, any>()
    integrationCategoryAttributes.value = new Map()
  })

  return {
    init, getIntegrationImagePathByCode, getClientErps, getClientECommerces, getIntegrationImagePathWithIntegrationCode, getClientShipments, getClientIntegration, retrievePlatformInfos, getIntegrationTitle, getPlatforms, getIntegrationCustomMap, getIntegrationCategory2, retrieveIntegrationBrands, retrieveIntegrationCategoryChoices, getIntegration, getIntegrationCategories, getIntegrationImagePath, retrieveCommisionForCategoryFromIntegration, integrationList, integrationTypes, getClientMarketplaces, isClientHasIntegration, hasBrandMapping, sortClientMarketplaces, clientInit, retrieveIntegrationCategoryAttributeValues, getClientPlatforms, getIntegrationCategory3,
  }
})