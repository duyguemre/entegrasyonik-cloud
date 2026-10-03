<!--
  Sistem ayarları → Otopilot: PLATFORM yapay zekâ sağlayıcı anahtarı (CHAT_UI_CONTRACT §3.4, §7.2; ADR-0034 H4).
  Web'deki tenant kurulumuyla AYNI `ChatProviderSetup` bileşeni (variant="settings"), ama taşıyıcı `/admin-api/agent/provider`:
  tenant anahtarı backoffice'te hiç görünmez. Anahtar girilene kadar backoffice sohbeti kurulum ekranında kalır.
  Anahtar alanı kayıttan sonra boşalır; değer depoya/denetleyiciye yazılmaz (paket kuralı).
-->
<template>
  <div class="bo-page">
    <BoPageHeader />
    <PageVerdict :verdict="verdict" />
    <BoTileGrid :cols="2">
      <BoSection fill title="Platform sağlayıcı anahtarı" description="Yalnız yönetim uygulamasındaki sohbet kullanır; müşteri anahtarlarından ayrıdır." icon="mdi-key-chain-variant">
        <v-text-field
          ref="reasonRef"
          v-model="platformKeyReason"
          label="Gerekçe (kaydet/kaldır için zorunlu)"
          hint="10–500 karakter; denetim kaydına yazılır. Kaydetme ve kaldırma ayrıca parola + TOTP ile yeniden doğrulama ister."
          persistent-hint
          density="compact"
          maxlength="500"
          :counter="REASON_MAX"
          :error-messages="platformKeyReasonError || undefined"
          autocomplete="off"
          class="mb-4"
          data-testid="platform-key-reason"
        />
        <ChatProviderSetup :api="otopilot.controllerRef.value.transport.setup" variant="settings" :translate="otopilot.controllerRef.value.t" @changed="onChanged" />
      </BoSection>
      <BoSection fill title="Nasıl çalışır?" icon="mdi-information-outline">
        <ul class="bo-otps__list">
          <li>Sohbet <strong>salt okumadır</strong>: {{ CHAT_PRODUCT.name }} platform durumunu, kuyrukları ve logları sorgular; işlem önermez ya da uygulamaz.</li>
          <li>Her istek yönetici oturumu ve yetki kontrolünden geçer; müşteri iş verisi sohbete gelmez.</li>
          <li>Sohbetler kaydedilmez; oturum kapanınca silinir.</li>
          <li>Yapay zekâ maliyeti bu anahtarın sağlayıcı hesabına yansır; kullanım yalnız bilgi amaçlı gösterilir.</li>
        </ul>
        <template #footer>
          <EkButton tone="secondary" icon="mdi-chat-processing-outline" data-testid="open-otopilot" @click="otopilot.open({ via: 'button' })">{{ CHAT_PRODUCT.name }}'u aç</EkButton>
        </template>
      </BoSection>
    </BoTileGrid>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { EkButton } from '@entegrasyonik/ui/components'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { otopilotVerdict } from './otopilotVerdict'
import { otopilot } from '@bo/chat/otopilot'
import { platformKeyReason, platformKeyReasonError, REASON_MAX } from '@bo/chat/setupReason'
import '@bo/styles/kit.css'

const ChatProviderSetup = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatProviderSetup))

const verdict = computed(() => {
  const m = otopilot.controllerRef.value.machine.value
  return otopilotVerdict({ status: m.status, unavailableReason: m.unavailableReason, errorCode: m.error?.code, retry: () => void otopilot.controller().ensureLoaded(true) })
})
onMounted(() => void otopilot.controller().ensureLoaded())

/** Kaydet/kaldır gerekçesiz denendiyse hata alanın altında görünür ve odak alana döner (paket formu ayrıca hatayı yazar). */
const reasonRef = ref<{ focus: () => void } | null>(null)
watch(platformKeyReasonError, (msg) => {
  if (msg) void nextTick(() => reasonRef.value?.focus())
})

function onChanged() {
  platformKeyReason.value = ''
  void otopilot.controller().ensureLoaded(true)
}
</script>

<style scoped>
.bo-otps__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding-left: var(--ek-space-5);
}

/* BO-LOCAL-01 — açıklama listesi: madde imi eylem renginde küçük kare (yuvarlak nokta değil), satırlar sakin. */
.bo-otps__list {
  padding-left: 0;
  list-style: none;
}

.bo-otps__list > li {
  position: relative;
  padding-left: var(--ek-space-5);
}

.bo-otps__list > li::before {
  content: '';
  position: absolute;
  top: 0.6em;
  left: var(--ek-space-1);
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--ek-color-action);
}
</style>
