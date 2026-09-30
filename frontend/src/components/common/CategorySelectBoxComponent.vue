<template>
  <div class="category-select-wrapper">
    <LoadingComponent v-if="loading" ref="loadingComponentRef" attach=".category-select-wrapper"></LoadingComponent>

    <v-autocomplete v-model="categoryId" v-model:search="categorySearchText" :items="computedCategories"
      item-value="_id" item-title="title" :rules="mandatory ? formRules.mandatoryRule : []"
      :placeholder="$t('productDefinitions.category.search')" no-data-text="Kategori bulunamadı" auto-select-first
      clearable persistent-hint :menu-props="{
        contentClass: 'category-autocomplete-menu',
        maxHeight: '400',
        transition: false
      }">

      <template #label>
        {{ $t('productDefinitions.category.name') }}{{ mandatory ? ' *' : '' }}
      </template>

      <template v-slot:selection="{ item }: any">
        <div class="d-flex align-center overflow-hidden">
          <span class="text-truncate">
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

            <v-icon v-if="item.raw.isParent" size="16" class="mr-2" color="content-muted">
              mdi-folder-network-outline
            </v-icon>
            <div v-else class="csb-icon-gap"></div>

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
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.custom-category-item {
  min-height: var(--ek-control-h-lg) !important;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.leaf-indicator {
  position: absolute;
  left: calc(var(--ek-space-4) * -1);
  width: 3px;
  height: 60%;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background-color: var(--ek-color-action);
}

.csb-icon-gap {
  width: var(--ek-space-6);
  flex: none;
}

.is-parent-row {
  background-color: var(--ek-color-surface-muted);
}

.is-parent-row .category-text {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.is-leaf-row .category-text {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-type-label-weight);
}

.child-count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>
