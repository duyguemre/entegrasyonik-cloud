<!--
  frontend/src/components/LoadingComponent.vue

  Eski yükleme/sonuç API'si (55 kullanım): `info(text)` → iş örtüsü açılır, `remove(id)` kapatır; `success/warning/
  error(text)` → sonuç. Aşama 6b (Standart 1 + 8): görünüm tek desenlere taşındı —
    • info / ilerleme → `EkLoadingOverlay` (marka yükleme işareti, YALNIZ bağlandığı içeriği örter: `attach` verilmezse
      çalışma alanı sekmesinin kabı; uygulama geneli olan tek örnek üst çubuktaki `.AppView` bağlamasıdır);
    • success / warning / error → tek toast kaynağı (`useToast`) — engelleyici sonuç kutusu YOK.
  Dışa açık API (info, success, error, warning, remove, showProgress, closeProgress) AYNI.
-->
<template>
  <EkLoadingOverlay :model-value="active" :label="label" :progress="showProgressBar ? progressPower : undefined" :attach="attach" />
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import EkLoadingOverlay from '@/components/ds/EkLoadingOverlay.vue'
import { useToast, type ToastTone } from '@/composables/useToast'

const props = defineProps<{ attach?: string }>()
const { showToast } = useToast()

interface Message { id: string; text: string; type: 'info' | 'progress' }
const messages = ref<Message[]>([])
const progressPower = ref(0)
const showProgressBar = ref(false)
let timeoutId: ReturnType<typeof setTimeout> | undefined
let time = 30

const active = computed(() => messages.value.length > 0 || showProgressBar.value)
const label = computed(() => messages.value.find((m) => m.type === 'info')?.text || (showProgressBar.value ? 'İşleniyor…' : 'Yükleniyor…'))

const generateGUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

const closeProgress = async () => {
  clearTimeout(timeoutId)
  progressPower.value = 100
  setTimeout(() => {
    showProgressBar.value = false
    progressPower.value = 0
    messages.value = messages.value.filter((m) => m.type !== 'progress')
  }, 800)
}

// Sunucu ilerleme bildirmiyor: tahmini ilerleme (yavaşlayan adımlar, %95'te bekler) — eski davranış aynen.
const showProgress = () => {
  showProgressBar.value = true
  timeoutId = setTimeout(() => {
    progressPower.value += (Math.floor(Math.random() * 100) % 8) + 1
    if (progressPower.value < 20) time = 500
    else if (progressPower.value < 40) time = 600
    else if (progressPower.value < 80) time = 800
    else if (progressPower.value > 95) {
      progressPower.value = 95
      time = 500
    }
    if (showProgressBar.value) showProgress()
  }, time)
}

const info = (text: string) => {
  const message: Message = { id: generateGUID(), text, type: 'info' }
  messages.value.push(message)
  return message.id
}

const notify = (tone: ToastTone, text: string) => {
  showToast({ tone, message: text })
  return generateGUID()
}
const success = (text: string) => notify('success', text)
const error = (text: string) => notify('error', text)
const warning = (text: string) => notify('warning', text)

const remove = (guid: string) => {
  messages.value = messages.value.filter((item) => item.id !== guid)
}

defineExpose({ info, success, error, warning, remove, showProgress, closeProgress, attach: props.attach })
</script>
