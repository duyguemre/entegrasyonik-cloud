import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
import { toFetchResult, type IntegrationFetchResult, type IntegrationSubject } from '@/composables/useIntegrationError'
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




  // ---- Hata bilgisini yüzeye çıkaran EK yükleyiciler (geriye uyumlu; yukarıdaki retrieve*/get* aynen durur) ----
  // `restApi` hatada axios hata nesnesini DÖNER (fırlatmaz); eski çağıranlar bunu sessizce yutuyordu.
  // Bu yükleyiciler aynı istekleri yapar, ama sonucu `{ ok, data } | { ok:false, error }` olarak döner
  // (`error`: bkz. composables/useIntegrationError.ts). Boş liste `ok:false` + `error.empty:true` olur.
  // Önbellek davranışı eski yöntemlerle AYNI anahtarı paylaşır (yalnız boş olmayan yanıt önbelleğe girer).
  const errorContext = (integrationCode: string, operation: string, subject: IntegrationSubject) => ({
    service: 'IntegrationService/' + operation,
    integrationCode,
    platformTitle: integrationList.value?.find((item: any) => item.code == integrationCode)?.title,
    subject,
  })

  const loadIntegrationCategories = async (integrationCode: string, reset = false): Promise<IntegrationFetchResult<any[]>> => {
    const cached = integrationCategories.value.get(integrationCode)
    if (!reset && cached) return { ok: true, data: cached }
    const resp = await restApi.post("IntegrationService/retrieveCategoriesFromIntegration", { integrationCode })
    const result = toFetchResult<any[]>(resp, errorContext(integrationCode, 'retrieveCategoriesFromIntegration', 'categories'))
    if (!result.ok) return result
    const processed = processCategories(result.data, [])
    integrationCategories.value.set(integrationCode, processed)
    return { ok: true, data: processed }
  }

  const loadIntegrationCategoryChoices = async (integrationCode: string, integrationCategoryId: number): Promise<IntegrationFetchResult<any[]>> => {
    const key = integrationCode + '_' + integrationCategoryId
    const cached = integrationCategoryAttributes.value.get(key)
    if (cached) return { ok: true, data: cached }
    const resp = await restApi.post("IntegrationService/retrieveCategoryAttributesFromIntegration", { integrationCode, integrationCategoryId })
    const result = toFetchResult<any[]>(resp, errorContext(integrationCode, 'retrieveCategoryAttributesFromIntegration', 'attributes'))
    if (result.ok) integrationCategoryAttributes.value.set(key, result.data)
    return result
  }

  const loadIntegrationCategoryAttributeValues = async (integrationCode: string, integrationCategoryId: number, integrationCategoryAttributeId: string): Promise<IntegrationFetchResult<any[]>> => {
    const resp = await restApi.post("IntegrationService/retrieveCategoryAttributeValuesFromIntegration", { integrationCode, integrationCategoryId, integrationCategoryAttributeId })
    return toFetchResult<any[]>(resp, errorContext(integrationCode, 'retrieveCategoryAttributeValuesFromIntegration', 'attributeValues'))
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

  // Kiracının entegrasyonları türe göre bir kez süzülüp sıralanır (FRONTEND_CLEANUP_PLAN V-03): `getClient*()` şablonlarda ve
  // ürün listesinde satır başına çağrılıyordu, her çağrı filter+sort yapıyordu. İmzalar aynı; katalog yüklenmemişse
  // tür getirileri eskisi gibi `undefined` döner. Dönen diziler paylaşılır — çağıran değiştirmemeli (bugün hiçbiri değiştirmiyor).
  const clientIntegrationsByType = computed(() => {
    const byType = new Map<string, any[]>()
    if (!integrationList.value) return byType
    const orderByCode = new Map<string, any>()
    for (const items of Object.values(clientIntegrations.value ?? {})) {
      if (!Array.isArray(items)) continue
      for (const item of items as any[]) if (!orderByCode.has(item.code)) orderByCode.set(item.code, item)
    }
    for (const item of integrationList.value) {
      const clientIntegration = orderByCode.get(item.code)
      if (!clientIntegration) continue
      item.order = clientIntegration.order
      const code = item.type?.code
      if (!byType.has(code)) byType.set(code, [])
      byType.get(code)!.push(item)
    }
    for (const items of byType.values()) items.sort((a: any, b: any) => orderByCode.get(a.code).order - orderByCode.get(b.code).order)
    return byType
  })
  const clientIntegrationsOfType = (typeCode: string): any =>
    integrationList.value ? clientIntegrationsByType.value.get(typeCode) ?? [] : undefined

  const clientPlatforms = computed(() => [
    ...(clientIntegrationsOfType('marketplace') ?? []),
    ...(clientIntegrationsOfType('ecommerce') ?? []),
    ...(clientIntegrationsOfType('erp') ?? []),
  ])

  const getClientPlatforms = () => clientPlatforms.value
  const getClientMarketplaces = () => clientIntegrationsOfType('marketplace')
  const getClientErps = () => clientIntegrationsOfType('erp')
  const getClientShipments = () => clientIntegrationsOfType('shipment')
  const getClientECommerces = () => clientIntegrationsOfType('ecommerce')

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
    loadIntegrationCategories, loadIntegrationCategoryChoices, loadIntegrationCategoryAttributeValues,
  }
})