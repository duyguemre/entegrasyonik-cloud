<template>
  <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
  <div :style="{ width: width ? width+'px' : '100%' + '!important' }" class="elevation-0 mb-2 uploadBox iuc-s1">
    <div :class="[dragging ? 'dragDropOn' : 'dragDropOff']">
      <v-card @dragleave="dragging = false" @dragenter="dragging = true" @dragend="dragging = false" elevation=0
        @drop="dragging = false" class="ma-0 dragCard iuc-s2" color="transparent">
        <v-btn :style="{ height: height ? height+'px' : '100%' + '!important' }"
          class="pt-15 pb-15 iuc-s3" block elevation=2 aria-label="Resim yükle" @click="openFilePicker">
          <div class="iuc-s4">
            <v-icon size="60" color="content-muted">mdi-plus</v-icon>
            <template v-if="!width || width > 200">
              Resimleri bu alana sürükleyebilirsiniz
            </template>
          </div>
          <input ref="fileInputRef" class="fileInput" type="file" multiple tabindex="-1" aria-hidden="true" @change="upload">
        </v-btn>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeMount, nextTick, reactive } from 'vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useI18n } from 'vue-i18n';
import { useUploadLimit } from '@/composables/useUploadLimit'
const { t } = useI18n()
// FE-CFG-1: yükleme tavanı backend ortam değeri (`env.images.uploadMaxBytes`).
const uploadLimit = useUploadLimit()

const props = defineProps<{
  productInfoForm: any,
  choice?: any,
  variantId?: any,
  width?: number,
  height?: number
}>()

const restApi = useRestApi()
const loadingComponentRef: any = ref(null)
const fileInputRef: any = ref(null)
const dragging = ref(false)
const maxImageCount = ref(20)
const emits = defineEmits(['uploadedEvent'])

onMounted(() => {
  fileInputRef.value = ""
})

// Klavye erisimi: dosya girisi sekme sirasinin disinda (buton icinde ic ice etkilesimli oge olmasin).
// Fare tiklamasi zaten gorunmez girisin kendisine duser; buton klavyeyle tetiklenince girisi acar.
// (fileInputRef onMounted'da "" ile eziliyor — bu yuzden ref yerine olay hedefinden bulunur.)
const openFilePicker = (event: MouseEvent) => {
  const input = (event.currentTarget as HTMLElement | null)?.querySelector('input[type="file"]') as HTMLInputElement | null
  if (input && event.target !== input) input.click()
}

const upload = async ($event: Event) => {
  const target = $event.target as HTMLInputElement;
  if (target && target.files) {
    if (target.files.length > maxImageCount.value || !uploadLimit.accept(target.files)) {
      target.value = ""
      return false
    }
    const formData = new FormData();
    const uploadImageForm: any = {
      productId: props.productInfoForm._id,
      tempProductId: props.productInfoForm.tempId
    }
    console.log(props.choice)
    if (props.variantId != undefined)
      uploadImageForm.variantId = props.variantId
    else if (props.choice && props.choice.choiceId != -1 && props.choice.choiceValueId != -1)
      uploadImageForm.choice = props.choice
    formData.append('uploadImageForm', JSON.stringify(uploadImageForm));
    for (let i = 0; i < target.files.length; i++) {
      formData.append('files', target.files[i]); 
    }
    let guid = loadingComponentRef.value.info(t('loading.info.imageUploading'))
    const resp: any = await restApi.postImageUpload(formData)
    loadingComponentRef.value.remove(guid)
    emits("uploadedEvent", resp.result)
    target.value = ""
  }
}
</script>

<style>

.uploadBox:hover {
  background-color: var(--ek-color-surface-muted) !important;
  box-shadow: 0px 0px 20px var(--ek-color-border-default) !important;
}

.uploadBox {
  background-color: var(--ek-color-surface-muted) !important;
}






.dropZone {
  position: relative;
  border: 0px dashed black;
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
</style>

<style>
/* ADR-0015 B5-2 — satir ici stillerden tasinan siniflar (autostyle). Satir ici stilin onceligi
   !important ile korunur; ayni ozellikte Vuetify yardimci sinifi/`color` prop cakismasi varsa
   (satir ici stil zaten yeniliyordu) !important eklenmez. Scope'suz: v-dialog/v-menu ve alt
   bilesen kokleri scoped ozniteligi almayabilir; onek dosyaya ozgudur. */
.iuc-s1 {
  border-radius: 5px !important;
  border: 1px solid var(--ek-color-border-strong) !important;
}

.iuc-s2 {
  border-radius: 10px !important;
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}

.iuc-s3 {
  /* Onceden opacity .6 ile soluk gosteriliyordu (metin kontrasti AA alti) — soluk gorunum artik
     metin rengiyle (content-muted, 4.76:1) saglanir. */
  opacity: 1 !important;
  background-color: var(--ek-color-surface) !important;
  border-radius: 0 !important;
}

.iuc-s4 {
  opacity: 1 !important;
  position: absolute !important;
  color: var(--ek-color-content-muted);
}
</style>
