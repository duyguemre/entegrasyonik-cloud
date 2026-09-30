<template>
  <div>
    <div class="search-section">
      <v-row>
        <v-col class="pb-0" cols="4">
          <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable"
            :label="$t('productDefinitions.product.searchlabel')" variant="outlined"></v-text-field>
        </v-col>
        <v-col class="pb-0 flex-grow-1 flow-shrink-0">
          <v-btn-group class="pa-0" elevation="2">
            <v-btn prepend-icon="mdi-magnify" to="/orderList" elevation=0 color="primary" min-width="200px">
              {{ $t("productDefinitions.product.search") }}</v-btn>

            <CustomDialogComponent title="Detaylı Arama" :component="PaginationComponent">
              <v-btn class="ml-0 fill-height" block color="neutral" elevation=0 aria-label="Detaylı arama">
                <v-icon class="advanced-search-button-background1" size="x-large">mdi-text-search
                  text-center</v-icon><v-icon class="ml-1" size="15">mdi-arrow-expand</v-icon>
              </v-btn>
            </CustomDialogComponent>
          </v-btn-group>
          <v-btn-group class="pa-0 ml-2" elevation="2">
            <ReportMenuComponent :reportsMenu="reportsMenu" />
          </v-btn-group>

          <v-btn-group class="pa-0 ml-2" elevation="2">
            <BatchMenuComponent :reportsMenu="batchMenu" />
          </v-btn-group>

        </v-col>
      </v-row>
    </div>
    <v-divider class="mb-2 mr-8 ml-8" />
    <div class="d-flex scroll-element expand-element no-expand">


      <v-data-table :items="computedItems" fixed-header :headers="headers" class="pa-0 ma-0" show-select>
        <template #bottom></template>
        <template v-slot:header.data-table-select="{ selectAll, allSelected }">
          <div class="mr-0 mt-0 mb-4 fill-height d-flex align-end">
            <v-checkbox hide-details @click="selectAll(!allSelected)"></v-checkbox>
          </div>
        </template>
        <template v-slot:header.image="{ column }">
          <div class="mr-0 mt-0 mb-12 fill-height d-flex align-end">{{ column.title }}</div>
        </template>
        <template v-slot:header.name="{ column }">
          <div class="mr-0 mt-0 mb-12 fill-height d-flex align-end">{{ column.title }}</div>
        </template>
        <template v-slot:header.price="{ column }">
          <div class="mr-0 mt-0 mb-12 fill-height d-flex align-end">{{ column.title }}</div>
        </template>
        <template v-slot:header.stock="{ column }">
          <div class="mr-0 mt-0 mb-12 fill-height d-flex align-end">{{ column.title }}</div>
        </template>
        <template v-slot:header.platform>
          <HorizontalScrollComponent id=".scroll-element .v-table__wrapper" class="special-table-width" />
          <div class="d-flex content-scroll-container special-table-width header-scroll-container">
            <div v-for="currentMarketplace in marketplace.getMarketplaces()" class="test-mp-head">
              <v-btn variant="text" class="mr-1 mt-1" width="140px" height="40"
                :style="{ 'background-color': currentMarketplace.color }" :aria-label="currentMarketplace.name">
                <v-img :width="currentMarketplace.width" :src="currentMarketplace.logo"></v-img>
              </v-btn>
            </div>
          </div>
        </template>
        <template v-slot:header.actions>
          <div class="d-flex d-block text-center align-end justify-center fill-height">
            <v-tooltip :text="$t('productDefinitions.product.define.title')">
              <template v-slot:activator="{ props }">
                <v-btn v-bind="props" @click="communication.openLink(menuStore.getMenuLinkWithTitle('productDefinition'))"
                  class="mb-1 flex-grow-1" min-width=0 elevation="2" color="primary" aria-label="Yeni ürün tanımla">
                  <v-icon size="30">mdi-plus</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
          </div>
        </template>
        <template v-slot:item.image="{ item, index }">
          <v-avatar size="x-large">
            <v-img class="ml-2 mt-1" :src="'/src/assets/logo.png'"></v-img>
          </v-avatar>

        </template>
        <template v-slot:item.name="{ item, index }">
          <div class="ma-0 pa-0 mb-0 test-clickable">
            <div class="text-truncate test-cw">
              {{ item.name }}
            </div>
            <CategoryNameComponent />
          </div>
          <div class="text-truncate test-cw"><span class="text-caption">Stok
              Kodu
              :</span> <span class="font-weight-medium">ER44678</span></div>
          <div class="text-truncate text-caption test-cw">Kaynak: Entegrator
          </div>
          <div class="text-truncate test-cw"><v-switch label="Satışa Açık"
              color="primary" density="compact" class="ma-0 pa-0 ml-4" hide-details></v-switch></div>
        </template>
        <template v-slot:item.price="{ item, index }">
          <div><span class="font-weight-medium">{{ item.price }}</span> <v-icon class="mb-2">mdi-currency-try</v-icon>
          </div>
        </template>
        <template v-slot:item.stock="{ item, index }">
          <div><span class="font-weight-medium">{{ item.stock }}</span></div>
        </template>
        <template v-slot:item.platform="{ item, index }">
          <div class="d-flex content-scroll-container special-table-width align-center test-platform-row" ref="content">
            <div v-for="currentMarketplace in marketplace.getMarketplaces()">
              <div class="test-cw">
                <span class="text-caption">id:</span><span class="ml-2 font-weight-medium">{{ (<any>
                  item)[currentMarketplace.code]?.id
                }}</span>
              </div>

              <div class="test-cw">
                <div class="text-truncate test-cw"><v-switch label="Satışta"
                    color="primary" density="compact" class="ma-0 pa-0  ml-4" hide-details></v-switch></div>
              </div>
            </div>
          </div>
        </template>
        <template v-slot:item.actions="{ item, index }">
          <div class="text-center justify-center align-center">
            <v-btn-group elevation=0 class="pa-1" density="compact">
              <v-btn class="" min-width=0 elevation="2" color="primary" aria-label="Güncelle">
                <v-icon>mdi-update</v-icon>
              </v-btn>
              <v-btn class="" min-width=0 elevation="2" color="error" aria-label="Sil">
                <v-icon>mdi-trash-can-outline</v-icon>
              </v-btn>
            </v-btn-group>
          </div>
        </template>
      </v-data-table>
      <ScrollComponent id=".scroll-element .v-table__wrapper" :isExpandable="true" />
    </div>
    <PaginationComponent />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onActivated, onDeactivated, watch, computed, getCurrentInstance, inject } from 'vue'
