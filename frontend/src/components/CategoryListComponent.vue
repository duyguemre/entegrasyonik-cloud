<template>
  <div class="categoryListComponentView">       
    
  <LoadingComponent attach=".categoryDefinition" ref="loadingComponentRef"></LoadingComponent>

<!--     <v-dialog v-model="isEditDialogOpen" max-width="500" location-strategy="connected" target="cursor"
      :attach="'.categoryDefinition'" :contained="true" location="left" v-if="editingCategory">
      <v-card style="background-color:#f3f5f3" variant="elevated" class="pa-4 mb-16">
        <v-card-title class="d-flex">
          <v-icon class="mr-2" style="opacity:.7">mdi-shape</v-icon>{{ $t('productDefinitions.category.editCategory')
          }}<v-spacer /><v-btn @click="endEdit" flat variant="outlined" color="grey" min-width="0"><v-icon
              size="x-large">mdi-close</v-icon></v-btn>
        </v-card-title>
        <v-card-text>
          <div>
            <v-form v-model="editingCategory.form" style="display:contents" @keydown.enter.prevent @submit.prevent>
              <v-text-field @click.stop="1" v-ripple.stop variant="outlined" density="compact" type="tel"
                maxlength="160" width="200" clearable bg-color="textfieldColor"
                :hint="$t('productDefinitions.category.updateCategoryDesc')" v-model="editingCategory.updateTitle"
                :rules="formRules.titleRules" @keyup.enter="updateCategory()">
                <template v-slot:label>
                  <span class="font-ital1ic font-weight-light">{{ $t('productDefinitions.category.title')
                    }}</span>
                </template>
                <template v-slot:append-inner>
                  <v-btn class="ml-2 mr-2" flat min-width=0 density="comfortable" color="success"
                    :disabled="!editingCategory.form || editingCategory.updateTitle == undefined"
                    @click="updateCategory()"><span class="text-captio1n">
                      <v-icon>mdi-refresh</v-icon>
                    </span></v-btn>
                </template>
              </v-text-field>
            </v-form>
          </div>
          <v-btn block density="default" color="danger" @click.stop="isConfirmationDialogOpen = true" class="mt-4"><span
              class="text-captio1n">
              <v-icon size="x-large">mdi-delete-outline</v-icon>
            </span></v-btn>
        </v-card-text>
      </v-card>
    </v-dialog>
 --><!--     <v-dialog v-model="isConfirmationDialogOpen" max-width="650" persistent :attach="'.categoryDefinition'"
      :contained="true" :retain-focus="false" v-if="editingCategory">
      <v-card prepend-icon="mdi-delete-outline" color="danger" class="mb-16">
        <template v-slot:prepend>
          <v-icon size="xx-large">mdi-delete</v-icon>
        </template>
        <template v-slot:title>
          {{ editingCategory.title }} <span class="text-caption">({{
        editingCategory.children.length }} {{ $t('productDefinitions.category.subcategory')
            }})</span><v-icon>mdi-exclamation</v-icon>
        </template>
        <template v-slot:text>
          <div v-if="editingCategory.children.length > 0">{{
        $t('productDefinitions.category.deleteConfirmationSubCategoriesWarning') }}</div>
          <div>{{ $t('productDefinitions.category.deleteConfirmationProductsWarning') }}</div>
          <div style="height:10px"></div>
          <div>{{ $t('productDefinitions.category.deleteConfirmation') }}</div>
          <div class="mt-8 mb-4 text-center">
            <v-btn color="tonal" min-width="100" variant="outlined" @click="isConfirmationDialogOpen = false"
              class="mr-4">
              {{ $t('common.cancel') }}
            </v-btn>

            <v-btn color="error" bg-color="error" variant="flat" style="border:1px solid white" min-width="100"
              @click="deleteCategory()">
              {{ $t('common.delete') }}
            </v-btn>
          </div>
        </template>
      </v-card>
    </v-dialog>

 -->    
