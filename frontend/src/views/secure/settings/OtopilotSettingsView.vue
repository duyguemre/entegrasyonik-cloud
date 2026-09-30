<!--
  frontend/src/views/secure/settings/OtopilotSettingsView.vue — Ayarlar → Otopilot (CHAT_UI_CONTRACT §3.4 / §7.1b).
  Paneldeki kurulumla AYNI `ChatProviderSetup` (variant="settings"): durum, test, kullanım (bilgi amaçlı), kaldır,
  sahip onayı / geri alma. Yetki sınırı backend (`settings:manage`; yetkisizde bileşen "yönetici kurulumu" görünümüne düşer).
  Kurulum değişince sohbet denetleyicisinin `info` önbelleği tazelenir.
-->
<template>
  <div class="ek-otopilot-settings">
    <EkPageHeader :section="appT('shell.section.settings')" :title="t('entry.settingsTitle')" :description="t('entry.settingsDescription')" />
    <div class="ek-otopilot-settings__body">
      <ChatProviderSetup :api="otopilot.getController().transport.setup" variant="settings" :translate="t" @changed="onChanged" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChatProviderSetup } from '@entegrasyonik/chat'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { useOtopilotStore } from '@/chat/otopilotStore'

defineProps<{ parameters?: Record<string, unknown> }>()
const otopilot = useOtopilotStore()
const t = otopilot.getController().t
const { t: appT } = useI18n({ useScope: 'global' })

function onChanged() {
  void otopilot.getController().ensureLoaded(true)
}
</script>

<style scoped>
.ek-otopilot-settings {
  height: 100%;
  overflow-y: auto;
  padding: var(--ek-space-6);
  background: var(--ek-color-app-bg);
}

.ek-otopilot-settings__body {
  max-width: 720px;
  margin-top: var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

@media (max-width: 767px) {
  .ek-otopilot-settings {
    padding: var(--ek-space-3);
  }

  .ek-otopilot-settings__body {
    padding: var(--ek-space-4);
  }
}
</style>
