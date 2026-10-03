<template>
  <div class="d-flex pa-0 pic-s1">
    <div v-if="computedImage.src == undefined" class="pic-s2">
      <v-icon :size="height" class="pic-s3">mdi-image-outline</v-icon>
    </div>
    <v-img v-else ref="imageRef" @load="onImageLoad" :height="height" :width="computedImage.width"
      :src="computedImage.src" />
  </div>
</template>
<script setup lang="ts">
import { ref, inject, nextTick, watch, computed, onBeforeMount, onMounted } from 'vue'
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')
var image: any = defineModel({ default: {} })

const props = withDefaults(defineProps<{
  height?: number,
  productId: string
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
  if (!image.value || !image.value._id) {
    return { width: 0, src: undefined }
  }
  var src = image.value.url
  var width = 0
  if (src == undefined) {
    src = (image.value.isTempImage == false ? baseImageURL.value : baseTempImageURL.value) + props.productId + '/' + image.value._id + '_t.' + image.value.extension
  } else {
    width = image.value.width * 100 / image.value.height
  }
  if (aspect.value) {
    width = aspect.value * props.height
  }
  src = image.value.url
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
.pic-s1 {
  border-top: 0px solid var(--ek-color-border-default) !important;
  border-right: 0px solid var(--ek-color-border-default) !important;
  background-color: var(--ek-color-surface) !important;
  width: 100% !important;
}

.pic-s2 {
  width: 100% !important;
}

.pic-s3 {
  opacity: .1 !important;
}
</style>
