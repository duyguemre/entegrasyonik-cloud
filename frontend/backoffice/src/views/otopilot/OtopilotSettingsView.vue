<!--
  Sistem ayarları → Otopilot: PLATFORM yapay zekâ sağlayıcı anahtarı (CHAT_UI_CONTRACT §3.4, §7.2; ADR-0034 H4).
  Web'deki tenant kurulumuyla AYNI `ChatProviderSetup` bileşeni (variant="settings"), ama taşıyıcı `/admin-api/agent/provider`:
  tenant anahtarı backoffice'te hiç görünmez. Anahtar girilene kadar backoffice sohbeti kurulum ekranında kalır.
  Anahtar alanı kayıttan sonra boşalır; değer depoya/denetleyiciye yazılmaz (paket kuralı).
-->
<template>
  <div class="bo-page">
    <BoPageHeader />
    <div class="bo-grid-2 bo-otps">
      <EkCard title="Platform sağlayıcı anahtarı" subtitle="Yalnız yönetim uygulamasındaki sohbet kullanır; müşteri anahtarlarından ayrıdır." icon="mdi-key-chain-variant">
        <ChatProviderSetup :api="otopilot.controllerRef.value.transport.setup" variant="settings" @changed="onChanged" />
      </EkCard>
      <EkCard title="Nasıl çalışır?" icon="mdi-information-outline" :heading-level="3">
        <ul class="bo-otps__list">
          <li>Sohbet <strong>salt okumadır</strong>: {{ CHAT_PRODUCT.name }} platform durumunu, kuyrukları ve logları sorgular; işlem önermez ya da uygulamaz.</li>
          <li>Her istek yönetici oturumu ve yetki kontrolünden geçer; müşteri iş verisi sohbete gelmez.</li>
          <li>Sohbetler kaydedilmez; oturum kapanınca silinir.</li>
          <li>Yapay zekâ maliyeti bu anahtarın sağlayıcı hesabına yansır; kullanım yalnız bilgi amaçlı gösterilir.</li>
        </ul>
        <template #footer>
          <EkButton tone="secondary" icon="mdi-chat-processing-outline" data-testid="open-otopilot" @click="otopilot.open({ via: 'button' })">{{ CHAT_PRODUCT.name }}'u aç</EkButton>
        </template>
      </EkCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { EkButton, EkCard } from '@entegrasyonik/ui/components'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { otopilot } from '@bo/chat/otopilot'
import '@bo/styles/kit.css'

const ChatProviderSetup = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatProviderSetup))

function onChanged() {
  void otopilot.controller().ensureLoaded(true)
}
</script>

<style scoped>
.bo-otps {
  align-items: start;
}
.bo-otps__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding-left: var(--ek-space-5);
}
</style>
