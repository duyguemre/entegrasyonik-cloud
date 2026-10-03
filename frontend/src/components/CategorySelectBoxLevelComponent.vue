<template>
  <div class="premium-category-explorer">

    <div class="hierarchy-wrapper">
      <v-expand-transition>
        <div v-if="selectedCategories.length > 0 || categoryId" class="hierarchy-path-display px-2">
          <div class="d-flex align-center flex-wrap">
            <v-icon size="16" color="passiveColor" class="mr-2">mdi-sitemap-outline</v-icon>
            <template v-for="(catId, index) in getFullHierarchyIds" :key="catId">
              <span class="path-item">{{ getCategoryTitle(catId) }}</span>
              <v-icon v-if="index < getFullHierarchyIds.length - 1" size="14"
                class="mx-1 opacity-30">mdi-chevron-right</v-icon>
            </template>
          </div>
        </div>
      </v-expand-transition>
    </div>

    <div class="explorer-layout">
      <v-slide-x-transition group>
        <div v-for="(levelIndex, currentLevel) in (selectedCategories.length + 1)" :key="currentLevel"
          class="category-column-unit">

          <div v-if="currentLevel !== 0" class="desktop-connector">
            <v-icon size="20" color="passiveColor" class="opacity-30">mdi-chevron-right</v-icon>
          </div>

          <v-card variant="outlined" class="category-column-card"
            :class="{ 'active-column-focus': selectedCategories.length === currentLevel }">
            <div class="column-header px-4 py-2">
              <span class="text-overline">{{ currentLevel + 1 }}. Seviye</span>
            </div>

            <v-divider opacity="0.1"></v-divider>

            <v-list class="category-list pa-2" density="compact" bg-color="transparent">
              <v-list-item v-for="item in filteredCategories(currentLevel)" :key="item._id"
                @click="handleCategoryAction(item, currentLevel)" class="category-item-base mb-1"
                :class="getItemClass(item, currentLevel)">

                <template v-slot:prepend v-if="item.children?.length > 0">
                  <div class="icon-wrapper mr-2">
                    <v-icon size="16" 
                      :icon="selectedCategories[currentLevel] === item._id ? 'mdi-folder-open-outline' : 'mdi-folder-outline'" 
                      color="passiveColor">
                    </v-icon>
                  </div>
                </template>

                <v-list-item-title class="category-item-text">
                  {{ item.title }}
                </v-list-item-title>

                <template v-slot:append>
                  <v-icon v-if="item.children?.length > 0" size="16" class="parent-chevron">mdi-chevron-right</v-icon>
                  <div v-else class="leaf-dot"></div>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </div>
      </v-slide-x-transition>
    </div>

    <div class="info-helper-box mt-6">
      <v-icon size="18" color="passiveColor" class="mr-3">mdi-information-outline</v-icon>
      <div class="info-content">
        <span class="info-title">Kategori Seçim Rehberi</span>
        <p class="info-desc">Ürününüzü doğru sınıflandırmak için yukarıdaki katmanları izleyerek en uç (leaf) kategoriyi
          seçiniz. Klasör ikonlu öğeler alt kırılımları içerir, etiketli öğeler ise son seçim noktalarıdır.</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onBeforeMount, onMounted, computed } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore';

const categoriesStore = useCategoriesStore()
const categoryId = defineModel({ default: undefined })
const selectedCategories = ref<Array<string>>([])
let categoriesStoreCategories: any = ref([])

const filteredCategories = (level: number) => {
  return categoriesStoreCategories.value.filter((citem: any) =>
    citem.level == level && (level == 0 || citem.parentId == selectedCategories.value[level - 1])
  )
}

const getItemClass = (item: any, level: number) => {
  const isParent = item.children?.length > 0
  const isSelected = selectedCategories.value[level] === item._id || (categoryId.value === item._id && item.level === level)

  return {
    'is-parent': isParent,
    'is-leaf': !isParent,
    'selected-parent': isSelected && isParent,
    'selected-leaf': isSelected && !isParent
  }
}

const handleCategoryAction = (item: any, level: number) => {
  if (!item.children || item.children.length === 0) {
    categoryId.value = item._id
    selectedCategories.value.splice(level)
  } else {
    categoryId.value = undefined
    selectedCategories.value.length = level + 1
    selectedCategories.value[level] = item._id
  }
}

const getCategoryTitle = (id: string) => {
  return categoriesStoreCategories.value.find((c: any) => c._id === id)?.title || ''
}