import CategoryNameComponent from '@/components/productDefinitions/crud/CategoryNameComponent.vue';
import PaginationComponent from '@/components/PaginationComponent.vue';
import useCommunication from '@/composables/site/communication';
const eventBus: any = inject('eventBus');
var communication: any = useCommunication(eventBus)

const menuStore: any = inject('useMenuStore')
const marketplace: any = inject('useMarketplaceStore')

const { t } = useI18n()
var contentWidth = 170

var a = () => {
  console.log("hebeleelelelel")
}

const computedItems = computed(() => { if (show.value) return items;else return[] })

/* var removeComponent= ()=> {
  console.log(ci)
  if(ci)
  console.log(ci)
}
N */
var batchMenu = {
  title: t('batch.menu.title'),
  desc: t('batch.menu.desc'),
  list: [
    {
      id: 1,
      title: t('orders.order.reports.tax'),
      path: '/support/ticket',
      icon: 'mdi-message-question-outline'
    },
    {
      id: 2,
      title: t('orders.order.reports.commission'),
      path: '/support/ticket/list',
      icon: 'mdi-list-status'
    },
    {
      id: 3,
      title: t('orders.order.reports.category'),
      path: '/support/school',
      icon: 'mdi-school-outline'
    },
    {
      id: 4,
      title: t('orders.order.reports.brand'),
      path: '/support/school',
      icon: 'mdi-school-outline'
    },

  ]
}


