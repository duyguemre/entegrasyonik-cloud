<template>
  <div class="category-select-wrapper">
    <LoadingComponent v-if="loading" ref="loadingComponentRef" attach=".category-select-wrapper"></LoadingComponent>

    <v-autocomplete v-model="categoryId" v-model:search="categorySearchText" v-model:menu="menuOpen" :items="computedCategories"
      item-value="_id" item-title="title" :rules="mandatory ? formRules.mandatoryRule : []" :custom-filter="categoryFilter"
      :placeholder="$t('productDefinitions.category.search')" auto-select-first @keydown.enter="onEnter"
      :no-data-text="createQuery ? `“${createQuery}” ile eşleşen kategori yok` : 'Kategori bulunamadı'"
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
        <v-list-item v-bind="itemProps" role="option"
          :class="['custom-category-item', item.raw.isParent ? 'is-parent-row' : 'is-leaf-row']"
          :disabled="item.raw.isParent" title="">

          <div class="d-flex align-center w-100 position-relative">
            <div v-if="!item.raw.isParent" class="leaf-indicator"></div>

            <div v-if="!isSearching" :style="{ width: (item.raw.displayLevel * 20) + 'px' }"
              class="flex-shrink-0">
            </div>

            <v-icon v-if="item.raw.isParent" size="16" class="mr-2" color="content-muted">
              mdi-folder-network-outline
            </v-icon>
            <div v-else class="csb-icon-gap"></div>

            <div class="category-title-wrapper d-flex align-center flex-grow-1 overflow-hidden">
              <span class="category-text text-truncate">{{ item.title }}</span>

              <span v-if="isSearching && item.raw.breadcrumb" class="breadcrumb-text text-truncate ml-2">
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
        <QuickCreateRow noun="kategori" :query="createQuery" :has-results="hasResults" @create="openCreate" />
      </template>
    </v-autocomplete>

    <QuickCreateCategoryDialog v-model="createOpen" :initial-name="createQuery" @created="onCreated"
      @picked="onPicked" />
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import useFormRules from '@/composables/formrules'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import LoadingComponent from '@/components/LoadingComponent.vue'
import QuickCreateRow from './QuickCreateRow.vue'
import QuickCreateCategoryDialog from './QuickCreateCategoryDialog.vue'
import { findDuplicate, normalizeTitle, trIncludes } from './quickCreate'

const props = defineProps<{
  noInit?: boolean
  mandatory?: boolean
}>()

const emits = defineEmits(['change'])

const categoriesStore = useCategoriesStore()
const formRules: any = useFormRules()
const { showToast } = useToast()

const categoryId = defineModel({ default: undefined })
const categorySearchText = ref("")
const menuOpen = ref(false)
const loading = ref(false)

const computedCategories = computed(() => {
  const rawList: any = categoriesStore.getSelectCategories()?.value || []
  const catMap = new Map()
  rawList.forEach((c: any) => catMap.set(c._id, c))

  const processedList = rawList.map((cat: any) => {
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

  // ANA KATEGORİLERİ FİLTRELE
  return processedList.filter((cat: any) => !cat.isMain)
})

// FR2-PFORM 23: arama Vuetify filtresiyle (Türkçe harf duyarsız; aramada klasörler gizlenir). Eskiden liste arama
// metniyle önceden süzülüyor, seçili kategori listeden düşünce kutu ham kimliği gösteriyordu.
const isSearching = computed(() => normalizeTitle(categorySearchText.value).length >= 2 && normalizeTitle(categorySearchText.value) !== selectedTitle.value)
const categoryFilter = (_value: string, query: string, item?: any) =>
  !isSearching.value || (!item?.raw?.isParent && trIncludes(item?.raw?.title, query))

// ---- yeni kategori (QuickCreateCategoryDialog) ----
const selectedTitle = computed(() => computedCategories.value.find((c: any) => c._id === categoryId.value)?.title)
const createQuery = computed(() => {
  const q = normalizeTitle(categorySearchText.value)
  return q && q !== selectedTitle.value ? q : ''
})
const hasResults = computed(() => !createQuery.value || computedCategories.value.some((c: any) => !c.isParent && trIncludes(c.title, createQuery.value)))
const createOpen = ref(false)

function openCreate() {
  menuOpen.value = false
  createOpen.value = true
}

function onEnter() {
  if (createQuery.value && !hasResults.value && !findDuplicate(computedCategories.value, createQuery.value)) openCreate()
}

function onCreated(id: string, title: string) {
  categoryId.value = id as any
  categorySearchText.value = ''
  showToast({ tone: 'success', message: `“${title}” kategorisi eklendi ve seçildi.` })
}

function onPicked(id: string) {
  categoryId.value = id as any
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
