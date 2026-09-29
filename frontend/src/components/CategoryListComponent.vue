<template>
  <div class="categoryListComponentView">
    <LoadingComponent attach=".categoryDefinition" ref="loadingComponentRef"></LoadingComponent>

    <div class="workarea-scroll ek-category-list">
      <CardComponent icon="mdi-shape-outline" title="Kategori Listesi" :isHovered="false">
        <v-text-field append-inner-icon="mdi-magnify" @click.stop type="tel" maxlength="160" clearable counter
          :rules="formRules.searchRules" v-model="categorySearchText" :label="$t('productDefinitions.category.search')"
          :hint="$t('productDefinitions.category.categorySearcDesc')" />

        <v-list density="compact" nav v-model:opened="open" activatable open-strategy="single" width="100%"
          active-strategy="single-independent" class="ek-category-list__tree">
          <CategoryTreeComponentVue :categories="computedCategories" v-if="showCategories" @update="fetchCategories()"
            @startEdit="startEdit($event)" @addCategory="categoriesStore.addCategory($event)"
            @openCategorySync="openCategorySync($event)" @move="moveCategory($event)"
            @changeOrder="changeOrderCategory($event)" @setDraggingCategory="setDraggingCategory($event)"
            :draggingCategory="draggingCategory" :level="0" />
        </v-list>
      </CardComponent>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, onBeforeMount, onBeforeUnmount } from 'vue'
import useRestApi from '@/composables/restapi'
import CategoryTreeComponentVue from './CategoryTreeComponent.vue';
import useFormRules from '@/composables/formrules';
import { useCategoriesStore } from '@/stores/categoriesStore';

    import LoadingComponent from '@/components/LoadingComponent.vue'
    import CardComponent from '@/components/CardComponent.vue';

const categoriesStore = useCategoriesStore()
const formRules = useFormRules()
const restApi = useRestApi()
var showCategories = defineModel({ default: false })

const emits = defineEmits(['openCategorySync'])
const open: any = ref(['0'])
var categoriesStoreCategories: any = ref()
const draggingCategory: any = ref()
const isEditDialogOpen = ref(false)
const isConfirmationDialogOpen = ref(false)
const editingCategory: any = ref()
const categorySearchText = ref()
const loadingComponentRef: any = ref(null)


onBeforeMount(() => {
  fetchCategories()
})

onBeforeUnmount(async () => {
  open.value = undefined
  draggingCategory.value = undefined
})

const computedCategories = computed(() => {
  resetSearch(undefined)
  if (categoriesStoreCategories.value && categorySearchText.value && categorySearchText.value.length > 1) {
    searchCategories(undefined)
    return categoriesStoreCategories.value
  }
  else return categoriesStoreCategories.value
})

const resetSearch = (categoryList: any) => {
  if (!categoryList) categoryList = categoriesStoreCategories.value
  else categoryList = categoryList.children
  if (categoryList) {
    for (let category of categoryList) {
      category.isHidden = false
      resetSearch(category)
    }
  }
}

const searchCategories = (categoryList: any) => {
  if (!categoryList) categoryList = categoriesStoreCategories.value
  else categoryList = categoryList.children
  var flag = false
  for (let category of categoryList) {
    let childrenVisible = false
    if (category.children.length > 0) {
      childrenVisible = searchCategories(category)
    }
    if (childrenVisible == true) {
      flag = true
      category.isHidden = false
    }
    else if (!category.title.toLowerCase().includes(categorySearchText.value.toLowerCase())) {
      category.isHidden = true
    } else {
      flag = true
      category.isHidden = false
    }
  }
  return flag
}

const fetchCategories = async () => {
  categoriesStoreCategories = categoriesStore.getCategories(true)
  openCategorySync(undefined)
}


const startEdit = (ec: any) => {
  editingCategory.value = ec
  editingCategory.value.updateTitle = ec.title
  isEditDialogOpen.value = true
}


const openCategorySync = (category: any) => {
  emits("openCategorySync", category)
}

/* const addCategory = (newCategory: any) => {
  restApi.post("CategoryService/addCategory", { parentCategoryId: newCategory.parentId, title: newCategory.title }).then((response: any) => {
    if (response && response.result && response.result.acknowledged == true) {
      update()
    }
  })
}
 */

const moveCategory = async (moveInCategory: any) => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("CategoryService/moveCategory", { moveCategoryId: draggingCategory.value._id, moveInCategoryId: moveInCategory._id })
    if (response && response.result && response.result.acknowledged == true) {
      update()
    }
  loadingComponentRef.value.remove(guid)
}

const changeOrderCategory = async (toCategory: any) => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("CategoryService/changeOrderCategory", { fromCategoryId: draggingCategory.value._id, toCategoryId: toCategory._id })
    if (response && response.result && response.result.fromResp && response.result.fromResp.acknowledged == true && response.result.toResp && response.result.toResp.acknowledged == true) {
      update()
    }
  loadingComponentRef.value.remove(guid)
}

const update = () => {
  fetchCategories()
}

const setDraggingCategory = (dc: any) => {
  draggingCategory.value = dc
}
</script>

<style scoped>
.ek-category-list {
  padding: var(--ek-space-4) var(--ek-space-2) 0 var(--ek-space-6);
}

.ek-category-list__tree {
  margin-top: var(--ek-space-3);
  padding: 0;
  background: transparent;
}
</style>