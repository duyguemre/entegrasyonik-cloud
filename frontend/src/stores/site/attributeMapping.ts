import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { registerStoreReset } from '@/stores/resetRegistry'

export const useAttributeMappingStore = defineStore('attributeMappingStore', () => {
  const restApi = useRestApi()
  const mappings = ref<any[]>([])

  // --- GETTERS & HELPERS ---

  const retrieveAttributeMappings = async () => {
    try {
      const response: any = await restApi.get("AttributeMappingService")
      if (response) {
        mappings.value = response
      }
    } catch (error) {
      logger.error('Özellik eşleşmeleri alınamadı', { module: 'attributeMapping', op: 'retrieveAttributeMappings', error })
    }
  }

  const getMappingDefinition = (
    integrationCode: string,
    platformCategoryId: string,
    attributeId?: string
  ) => {
    if (!mappings.value) return null;

    if (attributeId) {
      const specificMatch = mappings.value.find((m: any) =>
        m.integrationCode === integrationCode &&
        m.platformCategoryId?.toString() === platformCategoryId?.toString() &&
        m.platformAttributeId === attributeId?.toString() &&
        m.localChoiceId
      );
      if (specificMatch) return specificMatch;
    }

    return mappings.value.find((m: any) =>
      m.integrationCode === integrationCode &&
      m.platformCategoryId?.toString() === platformCategoryId?.toString()
    );
  }

  const isIntegrationCategoryMapped = (integrationCode: string, platformCategoryId: string): boolean => {
    if (!mappings.value) return false;
    return mappings.value.some((m: any) =>
      m.integrationCode === integrationCode &&
      m.platformCategoryId?.toString() === platformCategoryId?.toString()
    );
  }

  const isIntegrationAttributeMapped = (integrationCode: string, platformCategoryId: string, attributeId: string): boolean => {
    if (!mappings.value) return false;
    return mappings.value.some((m: any) =>
      m.integrationCode === integrationCode &&
      m.platformCategoryId?.toString() === platformCategoryId?.toString() &&
      m.platformAttributeId === attributeId?.toString()
    );
  }

  const isIntegrationAttributeValueMapped = (
    integrationCode: string,
    platformCategoryId: string,
    attributeId: string,
    attributeValueId: string,
    attributeValue: string
  ): boolean => {
    const attributeMapping = getMappingDefinition(integrationCode, platformCategoryId, attributeId)
    if (!attributeMapping || !attributeMapping.values) return false
    return attributeMapping.values.some((v: any) => {
      const isIdMatch = attributeValueId && v.platformValueId === attributeValueId
      const isNameMatch = attributeValue && v.platformValueName?.trim().toLowerCase() === attributeValue.trim().toLowerCase()
      return (isIdMatch || isNameMatch) && v.localValueId
    })
  }

  // --- ACTION METHODS (Taşınan Metodlar) ---

  /**
   * Kategori Düzeyinde Eşleştirme Kaydet
   */
  const saveCategoryMapping = async (payload: {
    integrationCode: string,
    platformCategoryId: string,
    localCategoryId: string
  }) => {
    try {
      const res = await restApi.post("AttributeMappingService/saveCategoryMapping", {
        ...payload,
        isCategoryMapping: true
      })
      if (res) await retrieveAttributeMappings()
      return res
    } catch (error) { throw error }
  }

  /**
   * Özellik (Attribute) - Seçenek Grubu Bağlantısı Kaydet
   */
  const saveAttributeMapping = async (payload: any) => {
    try {
      // Dışarıdan gelen payload'a zorunlu isCategoryMapping false bilgisini ekliyoruz
      const res = await restApi.post("AttributeMappingService/saveAttributeMapping", {
        ...payload,
        isCategoryMapping: false
      })
      if (res) await retrieveAttributeMappings()
      return res
    } catch (error) { throw error }
  }

  /**
   * Özellik Değeri (Value) Eşleştirmesi Kaydet
   */
  const saveAttributeValueMapping = async (payload: any) => {
    try {
      const res = await restApi.post("AttributeMappingService/saveAttributeValueMapping", {
        ...payload,
        isCategoryMapping: false
      })
      if (res) await retrieveAttributeMappings()
      return res
    } catch (error) { throw error }
  }

  // R9b: çıkış sonrası önceki kiracının özellik eşlemeleri kalmasın.
  registerStoreReset('attributeMappingStore', () => { mappings.value = [] })

  return {
    mappings,
    retrieveAttributeMappings,
    getMappingDefinition,
    isIntegrationAttributeValueMapped,
    isIntegrationAttributeMapped,
    isIntegrationCategoryMapped,
    saveCategoryMapping,
    saveAttributeMapping,
    saveAttributeValueMapping
  }
})