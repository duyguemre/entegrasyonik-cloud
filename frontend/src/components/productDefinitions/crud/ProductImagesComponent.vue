<template>
  <CardComponent icon="mdi-image-multiple-outline" title="Ürün Resim Galerisi" class="productImagesComponent pim-s1">
    <LoadingComponent attach=".productImagesComponent" ref="loadingComponentRef"></LoadingComponent>
    <template #header>
      <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Kapat" @click="emits('close')" />
    </template>
    <v-row no-gutters>
      <v-col class="pl-2 pr-4">
        <div>
          <CardComponent :whiteBackground="true" class="pim-s3">
            <v-row>
              <v-col>
                <div v-if="productInfoForm.images == undefined || productInfoForm.images.length == 0"
                  class="d-flex align-center justify-start mt-0 pa-3">
                  <v-card density="compact" class="pim-s4" :height="width + 80" :width="width + 120" elevation=0>
                    <v-card-text class="d-flex align-center justify-center fill-height">
                      <div>
                        <v-icon size="200" class="pim-s5">mdi-image-outline</v-icon>
                        <div class="text-center text-caption pim-s6">
                          Henüz resim eklenmemiş
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>
                <Sortable :list='productInfoForm.images' @end="onEndSort" item-key="_id" tag="div"
                  :options="{ handle: '.drag-handle' }" class="d-flex flex-wrap">
                  <template #item="{ element, index }">
                    <div class="draggable pa-2 hoveredContainer" :data-id="element._id">
                      <v-card density="compact" class="hoveredBorder d-flex flex-column pim-s7" :height="width + 78"
                        :width="width + 122"
                        :elevation="isSelectionExist(element._id) == -1 ? 0 : 2"
                        @click.stop="toggleSelectedImagesForId(element._id)" :class="{ 'pim-unselected': selectedImages.length > 0 && isSelectionExist(element._id) == -1 }">
                        <v-btn class="hovered pim-s8"
                          @click.stop="deleteImage(element)" elevation="0" min-width="0" color="transparent"><v-icon
                            size="large" color="deleteButtonColor">mdi-delete</v-icon></v-btn>
                        <v-btn class="hovered pim-s9"
                          @click.stop="downloadImage(element._id)" elevation="0" min-width="0"
                          color="transparent"><v-icon size="large" color="primary">mdi-download</v-icon></v-btn>

                        <v-card outlined
                          elevation="1" min-width="0" color="infoButtonColor" class="drag-handle hovered pim-s10">
                          <div class="d-flex justify-center text-center ">
                            <div class="text-caption pim-s11">

                              <v-icon color="processButtonColor" size="25">mdi-drag</v-icon>

                            </div>
                            <div class="pim-s12">
                              {{ getFileSize(element.size) }}
                            </div>
                            <div class="pim-s13">
                              {{ element.width }}x{{ element.height }}
                            </div>
                          </div>
                        </v-card>
                        <v-card-text class="pa-0">

                          <ProductImageComponent v-model="productInfoForm.images[index]"
                            :productId="productInfoForm._id ? productInfoForm._id : productInfoForm.tempId"
                            :height="206" class="pim-s14">
                          </ProductImageComponent>
                        </v-card-text>
                        <v-card-actions class="align-start justify-center pim-s15">
                        </v-card-actions>
                      </v-card>
                    </div>
                  </template>
                </Sortable>
              </v-col>
            </v-row>
          </CardComponent>
        </div>
      </v-col>
      <v-col cols=4>
        <v-row>
          <v-col>
            <ImageUploaderComponent :productInfoForm="productInfoForm" :choice="productImagesInfo.selectedChoice"
              @uploaded-event="refreshImages" />
            <CardComponent class="pa-4 mt-4" v-if="computedChoices.length > 0 && selectedImages.length != 0">
              <div class="pim-s16"></div>
              <template v-for="(choice, index) of computedChoices">
                <v-select multiple item-value="_id" item-title="title"
                  v-model="selectedChoices[choice._id]" :label="choice.title" :items="choice.values" density="compact"
                  class="mb-2 pim-s17" variant="outlined" bg-color="textfieldColor" hide-details>
                </v-select>
              </template>
              <v-btn-group elevation="0" class="d-block mt-6" density="compact">
                <v-btn density="compact" block class="fill-height pim-s18" color="processButtonColor"
                  :disabled="!Object.values(selectedChoices).some(arr => Array.isArray(arr) && arr.length > 0) || selectedImages.length <= 0"
                  @click="assignImages">
                  <span class="">
                    Seçili Resimleri Varyantlara Ata
                  </span></v-btn>
              </v-btn-group>
            </CardComponent>

            <div class="mt-4 pim-s19">
              <v-checkbox hide-details density="compact" v-model="selectAllImages"
                :disabled="productInfoForm.images?.length < 1"
                :indeterminate="selectedImages.length != 0 && selectedImages.length < productInfoForm.images.length">
                <template #label>
                  <div class="text-caption1">
                    {{ $t('common.selectAllImages') }}
                  </div>
                </template>
              </v-checkbox>

              <v-btn-group v-if="selectedImages.length > 0" elevation="0" class="ml-1  mt-1 mb-2" density="compact">
                <v-btn density="compact" block class="fill-height pim-s18" color="saveButtonColor" :disabled="selectedImages.length <= 0" @click="deleteImageSelected">
                  <div v-if="selectedImages.length > 0">
                    Seçili <span class="font-weight-bold pim-s20">{{ selectedImages.length }}</span>
                    Resmi
                    Sil
                  </div>
                </v-btn>
              </v-btn-group>
            </div>

          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </CardComponent>
