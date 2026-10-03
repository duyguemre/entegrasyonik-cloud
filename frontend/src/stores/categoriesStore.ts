import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
export const useCategoriesStore = defineStore('categoriesStore', () => {
  const categories = ref()
  const selectCategories = ref()
  const restApi = useRestApi()

  const getCategory = (_id: any) => {
    if (selectCategories.value == undefined || selectCategories.value.length == 0) {
      return { title: '-' }
    }
    for (var category of selectCategories.value) {
      if (category._id == _id)
        return category
    }
  }

  const getCategoryTitle = (_id: any) => {
    const category = getCategory(_id)
    return category?.title
  }



  const checkCategoryPlatformMapping = (categoryId: any, integrationCode: any) => {
    const ret: any = { code: "SUCCESS", choices: [] }
    for (var category of selectCategories.value) {
      if (category._id != categoryId) continue
      if (category.platforms && Array.isArray(category.platforms)) {
        const platform = category.platforms.find((platform: any) => platform.integrationCode == integrationCode)
        if (!platform) {
          ret.code = "PLATFORM"
          return ret
        } else {
          const isExist = Array.isArray(platform.mapping)
            ? (id: any) => platform.mapping.some((m: any) => m.choiceId === id)
            : () => true;

          for (const choiceId of category.choiceIds) {
            if (!isExist(choiceId)) {
              if (ret.choices.length === 0) ret.code = "CHOICE";
              ret.choices.push(choiceId);
            }
          }
        }
      }
    }
    return ret
  }



  const getCategoryPlatformMappingForChoiceId = (categoryId: any, integrationCode: any, choiceId: any) => {
    for (var category of selectCategories.value) {
      if (category._id != categoryId) continue
      if (category.platforms && Array.isArray(category.platforms)) {
        const platform = category.platforms.find((platform: any) => platform.integrationCode == integrationCode)
        if (platform) {
          if (platform.mapping && Array.isArray(platform.mapping)) {
            return platform.mapping.find((mapping: any) => mapping.choiceId == choiceId)
          }
        }
      }
    }
    return undefined
  }


  const getCategoryPlatformMapping = (integrationCode: any, integrationCategoryId: any, integrationCategoryChoiceId: any) => {
    console.log(integrationCode, integrationCategoryId, integrationCategoryChoiceId)
    for (var category of selectCategories.value) {
      if (category.platforms && Array.isArray(category.platforms)) {
        const platform = category.platforms.find((platform: any) => platform.integrationCode == integrationCode && platform.integrationCategoryId == integrationCategoryId)
        if (platform) {
          if (platform.mapping && Array.isArray(platform.mapping)) {
            return platform.mapping.find((mapping: any) => mapping.integrationCategoryChoiceId == integrationCategoryChoiceId)
          }
        }
      }
    }
    return undefined
  }


  const getCategoryPlatformChoiceId = (integrationCode: any, integrationCategoryId: any, integrationCategoryChoiceId: any) => {
    for (var category of selectCategories.value) {
      if (category.platforms && Array.isArray(category.platforms)) {
        const platform = category.platforms.find((platform: any) => platform.integrationCode == integrationCode && platform.integrationCategoryId == integrationCategoryId)
        if (platform) {
          if (platform.mapping && Array.isArray(platform.mapping)) {
            const mapping = platform.mapping.find((mapping: any) => mapping.integrationCategoryChoiceId == integrationCategoryChoiceId)
            if (mapping) return mapping.choiceId
          }
        }
      }
    }
    return undefined
  }

  const getCategoryNameFromIntegrationCategoryId = (integrationCode: any, integrationCategoryId: any) => {
    for (var category of selectCategories.value) {
      if (category.platforms && Array.isArray(category.platforms)) {
        const platform = category.platforms.find((platform: any) => platform.integrationCode == integrationCode && platform.integrationCategoryId == integrationCategoryId)
        if (platform)
          return category.title
      }
    }
    return undefined
  }

  const getIntegrationCategoryId = (integrationCode: any, categoryId: any) => {
    if (selectCategories.value == undefined || selectCategories.value.length == 0) {
      return undefined
    }
    for (var category of selectCategories.value) {
      if (category._id == categoryId) {
        return category.platforms?.[integrationCode]
      }
    }
  }



  const retrieve = async () => {
    await restApi.get("CategoryService").then((resp: any) => {
      if (resp && resp.length > 0) {
        categories.value = resp
        selectCategories.value = processCategories(categories.value, [])
      }
    })
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

  const addCategory = (newCategory: any) => {
    if (!newCategory.parentId) {
      for (const category of categories.value) {
        if (category.isMain == true) {
          newCategory.parentId = category._id
          break
        }
      }
    }
    restApi.post("CategoryService/addCategory", { parentCategoryId: newCategory.parentId, title: newCategory.title }).then((response: any) => {
      if (response && response._id) {
        retrieve()
      }
    })
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
  registerStoreReset('categoriesStore', () => { categories.value = undefined; selectCategories.value = undefined })

  return { retrieve, getCategoryTitle, getCategoryPlatformMappingForChoiceId, checkCategoryPlatformMapping, getCategoryPlatformMapping, getCategoryPlatformChoiceId, getCategoryNameFromIntegrationCategoryId, getIntegrationCategoryId, getCategories, getSelectCategories, addCategory, getCategory, countOfCategories }
})