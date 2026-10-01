<!--
  frontend/src/components/barcode/BarcodeScanButton.vue

  MOB-03 — liste arama kutusunun yanında "Barkod okut" düğmesi + tarama diyaloğu. YALNIZ telefon/tablette
  görünür (useDeviceInput); masaüstünde arama kutusu aynı işi yapar. Okunan ya da elle yazılan kod `code`
  olarak yayılır; çağıran ekran onu mevcut aramasına bağlar (ürün: barkod/stok kodu/ad araması; sipariş:
  sipariş no / kargo takip no). Hiçbir kayıt yazılmaz.
  Kamera izni reddedilir/kamera yoksa dürüst durum + elle giriş; elle giriş her durumda açıktır.
-->
<template>
  <template v-if="showDeviceInput">
    <EkButton class="ek-barcode-btn" tone="secondary" icon="mdi-barcode-scan" icon-only :aria-label="buttonLabel" @click="open = true" />
    <EkDialog v-model="open" :title="title" :description="description" icon="mdi-barcode-scan" width="sm" as-form
      confirm-label="Ara" confirm-icon="mdi-magnify" :confirm-disabled="!manualCode" @confirm="submitManual">
      <div class="ek-barcode">
        <div class="ek-barcode__view" :class="`is-${state}`">
          <video ref="videoRef" class="ek-barcode__video" muted playsinline aria-hidden="true" />
          <span v-if="state === 'scanning'" class="ek-barcode__frame" aria-hidden="true" />
          <span v-if="state === 'starting'" class="ek-barcode__msg"><v-icon icon="mdi-camera-outline" aria-hidden="true" />Kamera açılıyor…</span>
          <span v-else-if="state === 'problem'" class="ek-barcode__msg"><v-icon icon="mdi-camera-off-outline" aria-hidden="true" />Kamera kapalı</span>
        </div>
        <p class="ek-barcode__status" role="status" aria-live="polite">
          <template v-if="state === 'scanning'">Barkodu çerçevenin içine yatay hizalayın; okununca arama kendiliğinden yapılır.</template>
          <template v-else-if="state === 'starting'">Kamera izni istenirse "İzin ver"i seçin.</template>
        </p>
        <EkAlert v-if="state === 'problem' && problemCopy" tone="warning" dense :title="problemCopy.title" :text="problemCopy.text">
          <template v-if="problem === 'denied' || problem === 'busy' || problem === 'error'" #actions>
            <EkButton size="sm" icon="mdi-refresh" @click="restart">Yeniden dene</EkButton>
          </template>
        </EkAlert>
        <v-text-field v-model="manual" class="ek-barcode__manual" :label="manualLabel" autocomplete="off" autocapitalize="off" spellcheck="false"
          :maxlength="CODE_MAX_LENGTH" hide-details="auto" clearable />
      </div>
    </EkDialog>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { EkAlert, EkButton, EkDialog } from '@entegrasyonik/ui/components'
import { useDeviceInput } from '@/composables/useDeviceInput'
import { useBarcodeScanner } from '@/composables/barcode/useBarcodeScanner'
import { CAMERA_MESSAGES, CODE_MAX_LENGTH, normalizeCode } from '@/composables/barcode/barcodeScan'

const props = defineProps<{ target: 'product' | 'order' }>()
const emit = defineEmits<{ code: [code: string] }>()

const COPY = {
  product: {
    button: 'Barkod okutarak ürün ara',
    title: 'Barkodla ürün bul',
    description: 'Ürün barkodu ya da stok kodu etiketini okutun.',
    manual: 'Barkod ya da stok kodu',
  },
  order: {
    button: 'Barkod okutarak sipariş ara',
    title: 'Barkodla sipariş bul',
    description: 'Sipariş numarası ya da kargo takip barkodunu okutun.',
    manual: 'Sipariş no ya da kargo takip no',
  },
} as const

const copy = computed(() => COPY[props.target])
const buttonLabel = computed(() => copy.value.button)
const title = computed(() => copy.value.title)
const description = computed(() => copy.value.description)
const manualLabel = computed(() => copy.value.manual)

const { showDeviceInput } = useDeviceInput()
const open = ref(false)
const manual = ref<string | null>('')
const manualCode = computed(() => normalizeCode(manual.value))
const videoRef = ref<HTMLVideoElement | null>(null)

const { state, problem, start, stop } = useBarcodeScanner((code) => finish(code))
const problemCopy = computed(() => (problem.value ? CAMERA_MESSAGES[problem.value] : null))

function finish(code: string) {
  open.value = false
  emit('code', code)
}

function submitManual() {
  if (manualCode.value) finish(manualCode.value)
}

async function restart() {
  await nextTick()
  if (videoRef.value) void start(videoRef.value)
}

watch(open, async (v) => {
  if (v) {
    manual.value = ''
    await nextTick()
    // v-dialog içeriği geçişle bağlanır; video öğesi hazır olana kadar bekle
    for (let i = 0; i < 10 && !videoRef.value; i++) await new Promise((r) => setTimeout(r, 30))
    if (open.value && videoRef.value) void start(videoRef.value)
  } else {
    stop()
  }
})
</script>

<style scoped>
.ek-barcode {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-barcode__view {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}

.ek-barcode__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ek-barcode__view:not(.is-scanning) .ek-barcode__video {
  visibility: hidden;
}

/* Hizalama çerçevesi: yatay 1B barkod için geniş, alçak dikdörtgen. */
.ek-barcode__frame {
  position: absolute;
  inset: 32% 10%;
  border: 2px solid var(--ek-color-surface);
  border-radius: var(--ek-radius-control);
  box-shadow: 0 0 0 999px color-mix(in srgb, var(--ek-color-content-strong) 35%, transparent);
  pointer-events: none;
}

.ek-barcode__msg {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.ek-barcode__status {
  margin: 0;
  min-height: 1lh;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-barcode__status:empty {
  display: none;
}
</style>
