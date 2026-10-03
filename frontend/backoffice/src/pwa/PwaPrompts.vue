<!--
  MOB-06 — backoffice PWA istemleri (App.vue, tek örnek; desen: uygulamanın MOB-01 PwaPrompts.vue'su):
   1) Güncelleme: yeni sürüm beklerken tek "Yeni sürüm hazır" bildirimi + "Yenile" (tek toast kaynağı, useToast).
   2) Kurulum (yalnız telefon genişliği, oturum açıkken, kurulu değilse, kapatılmadıysa):
      Android/Chromium → "Ekle" (ertelenmiş `beforeinstallprompt`); iOS Safari → Paylaş → Ana Ekrana Ekle yönergesi.
  Kapatılınca bir daha gösterilmez (yalnız `bo-pwa-install-dismissed` bayrağı).
-->
<template>
  <div v-if="hint !== 'none'" class="bo-pwa-install" data-testid="pwa-install">
    <EkAlert
      tone="info"
      icon="mdi-cellphone-arrow-down"
      title="Yönetim panelini ana ekranınıza ekleyin"
      dismissible
      @dismiss="dismiss"
    >
      <template v-if="hint === 'ios'">
        Safari'de <strong>Paylaş</strong> <v-icon icon="mdi-export-variant" size="16" aria-hidden="true" /><span class="ek-sr-only">(kare içinde yukarı ok simgesi)</span> düğmesine,
        ardından <strong>Ana Ekrana Ekle</strong>'ye dokunun.
      </template>
      <template v-else>Ayrı bir uygulama gibi tam ekran açılır; platform ve müşteri verisi cihazda saklanmaz.</template>
      <template v-if="hint === 'android'" #actions>
        <EkButton tone="primary" size="md" data-testid="pwa-install-add" @click="install">Ekle</EkButton>
      </template>
    </EkAlert>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { EkAlert, EkButton } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { session } from '@bo/auth/session'
import { pwaState, applyUpdate, installHint, isIosSafari, isStandalone, readDismissed, writeDismissed } from './pwaState'

const { smAndDown } = useDisplay()
const dismissed = ref(readDismissed())

const hint = computed(() =>
  installHint({
    standalone: isStandalone(),
    dismissed: dismissed.value,
    mobile: smAndDown.value,
    signedIn: session.state.status === 'signedIn',
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
      message: 'Güncellemek için yenileyin; açık bir gerekçe ya da diyalog varsa önce tamamlayın.',
      actionLabel: 'Yenile',
      onAction: applyUpdate,
      duration: 10 * 60 * 1000,
    })
  },
  { immediate: true },
)
</script>

<style scoped>
.bo-pwa-install {
  position: fixed;
  inset-inline: var(--ek-space-3);
  bottom: calc(var(--ek-space-3) + env(safe-area-inset-bottom, 0px));
  z-index: var(--ek-z-toast);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}

/* BO-LOCAL-01 — kurulum istemi: açılır katman; köşe içindeki bilgi kutusuyla (EkAlert) aynı — kutu köşesi. Çerçeve bilgi
   kutusunun kendi ince ton çerçevesidir; gölge yalnız açılır katman gölgesi. */
.bo-pwa-install {
  border-radius: var(--ek-radius-tile);
}
</style>
