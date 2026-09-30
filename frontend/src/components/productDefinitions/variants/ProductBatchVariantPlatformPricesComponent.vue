<template>
  <EkDialogCard title="Toplu Varyant Fiyatları" icon="mdi-currency-try"
    description="Girilen fiyatlar ürünün tüm varyantlarına uygulanır." width="custom" class="pbvp-card"
    @close="emits('close')">
    <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
    <v-checkbox :label="$t('productDefinitions.product.platformPrice')" hide-details class="pbvp-check"
      v-model="batchVariant.prices.isPlatformBasedPrice" @click.stop />

    <EkFormGrid v-if="!batchVariant.prices.isPlatformBasedPrice" :columns="2" class="pbvp-grid">
      <VCurrencyComponentVue @click.stop v-model="batchVariant.prices.salePrice" :compact="true" label="Satış Fiyatı"
        clearable :required="false" :isIconExist="false" :hint="$t('productDefinitions.product.define.amountDesc')"
        persistent-hint />
      <VCurrencyComponentVue @click.stop v-model="batchVariant.prices.marketPrice" :compact="true"
        label="Piyasa Fiyatı" clearable :required="false" :isIconExist="false"
        :hint="$t('productDefinitions.product.define.amountDesc')" persistent-hint />
    </EkFormGrid>
    <PlatformPriceComponent v-else :platformPriceForm="batchVariant" :categoryId="productInfoForm.category" />

    <template #actions>
      <EkButton tone="secondary" @click="emits('close')">Vazgeç</EkButton>
      <EkButton tone="primary" icon="mdi-content-save-outline" @click="batchVariantPricesUpdate">
        Bütün Varyantların Fiyatlarını Güncelle
      </EkButton>
    </template>
  </EkDialogCard>
</template>

<script setup lang="ts">
import { formatNumber } from '@/composables/format'

import { ref, computed, onMounted, onBeforeMount, nextTick, reactive } from 'vue'
import EkDialogCard from '@/components/ds/EkDialogCard.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import EkButton from '@/components/ds/EkButton.vue'
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

<style scoped>
.pbvp-check {
  margin-bottom: var(--ek-space-3);
}

.pbvp-grid {
  padding-top: var(--ek-space-2);
}
</style>
