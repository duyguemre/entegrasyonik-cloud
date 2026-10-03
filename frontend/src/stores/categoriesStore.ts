import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
import type { CreateResult } from '@/components/common/quickCreate'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
export const useCategoriesStore = defineStore('categoriesStore', () => {
  const categories = ref()
  const selectCategories = ref()
  /** Son `retrieve` durumu (Kategoriler ekranı yükleniyor/hata/boş ayrımı için; diğer tüketiciler yok sayar). */
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const restApi = useRestApi()

  const getCategory = (_id: any) => {
    if (selectCategories.value == undefined || selectCategories.value.length == 0) {
      return { title: '-' }
    }
    for (var category of (selectCategories.value || [])) {
      if (category._id == _id)
        return category
    }
  }

  const getCategoryTitle = (_id: any) => {
    const category = getCategory(_id)
    return category?.title
  }



  /**
   * [eslesme-fiyat WP2, Ek C P0-1] Kategori eşleme durumu — TEK KAYNAK `AttributeMappings` (attributeMapping store).
   * Eski sürüm `Categories.platforms` okuyordu (backend bu alanı DÖNMEZ → kod hep 'SUCCESS'; "eşleme eksik" uyarısı ölüydü).
   * Seçenek (CHOICE) denetimi kategori düzeyinde bilinemez (choiceIds alanı yok); özellik düzeyindeki eksikler formda gösterilir.
   */
  const checkCategoryPlatformMapping = (categoryId: any, integrationCode: any): { code: 'SUCCESS' | 'PLATFORM'; choices: string[] } =>
    (useAttributeMappingStore().platformCategoryIdFor(integrationCode, categoryId) ? { code: 'SUCCESS', choices: [] } : { code: 'PLATFORM', choices: [] })

  /** [eslesme-fiyat WP2] Yerel kategorinin kanal kategori kimliği (AttributeMappings); eşleme yoksa undefined. */
  const getIntegrationCategoryId = (integrationCode: any, categoryId: any): string | undefined =>
    useAttributeMappingStore().platformCategoryIdFor(integrationCode, categoryId)

  const retrieve = async () => {
    status.value = 'loading'
    await restApi.get("CategoryService").then((resp: any) => {
      if (resp && resp.length > 0) {
        categories.value = resp
        selectCategories.value = processCategories(categories.value, [])
      }
      status.value = Array.isArray(resp) ? 'ready' : 'error'
    }).catch(() => { status.value = 'error' })
    return categories.value
  }

  const countOfCategories = () => {
    if (!categories.value) return 0
    const countCategories = (nodes: any) => {
      let count = 0;

      for (const node of nodes) {
        count += 1; // kendisini say
        if (node.children && node.children.length > 0) {
          count += countCategories(node.children); // çocuklarını ekle
        }
      }
      return count;
    }


    return countCategories(categories.value) - 1
  }

  /** FR2-PFORM 23: istek beklenir; başarıda ağaç yenilenir ve yeni kimlik döner, hata yutulmaz. Üst yoksa ana kök. */
  const addCategory = async (newCategory: any): Promise<CreateResult> => {
    if (!newCategory.parentId) {
      for (const category of categories.value ?? []) {
        if (category.isMain == true) {
          newCategory.parentId = category._id
          break
        }
      }
    }
    const response: any = await restApi.post("CategoryService/addCategory", { parentCategoryId: newCategory.parentId || undefined, title: newCategory.title })
    if (response && response._id) {
      await retrieve()
      return { id: String(response._id) }
    }
    return { error: response }
  }


  const processCategories = (categories: any, breadcrumb: any) => {
    var categoryList = []
    if (categories) {
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
    }
    return categoryList
  }

  const getSelectCategories = (reset = false) => {
    if (reset == true) retrieve()
    return selectCategories
  }

  const getCategories = (reset = false) => {
    if (reset == true) retrieve()
    return categories
  }

  // R9b: çıkış sonrası önceki kiracının kategori önbelleği kalmasın.
  registerStoreReset('categoriesStore', () => { categories.value = undefined; selectCategories.value = undefined; status.value = 'idle' })

  return { status, retrieve, getCategoryTitle, checkCategoryPlatformMapping, getIntegrationCategoryId, getCategories, getSelectCategories, addCategory, getCategory, countOfCategories }
})