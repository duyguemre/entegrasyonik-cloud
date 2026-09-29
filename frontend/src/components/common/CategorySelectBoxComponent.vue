<template>
  <div class="category-select-wrapper">
    <LoadingComponent v-if="loading" ref="loadingComponentRef" attach=".category-select-wrapper"></LoadingComponent>

    <v-autocomplete v-model="categoryId" v-model:search="categorySearchText" :items="computedCategories"
      item-value="_id" item-title="title" variant="outlined" density="compact" bg-color="textfieldColor"
      class="customTextField" :rules="mandatory ? formRules.mandatoryRule : []"
      :placeholder="$t('productDefinitions.category.search')" no-data-text="Kategori bulunamadı" auto-select-first
      clearable persistent-hint :menu-props="{
        contentClass: 'category-autocomplete-menu',
        maxHeight: '400',
        transition: false
      }">

      <template #label>
        <div>
          {{ $t('productDefinitions.category.name') }}
          <v-icon v-if="mandatory" size="12" class="mb-2 ml-1">mdi-asterisk</v-icon>
        </div>
      </template>

      <template v-slot:selection="{ item }: any">
        <div class="d-flex align-center overflow-hidden">
          <span class="text-subtitle-2 font-weight-bold text-truncate" style="color: rgb(var(--v-theme-passiveColor))">
            {{ item.title }}
          </span>
        </div>
      </template>

      <template v-slot:item="{ item, props: itemProps }: any">
        <v-list-item v-bind="itemProps"
          :class="['custom-category-item', item.raw.isParent ? 'is-parent-row' : 'is-leaf-row']"
          :disabled="item.raw.isParent" title="">

          <div class="d-flex align-center w-100 position-relative">
            <div v-if="!item.raw.isParent" class="leaf-indicator"></div>

            <div v-if="!categorySearchText" :style="{ width: (item.raw.displayLevel * 20) + 'px' }"
              class="flex-shrink-0">
            </div>

            <v-icon v-if="item.raw.isParent" size="16" class="mr-2" color="grey">
              mdi-folder-network-outline
            </v-icon>
            <div v-else style="width: 24px;"></div>

            <div class="category-title-wrapper d-flex align-center flex-grow-1 overflow-hidden">
              <span class="category-text text-truncate">{{ item.title }}</span>

              <span v-if="categorySearchText && item.raw.breadcrumb" class="breadcrumb-text text-truncate ml-2">
                {{ item.raw.breadcrumb }}
              </span>

              <span v-if="item.raw.isParent" class="child-count ml-2">
                {{ item.raw.childrenCount }} Alt Kategori
              </span>
            </div>
          </div>
        </v-list-item>
      </template>

      <template v-slot:append-item>
        <v-divider></v-divider>
        <div class="pa-4 bg-grey-lighten-5">
          <v-form v-model="isNewCategoryValid" @submit.prevent="addNewCategory">
            <v-text-field v-model="newCategoryName" variant="outlined" density="compact" hide-details="auto"
              class="bg-white" :placeholder="$t('productDefinitions.category.title')" :rules="titleRules">
              <template v-slot:append-inner>
                <v-btn color="primary" variant="flat" size="small" :disabled="!isNewCategoryValid || !newCategoryName"
                  @click="addNewCategory">
                  <v-icon>mdi-plus</v-icon>
                </v-btn>
              </template>
            </v-text-field>
          </v-form>
        </div>
      </template>
    </v-autocomplete>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useI18n } from 'vue-i18n'
import useFormRules from '@/composables/formrules'
import { useSnackbarStore } from '@/stores/snackbarStore'
import LoadingComponent from '@/components/LoadingComponent.vue'

const props = defineProps<{
  noInit?: boolean
  mandatory?: boolean
}>()

const emits = defineEmits(['change'])

const categoriesStore = useCategoriesStore()
const { t } = useI18n()
const formRules: any = useFormRules()
const snackbarStore = useSnackbarStore()

const categoryId = defineModel({ default: undefined })
const categorySearchText = ref("")
const newCategoryName = ref("")
const isNewCategoryValid = ref(false)
const loading = ref(false)

const titleRules = [
  (v: any) => !!v || t("rules.mandatory"),
  (v: string) => (v && v.length >= 2 && v.length <= 160) || t("rules.2_160characters"),
]

const computedCategories = computed(() => {
  const rawList: any = categoriesStore.getSelectCategories()?.value || []
  const catMap = new Map()
  rawList.forEach((c: any) => catMap.set(c._id, c))

  let processedList = rawList.map((cat: any) => {
    const path: string[] = []
    let currentLevel = 0
    let parent = catMap.get(cat.parentId)

    // Hiyerarşiyi yukarı doğru tararken hem breadcrumb hem level hesaplıyoruz
    while (parent) {
      if (!parent.isMain) { // Breadcrumb ve seviye için "Ana Kategori"yi es geçiyoruz
        currentLevel++
        path.unshift(parent.title)
      }
      parent = catMap.get(parent.parentId)
    }

    const children = rawList.filter((c: any) => c.parentId === cat._id)

    return {
      ...cat,
      displayLevel: currentLevel,
      isParent: children.length > 0,
      childrenCount: children.length,
      breadcrumb: path.join(' > ')
    }
  })

  // 1. ANA KATEGORİLERİ FİLTRELE
  processedList = processedList.filter((cat: any) => !cat.isMain)

  // 2. ARAMA FİLTRESİ
  if (categorySearchText.value && categorySearchText.value.length >= 2) {
    processedList = processedList.filter((cat: any) =>
      !cat.isParent &&
      cat.title.toLocaleUpperCase('tr-TR').includes(categorySearchText.value.toLocaleUpperCase('tr-TR'))
    )
  }

  return processedList
})

const addNewCategory = async () => {
  if (!newCategoryName.value || !isNewCategoryValid.value) return
  loading.value = true
  try {
    await categoriesStore.addCategory({ parentId: 0, title: newCategoryName.value })
    newCategoryName.value = ""
    snackbarStore.addSnackbar({ text: t('common.success'), color: 'success' })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!props.noInit && !categoryId.value) {
    const firstLeaf = computedCategories.value.find((c: any) => !c.isParent)
    if (firstLeaf) categoryId.value = firstLeaf._id
  }
})
</script>

<style scoped>
.category-select-wrapper {
  position: relative;
}

.breadcrumb-text {
  font-size: 0.75rem;
  color: black;
  font-style: italic;
  opacity: .6;
  font-weight: 400;
}

.custom-category-item {
  border-bottom: 1px solid #f5f5f5 !important;
  min-height: 40px !important;
}

.leaf-indicator {
  position: absolute;
  left: -16px;
  height: 60%;
  width: 3px;
  background-color: #1867C0;
  border-radius: 0 4px 4px 0;
  box-shadow: 1px 0 6px rgba(24, 103, 192, 0.4);
}

.is-parent-row {
  background-color: #fcfcfc !important;
}

.is-parent-row .category-text {
  text-transform: uppercase;
  color: rgb(var(--v-theme-passiveColor));
  font-weight: 600;
  font-size: 0.8rem;
}

.is-leaf-row .category-text {
  font-weight: 500;
  color: rgb(var(--v-theme-passiveColor));
  font-size: 0.85rem;
}

.is-leaf-row:hover {
  background-color: #f5f7f9 !important;
}

.child-count {
  font-size: 0.65rem;
  color: black;
  opacity: .6;
}

:deep(.v-field__input) {
  font-size: 0.9rem !important;
}
</style>