</template>

<script setup lang="ts">
import { Sortable } from "sortablejs-vue3";
import EkButton from '@/components/ds/EkButton.vue'

import { ref, computed, onMounted, onBeforeMount, nextTick, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useChoicesStore } from '@/stores/choicesStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
const categoriesStore = useCategoriesStore()
const selectedChoices: any = ref({})
import ImageUploaderComponent from '@/components/productDefinitions/crud/ImageUploaderComponent.vue'
import ProductImageComponent from '@/components/productDefinitions/products/ProductImageComponent.vue'
import { useSnackbarStore } from '@/stores/snackbarStore';
import CardComponent from "@/components/CardComponent.vue";
const snackbarStore = useSnackbarStore();


const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()

const isImages = defineModel({ default: false })
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')

const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{
  productInfoForm: any
}>()
const restApi = useRestApi()
const variantsList: any = ref()
const loadingComponentRef: any = ref(null)
const fileInputRef: any = ref(null)
const selectedImages: any = ref([])
const productImagesInfo: any = ref(
  {
    isVariant: false,
    selectedChoice: { choiceId: -1, choiceValueId: -1 },
    selectedChoiceForFilter: { choiceId: -1, choiceValueId: -1 },
  }
)
const selectedItems: any = ref([]);
const items = ref([
  { id: 1, name: "Elma", category: "Meyve" },
  { id: 2, name: "Armut", category: "Meyve" },
  { id: 3, name: "Domates", category: "Sebze" },
  { id: 4, name: "Havuç", category: "Sebze" },
  { id: 5, name: "Karpuz", category: "Meyve" },
]);
const groupedItems = computed(() => {
  const groups: any = {};
  items.value.forEach((item: any) => {
    if (!groups[item.category]) {
      groups[item.category] = { label: item.category, value: `group-${item.category}`, children: [] };
    }
    groups[item.category].children.push({ isChildren: true, label: item.name, value: item.id });
  });
  return Object.values(groups).map((group: any) => [group, ...group.children]).flat();
});

/* const onSelectChange = (value:any) => {
  const selectedGroups = value.filter((v:any) => typeof v === "string" && v.startsWith("group-"));
  selectedGroups.forEach((group:any) => {
    const category = group.replace("group-", "");
    const categoryItems = items.value.filter((item) => item.category === category).map((item) => item.id);
    if (categoryItems.every((id) => value.includes(id))) {
      value = value.filter((id:any) => !categoryItems.includes(id)); // Tümünü kaldır
    } else {
      value = [...new Set([...value, ...categoryItems])]; // Tümünü ekle
    }
  });

  selectedItems.value = value;
};
 */
// Belirli bir grubun seçili olup olmadığını kontrol et
const isGroupSelected = (groupLabel: any) => {
  const categoryItems: any = items.value.filter((item: any) => item.category === groupLabel).map((item: any) => item.id);
  return categoryItems.every((id: any) => selectedItems.value.includes(id));
};

// Grup seçildiğinde tüm öğeleri seç/kaldır
const toggleGroup = (groupLabel: any) => {
  const categoryItems = items.value.filter((item) => item.category === groupLabel).map((item) => item.id);
  if (categoryItems.every((id) => selectedItems.value.includes(id))) {
    selectedItems.value = selectedItems.value.filter((id: any) => !categoryItems.includes(id)); // Hepsini kaldır
  } else {
    selectedItems.value = [...new Set([...selectedItems.value, ...categoryItems])]; // Hepsini ekle
  }
};

