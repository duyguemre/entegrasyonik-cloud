<template>

  <CardComponent tabindex="0" icon="mdi-image-multiple-outline" title="Varyant Resimleri" :whiteBackground="true"
    class="productVariantImagesComponent pvi-s1">
    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
    <template #header>
      <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Kapat" @click="emits('close')" />
    </template>

    <LoadingComponent attach=".productVariantImagesComponent" ref="loadingComponentRef"></LoadingComponent>

    <v-row no-gutters>
      <v-col class="pl-2 pr-4">
        <div>
          <CardComponent tabindex="0" :whiteBackground="true" class="pvi-s3">
            <v-row>
              <v-col>
                <div v-if="sortedImageIds?.length == 0" class="d-flex align-center justify-start mt-0 pa-3">
                  <v-card density="compact" class="pvi-s4" :height="width + 80" :width="width + 120" elevation=0>
                    <v-card-text class="d-flex align-center justify-center fill-height">
                      <div>
                        <v-icon size="200" class="pvi-s5">mdi-image-outline</v-icon>
                        <div class="text-center text-caption pvi-s6">
                          Henüz resim eklenmemiş
                        </div>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>
                <Sortable :list='sortedImageIds' @end="onEndSort" tag="div" item-key="index" :key="sortedImageIds"
                  :options="{ handle: '.drag-handle' }" class="d-flex flex-wrap mt-1 ml-1 mr-1">
                  <template #item="{ element, index }">
                    <div class="draggable pa-0 hoveredContainer" :data-id="element">
                      <v-card density="compact" class="hoveredBorder d-flex flex-column pvi-s7" :height="width + 82"
                        :width="width + 122"
                        :elevation="isSelectionExistForVariant(element) == -1 ? 0 : 2"
                        @click.stop="toggleSelectedImagesForIdForVariant(element)"
                        :class="{ 'pvi-unselected': selectedImagesForVariant.length > 0 && isSelectionExistForVariant(element) == -1 }">
                        <v-btn aria-label="Resmi kaldır" class="hovered pvi-s8"
                          @click.stop="deleteImageForVariant(element)" elevation="0" min-width="0"
                          color="transparent"><v-icon size="large"
                            color="error">mdi-close-thick</v-icon></v-btn>
                        <v-btn class="hovered pvi-s9"
                          @click.stop="downloadImage(element)" elevation="0" min-width="0" color="transparent"><v-icon
                            size="large" color="primary">mdi-download</v-icon></v-btn>
                        <v-card outlined class="drag-handle hovered pvi-s10"
                          elevation="1" min-width="0" color="info">
                          <div class="d-flex justify-center text-center">
                            <div class="text-caption pvi-s11">
                              <v-icon size="25" color="content-muted">mdi-drag</v-icon>
                            </div>
                          </div>
                        </v-card>
                        <v-card-text class="pa-0">
                          <ProductVariantImageEditComponent v-model="sortedImageIds[index]"
                            :productInfoForm="productInfoForm" :height="206" class="pvi-s12">
                          </ProductVariantImageEditComponent>
                        </v-card-text>
                        <v-card-actions class="align-start justify-center pvi-s13">
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

        <ImageUploaderComponent :productInfoForm="productInfoForm" :choice="productImagesInfo.selectedChoice"
          @uploaded-event="assignImages" />



        <CardComponent tabindex="0" icon="mdi-image-multiple-outline" title="Ürün Resim Galerisi" :whiteBackground="true"
          class="productVariantImagesComponent pvi-s14">

          <div v-if="productInfoForm.images == undefined || productInfoForm.images.length == 0"
            class="d-flex align-center justify-start mt-0">
            <v-card density="compact" class="pvi-s15" :height="width + 80" :width="width + 120" elevation=0>
              <v-card-text class="d-flex align-center justify-center fill-height">
                <div>
                  <v-icon size="200" class="pvi-s16">mdi-image-outline</v-icon>
                  <div class="text-center text-caption pvi-s17">
                    Henüz resim eklenmemiş
                  </div>
                </div>
              </v-card-text>

            </v-card>
          </div>

          <Sortable :list='productInfoForm.images' @end="onEndSort" item-key="_id" tag="div"
            :options="{ disabled: true }" class="d-flex flex-wrap">
            <template #item="{ element, index }">
              <div class="draggable pa-0 hoveredContainer" :data-id="element._id">
                <v-card density="compact" class="d-flex flex-column pvi-s7" :height="width - 32" :width="width + 16" :elevation="0"
                  :class="{ 'pvi-unselected': selectedImages.length > 0 && isSelectionExist(element._id) == -1 }">
                  <div class="hovered pvi-s18">
                    <v-btn
                      @click.stop="assignImage(element)" elevation="0" min-width="0" class="pvi-s19"><v-icon size="70"
                        color="content-muted" class="pvi-s20">mdi-plus</v-icon></v-btn>
                  </div>

                  <v-card outlined
                    elevation="1" min-width="0" color="info" class="pvi-s10">
                    <div class="d-flex justify-center text-center">
                    </div>
                  </v-card>
                  <v-card-text class="pa-0">

                    <ProductImageComponent v-model="productInfoForm.images[index]"
                      :productId="productInfoForm._id ? productInfoForm._id : productInfoForm.tempId" :height="96" class="pvi-s13">
                    </ProductImageComponent>
                  </v-card-text>
                  <v-card-actions class="align-start justify-center pvi-s13">
                  </v-card-actions>
                </v-card>
              </div>
            </template>
          </Sortable>
        </CardComponent>


        <div class="ma-0 mt-8 pvi-s21">
          <v-checkbox hide-details density="compact" v-model="selectAllImagesForVariant"
            :indeterminate="selectedImagesForVariant.length != 0 && selectedImagesForVariant.length < productInfoForm.images.length">
            <template #label>
              <div class="text-caption1">
                {{ $t('common.selectAllImages') }}
              </div>
            </template>
          </v-checkbox>

          <v-btn-group v-if="selectedImagesForVariant.length > 0" elevation="0" class="ml-1  mt-1 mb-2"
            density="compact">
            <v-btn density="compact" block class="fill-height pvi-s22" color="primary"
              :disabled="selectedImagesForVariant.length <= 0" @click="deleteImageSelectedForVariant">
              <div v-if="selectedImagesForVariant.length > 0">
                Seçili <span class="font-weight-bold pvi-s23">{{ selectedImagesForVariant.length
                }}</span>
                Resmi
                Kaldır
              </div>
            </v-btn>
          </v-btn-group>
        </div>


      </v-col>
    </v-row>

  </CardComponent>
