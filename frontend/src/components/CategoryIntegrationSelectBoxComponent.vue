<template>
  <div class="categorySyncComponent">
    <LoadingComponent ref="loadingComponentRef" attach=".categorySyncComponent"></LoadingComponent>

    <div v-if="integrationCategories.length > 0">
      <v-autocomplete v-model="categoryId" v-model:search="searchText" :items="computedIntegrationCategories"
        item-value="_id" item-title="title" variant="outlined" density="compact" bg-color="textfieldColor"
        class="customTextField" :rules="mandatory == true ? formRules.mandatoryRule : []"
        :hint="integrationStore.getIntegrationTitle(integrationCode) + ' kategorisini buradan seçebilirsiniz.'"
        persistent-hint no-data-text="Kategori bulunamadı" :placeholder="$t('productDefinitions.category.search')"
        @update:modelValue="emits('change', '')" auto-select-first clearable :menu-props="{
          contentClass: 'category-autocomplete-menu',
          maxHeight: '400',
          transition: false
        }">

        <template v-slot:selection="{ item }: any">
          <div class="d-flex align-center">
            <span class="text-subtitle-2 font-weight-bold" style="color: rgb(var(--v-theme-passiveColor))">{{ item.title
            }}</span>
            <div class="ml-6 d-flex align-center" v-if="integrationCategoryCommissionRate">
              <v-divider vertical class="mx-2" height="15"></v-divider>
              <span class="text-caption font-weight-bold" style="color: #78909C">
                %{{ integrationCategoryCommissionRate?.commission }} Komisyon
              </span>
            </div>
          </div>
        </template>

        <template v-slot:item="{ item, props: itemProps }: any">
          <v-list-item v-bind="itemProps"
            :class="['custom-category-item', item.raw.isParent ? 'is-parent-row' : 'is-leaf-row']"
            :disabled="item.raw.isParent" title="" :style="{ '--p-color': brandColor }">

            <div class="d-flex align-center w-100 position-relative">
              <div v-if="!item.raw.isParent" class="leaf-indicator"></div>

              <div v-if="!searchText && item.raw.level" :style="{ width: (item.raw.level * 22) + 'px' }"
                class="flex-shrink-0"></div>

              <v-icon v-if="item.raw.isParent" size="16" class="mr-2" color="grey">
                mdi-folder-network-outline
              </v-icon>
              <div v-else style="width: 24px;"></div>

              <div class="index-column mr-2">
                {{ item.raw.originalIndex }}
              </div>

              <div class="category-title-wrapper d-flex align-center flex-grow-1 overflow-hidden">
                <span class="category-text text-truncate">{{ item.title }}</span>

                <span v-if="searchText && item.raw.breadcrumb" class="breadcrumb-text text-truncate ml-2">
                  {{ item.raw.breadcrumb }}
                </span>


                <span v-if="item.raw.isParent" class="child-count ml-2">
                  {{ item.raw.childrenCount }} Alt Kategori
                </span>
              </div>
            </div>
          </v-list-item>
        </template>
      </v-autocomplete>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore';
import useFormRules from '@/composables/formrules';
import LoadingComponent from './LoadingComponent.vue';

const integrationStore = useIntegrationStore()
const integrationCategories = ref<any[]>([])
const emits = defineEmits(['change'])
const integrationCategoryCommissionRate: any = ref(0)
const loadingComponentRef: any = ref(null)
const searchText = ref("")

const categoryId = defineModel({ default: undefined })
const props = defineProps<{ mandatory?: boolean, integrationCode: string }>()
const formRules: any = useFormRules()

const brandColor = computed(() => {
  return integrationStore.getClientMarketplaces().find((x: any) => x.code === props.integrationCode)?.color || '#1867C0'
})

const computedIntegrationCategories = computed(() => {
  if (!integrationCategories.value.length) return [];
  if (searchText.value && searchText.value.length > 0) {
    return integrationCategories.value.filter(cat => !cat.isParent);
  }
  return integrationCategories.value;
})

watch(() => props.integrationCode, async (newCode) => {
  if (!newCode) return
  let guid = loadingComponentRef.value?.info("")
  try {
    const resp = await integrationStore.getIntegrationCategories(newCode)
    const catMap = new Map();
    resp.forEach((c: any) => catMap.set(c._id, c));

    integrationCategories.value = resp.map((cat: any, idx: number) => {
      const path = [];
      let parent = catMap.get(cat.parentId);
      while (parent) {
        path.unshift(parent.title);
        parent = catMap.get(parent.parentId);
      }
      return {
        ...cat,
        originalIndex: idx + 1,
        isParent: cat.children?.length > 0,
        childrenCount: cat.children?.length || 0,
        breadcrumb: path.join(' > ')
      }
    });
  } catch (e) {
    integrationCategories.value = []
  } finally {
    loadingComponentRef.value?.remove(guid)
  }
}, { immediate: true })

watch(() => categoryId.value, async (newId) => {
  if (newId) {
    integrationCategoryCommissionRate.value = await integrationStore.retrieveCommisionForCategoryFromIntegration(props.integrationCode, newId)
  }
})
</script>

<style scoped>
.index-column {
  min-width: 30px;
  opacity: 0.5;
  font-size: 0.7rem;
}

.breadcrumb-text {
  font-size: 0.75rem;
  color: black;
  font-style: italic;
  opacity: .5;
  /* Daha görünür yapıldı */
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
  background-color: var(--p-color);
  border-radius: 0 4px 4px 0;
  box-shadow: 1px 0 6px var(--p-color);
}

.is-parent-row {
  background-color: #fcfcfc !important;
}

.is-parent-row .category-text {
  text-transform: uppercase;
  color: rgb(var(--v-theme-error));
  font-weight: 600;
  font-size: 0.8rem;
}

/* Passive Color Ayarı (#455A64) */
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
  opacity: .5
}
</style>