// Tek bir öğeyi seç/kaldır
const toggleItem = (itemId: any) => {
  if (selectedItems.value.includes(itemId)) {
    selectedItems.value = selectedItems.value.filter((id: any) => id !== itemId);
  } else {
    selectedItems.value.push(itemId);
  }
};

const onSelectChange = (value: any) => {
  selectedItems.value = value;
};



const { t } = useI18n()

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const computedVariantChoices: any = computed(() => {
  const cvc: any = []
  for (const variant of props.productInfoForm.variants) {
    let choiceLabel = ""
    for (const choice of variant.choices) {
      if (choiceLabel != "") choiceLabel += " | "
      choiceLabel += choicesStore.getChoiceTitle(choice.choiceId) + "  " + choicesStore.getDirectChoiceValueTitle(choice.choiceValueId)
    }
    cvc.push({ tempId: variant.tempId, title: choiceLabel })
  }
  return cvc
})



const computedChoices: any = ref([])//computed(() => {

watch(() => props.productInfoForm.variants, (newChoices) => {
  const currentCategory = categoriesStore.getCategory(props.productInfoForm.category)
  const allChoices = choicesStore.getChoices().value
  //console.log(allChoices,allChoices.filter((item:any)=>currentCategory.choiceIds.includes(item._id)))  
  let categoryChoices = allChoices.filter((item: any) => currentCategory.choiceIds?.includes(item._id))
  categoryChoices = JSON.parse(JSON.stringify(allChoices))

  const choiceIds = new Set()
  const choiceValueIds = new Set()
  for (const variant of props.productInfoForm.variants) {
    for (const choice of variant.choices) {
      choiceIds.add(choice.choiceId)
      choiceValueIds.add(choice.choiceValueId)
    }
  }
  console.log(choiceIds)
  categoryChoices = categoryChoices.filter((item: any) => choiceIds.has(item._id))
  for (const choice of categoryChoices) {
    if (choice.values)
      choice.values = choice.values.filter((item: any) => choiceValueIds.has(item._id))
  }

  console.log(categoryChoices)
  computedChoices.value = categoryChoices
}, { deep: true, immediate: true })



/* watch(()=>props.productInfoForm.variants, (newChoices) => {
  selectedChoices.value = []
  for (const choice of computedChoices.value) {
    selectedChoices.value.push({ choiceId: choice._id, choiceValueIds: [] })
  }
});
 */



var id = -1
const width = 160
var dragging = ref(false)

const onEndSort = (event: any) => {
  const { newIndex, oldIndex, from, to, item } = event
  if (newIndex == oldIndex) return
  const sortedImageIds = Array.from(to.children).map((item: any) => item.dataset.id)
  sortImages(newIndex, Number(item.dataset.id), sortedImageIds)
}