const getFullHierarchyIds = computed(() => {
  const path = [...selectedCategories.value]
  if (categoryId.value) path.push(categoryId.value)
  return path
})

onBeforeMount(() => {
  const result = categoriesStore.getSelectCategories()
  categoriesStoreCategories.value = result.value || result
})

onMounted(() => {
  if (categoryId.value) initHierarchy()
})

const initHierarchy = () => {
  const hierarchy = []
  let current = categoriesStoreCategories.value.find((c: any) => c._id === categoryId.value)
  while (current && current.parentId) {
    const parent = categoriesStoreCategories.value.find((p: any) => p._id === current.parentId)
    if (parent && parent.isMain !== true) {
      hierarchy.unshift(parent._id)
      current = parent
    } else break
  }
  selectedCategories.value = hierarchy
}
</script>

<style scoped>
.premium-category-explorer {
  width: 100%;
}

/* Kaymayı engelleyen yeni stil */
.hierarchy-wrapper {
  min-height: 52px; /* Breadcrumb'ın yaklaşık yüksekliği */
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.hierarchy-path-display {
  width: 100%;
  background: rgba(var(--v-theme-passiveColor), 0.03);
  border: 1px dashed rgba(var(--v-theme-passiveColor), 0.2);
  border-radius: 8px;
  padding: 8px 12px;
}

.path-item {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  color: rgb(var(--v-theme-passiveColor));
  letter-spacing: 0.5px;
}

.explorer-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: flex-start;
  min-height: 380px;
}

.category-column-unit {
  display: flex;
  align-items: center;
  flex: 0 0 280px; 
}

.category-column-card {
  width: 100%;
  max-height: 350px;
  overflow-y: auto;
  border: 1px solid #d1d5db !important;
  border-radius: 12px !important;
  background: #ffffff !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.active-column-focus {
  border-color: rgb(var(--v-theme-passiveColor)) !important;
  box-shadow: 0 4px 12px rgba(var(--v-theme-passiveColor), 0.08);
}

.is-parent :deep(.v-list-item-title) {
  text-transform: uppercase !important;
  font-weight: 600 !important;
  color: #1e293b !important;
  opacity: .6;
  white-space: normal !important;
}

.is-leaf {
  padding-left: 40px !important;
}

.is-leaf :deep(.v-list-item-title) {
  font-weight: 900 !important;
  color: #0f172a !important;
  text-transform: none !important;
  color: rgb(var(--v-theme-passiveColor)) !important;
  white-space: normal !important;
}

.parent-chevron {
  opacity: 0.8;
  font-weight: 900 !important;
}

.leaf-dot {
  width: 6px;
  height: 6px;
  background-color: rgb(var(--v-theme-passiveColor));
  border-radius: 50%;
  opacity: 0.4;
  margin-right: 4px;
}

.selected-parent {
  background-color: rgb(var(--v-theme-passiveColor), 0.1) !important;
  color: rgb(var(--v-theme-primary)) !important;
  opacity: 1 !important;
  font-weight: 600 !important;
  box-shadow: inset 4px 0 0 0 rgb(var(--v-theme-passiveColor)) !important;
}

.selected-leaf {
  background-color: rgb(var(--v-theme-passiveColor), 0.1) !important;
  color: rgb(var(--v-theme-passiveColor)) !important;
  opacity: 1 !important;
  font-weight: 900 !important;
  box-shadow: inset 4px 0px 0 0 rgb(var(--v-theme-passiveColor)) !important;
}

.selected-leaf .leaf-dot {
  opacity: 1;
  transform: scale(1.2);
}

.selected-parent :deep(.v-list-item-title),
.selected-leaf :deep(.v-list-item-title) {
  font-weight: 900 !important;
  color: inherit !important;
}

.category-item-base {
  border-radius: 8px !important;
  transition: all 0.2s ease;
  cursor: pointer;
  min-height: 40px !important;
}

.category-item-text {
  font-size: 12.5px !important;
  line-height: 1.3;
}

.column-header span {
  font-size: 10px !important;
  color: #475569;
  font-weight: 900;
}

.info-helper-box {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.info-title {
  display: block;
  font-size: 13px;
  font-weight: 900;
  color: #1e293b;
  margin-bottom: 4px;
}

.info-desc {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .explorer-layout {
    flex-direction: column;
  }
  .category-column-unit {
    width: 100%;
    flex: 1 1 auto;
  }
  .desktop-connector {
    display: none;
  }
  .hierarchy-wrapper {
    min-height: auto; /* Mobilde dikey akış olduğu için sabit yüksekliğe gerek yok */
  }
}
</style>