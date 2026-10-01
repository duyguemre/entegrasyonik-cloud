<!--
  frontend/src/components/mcp/McpActionPreview.vue

  MCP-6 — bekleyen yazma işleminin önizleme kartı (MCP_UI_CONTRACT §3 "önizleme kartı"). Görsel yapı sohbet onay
  kartıyla (ADR-0034 Karar 4.4, `@entegrasyonik/chat` PartConfirm) aynı: ikon karosu + başlık + işlem çipi; gövde
  ("pazaryerine gönderilir" notu + etkilenen kayıtlar) P-MCP-2 ile ORTAK bileşen `@entegrasyonik/chat/confirm`. `preview.*` DÜZ METİNDİR ({{ }} ile basılır; `v-html` YOK —
  statik test korur). Satırlar sözleşme gereği ≤ 20; yine de savunmacı olarak 20'de kesilir.
-->
<template>
  <section class="ek-mcp-preview" role="group" :aria-labelledby="titleId" data-testid="mcp-action-preview">
    <header class="ek-mcp-preview__head">
      <EkIconTile icon="mdi-shield-check-outline" tone="action" size="sm" />
      <div class="ek-mcp-preview__heading">
        <h2 :id="titleId" class="ek-mcp-preview__title">{{ view.preview.title }}</h2>
        <div class="ek-mcp-preview__chips">
          <EkStatusChip tone="info" :label="view.capability.title" />
        </div>
      </div>
    </header>

    <!-- P-MCP-2 (K49): gövde sohbet onay kartıyla ortak bileşen (@entegrasyonik/chat/confirm). -->
    <ConfirmBody
      :external="view.external"
      :external-text="$t('mcp.approval.external')"
      :label="countLabel"
      :items="lines.map((line, i) => ({ key: String(i), label: line }))"
      layout="lines"
    />

    <slot />
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import { ConfirmBody } from '@entegrasyonik/chat/confirm'
import type { ApprovalView } from '@/types/McpTypes'

const props = defineProps<{ view: ApprovalView }>()
const uid = useId()
const titleId = `ek-mcp-preview-${uid}`
const { t } = useI18n()
const lines = computed(() => (Array.isArray(props.view.preview.lines) ? props.view.preview.lines.slice(0, 20) : []))
const countLabel = computed(() => {
  if (typeof props.view.preview.count === 'number') return t('mcp.approval.count', { count: formatNumber(props.view.preview.count) })
  return lines.value.length ? t('mcp.approval.affected') : ''
})
</script>

<style scoped>
.ek-mcp-preview {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}
.ek-mcp-preview__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}
.ek-mcp-preview__heading {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}
.ek-mcp-preview__title {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-line-height-tight);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-mcp-preview__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
</style>