var reportsMenu = {
  title: t('productDefinitions.product.reports.title'),
  desc: t('productDefinitions.product.reports.desc'),
  list: [
    {
      id: 1,
      title: t('productDefinitions.product.reports.sold'),
      path: '/support/ticket',
      icon: 'mdi-message-question-outline'
    },
    {
      id: 2,
      title: t('productDefinitions.product.reports.bestseller'),
      path: '/support/ticket/list',
      icon: 'mdi-list-status'
    },

  ]
}


var buttons = [
  {
    title: t("productDefinitions.product.define.title"),
    icon: 'mdi-pencil-outline',
    color: 'primary',
    to: '',
    click: a
  },
/*   {
    title: t("productDefinitions.product.update"),
    icon: 'mdi-pencil-outline',
    color: 'primary',
    to: '',
    click: a
  },
 */  {
    title: t("productDefinitions.product.save"),
    icon: 'mdi-pencil-outline',
    color: 'primary',
    to: '',
    click: a
  },
  {
    title: t("productDefinitions.product.copy"),
    icon: 'mdi-pencil-outline',
    color: 'neutral',
    to: '',
    click: a
  },
  {
    title: t("productDefinitions.product.delete"),
    icon: 'mdi-pencil-outline',
    color: 'error',
    to: '',
    click: a
  },
]


const headers = [
  {
    id: 1,
    title: '',
    value: "image"
  },
  {
    id: 1,
    title: t('productDefinitions.product.headers.product'),
    value: "name",
    sortable: true
  },
  {
    id: 1,
    title: t('productDefinitions.product.headers.price'),
    value: "price",
    sortable: true
  },
  {
    id: 1,
    title: t('productDefinitions.product.headers.stock'),
    value: "stock",
    sortable: true
  },
  {
    id: 1,
    title: "platform",
    value: "platform"
  },
  {
    id: 1,
    title: "actions",
    value: "actions"
  },
]

