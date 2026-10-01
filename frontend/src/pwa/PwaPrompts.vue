<!--
  MOB-01 — PWA istemleri (App.vue, tek örnek):
   1) Güncelleme: yeni sürüm beklerken tek "Yeni sürüm hazır" bildirimi + "Yenile" (tek toast kaynağı, useToast).
   2) Kurulum (yalnız mobil genişlik, kurulu değilse, kapatılmadıysa, masaüstü kabuğunda asla):
      Android/Chromium → "Ana ekrana ekle" (ertelenmiş `beforeinstallprompt`); iOS Safari → Paylaş → Ana Ekrana Ekle yönergesi.
  Kapatılınca bir daha gösterilmez (yerel tercih).
-->
<template>
  <div v-if="hint !== 'none'" class="ek-pwa-install" data-testid="pwa-install">
    <EkAlert
      tone="info"
      icon="mdi-cellphone-arrow-down"
      title="Entegrasyonik'i ana ekranınıza ekleyin"
      dismissible
      @dismiss="dismiss"
    >
      <template v-if="hint === 'ios'">
        Safari'de <strong>Paylaş</strong> <v-icon icon="mdi-export-variant" size="16" aria-label="Paylaş simgesi" /> düğmesine,
        ardından <strong>Ana Ekrana Ekle</strong>'ye dokunun.
      </template>
      <template v-else>Uygulama gibi tam ekran açılır; verileriniz cihazda saklanmaz.</template>
      <template v-if="hint === 'android'" #actions>
        <EkButton tone="primary" size="md" @click="install">Ekle</EkButton>
      </template>
    </EkAlert>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { EkAlert, EkButton } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import {
  pwaState,
  applyUpdate,
  installHint,
  isDesktopShell,
  isIosSafari,
  isStandalone,
  readDismissed,
  writeDismissed,
} from './pwaState'

const { smAndDown } = useDisplay()
const dismissed = ref(readDismissed())

const hint = computed(() =>
  installHint({
    desktopShell: isDesktopShell(),
    standalone: isStandalone(),
    dismissed: dismissed.value,
    mobile: smAndDown.value,
    hasPromptEvent: !!pwaState.installEvent,
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints),
  }),
)

function dismiss() {
  dismissed.value = true
  writeDismissed()
}

async function install() {
  const event = pwaState.installEvent
  if (!event) return
  pwaState.installEvent = null // istem yalnız bir kez kullanılabilir
  await event.prompt()
  const { outcome } = await event.userChoice
  if (outcome === 'dismissed') dismiss()
}

const { showToast } = useToast()
let updateToast = false
watch(
  () => pwaState.waitingWorker,
  (worker) => {
    if (!worker || updateToast) return
    updateToast = true
    showToast({
      tone: 'info',
      title: 'Yeni sürüm hazır',
      message: 'Güncellemek için sayfayı yenileyin; kaydedilmemiş değişikliklerinizi önce kaydedin.',
      actionLabel: 'Yenile',
      onAction: applyUpdate,
      duration: 10 * 60 * 1000,
    })
  },
  { immediate: true },
)
</script>

<style scoped>
.ek-pwa-install {
  position: fixed;
  inset-inline: var(--ek-space-3);
  bottom: calc(var(--ek-space-3) + env(safe-area-inset-bottom, 0px));
  z-index: var(--ek-z-toast);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}
</style>