</template>

<script setup lang="ts">
import { formatNumber } from '@/composables/format'
import { Sortable } from "sortablejs-vue3";
import EkButton from '@/components/ds/EkButton.vue'

import { ref, computed, onMounted, onBeforeMount, nextTick, reactive, onActivated } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useChoicesStore } from '@/stores/choicesStore';

import ImageUploaderComponent from '@/components/productDefinitions/crud/ImageUploaderComponent.vue'
import ProductImageComponent from '@/components/productDefinitions/products/ProductImageComponent.vue'
import ProductVariantImageEditComponent from "./ProductVariantImageEditComponent.vue";
import CardComponent from "@/components/CardComponent.vue";


const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()

const isImages = defineModel({ default: false })
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')

const emits = defineEmits(['refreshImages', 'close'])
const props = defineProps<{
  productInfoForm: any,
  variant: any
}>()
const sortedImageIds: any = ref([])
const restApi = useRestApi()
const variantsList: any = ref()
const loadingComponentRef: any = ref(null)
const fileInputRef: any = ref(null)
const selectedImages: any = ref([])
const selectedImagesForVariant: any = ref([])
const productImagesInfo: any = ref(
  {
    isVariant: false,
    selectedChoice: { choiceId: -1, choiceValueId: -1 },
    selectedChoiceForFilter: { choiceId: -1, choiceValueId: -1 },
  }
)

const { t } = useI18n()

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

var id = -1
const width = 160
var dragging = ref(false)

const onEndSort = (event: any) => {
  const { newIndex, oldIndex, from, to, item } = event
  if (newIndex == oldIndex) return
  const sortedImageIds = Array.from(to.children).map((item: any) => item.dataset.id)
  console.log("AAAA", sortedImageIds, props.variant.images)
  props.variant.images = sortedImageIds
  //sortImages(newIndex, Number(item.dataset.id), sortedImageIds)
}

onActivated(() => {
  console.log("Activated")
  cloneVariantImages()
})

const cloneVariantImages = () => {
  sortedImageIds.value = JSON.parse(JSON.stringify(props.variant.images))
}

