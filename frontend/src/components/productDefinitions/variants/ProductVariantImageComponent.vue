<template>
  <div class="d-flex pa-0 pvim-s1">
    <div v-if="computedImage.src == undefined" class="pvim-s2">
      <v-icon :size="height" class="pvim-s3">mdi-image-outline</v-icon>
    </div>
    <v-img v-else ref="imageRef" @load="onImageLoad" :height="height" :width="computedImage.width"
      :src="computedImage.src" />
  </div>
</template>
<script setup lang="ts">
import { ref, inject, nextTick, watch, computed, onBeforeMount, onMounted } from 'vue'
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')

const props = withDefaults(defineProps<{
  height?: number,
  imageId: any,
  productInfoForm: any
}>(), {
  height: 114
});

const imageRef: any = ref(null);
const aspect: any = ref();

onMounted(() => {
})

const onImageLoad = () => {
  const imgElement = imageRef.value.$el.querySelector('img');
  aspect.value = imgElement.naturalWidth / imgElement.naturalHeight
}

const computedImage = computed(() => {
  if (!props.productInfoForm.images) {
    return { width: 0, src: undefined }
  }

  if (props.imageId && props.imageId.startsWith('http')) {
    return { width: 0, src: props.imageId }
  }

  const image = props.productInfoForm.images.find((image: any) => image._id == props.imageId)

  if (!image || !image._id) {
    return { width: 0, src: undefined }
  }
  var src = image.url
  var width = 0
  if (src == undefined) {
    src = (image.isTempImage == false ? baseImageURL.value : baseTempImageURL.value) + props.productInfoForm.tempId + '/' + image._id + '_t.' + image.extension
  } else {
    width = image.width * 100 / image.height
  }
  if (aspect.value) {
    width = aspect.value * props.height
  }
  return {
    width: width,
    src: src
  }
})
</script>
<style scoped></style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.pvim-s1 {
  border-top: 0px solid var(--ek-color-border-default) !important;
  border-right: 0px solid var(--ek-color-border-default) !important;
  background-color: var(--ek-color-surface) !important;
  width: 100% !important;
}

.pvim-s2 {
  width: 100% !important;
}

.pvim-s3 {
  opacity: .1 !important;
}
</style>