const dynamicHeaders = [
  "hepsiburada",
  "trendyol",
  "amazon",
  "pazarama",
  "pttavm",
  "ciceksepeti",
  "n11",
  "akakce",
]
const items = [
  {
    id: 1,
    name: "Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    price: "2.099,90 - 3.099,40",
    stock: 2,
    hepsiburada: { id: '345234EE', product: 'HBabet2222', color: 'Renk', size: 'Beden', number: 'Numara' },
    trendyol: { id: '345234EE', product: 'TBabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    amazon: { id: '345234EE', product: 'ABabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pazarama: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pttavm: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    ciceksepeti: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    n11: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    akakce: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },

  },
  {

    id: 2,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    price: "2.099,90 - 3.099,40",
    stock: 2,
    hepsiburada: { id: '345234EE', product: 'HBabet2222', color: 'Renk', size: 'Beden', number: 'Numara' },
    trendyol: { id: '345234EE', product: 'TBabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    amazon: { id: '345234EE', product: 'ABabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pazarama: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pttavm: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    ciceksepeti: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    n11: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    akakce: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },

  },
  {
    id: 3,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    price: "2.099,90 - 3.099,40",
    stock: 2,
    hepsiburada: { id: '345234EE', product: 'HBabet2222', color: 'Renk', size: 'Beden', number: 'Numara' },
    trendyol: { id: '345234EE', product: 'TBabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    amazon: { id: '345234EE', product: 'ABabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pazarama: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pttavm: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    ciceksepeti: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    n11: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    akakce: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },

  },
  {
    id: 4,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    price: "2.099,90 - 3.099,40",
    stock: 2,
    hepsiburada: { id: '345234EE', product: 'HBabet2222', color: 'Renk', size: 'Beden', number: 'Numara' },
    trendyol: { id: '345234EE', product: 'TBabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    amazon: { id: '345234EE', product: 'ABabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pazarama: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pttavm: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    ciceksepeti: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    n11: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    akakce: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },

  },
  {
    id: 5,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    price: "2.099,90 - 3.099,40",
    stock: 2,
    hepsiburada: { id: '345234EE', product: 'HBabet2222', color: 'Renk', size: 'Beden', number: 'Numara' },
    trendyol: { id: '345234EE', product: 'TBabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    amazon: { id: '345234EE', product: 'ABabet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pazarama: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    pttavm: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    ciceksepeti: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    n11: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
    akakce: { id: '345234EE', product: 'Babet', color: 'Renk', size: 'Beden', number: 'Numara' },
  },
  {
    id: 6,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1",
    price: "2.099,90 - 3.099,40",
    stock: 2,

  },
  {
    id: 7,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1"
  },
  {
    id: 8,
    name: "En Hakiki Kadın Babet Ayakkabı",
    platform: "1"
  },

]

var props = defineProps<{
  isRendered: boolean
}>()

var duygu:any = ref(true)
var show = ref(true)
var initialize = () => {
  console.log("initialized")
  show.value = true

}
onActivated(() => {
  console.log("onactivated test")
  show.value = true
  duygu.value = true

})
onDeactivated(() => {
  console.log("ondeactivated test test", props.isRendered)
  if (props.isRendered == false) {
    show.value = false
    duygu.value = false
    console.log(ci)

  }
})
var removeComponent = () => {
  console.log("remove component")
  show.value = false
}
defineExpose({
  initialize,
  removeComponent
});

var scrollTable: any = undefined
var contentScrolls: any = undefined
var ci: any = undefined
onMounted(() => {
  ci = getCurrentInstance()

  /*   scrollTable = document.querySelector('.scroll-table .v-table__wrapper');
    contentScrolls = document.querySelectorAll('.content-scroll-container');
  
    if (scrollTable) {
      if (scrollTable.scrollHeight)
        sliderTableMax.value = scrollTable.scrollHeight - scrollTable.clientHeight + 0
      scrollTable.addEventListener('scroll', handleTableScroll);
    }
  
    if (contentScrolls) {
      contentScrolls.forEach((contentScroll:any) => {
        contentScroll.addEventListener('scroll', handleScroll);
      })
  
      const contentScroll = contentScrolls[0];
      if (contentScroll?.scrollWidth)
        sliderMax.value = contentScroll?.scrollWidth - contentScroll?.clientWidth + 0
  
    } */
});


/* watch(sliderTableValue, (newValue, oldValue) => {
  if (scrollTable)
    scrollTable.scrollTop = sliderTableValue.value;
});

watch(sliderValue, (newValue, oldValue) => {
  if (contentScrolls) {
    contentScrolls.forEach((contentScroll: any) => {
      contentScroll.scrollLeft = sliderValue.value;
    })
  }
});

watch(tableScroll.expansionModel.value, (newValue, oldValue) => {
  if (scrollTable) {
    if (scrollTable.scrollHeight) {
      setTimeout(() => {
        sliderTableMax.value = scrollTable.scrollHeight - scrollTable.clientHeight + 0
      }, 500)
    }
  }
});

var handleTableScroll = (event: any) => {
  sliderTableValue.value = event.target.scrollTop
}

var handleScroll = (event: any) => {
  sliderValue.value = event.target.scrollLeft
  contentScrolls.forEach((contentScroll:any) => {
    contentScroll.scrollLeft = event.target.scrollLeft
  })
}
 */
</script>

<style></style>

<style scoped>
/* Sütun genişliği tek sabit (170px) — eskiden her hücrede satır içi `:style` ile veriliyordu. */
.test-cw {
  width: 170px !important;
}

.test-mp-head {
  min-height: 60px;
  min-width: 170px !important;
}

.test-platform-row {
  height: 120px;
}

.test-clickable {
  cursor: pointer;
}
</style>