const sortImages = async (itemIndex: number, imageId: number, sortedImageIds: Array<number>) => {
  let guid = loadingComponentRef.value.info(t('loading.info.sortingImages'))
  const response = await restApi.postImage('sortImages', { sortedImageIds: sortedImageIds, order: props.productInfoForm.images[itemIndex].order, orderChangeId: imageId, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getImages()
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

const toggleSelectedImagesForIdForVariant = (imageId: number) => {
  const index = isSelectionExistForVariant(imageId)
  if (index == -1) {
    selectedImagesForVariant.value.push(imageId);
  } else {
    selectedImagesForVariant.value.splice(index, 1);
  }
}

const isSelectionExistForVariant = (imageId: number) => {
  return selectedImagesForVariant.value.indexOf(imageId)
}



const selectAllImagesForVariant = computed({
  get() {
    if (!props.variant.images || props.variant.images.length == 0) return false
    return selectedImagesForVariant.value.length === props.variant.images.length
  },
  set(newValue: boolean) {
    selectedImagesForVariant.value = []
    if (newValue) {
      for (let currentImage of props.variant.images) {
        selectedImagesForVariant.value.push(currentImage)
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
      return formatNumber(Math.round(image.file.size / conversion * 10) / 10) + suffix

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
  return formatNumber(Math.round(size / conversion * 10) / 10) + suffix
}

var files = ref([])
function addImage1() {
  console.log(files)
}

const deleteImageForVariant = async (imageId: number) => {
  const index = props.variant.images.indexOf(imageId)
  if (index >= 0) {
    props.variant.images.splice(index, 1)
    cloneVariantImages()
  }
}


const deleteImage = async (imageId: number) => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  const response = await restApi.postImage('deleteImage', { imageId, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)

  if (response && response.acknowledged == true && response.modifiedCount == 1) {
    getImages()
  }
}


const deleteImageSelectedForVariant = async () => {
  for (const imageId of selectedImagesForVariant.value) {
    deleteImageForVariant(imageId)
  }
  selectedImagesForVariant.value = []
}


const deleteImageSelected = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  await sleep(1)
  const response = await restApi.postImage('deleteImageSelected', { productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId, tempProductId: props.productInfoForm.tempId, selectedImages: selectedImages.value })
  loadingComponentRef.value.remove(guid)
  if (response && response.acknowledged == true) {
    getImages()
  }
}


const refreshImages = async () => {
  await nextTick(() => { })
  let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
  const resp = await restApi.postImage('getImages', {
    productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId
  })
  props.productInfoForm.images = resp.images
  loadingComponentRef.value.remove(guid)
}



const getImages = async () => {
  if (selectedImages.value) selectedImages.value.length = 0
  refreshImages()
  emits('refreshImages', '')
  /*   await nextTick(() => { })
  
    let selectedChoice = productImagesInfo.value.selectedChoiceForFilter
      if(selectedChoice.choiceId==-1 || selectedChoice.choiceValueId==-1) selectedChoice = undefined
  
    let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
    props.productInfoForm.images = await restApi.postImage('getImages', {
      productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId,
      selectedChoice: selectedChoice
    })
    selectedImages.value.length = 0
    await sleep(1)
    loadingComponentRef.value.remove(guid) */
}

const assignImage = (image: any) => {
  props.variant.images = [...new Set([...props.variant.images, image._id])];
  cloneVariantImages()
}

const assignImages = async (images: any) => {
  console.log("hebelel", images)
  await getImages()
  for (const image of images) {
    props.variant.images.push(image._id)
  }
  cloneVariantImages()
}

const addImage = async ($event: Event) => {
  const target = $event.target as HTMLInputElement;
  if (target && target.files) {
    if (target.files.length > 5) {
      target.value = ""
      return false
    }
    id++


    const formData = new FormData();
    const pid = productImagesInfo.value._id
    const tempId = productImagesInfo.value.tempId
    let selectedChoice = productImagesInfo.value.selectedChoice
    if (selectedChoice.choiceId == -1 || selectedChoice.choiceValueId == -1) selectedChoice = undefined

    formData.append('product', JSON.stringify({
      _id: props.productInfoForm._id,
      tempId: props.productInfoForm.tempId,
      selectedChoice: selectedChoice
    }));
    for (let i = 0; i < target.files.length; i++) {
      formData.append('files', target.files[i]);
    }


    let guid = loadingComponentRef.value.info(t('loading.info.imageUploading'))
    await restApi.postImageUpload(formData)
    loadingComponentRef.value.remove(guid)
    await getImages()


    target.value = ""
    /*     for (let currentImage of currentImages.value) {
          currentImage.imageSrc = await constructImageUrl(currentImage)
        }
     */
    /*     images.value.push({ file: target.files[0], id })
     */    //reader.readAsDataURL(target.files[0])
  }
}


const reader = new FileReader();
reader.onload = (event) => {
  const image = new Image();
  if (event.target)
    (<any>image.src) = event.target.result;
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const thumbnailWidth = width + 400;
    const thumbnailHeight = (thumbnailWidth / image.width) * image.height;
    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;
    if (ctx)
      ctx.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);
    thumbnails.value.push({ url: canvas.toDataURL('image/png'), id, width: canvas.width, height: canvas.height })
  };
};




const file = ref<File | null>();
const form = ref<HTMLFormElement>();
var thumbnailUrl = ref("")

const config = {
  maxSize: 2000000,
}
/* function onFileChanged($event: Event) {
  const target = $event.target as HTMLInputElement;
  if (target && target.files) {
    file.value = target.files[0];
    generateThumbnail(file.value)
  }
}
 */
async function saveImage() {
  if (file.value) {
    try {
      // save file.value
    } catch (error) {
      console.error(error);
      form.value?.reset();
      file.value = null;
    } finally {
    }
  }
};

function generateThumbnail1(file: any) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = new Image();
    if (event.target)
      (<any>image.src) = event.target.result;

    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set the canvas size to the thumbnail size you desire
      const thumbnailWidth = 100;
      const thumbnailHeight = (thumbnailWidth / image.width) * image.height;

      canvas.width = thumbnailWidth;
      canvas.height = thumbnailHeight;

      // Draw the image on the canvas
      if (ctx)
        ctx.drawImage(image, 0, 0, thumbnailWidth, thumbnailHeight);

      // Convert the canvas content to a data URL
      thumbnailUrl.value = canvas.toDataURL('image/jpeg');
    };
  };

  // Read the file as a data URL
  reader.readAsDataURL(file);
}

const imageSrc = computed(() => {
  if (file.value)
    console.log(file.value.size)
  if (!file.value) return "ffff"
  console.log(file)
  var a = URL.createObjectURL(file.value)
  console.log(a)
  return a

})

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

.custom-expansion-panel .v-expansion-panel-text__wrapper {
  padding: 0 !important
}
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pvi-s1 {
  overflow-y: scroll !important;
  border: 1px solid var(--ek-color-border-default) !important;
  height: calc(100vh - 110px) !important;
}

.pvi-s2 {
  border: 1px solid var(--ek-color-border-strong) !important;
  width: 30px !important;
  opacity: .9 !important;
}

.pvi-s3 {
  overflow-y: scroll !important;
  height: calc(100vh - 190px) !important;
}

.pvi-s4 {
  background-color: white !important;
  border: 1px solid var(--ek-color-border-default) !important;
}

.pvi-s5 {
  opacity: .2 !important;
}

.pvi-s6 {
  opacity: .4 !important;
  font-style: italic !important;
}

.pvi-s7 {
  background-color: var(--ek-color-surface) !important;
}

.pvi-s8 {
  position: absolute !important;
  top: 0px !important;
  right: 0px !important;
  height: 30px !important;
  width: 30px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-left-radius: 20px !important;
  z-index: 1 !important;
}

.pvi-s9 {
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

.pvi-s10 {
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

.pvi-s11 {
  position: absolute !important;
  bottom: 2px !important;
  opacity: .7 !important;
}

.pvi-s12 {
  max-height: 140px !important;
}

.pvi-s13 {
  max-height: 30px !important;
}

.pvi-s14 {
  overflow-y: scroll !important;
  border: 1px solid var(--ek-color-border-default) !important;
  height: calc(100vh - 510px) !important;
}

.pvi-s15 {
  background-color: var(--ek-color-surface-sunken) !important;
  border: 1px solid var(--ek-color-border-default) !important;
}

.pvi-s16 {
  opacity: .05 !important;
}

.pvi-s17 {
  opacity: .6 !important;
}

.pvi-s18 {
  position: absolute !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: start !important;
  padding-bottom: 5px !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
}

.pvi-s19 {
  background-color: color-mix(in srgb, var(--ek-color-surface) 60%, transparent) !important;
  height: 100% !important;
  width: 100% !important;
  border-radius: 5px !important;
  border: 1px solid var(--ek-color-border-strong) !important;
}

.pvi-s20 {
  opacity: .8 !important;
}

.pvi-s21 {
  height: 100px !important;
}

.pvi-s22 {
  border: 1px solid var(--ek-color-border-strong) !important;
}

.pvi-s23 {
  font-size: 1.2em !important;
}

/* Secim varken secilmemis resimler soluk (onceki dinamik satir ici opacity). */
.pvi-unselected {
  opacity: .5 !important;
}
</style>
