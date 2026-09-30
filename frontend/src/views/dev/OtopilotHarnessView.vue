<!--
  frontend/src/views/dev/OtopilotHarnessView.vue — YALNIZ GELİŞTİRME (router DEV bloğu; üretimde elenir).
  Otopilot panelinin kabuktan bağımsız inceleme/erişilebilirlik tezgâhı: mock taşıyıcı + boş host, AÇIK/KOYU tema
  (uygulamanın koyu tema kapısı FR2-DARK kapalı olduğu için koyu inceleme ve axe burada yapılır).
  Sorgu: `?theme=dark|light` · `?mode=side|page` · `?config=<mock yapılandırması>` · `?ask=<metin>` (açılışta gönder) ·
  `?speed=<çarpan>` · `?settings=1` (Ayarlar → Otopilot görünümü).
-->
<template>
  <div class="ek-otopilot-harness" :class="`is-${mode}`">
    <div class="ek-otopilot-harness__frame">
      <ChatProviderSetup v-if="settings" :api="controller.transport.setup" variant="settings" :translate="controller.t" />
      <ChatPanel v-else ref="panelRef" :controller="controller" :mode="mode" :show-close="mode === 'side'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { ChatPanel, ChatProviderSetup, NULL_HOST, createChatController } from '@entegrasyonik/chat'
import { createMockTransport, MOCK_CONFIG_IDS, type MockConfigId } from '@entegrasyonik/chat/transports/mock'
import { THEME_NAMES, applyThemeToDocument } from '@entegrasyonik/ui/theme'
import { CLAIM_STATUS_TONE, ORDER_STATUS_TONE } from '@/design/status-map'

const route = useRoute()
const theme = useTheme()
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
const mode = computed(() => (q('mode') === 'page' ? 'page' : 'side'))
const settings = q('settings') === '1'
const config = ((MOCK_CONFIG_IDS as readonly string[]).includes(q('config')) ? q('config') : 'enabled') as MockConfigId
const speed = Number(q('speed') || '1')
const dark = q('theme') === 'dark'
const panelRef = ref<{ focusComposer: () => void } | null>(null)

const LABELS: Record<string, string> = {
  AWAITING_APPROVAL: 'Onay bekliyor', UNAPPROVED: 'Onaylanmadı', APPROVED: 'Onaylandı', SHIPPED: 'Kargoda', DELIVERED: 'Teslim edildi', CANCELLED: 'İptal', RETURNED: 'İade',
}
const controller = createChatController({
  transport: createMockTransport({ config, speed: Number.isFinite(speed) ? speed : 1 }),
  host: {
    ...NULL_HOST,
    resolveLink: (link) => (['OrderListView', 'DashboardView', 'productDefinitions/ProductListView'].includes(link.screen) ? { href: `#${link.screen}`, open: () => undefined } : null),
    status: (domain, value) => {
      const entry = (domain === 'order' ? ORDER_STATUS_TONE : domain === 'claim' ? CLAIM_STATUS_TONE : {})[value as never] as { tone: any } | undefined
      return entry ? { tone: entry.tone, label: LABELS[value] ?? value } : null
    },
    settingsLink: () => ({ screen: 'OtopilotSettingsView' }),
  },
})
controller.setContext({ screen: 'OrderListView', filters: { internalStatuses: 'AWAITING_APPROVAL' } }, 'Siparişler')

const previous = theme.global.name.value
onMounted(async () => {
  theme.global.name.value = THEME_NAMES[dark ? 'dark' : 'light']
  applyThemeToDocument(dark ? 'dark' : 'light')
  await controller.ensureLoaded()
  const ask = q('ask')
  if (ask) controller.send(ask)
})
onBeforeUnmount(() => {
  theme.global.name.value = previous
  applyThemeToDocument('light')
  controller.dispose()
})
</script>

<style scoped>
.ek-otopilot-harness {
  display: flex;
  justify-content: flex-end;
  height: 100vh;
  background: var(--ek-color-app-bg);
}

.ek-otopilot-harness__frame {
  width: 400px;
  height: 100%;
  border-left: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  overflow: auto;
}

.ek-otopilot-harness.is-page .ek-otopilot-harness__frame {
  width: 100%;
  border-left: 0;
}

@media (max-width: 767px) {
  .ek-otopilot-harness__frame {
    width: 100%;
    border-left: 0;
  }
}
</style>
