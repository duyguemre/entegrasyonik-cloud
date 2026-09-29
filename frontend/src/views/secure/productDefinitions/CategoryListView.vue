<template>
  <div class="categoryListView">
    <div class="workarea-scroll">
      <v-row class="mt-0 mb-0 cdv-row">
        <v-col class="cdv-col">
          <CategoryListComponent v-model="isCategoriesListed" @openCategorySync="openCategorySync($event)" />
        </v-col>
        <v-col class="cdv-col">
          <CategorySyncComponent v-model="selectedCategory" />
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted, onBeforeMount } from 'vue'
import { useMenuStore } from '@/stores/site/menu'
import CategoryListComponent from '@/components/CategoryListComponent.vue';
import CategorySyncComponent from '@/components/CategorySyncComponent.vue';
import useIntegrations from '@/composables/integrations';
import { useI18n } from 'vue-i18n';
import useRestApi from '@/composables/restapi'
const eventBus: any = inject('eventBus');
const selectedCategory = ref()
const isCategoriesListed = ref(true)
const destroyComponent = () => {
  console.log("destroy component categorylistview")
  isCategoriesListed.value = false
  selectedCategory.value = undefined
}

defineExpose({
  destroyComponent
});


const openCategorySync = (category: any) => {
  selectedCategory.value = category
}


const restApi = useRestApi()
const topCategoryName: any = ref()
const { t } = useI18n()

const dialog = ref(false)

const open = ref(['0'])
const menuStore: any = useMenuStore()
const context: any = inject('useContextStore')
var selectedTableItem: any = ref(0)
var contentWidth: any = ref(200)




/* const addCategory = (parentCategoryId: string, categoryName: string) => {
  restApi.post("CategoryService/addCategory", { parentCategoryId, title: categoryName }).then((response: any) => {
    if (response && response.result && response.result.acknowledged == true)
      categories.value = response.categories
  })
}
 */

/* const integrations: any = useIntegrations()
const headers = [
  {
    id: 0,
    title: t('common.platform'),
    value: "platform"
  },
  {
    id: 2,
    title: t('Kategori Adı'),
    value: "listPrice"
  },
  {
    id: 2,
    title: t('Renk'),
    value: "listPrice"
  },
  {
    id: 2,
    title: t('Beden'),
    value: "listPrice"
  },
  {
    id: 3,
    title: "actions",
    value: "actions"
  },
]
 */

onMounted(() => {
})
const drawer = computed({
  get: () => menuStore.getLeftMenu(),
  set: (value) => menuStore.toggleLeftMenu()
})

</script>

<style scoped>
/* ADR-0015 B5-2 — bu ekran içeriğini kapsam dışı kök bileşenlere (CategoryListComponent/
   CategorySyncComponent) devrediyor; kendi görsel sorumluluğu yalnızca iki panelin tam
   yükseklikte yan yana yerleşimi. (Önceki `.navigation-scroll-container1` bloğu şablonda
   HİÇBİR yerde kullanılmıyordu — ölü CSS, literal renk içeriyordu, kaldırıldı; davranış
   değişmedi.) 110px kabuk sekme/başlık şeridinin yüksekliği — ADR-0015 A3 kabuk sabiti. */
.cdv-row {
  height: 100%;
}

.cdv-col {
  height: calc(100vh - 110px);
  position: relative;
}
</style>
