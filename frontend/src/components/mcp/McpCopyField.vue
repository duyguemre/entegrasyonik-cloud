<!--
  frontend/src/components/mcp/McpCopyField.vue

  MCP-6 — salt-okunur adres + "Kopyala" (MCP_UI_CONTRACT §5/§6). Sonuç `aria-live` ile duyurulur ("Kopyalandı");
  pano erişimi yoksa (izin/HTTP) elle kopyalama yönergesi. Alan seçilebilir (tek tıkla tüm metin seçilir).
-->
<template>
  <div class="ek-mcp-copy">
    <span :id="labelId" class="ek-mcp-copy__label">{{ label }}</span>
    <div class="ek-mcp-copy__row">
      <input
        ref="inputRef"
        class="ek-mcp-copy__value"
        type="text"
        readonly
        :value="value"
        :aria-labelledby="labelId"
        spellcheck="false"
        data-testid="mcp-server-url"
        @focus="selectAll"
      />
      <EkButton tone="secondary" size="sm" :icon="copied ? 'mdi-check' : 'mdi-content-copy'" data-testid="mcp-copy" @click="copy">
        {{ copied ? $t('mcp.common.copied') : $t('mcp.common.copy') }}
      </EkButton>
    </div>
    <p class="ek-sr-only" aria-live="polite" data-testid="mcp-copy-status">{{ status }}</p>
    <p v-if="failed" class="ek-mcp-copy__error" role="alert">{{ $t('mcp.common.copyFailed') }}</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkButton } from '@entegrasyonik/ui/components'

const props = defineProps<{ value: string; label: string }>()
const { t } = useI18n()
const labelId = `ek-mcp-copy-${useId()}`
const inputRef = ref<HTMLInputElement | null>(null)
const copied = ref(false)
const failed = ref(false)
const status = ref('')
let resetTimer: ReturnType<typeof setTimeout> | null = null

function selectAll() {
  inputRef.value?.select()
}

async function copy() {
  failed.value = false
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    status.value = t('mcp.common.copied')
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      copied.value = false
      status.value = ''
    }, 2500)
  } catch {
    failed.value = true
    status.value = ''
    selectAll()
  }
}

onBeforeUnmount(() => {
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<style scoped>
.ek-mcp-copy {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}
.ek-mcp-copy__label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}
.ek-mcp-copy__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}
.ek-mcp-copy__value {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-sm);
  text-overflow: ellipsis;
}
.ek-mcp-copy__value:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
.ek-mcp-copy__error {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-error-emphasis);
}
</style>
