import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { registerStoreReset } from '@/stores/resetRegistry'
import { classifyIntegrationError, type IntegrationErrorInfo } from '@/composables/useIntegrationError'

export const useAttributeMappingStore = defineStore('attributeMappingStore', () => {
  const restApi = useRestApi()
  const mappings = ref<any[]>([])
  /** Son `retrieveAttributeMappings` başarısızsa neden (yoksa undefined). Boş liste hata DEĞİLDİR. */
  const loadError = ref<IntegrationErrorInfo | undefined>(undefined)
  /** İlk başarılı yükleme yapıldı mı (ürün formu gibi tüketiciler `ensureLoaded` ile tembel yükler). */
  const loaded = ref(false)
  let inflight: Promise<void> | null = null

  // --- GETTERS & HELPERS ---

  const retrieveAttributeMappings = async () => {
    try {
      const response: any = await restApi.get("AttributeMappingService")
      // `restApi` hatada axios hata nesnesini DÖNER: eskiden bu, `mappings`'e olduğu gibi atanıyordu
      // (ardından `.some` çağrıları patlardı). Yalnızca dizi atanır; hata `loadError`'a yazılır.
      if (Array.isArray(response)) {
        mappings.value = response
        loadError.value = undefined
        loaded.value = true
      } else {
        const info = classifyIntegrationError(response, { service: 'AttributeMappingService', subject: 'generic' }, { expectArray: true })
        loadError.value = info && !info.empty ? info : undefined
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

  /** Henüz yüklenmediyse bir kez yükler (eşzamanlı çağrılar aynı isteği bekler). */
  const ensureLoaded = async () => {
    if (loaded.value) return
    inflight ??= retrieveAttributeMappings().finally(() => { inflight = null })
    await inflight
  }

  /**
   * [eslesme-fiyat WP2, Ek C P0-1] Yerel kategorinin bu kanaldaki platform kategori kimliği — TEK KAYNAK `AttributeMappings`
   * (`isCategoryMapping: true`). Eski `Categories.platforms` alanının yazıcısı yok (ADR-0032 Karar 3).
   */
  const platformCategoryIdFor = (integrationCode: string, localCategoryId: unknown): string | undefined => {
    if (!integrationCode || localCategoryId === undefined || localCategoryId === null || localCategoryId === '') return undefined
    const row = mappings.value.find((m: any) => m.integrationCode === integrationCode && m.isCategoryMapping === true && String(m.localCategoryId) === String(localCategoryId))
    return row?.platformCategoryId === undefined || row?.platformCategoryId === null ? undefined : String(row.platformCategoryId)
  }

  /** Yerel kategorinin bu kanaldaki ÖZELLİK eşlemeleri (kategori kaydı hariç). */
  const attributeMappingsFor = (integrationCode: string, localCategoryId: unknown): any[] =>
    mappings.value.filter((m: any) => m.integrationCode === integrationCode && m.isCategoryMapping !== true && String(m.localCategoryId) === String(localCategoryId))

  /** [eslesme-fiyat WP2] Üst (ya da başka) kategoriden kopyala; başarıda liste tazelenir. Yanıt `{result,total,copied,skipped}` ya da hata nesnesi. */
  const copyMappingsFromCategory = async (payload: { sourceLocalCategoryId: string; targetLocalCategoryId: string; integrationCode: string; overwrite?: boolean }) => {
    const res: any = await restApi.post('AttributeMappingService/copyMappingsFromCategory', payload)
    if (res?.result === true) await retrieveAttributeMappings()
    return res
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
  registerStoreReset('attributeMappingStore', () => { mappings.value = []; loadError.value = undefined; loaded.value = false })

  return {
    mappings,
    loadError,
    loaded,
    retrieveAttributeMappings,
    ensureLoaded,
    platformCategoryIdFor,
    attributeMappingsFor,
    copyMappingsFromCategory,
    getMappingDefinition,
    isIntegrationAttributeValueMapped,
    isIntegrationAttributeMapped,
    isIntegrationCategoryMapped,
    saveCategoryMapping,
    saveAttributeMapping,
    saveAttributeValueMapping
  }
})