const sortImages = async (itemIndex: number, imageId: number, sortedImageIds: Array<number>) => {
  let guid = loadingComponentRef.value.info(t('loading.info.sortingImages'))
  const response = await restApi.postImage('sortImages', { sortedImageIds: sortedImageIds, order: props.productInfoForm.images[itemIndex].order, orderChangeId: imageId, tempProductId: props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)
  refreshImages()
  if (response == true) {
    snackbarStore.addSnackbar({
      show: true,
      text: 'Resimler sıralandı',
      timeout: 2000,
      color: 'success'
    })
  }
}

const toggleSelectedImagesForId = (imageId: number) => {
  const index = isSelectionExist(imageId)
  if (index == -1) {
    selectedImages.value.push(imageId);
  } else {
    selectedImages.value.splice(index, 1);
  }
}

const isSelectionExist = (imageId: number) => {
  return selectedImages.value.indexOf(imageId)
}

const selectAllImages = computed({
  get() {
    if (!props.productInfoForm.images || props.productInfoForm.images.length == 0) return false
    return selectedImages.value.length === props.productInfoForm.images.length
  },
  set(newValue: boolean) {
    selectedImages.value = []
    if (newValue) {
      for (let currentImage of props.productInfoForm.images) {
        selectedImages.value.push(currentImage._id)
      }
    }
  }
})


const init = async () => {
  choicesStoreChoices.value = choicesStore.getChoices()
  fileInputRef.value = ""
  /*   await getImages() */

}

onMounted(() => {
  init()
})

onMounted(() => {
  /*   getVariantsList() */
})

const downloadImage = (imageId: any) => {
  const link = document.createElement('a');
  link.href = restApi.downloadImage(imageId)
  link.target = "_blank"
  link.click();
}

const constructImageUrl = async (image: any) => {
  let binaryImageData = await restApi.postImage('getImage', image)

  return URL.createObjectURL(binaryImageData)

}

const getVariantsList = async () => {
  await nextTick(() => { })
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  await sleep(1)
  let response = await restApi.post("VariantService/getVariantsList", { _id: props.productInfoForm._id })
  loadingComponentRef.value.remove(guid)
  if (response && response.variants) {
    variantsList.value = []
    let flag = true
    for (let variant of response.variants) {
      variantsList.value.push({ title: variant.title, value: variant._id })
      if (flag == true) {
        console.log(variantsList.value, variantsList.value[0])
        /*         productImagesInfo.value.selectedChoice = variantsList.value[0].value */
        flag = false
      }
    }
  }
}

defineExpose({
  getVariantsList
});

const images = ref<Array<{ file: File, id: number }>>(
  []
)
const thumbnails = ref<Array<{ url: string, id: number, width: number, height: number }>>(
  []
)



var getFileName = (id: number) => {
  for (var image of images.value) {
    if (image.id == id) return image.file.name
  }
}

var getFileSizeOld = (id: number) => {
  for (var image of images.value) {
    if (image.id == id) {
      var suffix = "MB"
      var conversion = 1000000
      if (image.file.size < 1000000) {
        conversion = 1000
        suffix = "KB"
      }
      return parseFloat("" + image.file.size / conversion).toFixed(1) + suffix

    }
  }
}

var getFileSize = (size: number) => {
  if (size == undefined) return 0
  var suffix = "MB"
  var conversion = 1000000
  if (size < 1000000) {
    conversion = 1000
    suffix = "KB"
  }
  return parseFloat("" + size / conversion).toFixed(1) + suffix
}

var files = ref([])

const deleteImage = async (image: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  const response = await restApi.postImage('deleteImage', { imageId: image._id, tempProductId: props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)

  refreshImages()
  if (response == true) {
    snackbarStore.addSnackbar({
      show: true,
      text: 'Resim silindi',
      timeout: 2000,
      color: 'success'
    })
  }
}


const deleteImageSelected = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  await sleep(1)
  const response = await restApi.postImage('deleteImageSelected', { tempProductId: props.productInfoForm.tempId, selectedImages: selectedImages.value })
  loadingComponentRef.value.remove(guid)
  if (response == true) {
    refreshImages()
    snackbarStore.addSnackbar({
      show: true,
      text: 'Resim silindi',
      timeout: 2000,
      color: 'success'
    })
  }
}


const refreshImages = async () => {
  if (selectedImages.value) selectedImages.value.length = 0
  await nextTick(() => { })
  let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
  const resp = await restApi.postImage('getImages', {
    productId: props.productInfoForm.tempId
  })
  props.productInfoForm.images = resp.images
  const imageIds = resp.images?.map((image: any) => image._id); // Tüm _id değerlerini al
  props.productInfoForm.variants?.forEach((variant: any) => {
    variant.images = variant.images?.filter((imageId: any) => imageIds?.includes(imageId)) || [];
  });
  loadingComponentRef.value.remove(guid)
  emits('refreshImages', '')
}


const checkVariantChoice = (variantChoice: any) => {
  console.log("selectedChoices.value", selectedChoices.value)
  for (const choiceId of Object.keys(selectedChoices.value)) {
    if (variantChoice.choiceId == choiceId) {
      if (selectedChoices.value[choiceId]?.length == 0 || selectedChoices.value[choiceId].includes(variantChoice.choiceValueId)) {
        return true
      }
      return false
    }
  }
  return true
}
const assignImages = async () => {
  for (const variant of props.productInfoForm.variants) {
    let flag = true
    for (const variantChoice of variant.choices) {
      console.log("dsfdfd", checkVariantChoice(variantChoice))
      if (checkVariantChoice(variantChoice) == false) {
        flag = false
        break
      }
    }
    if (flag == false) continue
    if (!variant.images) variant.images = []
    variant.images = [...new Set([...variant.images, ...selectedImages.value])];

    console.log(variant)
  }

  selectedChoices.value = {}
  selectedImages.value = []
  snackbarStore.addSnackbar({
    show: true,
    text: 'Resimler başarıyla atandı',
    timeout: 2000,
    color: 'success'
  })
}

</script>

<style>
.dropZone {
  position: relative;
  border: 1px dashed black;
}

.dropZone:hover {
  background-color: red;
}

.dropZone:hover .dropZone-title {
  color: var(--ek-color-info);
}

.dropZone-info {
  color: var(--ek-color-content-muted);
  position: absolute;
  text-align: center;
}

.dropZone-title {
  color: var(--ek-color-content-muted);
}

.fileInput {
  position: absolute;
  cursor: pointer;
  opacity: 0;
  height: 100%;
  width: 100%;
}

.dragDropOn .dragDropOnZone {
  background-color: var(--ek-color-info);
}

.dragDropOff .dragDropOnZone {}

.dragDropOn {
  background-color: var(--ek-color-info);
}

.dragDropOff {}

.dragDropOn .dragCard {
  /*   top: 204px; */

}

.dragCard {
  /*   position: absolute; */
  /*   top: 184px; */
  /*   top: 150px;
  bottom: 2px;
  right: 0;
  left: 0; */
  border: 0px dashed var(--ek-color-border-default);

}

.dropZone input {
  cursor: pointer;
  opacity: 1;
}

.dropZone-upload-limit-info {
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
}

.dropZone-over {
  background: var(--ek-color-surface-sunken);
  opacity: 0.8;
}

.dropZone-uploaded {
  width: 80%;
  height: 200px;
  position: relative;
  border: 0px dashed var(--ek-color-border-default);
}

.dropZone-uploaded-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ek-color-content-muted);
  position: absolute;
  top: 50%;
  width: 100%;
  transform: translate(0, -50%);
  text-align: center;
}

