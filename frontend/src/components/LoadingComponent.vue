<template>
  <div v-if="messages.length > 0">
    <v-overlay persistent v-model="isOverlayActive" location-strategy="connected" target="cursor"
      class="align-center justify-center fill-height" :attach="attach" :contained="true" location="left">


      <div class="align-center justify-center d-flex loading-stage">
        <v-progress-linear class="elevation-3 mb-16 loading-progress" opacity="1"
          bg-opacity="1" bg-color="surface"
          v-model="progressPower" v-if="showProgressBar" color="neutral" height="35">
          <template v-slot:default>
            <span class="font-weight-bold">%{{ progressPower }}</span>
          </template>
        </v-progress-linear>


        <v-progress-circular v-else width="8" size="100"
          v-if="messages.filter((item: any) => item.type == 'info').length > 0" color="action-contrast"
          indeterminate></v-progress-circular>
      </div>
      <v-alert color="neutral" border="top" class="loading-alert" density="default" elevation="22"
        v-if="messages.filter((item: any) => item.type == 'info').length > 10000" rounded prominent
        title="Lütfen Bekleyiniz" type="info">

        <!--          icon="mdi-clock-time-eight-outline" -->

        <template #prepend>
        </template>

        <template #title>
          <div class="d-flex justify-center align-center text-center loading-alert__title">

            <v-progress-circular color="action-contrast" indeterminate></v-progress-circular>
          </div>
        </template>
        <div class="mt-2">
          <p v-for="message of messages.filter((item: any) => item.type == 'info')">{{ message.text }}</p>
        </div>
      </v-alert>
      <v-alert border="top" class="loading-alert" density="default" elevation="22"
        v-if="messages.filter((item: any) => item.type == 'success').length > 0" icon="mdi-check" title="İşlem Başarılı"
        type="success">
        <template #title>
          <div>
            <p v-for="message of messages.filter((item: any) => item.type == 'success')">{{ message.text }}</p>
          </div>
        </template>
      </v-alert>
      <v-alert border="top" class="loading-alert" density="default" elevation="22"
        v-if="messages.filter((item: any) => item.type == 'warning').length > 0" icon="mdi-exclamation" title="Uyarı"
        type="warning">
        <div class="mt-2">
          <p v-for="message of messages.filter((item: any) => item.type == 'warning')">{{ message.text }}</p>
        </div>
      </v-alert>
      <v-alert border="top" class="loading-alert" density="default" elevation="22"
        v-if="messages.filter((item: any) => item.type == 'error').length > 0" icon="mdi-close" title="İşlem Başarısız"
        type="error">
        <div class="mt-2">
          <p v-for="message of messages.filter((item: any) => item.type == 'error')">{{ message.text }}</p>
        </div>
      </v-alert>
    </v-overlay>
  </div>
</template>

<script lang="ts" setup>
import { nextTick } from 'process';
import { watch, ref, onActivated } from 'vue'
const props = defineProps<{
  attach?: string,
}>()


const isOverlayActive = ref(true)

const messages: any = ref([])

const progressPower: any = ref(0)
const showProgressBar = ref(false)
var timeoutId: any = undefined
var time = 30
const closeProgress = async () => {
  clearTimeout(timeoutId)
  progressPower.value = 100
  setTimeout(() => {
    showProgressBar.value = false
    progressPower.value = 0
    messages.value.length = 0
  }, 800)
}
const showProgress = () => {
  messages.value.push({})
  showProgressBar.value = true
  timeoutId = setTimeout(() => {
    progressPower.value += ((Math.floor(Math.random() * 100)) % 8) + 1;
    if (progressPower.value < 20) time = 500;
    else if (progressPower.value < 40) time = 600;
    else if (progressPower.value < 80) time = 800;
    else if (progressPower.value > 95) {
      progressPower.value = 95;
      time = 500;
    }
    if (showProgressBar.value == true) showProgress()
  }, time);
}



const generateGUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const info = (text: string) => {
  let message = { id: generateGUID(), text, type: "info" }
  messages.value.push(message)
  return message.id
}

const success = (text: string) => {
  let message = { id: generateGUID(), text, type: "success" }
  messages.value.push(message)
  return message.id
}

const error = (text: string) => {
  let message = { id: generateGUID(), text, type: "error" }
  messages.value.push(message)
  return message.id
}

const warning = (text: string) => {
  let message = { id: generateGUID(), text, type: "warning" }
  messages.value.push(message)
  return message.id
}


const remove = (guid: string) => {
  messages.value = messages.value.filter((item: any) => item.id !== guid);
}

defineExpose({
  info,
  success,
  error,
  warning,
  remove,
  showProgress,
  closeProgress
});

</script>

<style scoped>
.loading-stage {
  height: 100%;
}

.loading-progress {
  border-radius: var(--ek-radius-sm);
  border: 1px solid var(--ek-color-border-strong);
  opacity: 1;
  width: 300px;
}

.loading-alert {
  border: 1px solid var(--ek-color-border-strong);
}

.loading-alert__title {
  width: 100%;
}
</style>