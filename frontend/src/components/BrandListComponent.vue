<template>
  <div class="brandListComponentView">
    <LoadingComponent attach=".brandDefinition" ref="loadingComponentRef"></LoadingComponent>




    <!--     <div class="workarea-scroll pa-6 pr-2 pt-0 pb-0"
      style="margin-top:95px;border-right:0px solid #ddd;border-top:1px solid #ddd;"> -->
    <div class="workarea-scroll pa-6 pr-2 pt-4 pb-0" style="">

      <CardComponent icon="mdi-shape" title="Marka Listesi">

        <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop variant="outlined" density="compact"
          type="tel" maxlength="160" class="ma-4 mb-1 ml-0 mr-0 pr-0 customTextField" clearable counter
          :rules="formRules.searchRules" v-model="brandSearchText"
          :hint="$t('productDefinitions.brand.brandSearchDesc')">

          <template v-slot:label>
            <span class="font-weight-light">{{ $t('productDefinitions.brand.search')
              }}</span>
          </template>
        </v-text-field>

        <v-list density="compact" dense nav v-model:opened="open" activatable open-strategy="single" width="100%"
          active-strategy="single-independent" class="mt-1"
          style="background-color:#f8f8f8;border:1px solid #ddd;border-radius:5px;background1:linear-gradient(0deg, #fff 10%, #fafaff 20%, #fafaff 80%, #fff 90%)!important">

          <!--       <v-list density="compact" dense nav v-model:opened="open" activatable open-strategy="single" width="100%"
        active-strategy="single-independent" style="background-color:#eee"> -->

          <div class="mt-1">
            <div class="d-flex">

              <v-form v-model="brandForm" style="display:contents" @keydown.enter.prevent @submit.prevent>
                <v-text-field variant="outlined" density="compact" type="tel" maxlength="160" counter clearable
                  bg-color="textfieldColor" :hint="$t('productDefinitions.brand.brandNameDesc')" class="customTextField"
                  v-model="brandName" :rules="titleRules"
                  @keyup.enter="addBrand({ title: brandName }); brandName = undefined">
                  <template v-slot:label>
                    <span class="font-ital1ic font-weight-light">{{ $t('productDefinitions.brand.title') }}</span>
                  </template>
                  <template v-slot:append-inner>
                    <v-btn class="fill-height" size="40" flat min-width=0 density="compact" color="processButtonColor"
                      :disabled="!brandForm || brandName == undefined"
                      @click="addBrand({ title: brandName }); brandName = undefined"><span class="">
                        <v-icon>mdi-plus</v-icon>
                      </span></v-btn>
                  </template>
                </v-text-field>
              </v-form>
            </div>
          </div>


          <template v-for="(brand, index) of computedBrands" :style="{'background-color':index%2==0?'#eee':'#fff'}">
            <div v-if="!brand.isMain"
              style="position:relative;border:1px solid #bbb;border-bottom-left-radius:2px;border-bottom-right-radius:2px;"
              class="mb-3 brand-menu" :style="{ 'background-color': index % 2 == 0 ? '#f7f7f7' : '#fbfbfb' }">
              <v-list-group :value="brand._id" @click="eventBus.emit('pageResize', '')">
                <template v-slot:activator="{ props, isOpen }">

                  <v-list-item v-bind="props" :prepend-icon="brand.icon" :value="brand._id"
                    class="pt-0 pb-0  pl-2 mb-0 pr-0  elevation-0 brand-list-item"
                    style="padding-inline-start: 8px!important">
                    <template v-slot:prepend="{ isSelected, isActive }">
                      <div style="border:1px solid black" class="pr-3 pl-3 mr-4" @dragover.prevent> {{ index }}
                      </div>
                    </template>
                    <div class="pt-3 pb-3">
                      <v-icon style="opacity:.6" class="mr-2">mdi-folder-outline</v-icon>
                      {{ brand.title }}
                    </div>
                    <template v-slot:append="{ isSelected, isActive }">
                      <v-list-item-action end style="height:100%!important">

                                      <v-icon size="large" @click.stop="openBrandSync(brand)" style="opacity:1;" class="mr-4" btn color="processButtonColor">mdi-cog</v-icon>


                      </v-list-item-action>
                    </template>
                  </v-list-item>
                </template>
              </v-list-group>
            </div>
          </template>
        </v-list>

      </CardComponent>
    </div>


  </div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, onBeforeMount, onBeforeUnmount } from 'vue'
import useRestApi from '@/composables/restapi'
import useFormRules from '@/composables/formrules';
import { useI18n } from 'vue-i18n';
import { useBrandsStore } from '@/stores/brandsStore';
import LoadingComponent from '@/components/LoadingComponent.vue'
import CardComponent from './CardComponent.vue';

const brandsStore = useBrandsStore()
const formRules = useFormRules()
const restApi = useRestApi()
const eventBus: any = inject('eventBus')
var showBrands = defineModel({ default: false })

const emits = defineEmits(['openBrandSync'])
const open: any = ref(['0'])
const isEditDialogOpen = ref(false)
const isConfirmationDialogOpen = ref(false)
const editingBrand: any = ref()
const brandSearchText: any = ref()
const brandForm: any = ref()
const brandName: any = ref()
var brandsStoreBrands: any = undefined
const loadingComponentRef: any = ref(null)

const { t } = useI18n()
const titleRules = [
  (v: any) => !!v || (!v && v === 0) || t("rules.mandatory"),
  (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 2 || v.length > 160))) || t("rules.2_160characters"),
]

onBeforeMount(() => {
  fetchBrands()
})

onBeforeUnmount(async () => {
  open.value = undefined
})

const computedBrands = computed(() => {
  if (!brandsStoreBrands.value || !brandSearchText.value || brandSearchText.value.length < 2) return brandsStoreBrands.value
  return brandsStoreBrands.value.filter((item: any) => item.title.toLowerCase().includes(brandSearchText.value.toLowerCase()))
})


const fetchBrands = () => {
  brandsStoreBrands = brandsStore.getBrands(true)
  eventBus.emit('pageResize', "");
  openBrandSync(undefined)
}


const startEdit = (ec: any) => {
  editingBrand.value = ec
  editingBrand.value.updateTitle = ec.title
  isEditDialogOpen.value = true
}

const endEdit = () => {
  isEditDialogOpen.value = false
  isConfirmationDialogOpen.value = false
  editingBrand.value = undefined
}

const openBrandSync = (brand: any) => {
  emits("openBrandSync", brand)
}

const addBrand = async (newBrand: any) => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/addBrand", { title: newBrand.title })
  loadingComponentRef.value.remove(guid)
  if (response && response._id) {
    update()
  }

}

const updateBrand = async () => {
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/updateBrand", { _id: editingBrand.value._id, title: editingBrand.value.updateTitle })
  loadingComponentRef.value.remove(guid)
  if (response && response.result == true) {
    update()
    endEdit()
  }
}

const deleteBrand = async () => {
  if (!editingBrand.value)
    endEdit()
  let guid = loadingComponentRef.value.info("")
  const response = await restApi.post("BrandService/deleteBrand", { _id: editingBrand.value._id, parentId: editingBrand.value.parentId })
  loadingComponentRef.value.remove(guid)
  if (response && response.result && response.result.acknowledged == true) {
    endEdit()
    update()
  }
}

const update = () => {
  fetchBrands()
}

</script>

<style scoped></style>