.removeFile {
  width: 200px;
}
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pim-s1 {
  overflow-y: scroll !important;
  border: 1px solid var(--ek-color-border-default) !important;
  height: calc(100vh - 110px) !important;
}

.pim-s2 {
  border: 1px solid var(--ek-color-border-strong) !important;
  width: 30px !important;
  opacity: .9 !important;
}

.pim-s3 {
  overflow-y: scroll !important;
  height: calc(100vh - 190px) !important;
}

.pim-s4 {
  background-color: white !important;
  border: 1px solid var(--ek-color-border-default) !important;
}

.pim-s5 {
  opacity: .2 !important;
}

.pim-s6 {
  color: var(--ek-color-content-muted) !important;
  font-style: italic !important;
}

.pim-s7 {
  background-color: var(--ek-color-surface) !important;
}

.pim-s8 {
  position: absolute !important;
  border: 0px solid var(--ek-color-border-strong) !important;
  top: 0px !important;
  right: 0px !important;
  height: 30px !important;
  width: 30px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-left-radius: 20px !important;
  z-index: 1 !important;
}

.pim-s9 {
  position: absolute !important;
  top: 0px !important;
  left: 0px !important;
  height: 30px !important;
  width: 30px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-right-radius: 20px !important;
  z-index: 1 !important;
}

.pim-s10 {
  position: absolute !important;
  bottom: 0px !important;
  left: 0px !important;
  right: 0 !important;
  height: 30px !important;
  width: auto !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-top-left-radius: 20px !important;
  border-top-right-radius: 20px !important;
  z-index: 1 !important;
}

.pim-s11 {
  position: absolute !important;
  bottom: 5px !important;
  opacity: .7 !important;
}

.pim-s12 {
  position: absolute !important;
  bottom: 5px !important;
  left: 10px !important;
  opacity: .5 !important;
  font-size: .7em !important;
}

.pim-s13 {
  position: absolute !important;
  bottom: 5px !important;
  right: 10px !important;
  opacity: .5 !important;
  font-size: .7em !important;
}

.pim-s14 {
  max-height: 140px !important;
}

.pim-s15 {
  max-height: 30px !important;
}

.pim-s16 {
  height: 20px !important;
}

.pim-s17 {
  min-width: 200px !important;
}

.pim-s18 {
  border: 1px solid var(--ek-color-border-strong) !important;
}

.pim-s19 {
  height: 80px !important;
}

.pim-s20 {
  font-size: 1.2em !important;
}

/* Secim varken secilmemis resimler soluk (onceki dinamik satir ici opacity). */
.pim-unselected {
  opacity: .5 !important;
}
</style>
