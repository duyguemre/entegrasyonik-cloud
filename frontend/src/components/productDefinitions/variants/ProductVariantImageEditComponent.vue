<template>
  <div class="d-flex pa-0" style="border-top:0px solid #ccc;border-right:0px solid #ccc;background-color:#fff;width:100%">
    <div v-if="computedImage.src == undefined" style="width:100%">
      <v-icon :size="height" style="opacity:.1">mdi-image-outline</v-icon>
    </div>
    <v-img v-else     ref="imageRef"  @load="onImageLoad"   :height="height" :width="computedImage.width" :src="computedImage.src"/>
  </div>
</template>
<script setup lang="ts">
import { ref, inject, nextTick, watch, computed, onBeforeMount, onMounted } from 'vue'
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')
var imageId: any = defineModel({ default: {} }) 
 const image:any = ref() 
const props = withDefaults(defineProps<{
  height?: number,
  productInfoForm:any
}>(), {
  height: 114
});

const imageRef:any = ref(null);
const aspect:any = ref();

onMounted(() => {
})

const onImageLoad = () => {
  const imgElement = imageRef.value.$el.querySelector('img');
  aspect.value = imgElement.naturalWidth/imgElement.naturalHeight
}

const findAndSetImage = () => {
  for (const currentImage of props.productInfoForm?.images) {

    if (currentImage._id ==imageId.value || currentImage.url==imageId.value) {
      image.value = currentImage
    }
  }
}


const computedImage = computed(() => {
  findAndSetImage()
  if (!image.value || !image.value._id) {
    return { width: 0, src: undefined }
  }
  var src = image.value.url
  var width = 0 
  if (src == undefined) {
    src = (image.value.isTempImage == false ? baseImageURL.value : baseTempImageURL.value) + props.productInfoForm.tempId + '/' + image.value._id + '_t.' + image.value.extension
  } else {
    width = image.value.width * 100 / image.value.height
  }
  if(aspect.value) {
    width = aspect.value*props.height
  }
  return {
    width: width,
    src: src
  }
})
</script>
<style scoped></style>