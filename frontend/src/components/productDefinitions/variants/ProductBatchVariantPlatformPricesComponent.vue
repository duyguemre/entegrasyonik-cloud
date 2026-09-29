<template>
  <v-row>
    <v-col cols="6" offset="3">
      <v-card variant="elevated" elevation="1" class="ma-0 pbvp-s1">
        <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>

        <v-card-title class="mb-0" >

          <div
            class="elevation-1 pbvp-s2">
          </div>

          <v-btn aria-label="Kapat"
            @click="emits('close')" elevation="1" min-width="0" color="red" class="pbvp-s3"><v-icon
              size="x-large">mdi-close</v-icon></v-btn>

          <v-btn aria-label="Kapat"
            @click="emits('close')" elevation="1" min-width="0" color="red" class="pbvp-s4"><v-icon
              size="x-large">mdi-close</v-icon></v-btn>

            
            
            <span class="font-weight-medium  text-h6 ml-8">
            <v-icon class="mr-0 pbvp-s5" size="20">mdi-image-multiple-outline</v-icon>
            Toplu Varyant Fiyatları</span>

        </v-card-title>

        <v-card-text class="mt-0 pbvp-s6">
          <div class="pb-4 pbvp-s7">
            <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                      density="compact" hide-details class="ma-0 mb-2 mt-4 pa-0 pbvp-s8"
                      v-model="batchVariant.prices.isPlatformBasedPrice" @click.stop />

                      <v-divider/>

            <div class="d-flex" v-if="!batchVariant.prices.isPlatformBasedPrice">
            <VCurrencyComponentVue
                          prepend-icon="mdi-currency-try" @click.stop
                          v-model="batchVariant.prices.salePrice" :compact="false"
                          label="Satış Fiyatı" clearable :required="false"
                          :hint="$t('productDefinitions.product.define.amountDesc')" class="mb-2 mt-3"
                          :hide-details="false" counter>
          </VCurrencyComponentVue>
          <VCurrencyComponentVue
                          prepend-icon="mdi-currency-try" @click.stop
                          v-model="batchVariant.prices.marketPrice" :compact="false"
                          label="Piyasa Fiyatı" clearable :required="false"
                          :hint="$t('productDefinitions.product.define.amountDesc')" class="mb-2 mt-3"
                          :hide-details="false" counter>
          </VCurrencyComponentVue>
        </div>


            <PlatformPriceComponent v-else :platformPriceForm="batchVariant" 
              :categoryId="productInfoForm.category" />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn-group elevation="1" class="mt-0 pbvp-s9" density="compact" >
                        <v-btn density="compact" block class="fill-height pbvp-s10" color="saveButtonColor"                          
                          @click="batchVariantPricesUpdate">
                          <span class="">
                            <v-icon>mdi-plus-box-multiple-outline</v-icon> Bütün Varyantların Fiyatlarını Güncelle
                          </span></v-btn>
                      </v-btn-group>


        </v-card-actions>
      </v-card>
      </v-col>
      </v-row>
</template>

<script setup lang="ts">

import { ref, computed, onMounted, onBeforeMount, nextTick, reactive } from 'vue'
import { useI18n } from 'vue-i18n';
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useChoicesStore } from '@/stores/choicesStore';
import PlatformPriceComponent from '../crud/PlatformPriceComponent.vue';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';

import { useIntegrationStore } from '@/stores/integrationStore';
const integrationStore = useIntegrationStore()

const choicesStore = useChoicesStore()
var choicesStoreChoices: any = ref()

const editingVariantMenu = defineModel({ default: false })
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')

const emits = defineEmits(['refreshImages', 'close','batchVariantPricesUpdate'])
const props = defineProps<{
  productInfoForm: any,
  batchVariant:any
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

const { t } = useI18n()

const computedPlatformList = computed(() => {
  return integrationStore.getClientMarketplaces().filter((item: any) => item.type.code == 'marketplace')
})

const batchVariantPricesUpdate = ()=> {
  emits('batchVariantPricesUpdate')
}

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
  sortImages(newIndex, Number(item.dataset.id), sortedImageIds)
}


const sortImages = async (itemIndex: number, imageId: number, sortedImageIds: Array<number>) => {
  let guid = loadingComponentRef.value.info(t('loading.info.sortingImages'))
  const response = await restApi.postImage('sortImages', { sortedImageIds: sortedImageIds, order: props.productInfoForm.images[itemIndex].order, orderChangeId: imageId, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount>0) {
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
function addImage1() {
  console.log(files)
}

const deleteImage = async (imageId: number) => {
  let guid = loadingComponentRef.value.info(t('loading.info.getVariantsList'))
  const response = await restApi.postImage('deleteImage', { imageId, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)

  if (response && response.acknowledged == true && response.modifiedCount == 1) {
    getImages()
  }
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



const getImages = async () => {
  if (selectedImages.value) selectedImages.value.length = 0
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

const assignImages = async () => {
  await nextTick(() => { })
  let selectedChoice = productImagesInfo.value.selectedChoice
  if (selectedChoice.choiceId == -1 || selectedChoice.choiceValueId == -1) selectedChoice = undefined

  let guid = loadingComponentRef.value.info(t('loading.info.getImages'))
  await restApi.post('ImageService/assignImages', {
    productId: props.productInfoForm._id,
    selectedChoice: selectedChoice,
    selectedImages: selectedImages.value
  })
  await sleep(1)
  loadingComponentRef.value.remove(guid)
  getImages()
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
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pbvp-s1 {
  transition: none !important;
  box-shadow: none !important;
  transform: none !important;
  background-color: var(--ek-color-surface-sunken) !important;
}

.pbvp-s2 {
  position: absolute !important;
  top: 0px !important;
  left: 0px !important;
  right: 0 !important;
  height: 1px !important;
  width: auto !important;
  opacity: .9 !important;
  background-color: red !important;
}

.pbvp-s3 {
  position: absolute !important;
  border: 1px solid var(--ek-color-surface) !important;
  border-top: none !important;
  border-right: none !important;
  top: 0px !important;
  right: 0px !important;
  height: 40px !important;
  width: 40px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-left-radius: 20px !important;
}

.pbvp-s4 {
  position: absolute !important;
  border: 1px solid var(--ek-color-surface) !important;
  border-top: none !important;
  border-left: none !important;
  top: 0px !important;
  left: 0px !important;
  height: 40px !important;
  width: 40px !important;
  opacity: .9 !important;
  border-radius: 0 !important;
  border-bottom-right-radius: 20px !important;
}

.pbvp-s5 {
  opacity: .7 !important;
}

.pbvp-s6 {
  background-color: var(--ek-color-surface-sunken) !important;
}

.pbvp-s7 {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  min-height: 100px !important;
  height: auto !important;
  max-height: calc(100vh - 280px) !important;
}

.pbvp-s8 {
  min-width: 180px !important;
}

.pbvp-s9 {
  width: 100% !important;
}

.pbvp-s10 {
  border: 1px solid white !important;
}
</style>
