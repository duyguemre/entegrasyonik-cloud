<template>
  <LoadingComponent attach=".productDefinitionView" ref="loadingComponentRef"></LoadingComponent>
  <div :style="{ width: width ? width+'px' : '100%' + '!important' }" class="elevation-0 mb-2 uploadBox" style="border-radius:5px;border:1px solid #bbb;">
    <div :class="[dragging ? 'dragDropOn' : 'dragDropOff']">
      <v-card @dragleave="dragging = false" @dragenter="dragging = true" @dragend="dragging = false" elevation=0
        @drop="dragging = false" class="ma-0 dragCard" color="transparent" style="border-radius:10px;border-bottom-left-radius: 0;border-bottom-right-radius: 0;">
        <v-btn style="opacity:.6;background-color:#fff;border-radius: 0;" :style="{ height: height ? height+'px' : '100%' + '!important' }"
          class="pt-15 pb-15" block elevation=2>
          <div style="opacity:1;position:absolute">
            <v-icon size="60" color="processButtonColor">mdi-plus</v-icon>
            <template v-if="!width || width > 200">
              Resimleri bu alana sürükleyebilirsiniz
            </template>
          </div>
          <input ref="fileInputRef" class="fileInput" type="file" multiple @change="upload">
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
const { t } = useI18n()

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

const upload = async ($event: Event) => {
  const target = $event.target as HTMLInputElement;
  if (target && target.files) {
    if (target.files.length > maxImageCount.value) {
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
  background-color: #fafafa !important;
  box-shadow: 0px 0px 20px #bcc1c488 !important;
}

.uploadBox {
  background-color: #f6f7f8 !important;
}






.dropZone {
  position: relative;
  border: 0px dashed black;
}

.dropZone:hover {
  background-color: red;
}

.dropZone:hover .dropZone-title {
  color: #1975A0;
}

.dropZone-info {
  color: #A8A8A8;
  position: absolute;
  text-align: center;
}

.dropZone-title {
  color: #787878;
}

.fileInput {
  position: absolute;
  cursor: pointer;
  opacity: 0;
  height: 100%;
  width: 100%;
}

.dragDropOn .dragDropOnZone {
  background-color: #1975A0;
}

.dragDropOff .dragDropOnZone {}

.dragDropOn {
  background-color: #1975A0;
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
  border: 0px dashed #ccc;

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
  background: #ddd;
  opacity: 0.8;
}

.dropZone-uploaded {
  width: 80%;
  height: 200px;
  position: relative;
  border: 0px dashed #eee;
}

.dropZone-uploaded-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #A8A8A8;
  position: absolute;
  top: 50%;
  width: 100%;
  transform: translate(0, -50%);
  text-align: center;
}
</style>