<!--     <div class="d-flex scroll-element2 ml-4"> -->
<!--       <v-data-table :height="`calc(100vh - 201px)`" :items="[{ category: 1 }]" items-per-page="-1" fixed-header
        style="background-color:black!important" :headers="[{
        title: $t('productDefinitions.category.list'),
        value: 'category'
      }]" class="pa-0 ma-0 mt-0 no-row-color">
        <template #bottom></template>
        <template #headers>
          <tr>
            <th style="height:1px">
            </th>
          </tr>
        </template>
        <template v-slot:header.category="{ column }">
          <v-row no-gutters>
            <v-col>
              <div class="text-left">{{ column.title }}
              </div>
            </v-col>
            <v-col>
            </v-col>
          </v-row>
        </template>
        <template v-slot:item.category="{ item, index }">
        </template>
      </v-data-table>      
 -->
 <div class="workarea-scroll pa-6 pr-2 pt-4 pb-0" style="">
  <CardComponent icon="mdi-shape" title="Kategori Listesi">

    <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop variant="outlined" density="compact"
      type="tel" maxlength="160" class="mr-2 ml-2 mt-4 customTextField" clearable counter bg-color="textfieldColor"
      :rules="formRules.searchRules" v-model="categorySearchText"
      :hint="$t('productDefinitions.category.categorySearcDesc')">
      
      <template v-slot:label>
        <span class="font-weight-light">{{ $t('productDefinitions.category.search')
          }}</span>
      </template>
    </v-text-field> 
    <v-divider class="mr-8 ml-8" />

    
  <v-list density="compact" dense nav v-model:opened="open" activatable open-strategy="single" width="100%"
            active-strategy="single-independent" class="mt-1"
            style="background-color:transparent;border-radius:5px;background1:linear-gradient(0deg, #fff 10%, #fafaff 20%, #fafaff 80%, #fff 90%)!important">
            
            <CategoryTreeComponentVue :categories="computedCategories"
              v-if="showCategories" @update="fetchCategories()"
              @startEdit="startEdit($event)" @addCategory="categoriesStore.addCategory($event)"
              @openCategorySync="openCategorySync($event)" @move="moveCategory($event)"
              @changeOrder="changeOrderCategory($event)" @setDraggingCategory="setDraggingCategory($event)"
              :draggingCategory="draggingCategory" :level="0" />
          </v-list>

      </CardComponent>
    </div>


<!--       <v-data-table :height="`calc(100vh - 201px)`" :items="[{ category: 1 }]" items-per-page="-1" fixed-header
        style="background-color:black!important" :headers="[{
        title: $t('productDefinitions.category.list'),
        value: 'category'
      }]" class="pa-0 ma-0 mt-0 no-row-color">
        <template #bottom></template>
        <template #headers>
          <tr>
            <th style="height:1px">
            </th>
          </tr>
        </template>
        <template v-slot:header.category="{ column }">
          <v-row no-gutters>
            <v-col>
              <div class="text-left">{{ column.title }}
              </div>
            </v-col>
            <v-col>
            </v-col>
          </v-row>
        </template>
        <template v-slot:item.category="{ item, index }">
          <v-list density="compact" dense nav v-model:opened="open" activatable open-strategy="single"
            active-strategy="single-independent"
            style="background:linear-gradient(0deg, #fff 10%, #fafaff 20%, #fafaff 80%, #fff 90%)!important">
            
            <CategoryTreeComponentVue :categories="computedCategories"
              v-if="showCategories" @update="fetchCategories()"
              @startEdit="startEdit($event)" @addCategory="categoriesStore.addCategory($event)"
              @openCategorySync="openCategorySync($event)" @move="moveCategory($event)"
              @changeOrder="changeOrderCategory($event)" @setDraggingCategory="setDraggingCategory($event)"
              :draggingCategory="draggingCategory" :level="0" />
          </v-list>
        </template>
      </v-data-table>      
 -->


<!--       <ScrollComponent id=".scroll-element2 .v-table__wrapper" :isExpandable="false" />
    </div> -->
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

<style scoped></style>