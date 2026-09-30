<!--
  frontend/src/components/mcp/McpConnectGuide.vue

  MCP-6 — "Nasıl bağlanırım?" (MCP_UI_CONTRACT §5): sade 3 adım + bağlantı adresi (kopyala). Teknik sır YOK: yalnız
  herkese açık `serverUrl` (backend `GET /api/mcp/settings`). Ürün/uygulama adı yazılmaz ("yapay zekâ uygulamanız").
  Tenant erişimi `off` ise adımlar yerine uyarı + (sahipse) ayar bağlantısı.
-->
<template>
  <div class="ek-mcp-guide" data-testid="mcp-guide">
    <EkAlert v-if="access === 'off'" tone="info" dense :text="canOpenSettings ? $t('mcp.connections.accessOffOwner') : $t('mcp.connections.accessOff')">
      <template v-if="canOpenSettings" #actions>
        <EkButton tone="secondary" size="sm" trailing-icon="mdi-arrow-right" @click="$emit('open-settings')">{{ $t('mcp.connections.openSettings') }}</EkButton>
      </template>
    </EkAlert>
    <template v-else>
      <ol class="ek-mcp-guide__steps">
        <li>
          <span class="ek-mcp-guide__num" aria-hidden="true">1</span>
          <p>{{ $t('mcp.connections.guideStep1') }}</p>
        </li>
        <li>
          <span class="ek-mcp-guide__num" aria-hidden="true">2</span>
          <div class="ek-mcp-guide__body">
            <p>{{ $t('mcp.connections.guideStep2') }}</p>
            <McpCopyField v-if="serverUrl" :value="serverUrl" :label="$t('mcp.connections.serverUrl')" />
            <p v-else class="ek-mcp-guide__muted">{{ $t('mcp.connections.serverUrlError') }}</p>
          </div>
        </li>
        <li>
          <span class="ek-mcp-guide__num" aria-hidden="true">3</span>
          <p>{{ $t('mcp.connections.guideStep3') }}</p>
        </li>
      </ol>
      <p class="ek-mcp-guide__note">
        <v-icon icon="mdi-shield-lock-outline" size="small" aria-hidden="true" />
        <span>{{ $t('mcp.connections.guideNote') }}</span>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { EkAlert, EkButton } from '@entegrasyonik/ui/components'
import McpCopyField from './McpCopyField.vue'
import type { McpAccess } from '@/types/McpTypes'

defineProps<{ serverUrl: string | null; access: McpAccess | null; canOpenSettings: boolean }>()
defineEmits<{ 'open-settings': [] }>()
</script>

<style scoped>
.ek-mcp-guide {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.ek-mcp-guide__steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.ek-mcp-guide__steps li {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  min-width: 0;
}
.ek-mcp-guide__steps p {
  margin: 0;
  color: var(--ek-color-content-default);
}
.ek-mcp-guide__num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
}
.ek-mcp-guide__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  flex: 1 1 auto;
  min-width: 0;
}
.ek-mcp-guide__muted {
  color: var(--ek-color-content-muted) !important;
  font-size: var(--ek-font-size-sm);
}
.ek-mcp-guide__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
</style>
